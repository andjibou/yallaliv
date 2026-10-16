import React, { useEffect, useRef, useState } from 'react';
import { useT, useLang, toast } from './lib.jsx';
import { createMap, gAutocomplete, gPlaceDetails, fetchT, LANG3, l2Get, l2Put } from './MapGl.jsx';   // 🆓 v43 : Google UNIQUEMENT pour l'autocomplétion + Place Details (géocodage inverse 100 % gratuit)
import { useMapFullscreen, FsBtn, FS_STYLE } from './MapFullscreen.jsx';   // ⛶ v42 : plein écran PARTOUT où il y a une carte   // v36 : Places session + v38 : l2Get/l2Put (cache suggestions partage)   // 🎯 v36 : Places Autocomplete en session + Place Details à la sélection

// ================= 📍 v2026.10.14.34 — Géocodage CINQ-SOURCES (économie de quota) =================
// 🆓 v35 : l'AUTOCOMPLÉTION n'interroge PLUS JAMAIS Google — rapport utilisateur :
// « la consommation ne devrait avoir lieu que lorsque l'utilisateur clique sur une
// adresse suggérée ». Mieux encore : cliquer une suggestion ne consomme RIEN non plus
// (chaque suggestion porte DÉJÀ ses coordonnées). Donc :
//  · frappe (autocomplétion) : 100% GRATUITE — Mapbox/Esri/Photon/Nominatim seuls ;
//  · clic sur une suggestion : 0 appel (position = celle de la suggestion) ;
//  · « Choisir sur la carte » : exploration GRATUITE + Google UNE SEULE FOIS à la
//    confirmation, pour l'adresse ENREGISTRÉE (meilleure qualité, cache 90 j partagé
//    entre tous les appareils) — seul point de consommation restant.
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
 * Géocodage inverse (coordonnées → adresse lisible) — 🆓 v43 : Esri + Nominatim
 * en parallèle (gratuits, sans clé), on garde l'adresse la plus détaillée
 * (rue + numéro + quartier = score le plus haut).
 */
export async function reverseGeocode(lat, lng, lang = 'fr') {   // 🥇 à la CONFIRMATION (1 appel, caché 90 j)
  return reverseGeocodeFree(lat, lng, lang);
}

/** 🆓 v34 : géocodage inverse SANS Google (Esri/Mapbox/Nominatim) — pour l'EXPLORATION
 *  de la carte : déplacer l'épingle 20 fois = 0 quota consommé. */
export async function reverseGeocodeFree(lat, lng, lang = 'fr') {
  const l = LANG3(lang);
  const jobs = [   // 🆓 v43 : Esri + Nominatim — gratuits et sans clé
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
// 🔐 v36 : TOKEN DE SESSION — toute la frappe d'une adresse = UNE session Google ;
// clôturée à la sélection (pickPlace → Place Details) : c'est LÀ, et seulement là,
// que la session est facturée. Champ vidé → session suivante = nouveau token.
let acTok = null;
const acNewTok = () => { try { acTok = (crypto.randomUUID ? crypto.randomUUID() : 'yl' + Date.now() + Math.random().toString(36).slice(2)); } catch { acTok = 'yl' + Date.now(); } return acTok; };

/** 📌 À la SÉLECTION d'une suggestion — clôt la session (l'unique facturation) et
 *  récupère les coordonnées exactes. Moteurs gratuits : coordonnées déjà présentes. */
export async function pickPlace(pred, lang = 'fr') {
  if (pred?.placeId) {
    const d = await gPlaceDetails(pred.placeId, acTok, lang).catch(() => null);
    acTok = null;   // la prochaine frappe ouvrira une NOUVELLE session
    if (d) return { lat: d.lat, lng: d.lng, label: d.address || pred.label };
    const alts = await freeSearch(String(pred.label || ''), LANG3(lang), null).catch(() => []);   // 🧯 repli rare (quota/panne) : géocodage gratuit de l'étiquette
    const alt = (alts || []).find((x) => x.lat != null);
    if (alt) return { lat: alt.lat, lng: alt.lng, label: pred.label };
    return { lat: null, lng: null, label: pred.label };
  }
  return { lat: pred?.lat, lng: pred?.lng, label: pred?.label };
}

// 🧠 v38 : cache des suggestions — LOCAL (5 min, 30 entrées LRU) + PARTAGÉ sur le
// serveur (24 h, clé ac|lang|requête|zone). Effacer un caractère et le retaper, ou
// deux utilisateurs qui cherchent la même rue = 0 appel Google.
const AC_TTL = 5 * 60e3;
const acCache = new Map();   // ck → { t, r }
const acCk = (s, l, near) => 'ac|' + l + '|' + s.toLowerCase() + '|' + (near ? (+near.lat).toFixed(2) + ',' + (+near.lng).toFixed(2) : '-');

/** 🎯 v39 (option B) : passage GOOGLE — déclenché à la PAUSE (≈1,2 s après la dernière frappe).
 *  Caches local 5 min + serveur 24 h : retaper / 2ᵉ utilisateur = 0 appel. null = Places
 *  indisponible → l'appelant garde les suggestions gratuites affichées. */
export async function geocodeSearchGoogle(q, lang = 'fr', near = null) {
  const l = LANG3(lang);
  const s = String(q || '').trim();
  if (s.length < 6) return null;
  const ck = acCk(s, l, near);
  const hit = acCache.get(ck);
  if (hit && Date.now() - hit.t < AC_TTL) return hit.r;   // 💾 retaper la même requête = 0 appel
  if (hit) acCache.delete(ck);
  const l2 = await l2Get(ck).catch(() => undefined);   // 🗄️ déjà cherché par UN AUTRE utilisateur = 0 appel
  if (Array.isArray(l2)) { acCache.set(ck, { t: Date.now(), r: l2 }); return l2; }
  const gp = await gAutocomplete(s, l, near, acTok || acNewTok()).catch(() => null);   // 🎯 session (v36)
  if (gp !== null) {
    acCache.set(ck, { t: Date.now(), r: gp });
    if (acCache.size > 30) acCache.delete(acCache.keys().next().value);   // LRU 30 requêtes
    l2Put(ck, gp);
    return gp;
  }
  // 🧯 v40 : secours UNIQUEMENT si Google est indisponible (quota / panne / clé bloquée) —
  // choix utilisateur : GOOGLE SEUL → les moteurs gratuits ne s'affichent JAMAIS sinon.
  const free = await freeSearch(s, l, near).catch(() => null);
  return free && free.length ? free.slice(0, 6) : null;
}

async function freeSearch(s, l, near) {   // 🧯 moteurs GRATUITS (repli de l'autocomplétion Google)
  // 🥇 ordre de pertinence : adresse COMPLÈTE → Google puis Mapbox/Esri ; frappe
  // PARTIELLE (un seul mot) → Photon d'abord (« smou » trouve déjà Smouha).
  const order = s.includes(' ') ? [1, 2, 3, 4] : [3, 1, 2, 4];
  const acc = [];   // chaque moteur dépose ses résultats DÈS qu'il répond
  const jobs = [
    // 🧯 v36 : ces moteurs GRATUITS servent de REPLI quand Places (Google) est
    // indisponible — et l'appui avant activation. Les suggestions Google (cliquées)
    // passent par pickPlace → Place Details en session.
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
  // 🧭 v35 : RECENTRAGE LOCAL — sans Google dans l'autocomplétion, il faut garantir la
  // pertinence : les résultats à moins de ~40 km du point de référence (near) passent
  // EN PREMIER, ceux du pays (jusqu'à ~400 km) ensuite, le reste (autre pays…) tout en
  // bas. Le tri est stable : l'ordre des sources est conservé au sein de chaque palier.
  const km = (r) => (near ? Math.hypot((r.lat - near.lat) * 111, (r.lng - near.lng) * 100) : 0);
  const tier = (r) => (near ? (km(r) < 40 ? 0 : km(r) < 400 ? 1 : 2) : 1);
  const all = acc.slice().sort((a, b) => tier(a) - tier(b) || order.indexOf(a.src) - order.indexOf(b.src));
  const out = [], seen = [];
  for (const r of all) {
    if (out.length >= 7) break;
    if (seen.some((p) => Math.abs(p.lat - r.lat) < 0.001 && Math.abs(p.lng - r.lng) < 0.001)) continue;   // 🧭 v35 : doublon ≈ même position (~100 m — les moteurs décrivent la même rue)
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
  const { full, toggle } = useMapFullscreen(map);   // ⛶ v42
  const tm = useRef(null);
  const [pos, setPos] = useState(initial);
  const [addr, setAddr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = createMap(el.current, { lang: langRef.current, center: [initial.lng, initial.lat], zoom: 16, poolKey: 'pick' });   // 🏊 v37 : survit en arrière-plan ≤ 12 h (réouverture GRATUITE)

    const upd = () => {
      const c = map.current.getCenter();
      setPos({ lat: c.lat, lng: c.lng });
    };
    map.current.on('move', upd);
    map.current.on('moveend', () => {
      setAddr(null);
      clearTimeout(tm.current);
      // 🆓 v34 : l'EXPLORATION est GRATUITE — jamais Google ici (était : 1 appel Google à
      // CHAQUE arrêt de déplacement !). Google n'est consulté qu'au bouton Confirmer.
      tm.current = setTimeout(async () => {
        const c = map.current.getCenter();
        setAddr(await reverseGeocodeFree(c.lat, c.lng, langRef.current));
      }, 700);
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
    // 🐢 v34 : UN SEUL appel Google ici (cache 90 j + partagé entre appareils) pour
    // l'adresse ENREGISTRÉE — l'exploration gratuite ci-dessus a affiché une
    // approximation entre-temps ; on ne garde que la meilleure adresse au final.
    const address = (await reverseGeocode(pos.lat, pos.lng, langRef.current)) || addr;
    setBusy(false);
    onConfirm({ ...pos, address });
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div ref={el} style={full ? FS_STYLE : { position: 'relative', height: 320, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }}>
          <FsBtn full={full} onClick={toggle} />   {/* ⛶ v42 : carte plein écran */}
        </div>
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
