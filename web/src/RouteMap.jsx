import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './lr-global.js';      // ⚙️ expose window.L (le plugin ci-dessous patche le L global)
import 'leaflet-rotate';      // 🧭 v2026.09.23.1 : rotation de carte (setBearing) + pincement 2 doigts
import { useT } from './lib.jsx';
import { useMapFullscreen, FsBtn, FS_STYLE } from './MapFullscreen.jsx';

// On gère nos propres boutons 📍/🧭 : pas du contrôle de rotation par défaut du plugin
// (il s'ajouterait sinon à TOUTES les cartes de l'app, même celles sans rotation).
L.Map.mergeOptions({ rotateControl: false });

// 🛡️ v2026.09.23.4 — Correctif leaflet-rotate : son initialize lit `options.rotate`
// SANS vérifier qu'un objet d'options existe -> tout L.map(élément) appelé SANS
// options plantait (« Cannot read properties of undefined (reading 'rotate') ») :
// carte des livreurs du marchand, carte des magasins côté client, carte tournée
// livreur... On blinde ici une fois pour toutes : toutes les cartes de l'app
// passent par ce module, les options manquantes deviennent un objet vide.
const _lrMapInit = L.Map.prototype.initialize;
L.Map.prototype.initialize = function(id, options) { return _lrMapInit.call(this, id, options || {}); };

const mkIcon = (emoji) =>
  L.divIcon({
    html: `<div style="font-size:26px;line-height:26px;text-shadow:0 1px 4px rgba(0,0,0,.45)">${emoji}</div>`,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

// ================= 🧭 v2026.09.23.1 — Suivi live style Uber (côté livreur) =================
// Pastille 🛵 + bec directionnel qui pivote selon le cap (GPS > boussole > cap calculé).
const ARROW_ICON = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:40px;height:40px">
    <div class="yl-rot" style="position:absolute;inset:0;transition:transform .2s ease-out;will-change:transform">
      <svg width="40" height="40" viewBox="0 0 40 40" style="position:absolute;inset:0;overflow:visible">
        <path d="M20 -3 L27.5 11.5 L20 8 L12.5 11.5 Z" fill="#0e9f6e" stroke="#fff" stroke-width="1.6"/>
      </svg>
    </div>
    <div style="position:absolute;top:7px;left:7px;width:26px;height:26px;border-radius:50%;background:#fff;border:3px solid #0e9f6e;box-shadow:0 2px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:13px">🛵</div>
  </div>`,
  iconSize: [40, 40], iconAnchor: [20, 20]
});

// Applique le cap (degrés 0-360, nord=0) au marqueur flèche — compense la rotation de la carte.
export function arrowSetHeading(marker, hdg, mapBearing) {
  try {
    const el = marker?.getElement?.()?.querySelector?.('.yl-rot');
    if (!el || typeof hdg !== 'number' || isNaN(hdg)) return;
    const target = ((hdg + (mapBearing || 0)) % 360 + 360) % 360;
    const prev = parseFloat(el.dataset.rot || '0') || 0;
    const d = ((target - prev) % 360 + 540) % 360 - 180;   // pivotement par le plus court chemin
    el.dataset.rot = String(prev + d);
    el.style.transform = `rotate(${prev + d}deg)`;
  } catch {}
}

// Déplacement fluide du marqueur livreur (glisse au lieu de sauter à chaque position).
export function glideMarker(marker) {
  try { const el = marker?.getElement?.(); if (el) el.style.transition = 'transform .55s linear'; } catch {}
}

/**
 * 🧭 Navigation live : 
 *  - pivote la flèche en continu (cap fourni par live.getHdg()),
 *  - fait pivoter la carte sur le cap du livreur (mode Uber) tant qu'il ne la tourne pas lui-même,
 *  - expose follow/rot pour les boutons 📍 (recentrer) et 🧭 (cap auto on/off).
 * live = { getHdg: () => degrés|null } — fourni par l'espace livreur (driver.jsx).
 */
function useLiveNav(mapRef, live, getMarker) {
  const nav = useRef({ follow: true, rot: true, myBearing: null, bound: false, zooming: false });
  const [, bump] = useState(0);
  useEffect(() => {
    if (!live) return undefined;
    const m = () => mapRef.current;
    const s = nav.current;
    let dead = false;
    const onDrag = () => { if (s.follow) { s.follow = false; bump((x) => x + 1); } };
    const onRot = () => {
      const mm = m(); if (!mm || s.myBearing == null) return;
      const b = typeof mm.getBearing === 'function' ? mm.getBearing() : 0;
      // rotation qui ne vient PAS de nous -> geste manuel -> on rend la main au livreur
      if (Math.abs(((b - s.myBearing) % 360 + 540) % 360 - 180) > 1.5 && s.rot) { s.rot = false; bump((x) => x + 1); }
    };
    const onZoomStart = () => { s.zooming = true; };
    const onZoomEnd = () => { setTimeout(() => { s.zooming = false; }, 700); };
    const bind = () => { s.bound = true; m().on({ dragstart: onDrag, rotate: onRot, zoomstart: onZoomStart, zoomend: onZoomEnd }); };
    const ready = () => { if (!dead && m() && !s.bound) bind(); };
    ready();
    const it = setInterval(() => {
      const mm = m(); if (!mm) return;
      if (!s.bound) ready();
      const h = live.getHdg ? live.getHdg() : null;
      const b = typeof mm.getBearing === 'function' ? (mm.getBearing() || 0) : 0;
      arrowSetHeading(getMarker ? getMarker() : null, h, b);
      if (typeof h !== 'number' || !s.follow || !s.rot || s.zooming) return;
      if (typeof mm.setBearing !== 'function') return;
      const target = (360 - ((h % 360) + 360) % 360) % 360;        // cap du livreur pointé vers le HAUT
      const cur = mm.getBearing() || 0;
      const d = ((target - cur) % 360 + 540) % 360 - 180;
      if (Math.abs(d) > 2) { s.myBearing = ((cur + d * 0.35) % 360 + 360) % 360; mm.setBearing(s.myBearing); }
    }, 120);
    return () => { dead = true; clearInterval(it); try { if (s.bound) m()?.off({ dragstart: onDrag, rotate: onRot, zoomstart: onZoomStart, zoomend: onZoomEnd }); } catch {} s.bound = false; };
  }, [!!live]);
  return {
    nav,
    isFollow: () => nav.current.follow,
    isRot: () => nav.current.rot,
    recenter: (lat, lng) => {
      const s = nav.current; s.follow = true; s.rot = true; bump((x) => x + 1);
      const mm = mapRef.current;
      if (mm && lat != null) { try { mm.stop(); mm.setView([lat, lng], Math.max(mm.getZoom() || 13, 15.5), { animate: true }); } catch {} }
    },
    toggleRot: () => {
      const s = nav.current; s.rot = !s.rot; bump((x) => x + 1);
      const mm = mapRef.current;
      if (!s.rot && mm && typeof mm.setBearing === 'function') { s.myBearing = 0; mm.setBearing(0); }   // retour nord en haut
    }
  };
}

/** Boutons 📍 recentrer + 🧭 cap auto, superposés à la carte (sous le bouton plein écran). */
function LiveBtns({ navApi, pos }) {
  const btn = (active, emoji, title, onClick) => (
    <button onClick={onClick} title={title} aria-label={title}
      style={{
        width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
        fontSize: 16, lineHeight: '36px', textAlign: 'center', padding: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,.3)',
        background: active ? '#0e9f6e' : 'rgba(255,255,255,.95)',
        color: active ? '#fff' : '#0f172a'
      }}>{emoji}</button>
  );
  return (
    <div style={{ position: 'absolute', top: 50, right: 8, zIndex: 1100, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {btn(navApi.isFollow(), '📍', 'Recentrer sur ma position (suivi auto)', () => navApi.recenter(pos?.lat, pos?.lng))}
      {btn(navApi.isRot(), '🧭', 'Orientation automatique sur ma direction', navApi.toggleRot)}
    </div>
  );
}

/**
 * Itinéraire routier réel via OSRM (gratuit, sans clé API).
 * Retourne {coords: [[lat,lng]...], distance: mètres, duration: secondes} ou null.
 */
export async function fetchRoute(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes[0]) {
      const r = data.routes[0];
      return {
        coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        distance: r.distance,
        duration: r.duration
      };
    }
  } catch {}
  return null;
}

export const fmtKm = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m');
export const fmtMin = (s) => {
  const min = Math.max(1, Math.round(s / 60));
  return min >= 60 ? Math.floor(min / 60) + ' h ' + (min % 60) + ' min' : min + ' min';
};

/**
 * Carte avec itinéraire routier de `from` à `to`.
 * Fallback : ligne droite pointillée si OSRM indisponible (hors ligne).
 */
export default function RouteMap({ from, to, fromEmoji = '🏪', toEmoji = '🏠', height = 300, live = null }) {
  const el = useRef(null);
  const map = useRef(null);
  const { full, toggle } = useMapFullscreen(map);
  const markers = useRef({});
  const coordsRef = useRef(null);   // itineraire courant (pour detecter un ecart)
  const rerouteAt = useRef(0);      // anti-spam : 1 recalcul / 20 s max
  const [info, setInfo] = useState(null);
  const [flash, setFlash] = useState(false);
  const t = useT();

  useEffect(() => {
    if (!el.current || map.current) return;
    // 🧭 live (livreur) : carte orientable (2 doigts) + rotation auto sur son cap
    map.current = L.map(el.current, live ? { rotate: true, touchRotate: true } : {}).setView([31.2001, 29.9187], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    return () => { map.current?.remove(); map.current = null; markers.current = {}; };
  }, []);

  const navApi = useLiveNav(map, live, () => markers.current.from);

  useEffect(() => {
    const m = map.current;
    if (!m || !from || !to) return;
    let cancelled = false;

    // marqueurs départ / arrivée
    ['from', 'to', 'line'].forEach((k) => {
      if (markers.current[k]) { markers.current[k].remove(); delete markers.current[k]; }
    });
    // 🧭 live : le départ EST le livreur -> pastille + flèche de direction
    markers.current.from = L.marker([from.lat, from.lng], { icon: live ? ARROW_ICON : mkIcon(fromEmoji) }).addTo(m);
    if (live) { glideMarker(markers.current.from); m.setView([from.lat, from.lng], 16); }
    markers.current.to = L.marker([to.lat, to.lng], { icon: mkIcon(toEmoji) }).addTo(m);
    if (!live) m.fitBounds(L.latLngBounds([[from.lat, from.lng], [to.lat, to.lng]]).pad(0.3));

    // itinéraire réel (ou ligne droite en secours)
    setInfo(null);
    coordsRef.current = null;
    fetchRoute(from, to).then((r) => {
      if (cancelled || !map.current) return;
      if (r) {
        markers.current.line = L.polyline(r.coords, { color: '#0e9f6e', weight: 5, opacity: 0.85 }).addTo(map.current);
        setInfo({ distance: r.distance, duration: r.duration });
      } else {
        markers.current.line = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], { color: '#0e9f6e', dashArray: '6 8', weight: 3 }).addTo(map.current);
      }
      setTimeout(() => map.current?.invalidateSize(), 60);
    });

    return () => { cancelled = true; };
  }, [to?.lat, to?.lng, fromEmoji, toEmoji]);

  // 🧠 Intelligence : a chaque mouvement, si le livreur est SUR l'itineraire -> on glisse
  // son marqueur. S'il l'a depasse (> 75 m) -> NOUVEL itineraire depuis sa position actuelle,
  // sans jamais retourner en arriere.
  useEffect(() => {
    const m = map.current;
    if (!m || !from || !to || !markers.current.line || !coordsRef.current) return;
    markers.current.from?.setLatLng([from.lat, from.lng]);
    const d = distToRouteM(from.lat, from.lng, coordsRef.current);
    if (d <= 75 || Date.now() - rerouteAt.current < 20000) return;
    rerouteAt.current = Date.now();
    let cancelled = false;
    setFlash(true);
    setTimeout(() => setFlash(false), 4000);
    markers.current.line.remove(); delete markers.current.line;
    fetchRoute(from, to).then((r) => {
      if (cancelled || !map.current) return;
      if (r) {
        coordsRef.current = r.coords;
        markers.current.line = L.polyline(r.coords, { color: '#0e9f6e', weight: 5, opacity: 0.85 }).addTo(map.current);
        setInfo({ distance: r.distance, duration: r.duration });
      } else {
        markers.current.line = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], { color: '#0e9f6e', dashArray: '6 8', weight: 3 }).addTo(map.current);
      }
    });
    return () => { cancelled = true; };
  }, [from?.lat, from?.lng]);

  // 🧭 Mode Uber (live) : la carte suit le livreur en permanence — tant qu'il ne la
  // déplace pas lui-même (un drag désactive le suivi, 📍 le réactive).
  useEffect(() => {
    const m = map.current;
    const s = navApi.nav.current;
    if (!m || !live || !from || !s.follow || s.zooming) return;
    try { m.panTo([from.lat, from.lng], { animate: true, duration: 0.5 }); } catch {}
  }, [from?.lat, from?.lng]);

  return (
    <div>
      <div ref={el} style={full ? FS_STYLE : { position: 'relative', height, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }}>
        <FsBtn full={full} onClick={toggle} />
        {live && <LiveBtns navApi={navApi} pos={from} />}
      </div>
      {flash && <div className="row mt8"><span className="badge" style={{ background: '#e0e7ff', color: '#3730a3' }}>🔄 {t('rerouted')}</span></div>}
      {info ? (
        <div className="row mt8 wrap" style={{ gap: 8 }}>
          <span className="badge">📏 {fmtKm(info.distance)}</span>
          <span className="badge">⏱️ {fmtMin(info.duration)}</span>
          <span className="badge">🛵 {fromEmoji === '🛵' ? '→ 🏠' : '🏪 → 🏠'}</span>
        </div>
      ) : (
        <div className="row mt8"><span className="badge">↗️ {t('offline_route')}</span></div>
      )}
    </div>
  );
}

/**
 * Trajet double du livreur : sa position → magasin (ROUGE) puis magasin → client (VERT).
 * Affiché automatiquement à l'acceptation d'une livraison.
 */
export function DualRouteMap({ driverPos, storePos, clientPos, height = 320, live = null }) {
  const el = useRef(null);
  const map = useRef(null);
  const { full, toggle } = useMapFullscreen(map);
  const marks = useRef({});
  const leg1Ref = useRef(null);    // itineraire livreur->magasin (ecart -> recalcul)
  const rerouteAt = useRef(0);
  const [legs, setLegs] = useState(null);
  const [flash, setFlash] = useState(false);
  const t = useT();

  useEffect(() => {
    if (!el.current || map.current) return;
    // 🧭 live (livreur) : carte orientable (2 doigts) + rotation auto sur son cap
    map.current = L.map(el.current, live ? { rotate: true, touchRotate: true } : {}).setView([31.2001, 29.9187], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    return () => { map.current?.remove(); map.current = null; marks.current = {}; };
  }, []);

  const navApi = useLiveNav(map, live, () => marks.current.d);

  useEffect(() => {
    const m = map.current;
    if (!m || !driverPos || !storePos || !clientPos) return;
    let cancelled = false;
    ['d', 's', 'c', 'l1', 'l2'].forEach((k) => {
      if (marks.current[k]) { marks.current[k].remove(); delete marks.current[k]; }
    });
    // 🧭 live : pastille + flèche de direction sur le livreur, ouverture zoomée sur lui
    marks.current.d = L.marker([driverPos.lat, driverPos.lng], { icon: live ? ARROW_ICON : mkIcon('🛵') }).addTo(m);
    if (live) { glideMarker(marks.current.d); m.setView([driverPos.lat, driverPos.lng], 16); }
    marks.current.s = L.marker([storePos.lat, storePos.lng], { icon: mkIcon('🏪') }).addTo(m);
    marks.current.c = L.marker([clientPos.lat, clientPos.lng], { icon: mkIcon('🏠') }).addTo(m);
    setLegs(null);
    leg1Ref.current = null;

    Promise.all([fetchRoute(driverPos, storePos), fetchRoute(storePos, clientPos)]).then(([r1, r2]) => {
      if (cancelled || !map.current) return;
      leg1Ref.current = r1 ? r1.coords : null;
      marks.current.l1 = L.polyline(
        r1 ? r1.coords : [[driverPos.lat, driverPos.lng], [storePos.lat, storePos.lng]],
        r1 ? { color: '#ef4444', weight: 5, opacity: 0.9 } : { color: '#ef4444', weight: 3, dashArray: '6 8' }
      ).addTo(m);
      marks.current.l2 = L.polyline(
        r2 ? r2.coords : [[storePos.lat, storePos.lng], [clientPos.lat, clientPos.lng]],
        r2 ? { color: '#0e9f6e', weight: 5, opacity: 0.9 } : { color: '#0e9f6e', weight: 3, dashArray: '6 8' }
      ).addTo(m);
      setLegs([r1, r2]);
      if (!live) m.fitBounds(L.latLngBounds([[driverPos.lat, driverPos.lng], [storePos.lat, storePos.lng], [clientPos.lat, clientPos.lng]]).pad(0.25));
      setTimeout(() => map.current?.invalidateSize(), 60);
    });
    return () => { cancelled = true; };
  }, [storePos?.lat, storePos?.lng, clientPos?.lat, clientPos?.lng]);

  // 🧠 Intelligence : le livreur bouge -> sur le trajet rouge ? marqueur glisse.
  // Trajet depasse (> 75 m) -> le segment livreur->magasin est RECALCULE depuis sa position.
  useEffect(() => {
    const m = map.current;
    if (!m || !driverPos || !storePos || !marks.current.l1 || !leg1Ref.current) return;
    marks.current.d?.setLatLng([driverPos.lat, driverPos.lng]);
    const d = distToRouteM(driverPos.lat, driverPos.lng, leg1Ref.current);
    if (d <= 75 || Date.now() - rerouteAt.current < 20000) return;
    rerouteAt.current = Date.now();
    let cancelled = false;
    setFlash(true);
    setTimeout(() => setFlash(false), 4000);
      fetchRoute(driverPos, storePos).then((r) => {
      if (cancelled || !map.current || !r) return;
      leg1Ref.current = r.coords;
      marks.current.l1.remove(); delete marks.current.l1;
      marks.current.l1 = L.polyline(r.coords, { color: '#ef4444', weight: 5, opacity: 0.9 }).addTo(map.current);
      setLegs((pv) => [r, pv?.[1]]);
    });
    return () => { cancelled = true; };
  }, [driverPos?.lat, driverPos?.lng]);

  // 🧭 Mode Uber (live) : la carte suit le livreur — un drag désactive, 📍 réactive
  useEffect(() => {
    const m = map.current;
    const s = navApi.nav.current;
    if (!m || !live || !driverPos || !s.follow || s.zooming) return;
    try { m.panTo([driverPos.lat, driverPos.lng], { animate: true, duration: 0.5 }); } catch {}
  }, [driverPos?.lat, driverPos?.lng]);

  return (
    <div>
      <div ref={el} style={full ? FS_STYLE : { position: 'relative', height, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }}>
        <FsBtn full={full} onClick={toggle} />
        {live && <LiveBtns navApi={navApi} pos={driverPos} />}
      </div>
      {flash && <div className="row mt8"><span className="badge" style={{ background: '#e0e7ff', color: '#3730a3' }}>🔄 {t('rerouted')}</span></div>}
      {legs ? (
        <div className="row mt8 wrap" style={{ gap: 8 }}>
          <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>
            🛵→🏪 {fmtKm(legs[0]?.distance || 0)} · {fmtMin(legs[0]?.duration || 0)}
          </span>
          <span className="badge" style={{ background: '#d1fae5', color: '#065f46' }}>
            🏪→🏠 {fmtKm(legs[1]?.distance || 0)} · {fmtMin(legs[1]?.duration || 0)}
          </span>
        </div>
      ) : (
        <div className="row mt8"><span className="badge">🧭 …</span></div>
      )}
    </div>
  );
}

// ================= Dispatch automatique : tournee multi-livraisons =================

// Distance a vol d'oiseau en metres
function havM(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Distance (metres) entre un point et l'itineraire trace. Infinity si pas d'itineraire.
// Sert a detecter qu'un livreur a depasse son chemin (> 75 m hors itineraire).
export function distToRouteM(lat, lng, coords) {
  if (!coords || coords.length < 2) return Infinity;
  const p = { lat, lng };
  let best = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = { lat: coords[i][0], lng: coords[i][1] };
    const b = { lat: coords[i + 1][0], lng: coords[i + 1][1] };
    const dLat = b.lat - a.lat, dLng = b.lng - a.lng;
    const len2 = dLat * dLat + dLng * dLng || 1e-12;
    let tt = ((p.lat - a.lat) * dLat + (p.lng - a.lng) * dLng) / len2;
    tt = Math.max(0, Math.min(1, tt));
    const d = havM(p, { lat: a.lat + dLat * tt, lng: a.lng + dLng * tt });
    if (d < best) best = d;
  }
  return best;
}

// Construit la tournee optimisee : a partir de la position du livreur, arrêt le plus proche
// d'abord (recuperation 🏪 ou livraison 🏠 d'un colis deja en main), puis le suivant, etc.
export function buildTour(pos, missions) {
  if (!pos || !missions?.length) return [];
  const stops = [];
  const pickups = missions
    .filter((o) => o.status === 'assigned' && o.store_lat != null)
    .map((o) => ({ o, lat: o.store_lat, lng: o.store_lng, kind: 'pickup' }));
  const drops = missions
    .filter((o) => o.status === 'picked_up' && o.client_lat != null)
    .map((o) => ({ o, lat: o.client_lat, lng: o.client_lng, kind: 'dropoff' }));
  let cur = pos;
  const remaining = [...pickups, ...drops];
  while (remaining.length) {
    let bi = -1, bd = Infinity;
    remaining.forEach((s, i) => {
      const d = havM(cur, s);
      if (d < bd) { bd = d; bi = i; }
    });
    const s = remaining.splice(bi, 1)[0];
    stops.push(s);
    cur = s;
  }
  return stops;
}

const mkStopIcon = (emoji, n, kind) => L.divIcon({
  className: '',
  html: `<div style="position:relative;font-size:24px;text-align:center;line-height:1;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))">${emoji}
    <div style="position:absolute;top:-7px;right:-13px;background:${kind === 'pickup' ? '#ef4444' : '#0e9f6e'};color:#fff;font-size:10px;font-weight:800;border-radius:999px;min-width:15px;padding:1px 3px;border:2px solid #fff">${n}</div></div>`,
  iconSize: [28, 28], iconAnchor: [14, 14]
});

/**
 * Tournee multi-arrêts : legs rouges vers les magasins (recuperer), vertes vers les clients (livrer).
 * stops = sortie de buildTour(). Montre la position du livreur + la sequence 1,2,3...
 */
export function TourMap({ driverPos, stops, height = 340, live = null }) {
  const el = useRef(null);
  const map = useRef(null);
  const { full, toggle } = useMapFullscreen(map);
  const grp = useRef(null);
  const driverMk = useRef(null);
  const firstLegRef = useRef(null);  // segment en cours (ecart -> recalcul de la tournee)
  const rerouteAt = useRef(0);
  const [legs, setLegs] = useState(null);
  const [flash, setFlash] = useState(false);
  const [redrawToken, setRedrawToken] = useState(0);
  const t = useT();
  const stopsKey = stops.map((s) => s.o.id + s.kind).join('|');

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, {}).setView([31.2001, 29.9187], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    grp.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; grp.current = null; };
  }, []);

  // 🧭 v2026.09.23.2 : la flèche du livreur pivote en continu (vue d'ensemble nord en haut)
  useEffect(() => {
    if (!live) return undefined;
    const it = setInterval(() => arrowSetHeading(driverMk.current, live.getHdg ? live.getHdg() : null, 0), 150);
    return () => clearInterval(it);
  }, [!!live]);

  useEffect(() => {
    const m = map.current, g = grp.current;
    if (!m || !g || !driverPos || !stops.length) return;
    let cancelled = false;
    g.clearLayers();
    setLegs(null);
    firstLegRef.current = null;

    driverMk.current = L.marker([driverPos.lat, driverPos.lng], { icon: ARROW_ICON }).addTo(g);   // 🧭 pastille + flèche de cap
    glideMarker(driverMk.current);
    stops.forEach((s, i) => {
      L.marker([s.lat, s.lng], { icon: mkStopIcon(s.kind === 'pickup' ? '🏪' : '🏠', i + 1, s.kind) }).addTo(g);
    });

    const pts = [{ lat: driverPos.lat, lng: driverPos.lng }, ...stops];
    Promise.all(pts.slice(0, -1).map((a, i) => fetchRoute(a, pts[i + 1]).then((r) => ({
      i, kind: stops[i].kind,
      coords: r ? r.coords : [[a.lat, a.lng], [pts[i + 1].lat, pts[i + 1].lng]],
      dist: r ? r.distance : havM(a, pts[i + 1]),
      dur: r ? r.duration : (havM(a, pts[i + 1]) * 1.4) / (30 / 3.6)
    }))))
      .then((ls) => {
        if (cancelled || !map.current) return;
        firstLegRef.current = ls[0]?.coords || null;
        ls.forEach((l) => {
          L.polyline(l.coords, l.dist != null && l.dur != null
            ? { color: l.kind === 'pickup' ? '#ef4444' : '#0e9f6e', weight: 5, opacity: 0.9 }
            : { color: l.kind === 'pickup' ? '#ef4444' : '#0e9f6e', weight: 3, dashArray: '6 8' }).addTo(g);
        });
        setLegs(ls);
        m.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])).pad(0.25));
        setTimeout(() => map.current?.invalidateSize(), 60);
      });
    return () => { cancelled = true; };
  }, [stopsKey, redrawToken]);

  // 🧠 Intelligence : le livreur avance -> sur la tournee ? son marqueur glisse.
  // Chemin depasse (> 75 m) -> la tournee ENTIERE est recalculee depuis sa position
  // (arrets re-ordonnes du plus proche au plus loin) sans retour en arriere.
  useEffect(() => {
    const m = map.current;
    if (!m || !driverPos || !grp.current || !firstLegRef.current) return;
    driverMk.current?.setLatLng([driverPos.lat, driverPos.lng]);
    const d = distToRouteM(driverPos.lat, driverPos.lng, firstLegRef.current);
    if (d <= 75 || Date.now() - rerouteAt.current < 20000) return;
    rerouteAt.current = Date.now();
    setFlash(true);
    setTimeout(() => setFlash(false), 4000);
    setRedrawToken((x) => x + 1);   // retrace complet depuis la position actuelle
  }, [driverPos?.lat, driverPos?.lng]);

  const total = legs ? legs.reduce((s, l) => ({ d: s.d + (l.dist || 0), t: s.t + (l.dur || 0) }), { d: 0, t: 0 }) : null;
  return (
    <div>
      <div ref={el} style={full ? FS_STYLE : { position: 'relative', height, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }}>
        <FsBtn full={full} onClick={toggle} />
      </div>
      {flash && <div className="row mt8"><span className="badge" style={{ background: '#e0e7ff', color: '#3730a3' }}>🔄 {t('rerouted')}</span></div>}
      {legs ? (
        <div className="mt8 row wrap" style={{ gap: 6 }}>
          {legs.map((l, i) => (
            <span key={i} className="badge" style={{ background: l.kind === 'pickup' ? '#fee2e2' : '#d1fae5', color: l.kind === 'pickup' ? '#b91c1c' : '#065f46' }}>
              {i + 1} {l.kind === 'pickup' ? '🏪' : '🏠'} {fmtKm(l.dist)} · {fmtMin(l.dur)}
            </span>
          ))}
          <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3' }}>Σ {fmtKm(total.d)} · {fmtMin(total.t)}</span>
        </div>
      ) : (
        <div className="row mt8"><span className="badge">🧭 …</span></div>
      )}
    </div>
  );
}

/**
 * Carte des boutiques : un marqueur emoji par magasin, clic -> onSelect(store).
 * Utilisee cote client (vue Carte + position dans la fiche boutique).
 */
export function StoresMap({ stores, height = 380, onSelect }) {
  const el = useRef(null);
  const map = useRef(null);
  const { full, toggle } = useMapFullscreen(map);
  const grp = useRef(null);
  const selRef = useRef(onSelect);
  selRef.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, {}).setView([31.2001, 29.9187], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    grp.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; grp.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, g = grp.current;
    if (!m || !g || !stores) return;
    g.clearLayers();
    const pts = stores.filter((s) => s.lat != null && s.lng != null);
    pts.forEach((s) => {
      const inner = s.photo
        ? `<img src="${s.photo}" style="width:28px;height:28px;border-radius:8px;object-fit:cover" />`
        : (s.emoji || '🏪');
      const ic = L.divIcon({
        className: '',
        html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:12px;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.35);border:2.5px solid ${s.color || '#0e9f6e'};font-size:19px;overflow:hidden">${inner}</div>`,
        iconSize: [34, 34], iconAnchor: [17, 17]
      });
      L.marker([s.lat, s.lng], { icon: ic }).addTo(g).on('click', () => selRef.current?.(s));
    });
    if (pts.length === 1) m.setView([pts[0].lat, pts[0].lng], 15);
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts.map((s) => [s.lat, s.lng])).pad(0.25));
    setTimeout(() => map.current?.invalidateSize(), 80);
  }, [stores]);

  return (
    <div ref={el} style={full ? FS_STYLE : { position: 'relative', height, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }}>
      <FsBtn full={full} onClick={toggle} />
    </div>
  );
}
