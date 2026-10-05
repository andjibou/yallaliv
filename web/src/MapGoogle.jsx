// ═══════════════════════════════════════════════════════════════════════════
// 🗺️ MapGoogle.jsx — v2026.10.05.3 : moteur GOOGLE MAPS (étage 1 sur 3).
// Google Maps JS (cartes) + Geocoder (recherche) + Routes API computeRoutes (itinéraires).
// Chargement du script par injection manuelle → AUCUNE dépendance npm.
// La façade MapGl.jsx choisit ce moteur si VITE_GMAPS_KEY est définie, sinon
// Mapbox, sinon le fond OSM. Une clé absente/quota dépassé/erreur → bascule.
// ═══════════════════════════════════════════════════════════════════════════

const LANG3 = (l) => (l === 'ar' ? 'ar' : l === 'en' ? 'en' : 'fr');

export const GMAPS_KEY = () => String(import.meta.env.VITE_GMAPS_KEY || '').trim();

let loadPromise = null;
export let gFailed = false;   // le chargement a échoué (clé invalide…) → ne plus réessayer

// 🔐 Google appelle window.gm_authFailure quand la clé est invalide / l'API
// désactivée / le quota atteint. On s'y branche pour déclencher la bascule
// vers Mapbox (la façade s'abonne via onAuthFailure).
const authFns = new Set();
export function onAuthFailure(fn) { authFns.add(fn); return () => authFns.delete(fn); }
try {
  const prev = window.gm_authFailure;
  window.gm_authFailure = function () { gFailed = true; authFns.forEach((f) => { try { f(); } catch {} }); try { prev?.(); } catch {} };
} catch {}

/**
 * Charge l'API Google Maps UNE SEULE FOIS (langue de l'app, région Égypte).
 * Retourne window.google ou null si pas de clé.
 */
export function loadGoogle(lang = 'fr') {
  const key = GMAPS_KEY();
  if (!key) return Promise.resolve(null);
  if (loadPromise) return loadPromise;
  // 🔎 Certaines erreurs de compte (billing non activé…) ne déclenchent NI
  // gm_authFailure NI l'absence de tuiles — Google les signale uniquement en
  // console : « Google Maps JavaScript API error: … ». On intercepte ce message
  // standard pour déclencher la bascule Mapbox (même canal que gm_authFailure).
  try {
    if (!console.__ylHook) {
      console.__ylHook = true;
      const origErr = console.error.bind(console);
      console.error = (...a) => {
        try {
          if (/Google Maps JavaScript API error/i.test(String(a?.[0] || ''))) {
            gFailed = true;
            authFns.forEach((f) => { try { f(); } catch {} });
          }
        } catch {}
        origErr(...a);
      };
    }
  } catch {}
  const cb = '___ylGmapsReady' + Date.now();
  loadPromise = new Promise((resolve, reject) => {
    window[cb] = () => { resolve(window.google); };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=${LANG3(lang)}&region=EG&v=weekly&loading=async&callback=${cb}`;
    s.async = true;
    s.onerror = () => reject(new Error('Google Maps non chargé'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('Google Maps: délai dépassé')), 12000);
  }).catch((e) => { gFailed = true; loadPromise = null; throw e; });
  return loadPromise;
}

/** google résolu (ou null si pas de clé). Ne rejette jamais. */
export async function ensureGoogle(lang = 'fr') {
  try { return await loadGoogle(lang); } catch { return null; }
}

// ───────────────────────── Adaptateur carte (API Mapbox-like) ─────────────────────────
// Nos composants parlent « Mapbox » (jumpTo/panTo/setBearing/getCenter/on…) :
// cet adaptateur traduit vers Google Maps, en file d'attente tant que le
// script n'est pas prêt (les composants n'attendent jamais).

export function createGoogleMap(el, { lang = 'fr', center = [29.9187, 31.2001], zoom = 13 } = {}) {
  const A = {
    __yl: 'google', __g: null, __map: null, __ready: false, __dead: false,
    __ops: [], __handlers: {}, zooming: false, __noAnim: false, __mb: null,
  };
  const emit = (ev, ...a) => (A.__handlers[ev] || []).forEach((f) => { try { f(...a); } catch {} });
  const op = (fn) => { if (A.__dead) return; if (A.__ready) { try { fn(A.__g, A.__map); } catch {} } else A.__ops.push(fn); };

  loadGoogle(lang).then((google) => {
    if (A.__dead || !google) return;
    A.__g = google;
    A.__map = new google.maps.Map(el, {
      center: { lat: center[1], lng: center[0] },
      zoom,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      clickableIcons: false, gestureHandling: 'greedy',
      ...(google.maps.RenderingType ? { renderingType: google.maps.RenderingType.VECTOR } : {}),   // cartes vectorielles → rotation possible
    });
    A.__ready = true;
    A.__ops.forEach((f) => { try { f(A.__g, A.__map); } catch {} });
    A.__ops = [];
    A.__map.addListener('dragstart', () => emit('dragstart'));
    A.__map.addListener('center_changed', () => emit('move'));
    A.__map.addListener('heading_changed', () => emit('rotate'));
    A.__map.addListener('zoom_changed', () => { if (!A.zooming) { A.zooming = true; A.__noAnim = true; emit('zoomstart'); } });
    A.__map.addListener('idle', () => { A.__noAnim = false; if (A.zooming) { A.zooming = false; emit('zoomend'); } emit('moveend'); });
    // 🛟 WATCHDOG TUILES : si aucune tuile n'a chargé 10 s après la création
    // (billing non activé, quota du jour épuisé, panne Google…), on signale le
    // blocage à la façade pour qu'elle bascule sur Mapbox — l'utilisateur ne
    // voit JAMAIS une carte grise.
    let tilesLoaded = false;
    try { A.__map.addListener('tilesloaded', () => { tilesLoaded = true; }); } catch {}
    setTimeout(() => { if (!tilesLoaded && !A.__dead && A.__onStall) { try { A.__onStall(); } catch {} } }, 10000);
  }).catch(() => { A.__dead = true; });   // la façade bascule sur Mapbox

  A.__op = op;
  A.on = (ev, fn) => { (A.__handlers[ev] = A.__handlers[ev] || []).push(fn); return A; };
  A.off = (ev, fn) => { A.__handlers[ev] = (A.__handlers[ev] || []).filter((f) => f !== fn); return A; };
  A.getCenter = () => {
    if (!A.__map) return { lat: center[1], lng: center[0] };
    const c = A.__map.getCenter();
    return { lat: c.lat(), lng: c.lng() };
  };
  A.getZoom = () => (A.__map ? A.__map.getZoom() : zoom);
  A.jumpTo = ({ center: [lng, lat], zoom: z }) => op((_g, m) => { m.setCenter({ lat, lng }); if (z != null) m.setZoom(z); });
  A.easeTo = ({ center: [lng, lat], zoom: z }) => op((_g, m) => { m.panTo({ lat, lng }); if (z != null) m.setZoom(z); });
  A.panTo = ([lng, lat]) => op((_g, m) => m.panTo({ lat, lng }));
  A.stop = () => {};
  // 🧭 rotation Uber : les cartes VECTORIELLES Google pivotent via heading (+ inclinaison)
  A.setBearing = (b) => op((_g, m) => { try { m.setTilt(b ? 45 : 0); m.setHeading(b); } catch {} });
  A.getBearing = () => { try { return (A.__map && A.__map.getHeading()) || 0; } catch { return 0; } };
  A.resize = () => { try { A.__g?.maps?.event?.trigger(A.__map, 'resize'); } catch {} };
  A.fitBounds = (b, opts = {}) => op((g, m) => { m.fitBounds(b, opts.padding ?? 40); if (opts.maxZoom) g.maps.event.addListenerOnce(m, 'idle', () => { if (m.getZoom() > opts.maxZoom) m.setZoom(opts.maxZoom); }); });
  A.remove = () => { A.__dead = true; A.__ops = []; try { A.__g?.maps?.event?.clearInstanceListeners(A.__map); } catch {} try { el.innerHTML = ''; } catch {} A.__map = null; };
  return A;
}

// ───────────────────────── Marqueurs HTML (OverlayView) ─────────────────────────
// Même DOM que les marqueurs Mapbox (emoji, flèche Uber, arrêts, boutiques) :
// les helpers arrowSetHeading/glideMarker continuent de fonctionner tels quels.

export function attachMarker(A, el, pos) {
  const M = { el, __ov: null, __pos: pos ? { lng: pos[0], lat: pos[1] } : null };
  A.__op((google, map) => {
    const ov = new google.maps.OverlayView();
    ov.el = el; ov.pos = M.__pos;
    ov.onAdd = function () { this.getPanes().overlayMouseTarget.appendChild(this.el); this.el.style.position = 'absolute'; };
    ov.draw = function () {
      if (!this.pos) return;
      const pt = this.getProjection().fromLatLngToDivPixel(this.pos);
      if (!pt) return;
      // glisse fluide (sauf pendant un zoom — sinon les marqueurs « nagent »)
      this.el.style.transition = A.__noAnim ? 'none' : (this.el.dataset.glide ? 'transform .55s linear' : 'none');
      this.el.style.transform = `translate(${Math.round(pt.x)}px, ${Math.round(pt.y)}px) translate(-50%, -50%)`;
    };
    ov.onRemove = function () { this.el.parentNode?.removeChild(this.el); };
    ov.getPosition = function () { return this.pos ? new google.maps.LatLng(this.pos.lat, this.pos.lng) : null; };
    ov.setMap(map);
    M.__ov = ov;
  });
  return M;
}

export function markerSetPos(M, lng, lat) { M.__pos = { lng, lat }; if (M.__ov) { M.__ov.pos = M.__pos; M.__ov.draw(); } }
export function markerRemove(M) { if (M.__ov) { M.__ov.setMap(null); M.__ov = null; } }

/** Popup Google (InfoWindow) au clic sur le marqueur. */
export function bindGPopup(A, M, html) {
  let iw = null;
  M.el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!A.__g || !A.__map || !M.__ov) return;
    iw = iw || new A.__g.maps.InfoWindow({ maxWidth: 240, disableAutoPan: false });
    iw.setContent(html);
    iw.open({ map: A.__map, anchor: M.__ov });
  });
}

// ───────────────────────── Lignes (polylines) ─────────────────────────

export function addGLine(A, coords, { color = '#0e9f6e', width = 5, dashed = false, opacity = 0.85 } = {}) {
  const W = { __yl: 'g', remove: () => {} };
  A.__op((google, map) => {
    const poly = new google.maps.Polyline({
      path: (coords || []).map(([lat, lng]) => ({ lat, lng })),
      strokeColor: color,
      strokeWeight: width,
      strokeOpacity: dashed ? 0 : opacity,
      ...(dashed ? { icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: opacity, scale: Math.max(1.5, width / 1.6), strokeColor: color }, repeat: '14px' }] } : {}),
      clickable: false,
    });
    poly.setMap(map);
    W.__poly = poly;   // exposition pour tests
    W.remove = () => poly.setMap(null);
  });
  return W;
}

// ───────────────────────── API Google : recherche / inverse / itinéraires ─────────────────────────

/** 🔎 Recherche d'adresse (Geocoding API — 10k/mois gratuites). [{lat,lng,label}] */
export async function gForward(q, lang = 'fr', near = null) {
  const g = await ensureGoogle(lang);
  if (!g) return [];
  const req = { address: q, region: 'EG' };
  if (near) req.bounds = new g.maps.LatLngBounds({ lat: near.lat - 0.35, lng: near.lng - 0.35 }, { lat: near.lat + 0.35, lng: near.lng + 0.35 });
  const { results } = await new g.maps.Geocoder().geocode(req);
  return (results || [])
    .filter((r) => r.geometry?.location)
    .map((r) => ({ lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), label: r.formatted_address }));
}

/** Géocodage inverse (coords → adresse) ou null. */
export async function gReverse(lat, lng, lang = 'fr') {
  const g = await ensureGoogle(lang);
  if (!g) return null;
  try {
    const { results } = await new g.maps.Geocoder().geocode({ location: { lat, lng }, region: 'EG' });
    return results?.[0]?.formatted_address || null;
  } catch { return null; }
}

// ── Décodeur polyline encodée Google (algorithme standard, précision 1e-5) ──
function decodePolyline(str) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    let r = 0, shift = 0, b;
    do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (r & 1) ? ~(r >> 1) : (r >> 1);
    r = 0; shift = 0;
    do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (r & 1) ? ~(r >> 1) : (r >> 1);
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

/**
 * 🛣️ Itinéraire — Routes API « computeRoutes » (10k/mois gratuites, SKU
 * Essentials). ⚠️ L'ancienne Directions API est passée Legacy le 05/10/2026 :
 * elle n'est PLUS activable sur un nouveau projet Google Cloud — d'où ce
 * endpoint moderne, appelé directement depuis le navigateur (CORS vérifié) :
 * pas besoin que la carte Google elle-même soit chargée. Field mask minimal
 * (on ne paie que les champs demandés) + TRAFFIC_AWARE (Essentials, pas Pro).
 * Retourne {coords: [[lat,lng]…], distance: m, duration: s} ou null.
 */
export async function gRoute(from, to) {
  const key = GMAPS_KEY();
  if (!key) return null;
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), 5000);
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',   // SKU Essentials (10k/mois gratuits)
        computeAlternativeRoutes: false,
      }),
    });
    if (!res.ok) return null;
    const r = (await res.json())?.routes?.[0];
    if (!r?.polyline?.encodedPolyline) return null;
    return {
      coords: decodePolyline(r.polyline.encodedPolyline),
      distance: r.distanceMeters ?? null,
      duration: r.duration ? parseFloat(r.duration) : null,   // "1234s" → 1234
    };
  } catch { return null; } finally { clearTimeout(tm); }
}
