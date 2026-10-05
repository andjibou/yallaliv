import React, { useEffect, useRef, useState } from 'react';
import { useT, useLang, toast } from './lib.jsx';
import { createMap, gForward, gReverse, mbForward, mbReverse, fetchT, LANG3 } from './MapGl.jsx';

// ================= 📍 v2026.10.05.3 — Géocodage CINQ-SOURCES (Google en tête) =================
// Le champ « Adresse de livraison » du panier propose AUTOMATIQUEMENT des
// adresses pendant la frappe ; toucher une suggestion pose le point de livraison.
// CINQ bases sont interrogées EN PARALLÈLE (chaque étage tombe en douceur si sa
// clé/quota manque — jamais de trou de couverture) :
//  · Google Geocoder (10k/mois gratuits) — 🥇 le meilleur sur l'Égypte ;
//  · Mapbox Geocoding v6 (100k/mois) — adresses précises (rue + numéro) ;
//  · Esri World Geocoder — couverture Égypte, noms arabes locaux ;
//  · Photon (OpenStreetMap) — auto-complétion, imbattable sur les quartiers
//    (« smou » → Smouha) ;
//  · Nominatim (OpenStreetMap) — zones bien cartographiées.
// Fusion + dédoublonnage ≈15 m.

/**
 * Géocodage inverse (coordonnées → adresse lisible) : Mapbox d'abord (adresse
 * la plus propre, avec numéro), sinon Esri + Nominatim en parallèle et on garde
 * l'adresse la plus détaillée (rue + numéro + quartier = score le plus haut).
 */
export async function reverseGeocode(lat, lng, lang = 'fr') {
  const l = LANG3(lang);
  const g = await gReverse(lat, lng, l).catch(() => null);   // 🥇 Google d'abord
  if (g) return g;
  const mb = await mbReverse(lat, lng, l).catch(() => null);   // 🥈 Mapbox
  if (mb) return mb;
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
 * 🔎 v2026.10.05.3 — Recherche par ADRESSE TAPÉE (texte → position) : CINQ
 * moteurs interrogés EN PARALLÈLE — Google en tête (les meilleures données
 * Égypte), puis Mapbox, Esri, Photon (frappes partielles/quartiers) et
 * Nominatim. Fusion + dédoublonnage (≈15 m) + classement par source. Biais vers
 * « near » (Alexandrie par défaut côté appelants).
 * Retourne [{lat, lng, label}].
 */
export async function geocodeSearch(q, lang = 'fr', near = null) {
  const l = LANG3(lang);
  const s = String(q || '').trim();
  if (s.length < 3) return [];
  // 🥇 ordre de pertinence : adresse COMPLÈTE → Google puis Mapbox/Esri ; frappe
  // PARTIELLE (un seul mot) → Photon d'abord (« smou » trouve déjà Smouha).
  const order = s.includes(' ') ? [0, 1, 2, 3, 4] : [3, 0, 2, 1, 4];
  const acc = [];   // chaque moteur dépose ses résultats DÈS qu'il répond
  const jobs = [
    (async () => {   // ① Google Geocoder (🥇 Égypte — renvoie [] sans clé)
      const r = await gForward(s, l, near).catch(() => []);
      r.forEach((x) => acc.push({ ...x, src: 0 }));
    })(),
    (async () => {   // ② Mapbox Geocoding v6
      const r = await mbForward(s, l, near).catch(() => []);
      r.forEach((x) => acc.push({ ...x, src: 1 }));
    })(),
    (async () => {   // ③ Esri
      const esri = near ? `&location=${near.lng},${near.lat}&distance=25000` : '';
      const d = await (await fetchT(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(s)}&maxLocations=6&langCode=${l}${esri}`, 4500)).json();
      (d?.candidates || []).filter((c) => c.location).forEach((c) => acc.push({ lat: c.location.y, lng: c.location.x, label: c.address, src: 2 }));
    })().catch(() => {}),
    (async () => {   // ③ Photon (auto-complétion façon Google)
      const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : '';
      const d = await (await fetchT(`https://photon.komoot.io/api/?q=${encodeURIComponent(s)}&limit=6&lang=${l}${bias}`, 4500)).json();
      (d?.features || []).filter((f) => f?.geometry?.coordinates).forEach((f) => {
        const a = f.properties || {};
        const bits = [...new Set([a.name, a.street && (a.housenumber ? a.housenumber + ' ' + a.street : a.street), a.district, a.city, a.state, a.country].filter(Boolean))].slice(0, 4);
        if (bits.length) acc.push({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: bits.join(', '), src: 3 });
      });
    })().catch(() => {}),
    (async () => {   // ④ Nominatim
      const vb = near ? `&viewbox=${near.lng - 0.4},${near.lat + 0.4},${near.lng + 0.4},${near.lat - 0.4}` : '';
      const d = await (await fetchT(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(s)}&format=json&limit=5&accept-language=${l}${vb}`, 4500)).json();
      (d || []).forEach((x) => acc.push({ lat: +x.lat, lng: +x.lon, label: x.display_name, src: 4 }));
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
 * Sélecteur de position façon Uber (v2026.10.05.2 : carte Mapbox GL) :
 * l'épingle 📌 reste FIXE au centre — l'utilisateur déplace la carte.
 * L'adresse sous l'épingle = Mapbox, sinon la plus détaillée des bases gratuites.
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
    map.current = createMap(el.current, { lang: langRef.current, center: [initial.lng, initial.lat], zoom: 16 });

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
    setTimeout(() => map.current?.resize(), 60);
    return () => { clearTimeout(tm.current); map.current?.remove(); map.current = null; };
  }, []);

  const goToMe = () => {
    if (!navigator.geolocation) return toast(t('gps_fail'), 'err');
    navigator.geolocation.getCurrentPosition(
      (p) => map.current?.jumpTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 16 }),
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
