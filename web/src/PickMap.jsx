import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { addBaseLayers } from './mapTiles.js';
import { useT, useLang, toast } from './lib.jsx';

// ================= 📍 v2026.09.23.10 — Géocodage double source (gratuit, sans clé) =================
// Le champ « Adresse de livraison » du panier propose AUTOMATIQUEMENT des adresses
// pendant la frappe ; toucher une suggestion pose le point de livraison.
// Deux bases sont interrogées (la meilleure couverture possible sans clé API) :
//  · Esri World Geocoder — couverture Égypte excellente, noms arabes locaux ;
//  · Nominatim / OpenStreetMap — bon dans les zones bien cartographiées par OSM.
const LANG3 = (l) => (l === 'ar' ? 'ar' : l === 'en' ? 'en' : 'fr');
const fetchT = async (url, ms = 6000) => {
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { signal: ac.signal }); } finally { clearTimeout(tm); }
};

/**
 * Géocodage inverse (coordonnées → adresse lisible) : Esri + Nominatim en parallèle,
 * on garde l'adresse la plus détaillée (rue + numéro + quartier = score le plus haut).
 */
export async function reverseGeocode(lat, lng, lang = 'fr') {
  const l = LANG3(lang);
  const jobs = [
    // Esri World Geocoder (sans clé)
    (async () => {
      const d = await (await fetchT(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=json&location=${lng},${lat}&langCode=${l}`)).json();
      const a = d?.address || {};
      const name = a.Address || a.PlaceName || a.ShortLabel || a.Match_addr;   // rue ou nom de place
      const bits = [...new Set([a.AddNum, name, a.Neighborhood || a.District, a.City || a.Subregion || a.Region].filter(Boolean))];
      const label = bits.join(', ');
      if (!label) return null;
      return { label, score: (name ? 4 : 0) + (a.AddNum ? 3 : 0) + ((a.Neighborhood || a.District) ? 2 : 0) + ((a.City || a.Subregion) ? 1 : 0) };
    })(),
    // Nominatim (OpenStreetMap)
    (async () => {
      const d = await (await fetchT(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=${l}&zoom=18&addressdetails=1`)).json();
      const a = d?.address || {};
      if (!d?.display_name) return null;
      return { label: d.display_name, score: (a.road ? 4 : 0) + (a.house_number ? 3 : 0) + ((a.neighbourhood || a.suburb) ? 2 : 0) + ((a.city || a.town) ? 1 : 0) };
    })()
  ];
  try {
    const rs = await Promise.allSettled(jobs);
    const ok = rs.map((r) => (r.status === 'fulfilled' ? r.value : null)).filter(Boolean);
    if (!ok.length) return null;
    ok.sort((x, y) => y.score - x.score);
    return ok[0].label;
  } catch { return null; }
}

/**
 * 🔎 v2026.10.05.1 — Recherche par ADRESSE TAPÉE (texte → position) : TROIS moteurs
 * GRATUITS interrogés EN PARALLÈLE (le maximum de couverture sans clé API, qualité
 * proche de Google) :
 *  · Esri World Geocoder — couverture Égypte excellente, noms arabes locaux ;
 *  · Photon (OpenStreetMap) — auto-complétion rapide, très bon sur les frappes
 *    partielles (« smou » trouve déjà Smouha) ;
 *  · Nominatim (OpenStreetMap) — complet sur les zones bien cartographiées.
 * Fusion + dédoublonnage (≈15 m) + classement par source. Biais vers « near »
 * (Alexandrie par défaut côté appelants) : « Miami » trouve Miami d'Alexandrie.
 * Retourne [{lat, lng, label}].
 */
export async function geocodeSearch(q, lang = 'fr', near = null) {
  const l = LANG3(lang);
  const s = String(q || '').trim();
  if (s.length < 3) return [];
  // 🥇 ordre de pertinence : frappe PARTIELLE (un seul mot) → Photon d'abord (auto-
  // complétion façon Google : « smou » trouve Smouha) ; adresse complète → Esri d'abord.
  const order = s.includes(' ') ? [0, 1, 2] : [1, 0, 2];
  const acc = [];   // chaque moteur dépose ses résultats DÈS qu'il répond
  const jobs = [
    (async () => {   // ① Esri
      const esri = near ? `&location=${near.lng},${near.lat}&distance=25000` : '';
      const d = await (await fetchT(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(s)}&maxLocations=6&langCode=${l}${esri}`, 4500)).json();
      (d?.candidates || []).filter((c) => c.location).forEach((c) => acc.push({ lat: c.location.y, lng: c.location.x, label: c.address, src: 0 }));
    })().catch(() => {}),
    (async () => {   // ② Photon (auto-complétion façon Google)
      const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : '';
      const d = await (await fetchT(`https://photon.komoot.io/api/?q=${encodeURIComponent(s)}&limit=6&lang=${l}${bias}`, 4500)).json();
      (d?.features || []).filter((f) => f?.geometry?.coordinates).forEach((f) => {
        const a = f.properties || {};
        const bits = [...new Set([a.name, a.street && (a.housenumber ? a.housenumber + ' ' + a.street : a.street), a.district, a.city, a.state, a.country].filter(Boolean))].slice(0, 4);
        if (bits.length) acc.push({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: bits.join(', '), src: 1 });
      });
    })().catch(() => {}),
    (async () => {   // ③ Nominatim
      const vb = near ? `&viewbox=${near.lng - 0.4},${near.lat + 0.4},${near.lng + 0.4},${near.lat - 0.4}` : '';
      const d = await (await fetchT(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(s)}&format=json&limit=5&accept-language=${l}${vb}`, 4500)).json();
      (d || []).forEach((x) => acc.push({ lat: +x.lat, lng: +x.lon, label: x.display_name, src: 2 }));
    })().catch(() => {}),
  ];
  // ⏱️ 2,8 s GRAND MAX tout compris : un moteur lent ne retarde JAMAIS l'affichage —
  // on fusionne ce qui est déjà arrivé, les traînards sont simplement ignorés.
  await Promise.race([Promise.allSettled(jobs), new Promise((r) => setTimeout(r, 2800))]);
  const all = acc.slice().sort((a, b) => order.indexOf(a.src) - order.indexOf(b.src));   // tri stable : pertinence conservée au sein de chaque source
  const out = [], seen = [];
  for (const r of all) {
    if (out.length >= 7) break;
    if (seen.some((p) => Math.abs(p.lat - r.lat) < 0.00015 && Math.abs(p.lng - r.lng) < 0.00015)) continue;   // doublon ≈ même position
    seen.push(r); out.push(r);
  }
  return out;
}

/**
 * Sélecteur de position façon Uber :
 * l'épingle 📌 reste FIXE au centre — l'utilisateur déplace la carte.
 * L'adresse sous l'épingle = la plus détaillée des deux bases (Esri/OSM).
 */
export default function PickMap({ initial, onConfirm }) {
  const t = useT();
  const { lang } = useLang();
  const langRef = useRef(lang); langRef.current = lang;
  const el = useRef(null);
  const map = useRef(null);
  const tm = useRef(null);
  const [pos, setPos] = useState(initial);
  const [addr, setAddr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true }).setView([initial.lat, initial.lng], 16);
    addBaseLayers(map.current);   // 🗺️ Leaflet | © OpenStreetMap

    const upd = () => {
      const c = map.current.getCenter();
      setPos({ lat: c.lat, lng: c.lng });
    };
    map.current.on('move', upd);
    map.current.on('moveend', () => {
      setAddr(null);
      clearTimeout(tm.current);
      tm.current = setTimeout(async () => {
        const c = map.current.getCenter();
        setAddr(await reverseGeocode(c.lat, c.lng, langRef.current));
      }, 350);
    });
    setTimeout(() => map.current?.invalidateSize(), 60);
    return () => { clearTimeout(tm.current); map.current?.remove(); map.current = null; };
  }, []);

  const goToMe = () => {
    if (!navigator.geolocation) return toast(t('gps_fail'), 'err');
    navigator.geolocation.getCurrentPosition(
      (p) => map.current?.setView([p.coords.latitude, p.coords.longitude], 16),
      () => toast(t('gps_fail'), 'err'),
      { timeout: 6000 }
    );
  };

  const confirm = async () => {
    setBusy(true);
    const address = addr || (await reverseGeocode(pos.lat, pos.lng, langRef.current));
    setBusy(false);
    onConfirm({ ...pos, address });
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div ref={el} style={{ height: 320, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }} />
        {/* épingle FIXE au centre — seule la carte bouge */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -100%)',
          fontSize: 36, lineHeight: '36px', pointerEvents: 'none',
          filter: 'drop-shadow(0 4px 5px rgba(0,0,0,.45))', zIndex: 500
        }}>📌</div>
        <button className="btn ghost sm" onClick={goToMe}
          style={{ position: 'absolute', bottom: 10, insetInlineEnd: 10, zIndex: 500 }}>
          🛰️ {t('use_gps')}
        </button>
      </div>
      <p className="muted small mt8">{t('pin_hint')}</p>
      {addr && <div className="banner ok" style={{ marginTop: 8 }}>📍 {addr}</div>}
      <button className="btn primary block mt8" disabled={busy} onClick={confirm}>
        {busy ? '🔎 ' + t('locating') : '✅ ' + t('confirm_location')}
      </button>
    </div>
  );
}
