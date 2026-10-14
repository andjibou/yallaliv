import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  GMAPS_KEY, createGoogleMap, attachMarker, markerSetPos, markerRemove, bindGPopup,
  addGLine, gForward, gReverse, gRoute, gAutocomplete, gPlaceDetails, loadGoogle, gFailed, onAuthFailure,
} from './MapGoogle.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// 🗺️ MapGl.jsx — v2026.10.05.3 : FAÇADE CARTES À 3 ÉTAGES pour toute l'app.
//   ① GOOGLE MAPS (si VITE_GMAPS_KEY) — cartes, recherche, itinéraires
//   ② MAPBOX GL (si VITE_MAPBOX_TOKEN) — secours complet
//   ③ Fond OpenStreetMap raster — dernier recours (sans clé, sans compte)
// Une clé absente / un quota atteint / une erreur → bascule AUTOMATIQUE à
// l'étage suivant : l'app n'a JAMAIS de carte morte.
// Les 8 composants carte (PickMap, RouteMap, DualRouteMap, TourMap, StoresMap,
// TrackMap, DriversMap, MapFullscreen) ne parlent qu'à cette façade.
// ═══════════════════════════════════════════════════════════════════════════

// 🔑 Clés via VARIABLES D'ENVIRONNEMENT (jamais dans le code → jamais de push
// bloqué par GitHub Push Protection) :
//   · Google : VITE_GMAPS_KEY (Vercel + web/.env.local)
//   · Mapbox : VITE_MAPBOX_TOKEN (Vercel + web/.env.local)
export const MB_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN || '').trim();

// Style signature Mapbox (secours) + fond OSM raster (dernier recours).
const MB_STYLE = 'mapbox://styles/mapbox/standard';
export const FALLBACK_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export const fetchT = async (url, ms = 6000) => {
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { signal: ac.signal }); } finally { clearTimeout(tm); }
};
export const LANG3 = (l) => (l === 'ar' ? 'ar' : l === 'en' ? 'en' : 'fr');

// ───────────────────────────── Création de carte ─────────────────────────────

// Plugin RTL Mapbox (texte arabe du style vectoriel Mapbox)
let rtlTried = false;
const ensureRtl = () => {
  if (rtlTried || !MB_TOKEN) return;
  rtlTried = true;
  try {
    mapboxgl.setRTLTextPlugin(
      'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.3.0/mapbox-gl-rtl-text.js',
      () => {},
      (e) => console.warn('plugin RTL non chargé :', e),
    );
  } catch {}
};

/** Carte MAPBOX (avec fond OSM de secours si pas de token Mapbox). */
function createMapboxMap(el, { lang = 'fr', center = [29.9187, 31.2001], zoom = 13, bearing = 0 } = {}) {
  ensureRtl();
  if (MB_TOKEN) mapboxgl.accessToken = MB_TOKEN;
  const lg = LANG3(lang);
  const map = new mapboxgl.Map({
    container: el,
    style: MB_TOKEN ? MB_STYLE : FALLBACK_STYLE,
    center, zoom, bearing,
    attributionControl: { compact: true },
  });
  // ⚠️ ne l'appliquer qu'UNE FOIS : le réglage de langue du style Standard
  // déclenche un nouveau cycle style.load — sans garde, boucle infinie de
  // rechargement (couches vides, lignes jamais tracées). Bug .2 corrigé.
  let langDone = false;
  if (MB_TOKEN) map.on('style.load', () => { if (langDone) return; langDone = true; try { map.setConfigProperty('basemap', 'language', lg); } catch {} });
  map.on('styledata', () => {
    const p = map._ylPend;
    if (!p) return;
    for (const k of Object.keys(p)) { try { p[k](); } catch {} delete p[k]; }
  });
  return map;
}

/**
 * Crée la carte : Google si clé disponible, sinon Mapbox, sinon OSM.
 * Filet anti-carte-morte : si le script Google échoue (clé invalide…) et qu'un
 * token Mapbox existe, la carte Google est REMPLACÉE par Mapbox dans le même
 * élément, avec re-branchement des écouteurs — l'utilisateur ne voit rien.
 */
// 🏊 v37 : pool de cartes en arrière-plan (≤ 12 h, LRU 4) — key → { A, div, t }
const MPOOL = new Map();
try { window.__ylMPool = MPOOL; } catch {}   // sonde (tests)

export function createMap(el, opts = {}) {
  const key = GMAPS_KEY();
  // 🟩 v2026.10.13.28 — GOOGLE MAPS UNIQUEMENT quand la clé est configurée :
  // plus AUCUNE bascule Mapbox (plus de watchdog tuiles, plus de secours) —
  // l'utilisateur voit Google, point final. Si un écran affiche « © Mapbox »,
  // c'est le SIGNAL que la clé VITE_GMAPS_KEY manque dans CE build
  // (local : web/.env.local · prod : variable Vercel + Redeploy).
  // 🏊 v37 : POOL DE CARTES — idée utilisateur : la carte ouverte UNE FOIS survit en
  // arrière-plan jusqu'à 12 h. Réouvrir la carte / revoir un trajet = RÉUTILISATION de
  // l'instance → 0 nouveau chargement facturé (Google ne facture qu'à la CRÉATION).
  // Marche pendant toute la session du site ET dans l'APK en arrière-plan (le processus
  // survit). Limite honnête : onglet navigateur fermé = tout est détruit (impossible d'y
  // survivre sur le web) → à la réouverture du site, 1 création (la page se recharge de
  // toute façon). Garde-fous : max 4 cartes en vie (LRU, mémoire téléphones modestes) +
  // TTL 12 h + marqueurs/lignes/handlers nettoyés à chaque détachement.
  if (key && opts.poolKey) {
    const pk = opts.poolKey;
    const hit = MPOOL.get(pk);
    if (hit && !hit.A.__dead && Date.now() - hit.t < 12 * 36e5) {
      hit.A.__handlers = {}; hit.A.__ops = [];   // handlers du composant précédent abandonnés
      try { el.appendChild(hit.div); } catch {}
      for (const c of [...el.children]) if (c !== hit.div) c.style.display = 'none';   // 🎨 v37 : google.maps.Map() vidait le conteneur → le ⛶ n'apparaissait jamais sur les cartes Google — UI rétablie
      try { hit.A.resize(); } catch {}
      setTimeout(() => { try { hit.A.resize(); } catch {} }, 200);
      hit.t = Date.now();
      return hit.A;   // 🏊 réutilisé — AUCUN nouveau chargement facturé
    }
    if (hit) { try { (hit.A.__destroy || hit.A.remove.bind(hit.A))(); } catch {} MPOOL.delete(pk); }
    const div = document.createElement('div');
    div.style.cssText = 'width:100%;height:100%';
    try { el.appendChild(div); } catch {}
    for (const c of [...el.children]) if (c !== div) c.style.display = 'none';   // 🎨 v37 : idem — ⛶ réservé au moteur Mapbox (sans clé)
    const A = createGoogleMap(div, opts);
    const rec = { A, div, t: Date.now() };
    MPOOL.set(pk, rec);
    if (MPOOL.size > 4) {   // 🧠 LRU : plus ancienne carte hors pool (vraie destruction)
      const oldest = [...MPOOL.entries()].filter(([k]) => k !== pk).sort((a, b) => a[1].t - b[1].t)[0];
      if (oldest) { try { (oldest[1].A.__destroy || oldest[1].A.remove.bind(oldest[1].A))(); } catch {} MPOOL.delete(oldest[0]); }
    }
    A.__destroy = A.remove.bind(A);   // vraie destruction (LRU/TTL)
    A.remove = () => {   // 🏊 le composant croit détruire → on DÉTACHE : la carte survit
      try { [...(A.__ylMarkers || new Set())].forEach((mk) => { try { mk.remove(); } catch {} }); } catch {}
      try { [...(A.__ylLines || new Set())].forEach((ln) => { try { ln.remove(); } catch {} }); } catch {}
      A.__handlers = {}; A.__ops = [];
      try { rec.div.remove(); } catch {}   // sortie du DOM — l'instance Google continue en arrière-plan
    };
    return A;
  }
  if (key) return createGoogleMap(el, opts);
  // sans clé (développement hors production) : secours Mapbox → OSM, inchangé
  return createMapboxMap(el, opts);
}

// ───────────────────────── API recherche / inverse / itinéraires (chaînes) ─────────────────────────
// Chaque étage tombe en douceur : Google → Mapbox → moteurs gratuits (PickMap)
// → OSRM (RouteMap).

export { gForward, gReverse, gRoute, gAutocomplete, gPlaceDetails };   // 🎯 v36 : Places Autocomplete (session) + Place Details

/** Recherche : Google d'abord, sinon Mapbox. [{lat,lng,label}] */
export async function geoForward(q, lang = 'fr', near = null) {
  const g = await gForward(q, lang, near).catch(() => []);
  if (g && g.length) return g;
  return mbForward(q, lang, near).catch(() => []);
}

/** Géocodage inverse : Google d'abord, sinon Mapbox. */
export async function geoReverse(lat, lng, lang = 'fr') {
  const g = await gReverse(lat, lng, lang).catch(() => null);
  if (g) return g;
  return mbReverse(lat, lng, lang).catch(() => null);
}

/** Mapbox Geocoding v6 (secours — 100k/mois gratuits) ou [] sans token. */
export async function mbForward(q, lang = 'fr', near = null) {
  if (!MB_TOKEN) return [];
  const p = near ? `&proximity=${near.lng},${near.lat}` : '';
  const d = await (await fetchT(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&language=${LANG3(lang)}&limit=5${p}&access_token=${MB_TOKEN}`, 4000)).json();
  return (d?.features || [])
    .filter((f) => f?.geometry?.coordinates)
    .map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: f.properties?.full_address || f.properties?.name || '' }))
    .filter((r) => r.label);
}

/** Mapbox géocodage inverse (secours) ou null. */
export async function mbReverse(lat, lng, lang = 'fr') {
  if (!MB_TOKEN) return null;
  try {
    const d = await (await fetchT(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&language=${LANG3(lang)}&access_token=${MB_TOKEN}`, 4000)).json();
    return d?.features?.[0]?.properties?.full_address || null;
  } catch { return null; }
}

/** Mapbox Directions (secours — trafic réel) ou null. */
export async function mbRoute(from, to) {
  if (!MB_TOKEN) return null;
  const d = await (await fetchT(`https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full&access_token=${MB_TOKEN}`, 4500)).json();
  const r = d?.routes?.[0];
  if (!r) return null;
  return { coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]), distance: r.distance, duration: r.duration };
}

// ───────────────────────────── Marqueurs (bi-moteur) ─────────────────────────────
// Le même élément DOM sert aux deux moteurs : arrowSetHeading et glideMarker
// (qui ne touchent que le DOM) fonctionnent à l'identique.

class YlMarker {
  constructor(el) { this.el = el; this.__pos = null; this.__tgt = null; this.__inst = null; this.__A = null; this.__popupHtml = null; }
  setLngLat(ll) {
    this.__pos = ll;
    if (this.__tgt === 'mb' && this.__inst) this.__inst.setLngLat(ll);
    else if (this.__tgt === 'g' && this.__inst) markerSetPos(this.__inst, ll[0], ll[1]);
    return this;
  }
  addTo(m) {
    if (m.__mb || m.__yl !== 'google') {   // Mapbox (ou adaptateur Google déjà basculé)
      this.__tgt = 'mb';
      this.__inst = new mapboxgl.Marker({ element: this.el, anchor: 'center' });
      if (this.__pos) this.__inst.setLngLat(this.__pos);
      this.__inst.addTo(m.__mb || m);
    } else {                                // Google
      this.__tgt = 'g'; this.__A = m;
      this.__inst = attachMarker(m, this.el, this.__pos);
      (m.__ylMarkers = m.__ylMarkers || new Set()).add(this);   // registre : migration si bascule
    }
    return this;
  }
  getElement() { return this.el; }
  getPopup() {
    if (this.__tgt === 'mb') return this.__inst?.getPopup?.() || null;
    return this.__popupStub || null;   // stub .setHTML() pour DriversMap (màj du contenu)
  }
  setPopup(p) { this.__inst?.setPopup?.(p); return this; }
  remove() {
    if (this.__tgt === 'mb') this.__inst?.remove();
    else if (this.__inst) markerRemove(this.__inst);
    try { this.__A?.__ylMarkers?.delete(this); } catch {}
    this.__inst = null;
  }
}

function mkMarkerEl(css, html) {
  const el = document.createElement('div');
  el.style.cssText = css;
  el.innerHTML = html;
  return el;
}

/** Marqueur emoji (🏪 🏠 🛵…) — même rendu sur Google et Mapbox. */
export function emojiMarker(emoji, size = 26) {
  const el = document.createElement('div');
  el.style.cssText = `font-size:${size}px;line-height:${size}px;text-shadow:0 1px 4px rgba(0,0,0,.45)`;
  el.textContent = emoji;
  return new YlMarker(el);
}

/** 🧭 Marqueur livreur « style Uber » : pastille + bec directionnel. */
export function arrowMarker(color = '#0e9f6e', dim = false) {
  const el = mkMarkerEl(`position:relative;width:40px;height:40px;${dim ? 'filter:grayscale(1);opacity:.55;' : ''}`,
    `<div class="yl-rot" style="position:absolute;inset:0;transition:transform .2s ease-out;will-change:transform">` +
      `<svg width="40" height="40" viewBox="0 0 40 40" style="position:absolute;inset:0;overflow:visible">` +
        `<path d="M20 -3 L27.5 11.5 L20 8 L12.5 11.5 Z" fill="${color}" stroke="#fff" stroke-width="1.6"/>` +
      `</svg>` +
    `</div>` +
    `<div style="position:absolute;top:7px;left:7px;width:26px;height:26px;border-radius:50%;background:#fff;border:3px solid ${color};box-shadow:0 2px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:13px">🛵</div>`);
  return new YlMarker(el);
}

/** Changement de statut d'une flèche SANS la recréer (couleur + estompage). */
export function updateArrowStatus(marker, color, dim) {
  try {
    const el = marker?.getElement?.(); if (!el) return;
    const path = el.querySelector('svg path'); if (path) path.setAttribute('fill', color);
    const ring = el.querySelector('div[style*="border-radius:50%"]'); if (ring) ring.style.borderColor = color;
    el.style.filter = dim ? 'grayscale(1)' : '';
    el.style.opacity = dim ? '.55' : '1';
  } catch {}
}

/** Marqueur arrêt numéroté (tournées) : 🏪/🏠 + badge 1,2,3… */
export function stopMarker(emoji, n, kind) {
  const el = mkMarkerEl('position:relative;font-size:24px;text-align:center;line-height:1;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))',
    `${emoji}<div style="position:absolute;top:-7px;right:-13px;background:${kind === 'pickup' ? '#ef4444' : '#0e9f6e'};color:#fff;font-size:10px;font-weight:800;border-radius:999px;min-width:15px;padding:1px 3px;border:2px solid #fff">${n}</div>`);
  return new YlMarker(el);
}

/** Marqueur boutique : pastille blanche, photo ou emoji, bord couleur. */
export function storeMarker(s) {
  const el = mkMarkerEl(`display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:12px;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.35);border:2.5px solid ${s.color || '#0e9f6e'};font-size:19px;overflow:hidden`,
    s.photo ? `<img src="${s.photo}" style="width:28px;height:28px;border-radius:8px;object-fit:cover" />` : (s.emoji || '🏪'));
  return new YlMarker(el);
}

/** Cap du bec directionnel (compense la rotation de la carte). */
export function arrowSetHeading(marker, hdg, mapBearing) {
  try {
    const el = marker?.getElement?.()?.querySelector?.('.yl-rot');
    if (!el || typeof hdg !== 'number' || isNaN(hdg)) return;
    const target = ((hdg + (mapBearing || 0)) % 360 + 360) % 360;
    const prev = parseFloat(el.dataset.rot || '0') || 0;
    const d = ((target - prev) % 360 + 540) % 360 - 180;
    el.dataset.rot = String(prev + d);
    el.style.transform = `rotate(${prev + d}deg)`;
  } catch {}
}

/** Déplacement fluide (glisse au lieu de sauter). */
export function glideMarker(marker) {
  try {
    const el = marker?.getElement?.(); if (!el) return;
    el.style.transition = 'transform .55s linear';
    el.dataset.glide = '1';   // le moteur Google lit ce drapeau dans draw()
  } catch {}
}

// ───────────────────────────── Lignes (itinéraires) ─────────────────────────────

let lineSeq = 0;
/**
 * Trace une ligne. coords = [[lat, lng], …]. { color, width, dashed, opacity }.
 * Retourne un identifiant (Google : objet avec .remove() ; Mapbox : id source).
 */
export function addLine(map, coords, opts = {}) {
  if (map.__yl === 'google' && !map.__mb) {
    const W = addGLine(map, coords, opts);
    W.__ylCoords = coords; W.__ylOpts = opts;
    (map.__ylLines = map.__ylLines || new Set()).add(W);   // registre : migration si bascule
    return W;
  }
  const m = map.__mb || map;
  const id = 'yl-line-' + (++lineSeq);
  const data = { type: 'Feature', geometry: { type: 'LineString', coordinates: (coords || []).map(([lat, lng]) => [lng, lat]) } };
  const layerDef = {
    id, type: 'line', source: id,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': opts.color || '#0e9f6e',
      'line-width': opts.width || 5,
      'line-opacity': opts.opacity ?? 0.85,
      ...(opts.dashed ? { 'line-dasharray': [2.5, 2] } : {}),
    },
  };
  const draw = () => {
    // idempotent ÉTAPE PAR ÉTAPE : si addSource a réussi mais addLayer a été
    // rejeté, on réessaie juste la couche.
    try {
      if (!m.getStyle()) return;
      if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data });
      if (!m.getLayer(id)) m.addLayer(layerDef);
    } catch {}
  };
  draw();   // tentative immédiate — isStyleLoaded() peut rester fausse de longues
            // secondes alors que l'ajout fonctionne très bien
  if (!m.getLayer(id)) (m._ylPend = m._ylPend || {})[id] = draw;   // style pas prêt → file d'attente
  // 🩹 AUTO-RÉPARATION par sondage : le chargement du plugin RTL (labels arabes
  // des tuiles égyptiennes) recharge le style ~200 ms après le 1er chargement et
  // EFFACE les couches déjà posées ; getSource/getLayer peuvent lire l'ancien
  // style (mentir) et aucun événement ne survient parfois pendant des secondes.
  // draw() étant idempotent, on re-vérifie toutes les 400 ms (max 30 s) et à
  // chaque styledata/style.load — la ligne se (re)trace dès que possible.
  const born = Date.now();
  const heals = (m._ylHeals = m._ylHeals || {});
  heals[id]?.();
  const stop = () => { clearInterval(tm); try { m.off('styledata', heal); m.off('style.load', heal); } catch {} delete heals[id]; };
  const heal = () => { if (m.getLayer(id)) { stop(); return; } draw(); };
  const tm = setInterval(() => { if (Date.now() - born > 30000) { stop(); return; } heal(); }, 400);
  heals[id] = stop;
  try { m.on('styledata', heal); m.on('style.load', heal); } catch {}
  return id;
}

export function rmLine(map, id) {
  if (!id) return;
  if (id.__yl === 'g') { id.remove(); try { map?.__ylLines?.delete(id); } catch {} return; }   // ligne Google
  const m = map?.__mb || map;
  try { m?._ylHeals?.[id]?.(); } catch {}   // arrêter la réparation AVANT de retirer
  try { if (m?._ylPend) delete m._ylPend[id]; } catch {}
  try { if (m.getLayer(id)) m.removeLayer(id); } catch {}
  try { if (m.getSource(id)) m.removeSource(id); } catch {}
}

// ───────────────────────────── Cadrage & popups ─────────────────────────────

/** Cadre la carte sur des points [[lat, lng], …] (les 2 moteurs). */
export function fitPts(map, pts, pad = 0.3, opts = {}) {
  if (!map || !pts?.length) return;
  if (map.__yl === 'google' && !map.__mb) {
    map.__op((g, m) => {
      if (pts.length === 1) { m.setCenter({ lat: pts[0][0], lng: pts[0][1] }); m.setZoom(opts.zoom || 14); return; }
      const b = new g.maps.LatLngBounds();
      pts.forEach(([lat, lng]) => b.extend({ lat, lng }));
      const div = m.getDiv();
      const padPx = Math.round(pad * Math.min(div?.clientWidth || 360, div?.clientHeight || 300) * 0.5);
      m.fitBounds(b, padPx);
      if (opts.maxZoom) g.maps.event.addListenerOnce(m, 'idle', () => { if (m.getZoom() > opts.maxZoom) m.setZoom(opts.maxZoom); });
    });
    return;
  }
  const m = map.__mb || map;
  if (pts.length === 1) { m.jumpTo({ center: [pts[0][1], pts[0][0]], zoom: opts.zoom || 14 }); return; }
  const b = new mapboxgl.LngLatBounds();
  pts.forEach(([lat, lng]) => b.extend([lng, lat]));
  const cw = m.getCanvas()?.clientWidth || 360, ch = m.getCanvas()?.clientHeight || 300;
  m.fitBounds(b, { padding: Math.round(pad * Math.min(cw, ch) * 0.5), maxZoom: opts.maxZoom || 17, duration: 0 });
}

/** Popup HTML au clic sur un marqueur (les 2 moteurs). */
export function bindPopup(marker, html) {
  if (!marker) return;
  if (marker.__tgt === 'g') {
    marker.__popupHtml = html;
    marker.__popupStub = { setHTML: (h) => { marker.__popupHtml = h; } };
    bindGPopup(marker.__A, marker.__inst, () => marker.__popupHtml);
    return marker.__popupStub;
  }
  const pop = new mapboxgl.Popup({ offset: 22, closeButton: false, maxWidth: '240px' }).setHTML(html);
  marker.__inst?.setPopup?.(pop);
  return pop;
}

export { mapboxgl };
