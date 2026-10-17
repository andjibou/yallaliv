import * as maplibregl from 'maplibre-gl';   // 🆓 v45 : MapLibre GL — fork COMMUNAUTAIRE de mapbox-gl, SANS token, SANS requête mapbox.com (mapbox-gl v2+ exige un token pour afficher les tuiles — cause des cartes grises v44)
import 'maplibre-gl/dist/maplibre-gl.css';

// 🔧 v46 : WORKER auto-hébergé — MapLibre calcule l'URL de son worker par rapport au module
// (inexistante en dev Vite .vite/deps/ ET en build /assets/) → « Worker failed to load » →
// les sources GeoJSON n'étaient JAMAIS traitées → itinéraires invisibles. On héberge le
// worker (copie de node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs) dans public/.
try { maplibregl.config.WORKER_URL = '/yl-maplibre-worker.mjs'; } catch {}
import {
  GMAPS_KEY, createGoogleMap, attachMarker, markerSetPos, markerRemove, bindGPopup,
  addGLine, gForward, gReverse, gRoute, gOrderRoute, gAutocomplete, gPlaceDetails, loadGoogle, gFailed, onAuthFailure, l2Get, l2Put, snapToRoute,
} from './MapGoogle.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// 🗺️ MapGl.jsx — v2026.10.16.43 : CARTES 100 % OPENSTREETMAP (GRATUITES).
//   · AFFICHAGE : bibliothèque mapbox-gl (libre) + tuiles tile.openstreetmap.org
//     → PLUS AUCUNE carte Google : 0 Maps JavaScript API, 0 facturation au chargement.
//   · RECHERCHE D'ADRESSE : Google Places Autocomplete en session (la SEULE API
//     Google conservée — choix utilisateur v43) ; la sélection (Place Details)
//     rend lat/lng, tracés TELS QUELS sur la carte OSM (même WGS84, même point).
//   · ITINÉRAIRES : OSRM public (gratuit, sans clé) + cache partagé serveur.
//   · GÉOCODAGE INVERSE : Esri + Nominatim (gratuits, sans clé).
// 🚫 v44 : plus AUCUNE trace du service Mapbox (clé supprimée) — la bibliothèque
//   open-source mapbox-gl ne sert qu'à DESSINER les tuiles OpenStreetMap.
// Les 8 composants carte (PickMap, RouteMap, DualRouteMap, TourMap, StoresMap,
// TrackMap, DriversMap, MapFullscreen) ne parlent qu'à cette façade.
// ═══════════════════════════════════════════════════════════════════════════

// 🔑 Clé Google via VARIABLE D'ENVIRONNEMENT (jamais dans le code) : VITE_GMAPS_KEY
// (Vercel + web/.env.local) — utilisée UNIQUEMENT pour la recherche d'adresse (Places).
// 🚫 v44 : PLUS AUCUNE CLÉ MAPBOX — les cartes affichent uniquement OpenStreetMap.

// 🗺️ v44 : LE style de carte unique — tuiles raster OpenStreetMap (gratuites, sans clé).
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

// (🚫 v44 : plus de plugin RTL Mapbox — inutile pour des tuiles raster OSM,
//  les libellés sont déjà dans les images de tuiles.)

function createMapboxMap(el, { center = [29.9187, 31.2001], zoom = 13, bearing = 0 } = {}) {
  // 🆓 v43/v44 : tuiles OpenStreetMap raster UNIQUEMENT — gratuites, sans clé, sans
  // compte. Rotation NATIVE conservée (setBearing / geste à deux doigts) ;
  // inclinaison désactivée : la carte reste PLATE (zéro bâtiment 3D — choix v42).
  const map = new maplibregl.Map({
    container: el,
    style: FALLBACK_STYLE,
    center, zoom, bearing,
    pitchWithRotate: false,   // ⛔ jamais d'inclinaison — carte plate
    attributionControl: { compact: true },
  });
  map.on('styledata', () => {
    const p = map._ylPend;
    if (!p) return;
    for (const k of Object.keys(p)) { try { p[k](); } catch {} delete p[k]; }
  });
  return map;
}

// 🆓 v43 : registre des cartes vivantes (sonde pour les tests) — remplace le pool
// Google v37, devenu inutile : OpenStreetMap ne facture RIEN au chargement.
const MLIVE = new Set();
try { window.__ylMaps = MLIVE; } catch {}   // sonde (tests)

/**
 * Crée la carte — v43/v44 : TOUJOURS OpenStreetMap (bibliothèque mapbox-gl +
 * tuiles OSM gratuites, SANS AUCUNE clé). Google ne sert qu'à la RECHERCHE
 * D'ADRESSE (Places Autocomplete → PickMap). Filet de sécurité : si la carte ne
 * peut pas s'initialiser (WebGL indisponible), un message clair remplace la
 * carte au lieu de casser la page.
 */
export function createMap(el, opts = {}) {
  try {
    const m = createMapboxMap(el, opts);
    MLIVE.add(m);
    const origRemove = m.remove.bind(m);
    m.remove = () => { MLIVE.delete(m); try { origRemove(); } catch {} };   // sonde propre
    return m;
  } catch (ex) {
    // 🧯 carte indisponible → message visible, page intacte (objet no-op)
    try {
      const msg = document.createElement('div');
      msg.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center;color:#64748b;font-weight:700;font-size:14px;background:#eef2f7;border-radius:14px';
      msg.textContent = '🗺️ Carte indisponible sur cet appareil';
      el.appendChild(msg);
    } catch {}
    const noop = () => {};
    return { __dead: true, on: noop, off: noop, once: noop, remove: noop, jumpTo: noop, easeTo: noop, stop: noop, resize: noop, getBearing: () => 0, setBearing: noop, getPitch: () => 0, setPitch: noop, getZoom: () => 13, setZoom: noop, getCenter: () => ({ lat: 31.2001, lng: 29.9187 }), setCenter: noop, getCanvas: () => null, getStyle: () => ({ layers: [] }), fitBounds: noop, project: () => ({ x: 0, y: 0 }), addSource: noop, addLayer: noop, getSource: () => null, removeLayer: noop, removeSource: noop, _ylPend: {} };
  }
}

// ───────────────────────── API recherche / inverse / itinéraires (chaînes) ─────────────────────────
// 🆓 v44 : 100 % gratuit — Photon/Nominatim (recherche), Esri/Nominatim (inverse), OSRM (itinéraires).

export { gForward, gReverse, gRoute, gOrderRoute, gAutocomplete, gPlaceDetails, l2Get, l2Put, snapToRoute };   // + 📐 v41 snapToRoute (pastille collée + trajet parcouru gris)

/** Recherche GRATUITE (🆓 v43 : plus de géocodage Google/Mapbox) : Photon puis Nominatim. [{lat,lng,label}] */
export async function geoForward(q, lang = 'fr', near = null) {
  const l = LANG3(lang);
  try {
    const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : '';
    const d = await (await fetchT(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=${l}${bias}`, 4500)).json();
    const out = (d?.features || []).filter((f) => f?.geometry?.coordinates)
      .map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: [f.properties?.name, f.properties?.street, f.properties?.city, f.properties?.state].filter(Boolean).join(', ') }))
      .filter((r) => r.label);
    if (out.length) return out;
  } catch {}
  try {
    const vb = near ? `&viewbox=${near.lng - 0.35},${near.lat + 0.35},${near.lng + 0.35},${near.lat - 0.35}` : '';
    const d = await (await fetchT(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=${l}${vb}`, 4500)).json();
    return (d || []).map((r) => ({ lat: +r.lat, lng: +r.lon, label: r.display_name }));
  } catch { return []; }
}

/** Géocodage inverse GRATUIT (🆓 v43) : Nominatim (OpenStreetMap). */
export async function geoReverse(lat, lng, lang = 'fr') {
  try {
    const d = await (await fetchT(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=${LANG3(lang)}&zoom=18&addressdetails=1`, 5000)).json();
    return d?.display_name || null;
  } catch { return null; }
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
      this.__inst = new maplibregl.Marker({ element: this.el, anchor: 'center' });
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
    // 🔧 v46 : moteur MapLibre/Mapbox — GLIDE EN JS (requestAnimationFrame). JAMAIS de
    // transition CSS sur l'élément racine : le moteur y écrit « transform » à chaque
    // frame ; une transition CSS y fait TREMBLER le marqueur pendant les déplacements
    // de carte (il lag, puis « revient à sa place » quand le geste s'arrête).
    if (marker && marker.__tgt === 'mb' && marker.__inst && !marker.__ylGlide) {
      marker.__ylGlide = true;
      const inst = marker.__inst;
      const real = inst.setLngLat.bind(inst);
      let raf = 0;
      inst.setLngLat = (ll) => {
        const to = Array.isArray(ll) ? { lng: ll[0], lat: ll[1] } : { lng: ll && ll.lng, lat: ll && ll.lat };
        const cur = inst.getLngLat ? inst.getLngLat() : null;
        if (!cur || cur.lng == null || (to.lng === cur.lng && to.lat === cur.lat)) { real(to); return inst; }
        cancelAnimationFrame(raf);
        const from = { lng: cur.lng, lat: cur.lat };
        const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / 550);   // même douceur que l'ancien .55s
          real({ lng: from.lng + (to.lng - from.lng) * k, lat: from.lat + (to.lat - from.lat) * k });
          if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return inst;
      };
      return;
    }
    // moteur Google : drapeau lu par draw() (positions left/top — pas de conflit transform)
    const el = marker?.getElement?.(); if (!el) return;
    el.style.transition = 'transform .55s linear';
    el.dataset.glide = '1';
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
  const b = new maplibregl.LngLatBounds();
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
  const pop = new maplibregl.Popup({ offset: 22, closeButton: false, maxWidth: '240px' }).setHTML(html);
  marker.__inst?.setPopup?.(pop);
  return pop;
}


