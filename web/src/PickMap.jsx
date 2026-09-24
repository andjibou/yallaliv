import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { addBaseLayers } from './mapTiles.js';
import { useT, useLang, toast, api } from './lib.jsx';

// ================= 📍 v2026.09.23.7 — Géocodage double source (gratuit, sans clé) =================
// Le problème « l'adresse existe sur Google Maps mais pas chez nous » vient de la BASE
// d'adresses du geocoder, pas des coordonnées (une lat/lng est identique partout).
// On interroge donc DEUX bases et on garde le résultat le plus détaillé :
//  · Esri World Geocoder (sans clé) — couverture Égypte excellente, noms arabes locaux ;
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
 * 🔎 Recherche par ADRESSE TAPÉE (texte → position) : Esri d'abord (biaisée vers la
 * zone actuellement affichée : « Miami » trouve Miami d'Alexandrie, pas la Floride),
 * Nominatim en secours. Retourne [{lat, lng, label}].
 */
export async function geocodeSearch(q, lang = 'fr', near = null) {
  const l = LANG3(lang);
  const esri = near ? `&location=${near.lng},${near.lat}&distance=15000` : '';
  try {
    const d = await (await fetchT(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(q)}&maxLocations=5&langCode=${l}${esri}`)).json();
    const out = (d?.candidates || []).filter((c) => c.location).map((c) => ({ lat: c.location.y, lng: c.location.x, label: c.address }));
    if (out.length) return out;
  } catch {}
  try {
    const vb = near ? `&viewbox=${near.lng - 0.4},${near.lat + 0.4},${near.lng + 0.4},${near.lat - 0.4}` : '';
    const d = await (await fetchT(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=${l}${vb}`)).json();
    return (d || []).map((x) => ({ lat: +x.lat, lng: +x.lon, label: x.display_name }));
  } catch {}
  return [];
}

/**
 * 🎯 v2026.09.23.9 — Extrait les coordonnées EXACTES d'un lien Google Maps partagé
 * (Partager → Copier le lien). Formats gérés :
 *  · !3dLAT!4dLNG  : marqueur de lieu — précision maximale (priorité) ;
 *  · @LAT,LNG      : épingle posée / caméra centrée dessus ;
 *  · ?q= / query= / destination= / ll= / center=LAT,LNG.
 * Même principe que le bouton 🧭 Navigation livreur : lien Google officiel, gratuit,
 * sans clé API — la position Google est importée au millimètre dans notre carte.
 */
export function parseGmapsUrl(s) {
  const chk = (lat, lng) => (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null);
  try {
    s = String(s || '').trim();
    if (!/^https?:\/\//i.test(s)) return null;
    const num = '(-?\\d+(?:\\.\\d+)?)';
    let m = s.match(new RegExp('!3d' + num + '!4d' + num));
    if (m) return chk(+m[1], +m[2]);
    m = s.match(new RegExp('@' + num + ',' + num));
    if (m) return chk(+m[1], +m[2]);
    const u = new URL(s);
    for (const k of ['q', 'query', 'destination', 'll', 'center']) {
      const v = u.searchParams.get(k);
      if (v) {
        const mm = v.match(new RegExp('^' + num + ',\\s*' + num));
        if (mm) return chk(+mm[1], +mm[2]);
      }
    }
    return null;
  } catch { return null; }
}

/**
 * Sélecteur de position façon Uber :
 * l'épingle 📌 reste FIXE au centre — l'utilisateur déplace la carte.
 * 🔎 Nouveau : il peut aussi TAPER son adresse (Esri/OSM) — la carte y va directement,
 * puis il affine à la main. L'adresse affichée = la plus détaillée des deux bases.
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
  const [q, setQ] = useState('');            // 🔎 texte recherché
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [paste, setPaste] = useState('');    // 🎯 lien Google Maps partagé (collé)
  const [busyG, setBusyG] = useState(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true }).setView([initial.lat, initial.lng], 16);
    addBaseLayers(map.current);   // 🗺️ Plan/Satellite + mémoire du choix

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

  // 🔎 Recherche : la position actuelle sert de BIAIS (résultats proches d'abord)
  const doSearch = async () => {
    if (!q.trim() || searching) return;
    setSearching(true); setResults(null);
    const r = await geocodeSearch(q.trim(), langRef.current, pos);
    setResults(r);
    setSearching(false);
    if (!r.length) toast(t('addr_no_result'), 'err');
  };
  const goTo = (r) => {
    map.current?.setView([r.lat, r.lng], 17);
    setResults(null);
  };

  // 🎯 Ouvre Google Maps (app native ou web) avec la recherche en cours pré-remplie —
  // même principe que le bouton 🧭 Navigation livreur : lien officiel Google, gratuit, sans clé.
  const openG = () => {
    const qq = q.trim();
    window.open('https://www.google.com/maps/search/?api=1' + (qq ? '&query=' + encodeURIComponent(qq) : ''), '_blank');
  };

  // 🎯 Importe les coordonnées EXACTES du lien Google Maps partagé. Les liens courts
  // (maps.app.goo.gl) sont étendus par notre serveur, puis analysés : l'épingle
  // Leaflet prend la position Google au millimètre près.
  const importG = async () => {
    let s = paste.trim();
    if (!s || busyG) return;
    setBusyG(true);
    try {
      if (/goo\.gl|g\.co/.test(s)) {
        try { const d = await api('/gmaps/expand?url=' + encodeURIComponent(s)); if (d?.url) s = d.url; } catch {}
      }
      const p = parseGmapsUrl(s);
      if (!p) { toast(t('gmap_bad_link'), 'err'); return; }
      setPaste('');
      map.current?.setView([p.lat, p.lng], 18);
      toast(t('gmap_imported'), 'ok');
    } finally { setBusyG(false); }
  };

  const confirm = async () => {
    setBusy(true);
    const address = addr || (await reverseGeocode(pos.lat, pos.lng, langRef.current));
    setBusy(false);
    onConfirm({ ...pos, address });
  };

  return (
    <div>
      {/* 🔎 Recherche par adresse tapée — le résultat le plus proche de la zone affichée */}
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <input
          className="grow" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } }}
          placeholder={'🔎 ' + t('addr_search')}
          style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #e3e9f0', fontSize: 14 }}
        />
        <button className="btn primary" disabled={searching} onClick={doSearch}>{searching ? '…' : '🔍'}</button>
      </div>
      {results && results.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 8, overflow: 'hidden' }}>
          {results.map((r, i) => (
            <button key={i} onClick={() => goTo(r)}
              style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: i < results.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', fontSize: 13.5, lineHeight: 1.35 }}>
              📍 {r.label}
            </button>
          ))}
        </div>
      )}
      {/* 🎯 Précision Google Maps : chercher sur Google (lien officiel gratuit), puis
          importer les coordonnées exactes du lien partagé — épingle au millimètre */}
      <div className="card" style={{ padding: 10, marginBottom: 8 }}>
        <div className="row spread wrap" style={{ gap: 6 }}>
          <div className="small" style={{ fontWeight: 800 }}>🎯 {t('gmap_title')}</div>
          <button className="btn blue sm" onClick={openG}>🔗 {t('gmap_open')}</button>
        </div>
        <div className="muted small mt4">{t('gmap_hint')}</div>
        <div className="row mt8" style={{ gap: 6 }}>
          <input
            className="grow" value={paste} onChange={(e) => setPaste(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); importG(); } }}
            placeholder={t('gmap_paste')}
            style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #e3e9f0', fontSize: 13 }}
          />
          <button className="btn primary" disabled={busyG} onClick={importG}>{busyG ? '…' : '⬇️'}</button>
        </div>
      </div>
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
