// ═══════════════════════════════════════════════════════════════════════════
// 🗺️ MapGoogle.jsx — v2026.10.14.36 : moteur GOOGLE MAPS (étage 1 sur 3).
// Google Maps JS (cartes) + Geocoder (recherche) + Routes API computeRoutes (itinéraires).
// Chargement du script par injection manuelle → AUCUNE dépendance npm.
// La façade MapGl.jsx choisit ce moteur si VITE_GMAPS_KEY est définie, sinon
// Mapbox, sinon le fond OSM. Une clé absente/quota dépassé/erreur → bascule.
// ═══════════════════════════════════════════════════════════════════════════

const LANG3 = (l) => (l === 'ar' ? 'ar' : l === 'en' ? 'en' : 'fr');

export const GMAPS_KEY = () => String(import.meta.env.VITE_GMAPS_KEY || '').trim().replace(/^["']+|["']+$/g, '');   // 🛟 v31 : trim + sans guillemets (copier-coller Vercel)

let loadPromise = null;
export let gFailed = false;   // le chargement a échoué (clé invalide…) → ne plus réessayer
export let gLastErr = '';     // 🛟 v30 : dernier code d'erreur Google capté — affiché au lieu d'une carte blanche

// 🔐 Google appelle window.gm_authFailure quand la clé est invalide / l'API
// désactivée / le quota atteint. On s'y branche pour déclencher la bascule
// vers Mapbox (la façade s'abonne via onAuthFailure).
const authFns = new Set();
export function onAuthFailure(fn) { authFns.add(fn); return () => authFns.delete(fn); }
const gFail = (code) => { gFailed = true; if (!gLastErr) gLastErr = String(code || '').slice(0, 220); authFns.forEach((f) => { try { f(); } catch {} }); };   // 🛟 v30
try {
  const prev = window.gm_authFailure;
  window.gm_authFailure = function () { gFail("Clé refusée par Google (gm_authFailure) — domaine non autorisé, API désactivée ou facturation/quota"); try { prev?.(); } catch {} };
} catch {}

/**
 * Charge l'API Google Maps UNE SEULE FOIS (langue de l'app, région Égypte).
 * Retourne window.google ou null si pas de clé.
 */
export function loadGoogle(lang = 'fr') {
  const key = GMAPS_KEY();
  if (!key) return Promise.resolve(null);
  // 🛟 v31 : clé mal COPIÉE (tronquée — ex. 34 caractères au lieu de 39 — ou quotes
  // oubliées) → diagnostic immédiat SANS interroger Google. C'est l'erreur
  // InvalidKeyMapError vue en production v30 : la clé du bundle s'arrêtait à « hvc_ ».
  if (!/^AIza[A-Za-z0-9_-]{32,}$/.test(key)) {
    const disp = key.length > 12 ? key.slice(0, 6) + '…' + key.slice(-4) : key;
    gFail('Clé Google invalide dans la configuration du site : « ' + disp + ' » — ' + key.length + ' caractères au lieu de 39. Clé tronquée ou mal copiée : colle la clé ENTIÈRE (VITE_GMAPS_KEY), puis Redeploy.');
    return Promise.resolve(null);
  }
  if (loadPromise) return loadPromise;
  if (gFailed) return Promise.resolve(null);   // 🛟 v30 : déjà échoué sur CETTE page → on ne ré-injecte JAMAIS (une 2e injection = « API chargée plusieurs fois » → carte cassée)
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
          const msg = a.map((x) => (typeof x === 'string' ? x : '')).join(' ');
          if (/Google Maps (JavaScript )?API error/i.test(msg)) gFail(msg);   // 🛟 v30 : capture le code ET « Your site URL to be authorized: … »
        } catch {}
        origErr(...a);
      };
    }
  } catch {}
  const cb = '___ylGmapsReady';   // 🛟 v30 : nom STABLE → URL identique à chaque chargement
  let settled = false;
  loadPromise = new Promise((resolve, reject) => {
    window[cb] = () => { if (!settled) { settled = true; clearTimeout(tm); resolve(window.google); } };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=${LANG3(lang)}&region=EG&v=weekly&loading=async&callback=${cb}`;
    s.async = true;
    s.onerror = () => { if (settled) return; settled = true; clearTimeout(tm); s.remove(); loadPromise = null; gFail("Réseau : le script Google n'a pas pu être téléchargé (connexion coupée, bloqueur de pub ou pare-feu)"); reject(new Error('Google Maps non chargé')); };
    document.head.appendChild(s);
    // 🛟 v30 : 30 s (était 12 s) — sur connexion mobile lente, le bootstrap Google + ses chunks
    // dépassent 12 s ; l'ancien délai annulait puis une 2e injection sur la même page
    // provoquait « Google Maps chargé plusieurs fois » → le message « Petit problème… ».
    const tm = setTimeout(() => { if (settled) return; settled = true; s.remove(); loadPromise = null; gFail("Délai dépassé : Google Maps n'a pas fini de charger en 30 s (connexion très lente — rafraîchis la page)"); reject(new Error('Google Maps: délai dépassé')); }, 30000);
  }).catch(() => null);   // 🛟 v30 : ne rejette plus jamais — la carte affichera le diagnostic
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

// ── 🛟 v30 : échec Google = MESSAGE VISIBLE (jamais une carte blanche silencieuse) ──
// Affiche le code d'erreur exact capté (console/gm_authFailure — y compris
// « Your site URL to be authorized: … » quand le domaine n'est pas autorisé)
// + la marche à suivre + un bouton Réessayer. fr / ar / en.
function gFailEl(el, lang) {
  try {
    const L = {
      fr: { t: "Google Maps n'a pas pu se charger", r: "🔄 Réessayer", h0: "La clé Google intégrée au site est invalide (tronquée ou mal copiée). Ouvre Vercel → Settings → Environment Variables → VITE_GMAPS_KEY et colle la clé ENTIÈRE (39 caractères, commence par AIza, sans espaces ni guillemets), puis Deployments → ⋯ → Redeploy. En local : web/.env.local.", h1: "Ce domaine n'est pas encore autorisé pour la clé Google. Dans Google Cloud Console → APIs & Services → Identifiants → ta clé → « Restrictions des sites de référence », ajoute l'adresse affichée ci-dessus.", h2: "Connexion trop lente ou Google momentanément indisponible. Appuie sur Réessayer." },
      ar: { t: "تعذّر تحميل خرائط Google", r: "🔄 إعادة المحاولة", h0: "مفتاح Google المدمج في الموقع غير صالح (ناقص أو منسوخ خطأ). افتح Vercel → الإعدادات → متغيرات البيئة → VITE_GMAPS_KEY والصق المفتاح كاملًا (39 حرفًا يبدأ بـ AIza، بدون مسافات أو علامات اقتباس) ثم Deployments → ⋯ → Redeploy. محليًا: web/.env.local.", h1: "هذا النطاق غير مسموح به لمفتاح Google. في Google Cloud Console → APIs & Services → بيانات الاعتماد → المفتاح → «قيود مواقع الإحالة»، أضف العنوان المعروض أعلاه.", h2: "الاتصال بطيء جدًا أو Google غير متاح مؤقتًا. اضغط إعادة المحاولة." },
      en: { t: "Google Maps could not load", r: "🔄 Retry", h0: "The Google key embedded in the site is invalid (truncated or mis-copied). Open Vercel → Settings → Environment Variables → VITE_GMAPS_KEY and paste the FULL key (39 characters, starts with AIza, no spaces or quotes), then Deployments → ⋯ → Redeploy. Locally: web/.env.local.", h1: "This domain is not yet allowed for the Google key. In Google Cloud Console → APIs & Services → Credentials → your key → “Website referrer restrictions”, add the address shown above.", h2: "Connection too slow or Google temporarily unavailable. Tap Retry." },
    }[LANG3(lang)];
    const err = (gLastErr || '').replace(/</g, '&lt;');
    const keyErr = /InvalidKey|invalide|au lieu de/i.test(err);   // 🛟 v31
    const refErr = /autoris|authorized|RefererNotAllowed|gm_authFailure/i.test(err);
    el.innerHTML = '<div class="yl-gfail" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:170px;padding:16px;text-align:center;gap:7px;background:#f8fafc;border-radius:12px">'
      + '<div style="font-size:32px;line-height:1">🗺️</div>'
      + '<div style="font-weight:800;color:#b91c1c">⚠️ ' + L.t + '</div>'
      + (err ? '<div style="font-size:11px;color:#334155;background:#e2e8f0;border-radius:8px;padding:6px 9px;max-width:320px;word-break:break-word">' + err + '</div>' : '')
      + '<div style="font-size:11.5px;color:#475569;max-width:320px">' + (keyErr ? L.h0 : refErr ? L.h1 : L.h2) + '</div>'
      + '<button onclick="location.reload()" style="margin-top:2px;border:0;background:#0e9f6e;color:#fff;font-weight:700;padding:8px 18px;border-radius:999px;font-size:13px">' + L.r + '</button>'
      + '</div>';
  } catch {}
}

export function createGoogleMap(el, { lang = 'fr', center = [29.9187, 31.2001], zoom = 13 } = {}) {
  const A = {
    __yl: 'google', __g: null, __map: null, __ready: false, __dead: false,
    __ops: [], __handlers: {}, zooming: false, __noAnim: false, __mb: null,
  };
  const emit = (ev, ...a) => (A.__handlers[ev] || []).forEach((f) => { try { f(...a); } catch {} });
  const op = (fn) => { if (A.__dead) return; if (A.__ready) { try { fn(A.__g, A.__map); } catch {} } else A.__ops.push(fn); };

  const unAuth = onAuthFailure(() => { if (!A.__dead) gFailEl(el, lang); });   // 🛟 v30 : échec TARDIF (clé refusée après rendu) → message, pas de carte blanche
  loadGoogle(lang).then((google) => {
    if (A.__dead) return;
    if (!google || !google.maps) { gFailEl(el, lang); return; }   // 🛟 v30 : plus JAMAIS de carte blanche silencieuse
    A.__g = google;
    A.__map = new google.maps.Map(el, {
      center: { lat: center[1], lng: center[0] },
      zoom,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      clickableIcons: false, gestureHandling: 'greedy',
      ...(google.maps.RenderingType ? { renderingType: google.maps.RenderingType.VECTOR } : {}),   // cartes vectorielles → rotation possible
    });
    gBump('maps');   // 🧮 v33 : 1 chargement de carte = 1 unité de quota
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
  }).catch(() => { if (!A.__dead) gFailEl(el, lang); });   // 🛟 v30

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
  A.remove = () => { A.__dead = true; A.__ops = []; try { unAuth(); } catch {} try { A.__g?.maps?.event?.clearInstanceListeners(A.__map); } catch {} try { el.innerHTML = ''; } catch {} A.__map = null; };
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
      // 🛟 v2026.10.13.29 : avant onAdd, getProjection() est undefined (carte encore
      // en initialisation — téléphone lent, 1er chargement Google) → on ne dessine
      // PAS ; l'API rappellera draw() toute seule dès que la projection existera.
      const pr = this.getProjection();
      if (!pr) return;
      const pt = pr.fromLatLngToDivPixel(this.pos);
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

export function markerSetPos(M, lng, lat) { M.__pos = { lng, lat }; if (M.__ov) { M.__ov.pos = M.__pos; if (M.__ov.getProjection()) M.__ov.draw(); } }   // 🛟 v2026.10.13.29 : sans projection (avant onAdd) on saute — draw() auto ensuite
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

// ───────────────── 💾 v32 : CACHE LOCAL — rester dans le GRATUIT Google Maps ─────────────────
// Plafonds 2026 : 10 000/mois PAR API (cartes · géocodage · itinéraires). Les requêtes
// répétées sont servies depuis localStorage → 0 quota consommé. Une adresse ne change
// pas (30-90 j de TTL), une géométrie de trajet est stable (12 h).
const YLC = 'yl|c|';   // préfixe commun (pruning facile)
function cGet(k, ttl) {
  try {
    const raw = localStorage.getItem(YLC + k);
    if (!raw) return undefined;
    const v = JSON.parse(raw);
    if (!v || typeof v.t !== 'number' || Date.now() - v.t > ttl) { localStorage.removeItem(YLC + k); return undefined; }
    return v.v;
  } catch { return undefined; }
}
function cSet(k, v) {
  try { localStorage.setItem(YLC + k, JSON.stringify({ t: Date.now(), v })); }
  catch {   // quota localStorage plein → on purge nos entrées et on retente une fois
    try { Object.keys(localStorage).filter((x) => x.startsWith(YLC)).slice(0, 60).forEach((x) => localStorage.removeItem(x)); try { localStorage.setItem(YLC + k, JSON.stringify({ t: Date.now(), v })); } catch {} } catch {}
  }
}

// ── 🧮 v33 : COMPTEURS DE CONSOMMATION + CACHE CROISÉ (tous les appareils) ──
// Chaque appel Google réel est compté puis reporté au serveur (toutes les 10 s) →
// le dashboard superadmin affiche la consommation du jour par API. Les lectures
// servies du cache (local OU serveur) sont comptées « hits » = appels évités.
export const gUsage = { maps: 0, geo: 0, rev: 0, rt: 0, hits: 0, ac: 0, pd: 0 };
let gSent = { maps: 0, geo: 0, rev: 0, rt: 0, hits: 0, ac: 0, pd: 0 };
const gBump = (k) => { gUsage[k]++; };
function gFlush() {
  try {
    const d = {}; let any = false;
    for (const k of ['maps', 'geo', 'rev', 'rt', 'hits', 'ac', 'pd']) { d[k] = Math.max(0, gUsage[k] - gSent[k]); if (d[k]) any = true; }
    if (!any) return;
    const prev = { ...gSent };
    gSent = { ...gUsage };
    const tok = (typeof localStorage !== 'undefined' && localStorage.getItem('yl_token')) || '';
    fetch('/api/gmaps/usage', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(d), keepalive: true })
      .catch(() => { gSent = prev; });   // échec → le delta sera renvoyé au prochain cycle
  } catch {}
}
try { setInterval(gFlush, 10000); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') gFlush(); }); } catch {}

// 🗄️ cache L2 — BASE DE DONNÉES du serveur : le marchand, le livreur et le client
// qui regardent le MÊME trajet ne déclenchent qu'UN SEUL appel Google au total.
const l2Get = async (k) => { try { const r = await fetch('/api/gmaps/cache?k=' + encodeURIComponent(k)); const d = await r.json(); return (d && d.v !== undefined) ? d.v : undefined; } catch { return undefined; } };
const l2Put = (k, v) => {
  try {
    const tok = (typeof localStorage !== 'undefined' && localStorage.getItem('yl_token')) || '';
    fetch('/api/gmaps/cache', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify({ k, v }), keepalive: true }).catch(() => {});
  } catch {}
};

// ───────────────────────── API Google : recherche / inverse / itinéraires ─────────────────────────

/** 🔎 Recherche d'adresse (Geocoding API — 10k/mois gratuites). [{lat,lng,label}] */
export async function gForward(q, lang = 'fr', near = null) {
  // 💾 v32 : cache 30 jours — les recherches répétées ne consomment PLUS de quota
  const ck = 'geo|2|' + LANG3(lang) + '|' + String(q || '').trim().toLowerCase().replace(/\s+/g, ' ') + '|' + (near ? (+near.lat).toFixed(1) + ',' + (+near.lng).toFixed(1) : '-');
  const hit = cGet(ck, 30 * 864e5);
  if (hit) { gBump('hits'); return hit; }
  const l2 = await l2Get(ck);   // 🗄️ v33 : cache croisé serveur — TOUS les appareils
  if (l2) { gBump('hits'); cSet(ck, l2); return l2; }
  const g = await ensureGoogle(lang);
  if (!g) return [];
  gBump('geo');   // 🧮 appel réseau réel = 1 unité de quota
  const req = { address: q, region: 'EG' };
  if (near) req.bounds = new g.maps.LatLngBounds({ lat: near.lat - 0.35, lng: near.lng - 0.35 }, { lat: near.lat + 0.35, lng: near.lng + 0.35 });
  const { results } = await new g.maps.Geocoder().geocode(req);
  const out = (results || [])
    .filter((r) => r.geometry?.location)
    .map((r) => ({ lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), label: r.formatted_address }));
  if (out.length) { cSet(ck, out); l2Put(ck, out); }
  return out;
}

/** Géocodage inverse (coords → adresse) ou null. */
export async function gReverse(lat, lng, lang = 'fr') {
  // 💾 v32 : cache 90 jours, arrondi 4 décimales (~11 m) — un point garde la même adresse
  const ck = 'rev|2|' + LANG3(lang) + '|' + (+lat).toFixed(4) + ',' + (+lng).toFixed(4);
  const hit = cGet(ck, 90 * 864e5);
  if (hit !== undefined) { gBump('hits'); return hit; }
  const l2 = await l2Get(ck);   // 🗄️ v33 : cache croisé serveur — TOUS les appareils
  if (l2 !== undefined && l2 !== null) { gBump('hits'); cSet(ck, l2); return l2; }
  const g = await ensureGoogle(lang);
  if (!g) return null;
  gBump('rev');   // 🧮 appel réseau réel = 1 unité de quota
  try {
    const { results } = await new g.maps.Geocoder().geocode({ location: { lat, lng }, region: 'EG' });
    const addr = results?.[0]?.formatted_address || null;
    if (addr) { cSet(ck, addr); l2Put(ck, addr); }
    return addr;
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
  // 💾 v32 : cache 12 h, extrémités arrondies à ~11 m — les trajets fixes (magasin→client,
  // tournées) ne consomment PLUS de quota à chaque réaffichage
  const ck = 'rt|2|' + (+from.lat).toFixed(4) + ',' + (+from.lng).toFixed(4) + '|' + (+to.lat).toFixed(4) + ',' + (+to.lng).toFixed(4);
  const hit = cGet(ck, 12 * 36e5);
  if (hit) { gBump('hits'); return hit; }
  const l2 = await l2Get(ck);   // 🗄️ v33 : cache croisé serveur — le trajet vu par le marchand, le livreur ET le client = 1 seul appel
  if (l2) { gBump('hits'); cSet(ck, l2); return l2; }
  const key = GMAPS_KEY();
  if (!key) return null;
  gBump('rt');   // 🧮 appel réseau réel = 1 unité de quota
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
    const out = {
      coords: decodePolyline(r.polyline.encodedPolyline),
      distance: r.distanceMeters ?? null,
      duration: r.duration ? parseFloat(r.duration) : null,   // "1234s" → 1234
    };
    cSet(ck, out); l2Put(ck, out);
    return out;
  } catch { return null; } finally { clearTimeout(tm); }
}

// ── 🎯 v36 : PLACES AUTOCOMPLETE (New) EN SESSION — les VRAIES suggestions Google Maps ──
// Modèle 2026 : toute la frappe partage un token de SESSION ; c'est la requête Place
// Details (à la SÉLECTION) qui clôt la session — la facturation a lieu là, pas pendant
// la frappe. Sessions abandonnées = quota « Autocomplete Requests » SÉPARÉ (10k/mois
// gratuits, indépendant du Geocoding). Si l'utilisateur n'a pas encore activé Places
// API (New) sur sa clé → 403 → gPlacesOk = false → repli moteurs gratuits, sans spam.
export let gPlacesOk = true;

/** 🔎 Suggestions en frappant (le moteur d'autocomplétion de Google Maps). null = indisponible. */
export async function gAutocomplete(input, lang = 'fr', near = null, sessionToken = null) {
  const key = GMAPS_KEY();
  if (!key || !gPlacesOk) return null;
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), 4500);
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST', signal: ac.signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({
        input: String(input).slice(0, 200),
        ...(sessionToken ? { sessionToken } : {}),
        languageCode: LANG3(lang),
        ...(near ? { locationBias: { circle: { center: { latitude: +near.lat, longitude: +near.lng }, radius: 25000 } } } : {}),
      }),
    });
    if (!res.ok) { if (res.status === 403 || res.status === 429) gPlacesOk = false; return null; }   // Places désactivée / quota → repli silencieux
    gBump('ac');   // 🧮 frappe = 1 requête Autocomplete (quota SÉPARÉ — la session est facturée à la sélection)
    const d = await res.json();
    return (d?.suggestions || [])
      .map((x) => x?.placePrediction).filter(Boolean)
      .map((p) => ({
        placeId: p.placeId || (p.place ? String(p.place).split('/').pop() : null),
        label: [p.structuredFormat?.mainText?.text || p.text?.text, p.structuredFormat?.secondaryText?.text].filter(Boolean).join(', '),
        lat: null, lng: null, src: 'g',   // coordonnées obtenues à la SÉLECTION (Place Details)
      }))
      .filter((r) => r.placeId && r.label);
  } catch { return null; } finally { clearTimeout(tm); }
}

/** 📌 Place Details (Essentials : adresse + coordonnées) — clôt la session = l'unique facturation. */
export async function gPlaceDetails(placeId, sessionToken = null, lang = 'fr') {
  const key = GMAPS_KEY();
  if (!key) return null;
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), 4500);
  try {
    const q = new URLSearchParams({ languageCode: LANG3(lang), ...(sessionToken ? { sessionToken } : {}) });
    const res = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId) + '?' + q, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'location,formattedAddress' },   // champs Essentials → session clôturée proprement
      signal: ac.signal,
    });
    if (!res.ok) return null;
    gBump('pd');   // 🧮 LA sélection — c'est ICI que la session est facturée
    const d = await res.json();
    if (d?.location?.latitude == null) return null;
    return { lat: d.location.latitude, lng: d.location.longitude, address: d.formattedAddress || null };
  } catch { return null; } finally { clearTimeout(tm); }
}
