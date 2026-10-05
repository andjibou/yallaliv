import React, { useEffect, useRef, useState } from 'react';
import { useT } from './lib.jsx';
import {
  createMap, emojiMarker, arrowMarker, stopMarker, storeMarker,
  arrowSetHeading, glideMarker, updateArrowStatus, addLine, rmLine, fitPts, bindPopup, gRoute, mbRoute,
} from './MapGl.jsx';
import { useMapFullscreen, FsBtn, FS_STYLE } from './MapFullscreen.jsx';

// 🗺️ v2026.10.05.2 — TOUTES les cartes de ce fichier sont passées de Leaflet à
// Mapbox GL JS (style Standard 3D, libellés dans la langue de l'app, rotation
// NATIVE — plus besoin du plugin leaflet-rotate). Les exports et le comportement
// (recalcul d'itinéraire à 75 m, mode Uber, tournées) restent IDENTIQUES.
export { arrowSetHeading, glideMarker };   // compat : DriversMap les importe d'ici

/**
 * Itinéraire routier réel — chaîne à 3 étages : Google Directions (trafic
 * réel, 10k/mois gratuits) → Mapbox Directions (100k/mois) → OSRM public
 * (gratuit, sans clé). Retourne {coords: [[lat,lng]…], distance: m, duration: s} ou null.
 */
export async function fetchRoute(from, to) {
  const g = await gRoute(from, to).catch(() => null);   // 🥇 Google Directions
  if (g) return g;
  const mb = await mbRoute(from, to).catch(() => null); // 🥈 Mapbox Directions
  if (mb) return mb;
  try {   // 🛟 secours OSRM
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
 * 🧭 Navigation live (côté livreur) — adapté à Mapbox GL :
 *  - pivote la flèche en continu (cap fourni par live.getHdg()),
 *  - fait pivoter la carte sur le cap du livreur (mode Uber, rotation native)
 *    tant qu'il ne la tourne pas lui-même,
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
      const b = mm.getBearing() || 0;
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
      const b = mm.getBearing() || 0;
      arrowSetHeading(getMarker ? getMarker() : null, h, b);
      if (typeof h !== 'number' || !s.follow || !s.rot || s.zooming) return;
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
      if (mm && lat != null) { try { mm.stop(); mm.easeTo({ center: [lng, lat], zoom: Math.max(mm.getZoom() || 13, 15.5), duration: 600 }); } catch {} }
    },
    toggleRot: () => {
      const s = nav.current; s.rot = !s.rot; bump((x) => x + 1);
      const mm = mapRef.current;
      if (!s.rot && mm) { s.myBearing = 0; mm.setBearing(0); }   // retour nord en haut
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
 * Carte avec itinéraire routier de `from` à `to` (Mapbox Directions, repli OSRM).
 * Fallback : ligne droite pointillée si aucune réponse (hors ligne).
 */
export default function RouteMap({ from, to, fromEmoji = '🏪', toEmoji = '🏠', height = 300, live = null }) {
  const el = useRef(null);
  const map = useRef(null);
  const { full, toggle } = useMapFullscreen(map);
  const markers = useRef({});
  const coordsRef = useRef(null);   // itineraire courant (pour detecter un ecart)
  const rerouteAt = useRef(0);      // anti-spam : 1 recalcul / 20 s max
  const lineId = useRef(null);
  const [info, setInfo] = useState(null);
  const [flash, setFlash] = useState(false);
  const t = useT();

  useEffect(() => {
    if (!el.current || map.current) return;
    // 🧭 live (livreur) : rotation auto sur son cap (native GL JS)
    map.current = createMap(el.current, { zoom: 13 });
    return () => { map.current?.remove(); map.current = null; markers.current = {}; };
  }, []);

  const navApi = useLiveNav(map, live, () => markers.current.from);

  useEffect(() => {
    const m = map.current;
    if (!m || !from || !to) return;
    let cancelled = false;

    // marqueurs départ / arrivée
    ['from', 'to'].forEach((k) => { if (markers.current[k]) { markers.current[k].remove(); markers.current[k] = null; } });
    if (lineId.current) { rmLine(m, lineId.current); lineId.current = null; }
    // 🧭 live : le départ EST le livreur -> pastille + flèche de direction
    markers.current.from = (live ? arrowMarker('#0e9f6e') : emojiMarker(fromEmoji)).setLngLat([from.lng, from.lat]).addTo(m);
    if (live) { glideMarker(markers.current.from); m.jumpTo({ center: [from.lng, from.lat], zoom: 16 }); }
    markers.current.to = emojiMarker(toEmoji).setLngLat([to.lng, to.lat]).addTo(m);
    if (!live) fitPts(m, [[from.lat, from.lng], [to.lat, to.lng]], 0.3);

    // itinéraire réel (ou ligne droite en secours)
    setInfo(null);
    coordsRef.current = null;
    fetchRoute(from, to).then((r) => {
      if (cancelled || !map.current) return;
      if (r) {
        lineId.current = addLine(map.current, r.coords, { color: '#0e9f6e', width: 5, opacity: 0.85 });
        coordsRef.current = r.coords;
        setInfo({ distance: r.distance, duration: r.duration });
      } else {
        lineId.current = addLine(map.current, [[from.lat, from.lng], [to.lat, to.lng]], { color: '#0e9f6e', width: 3, dashed: true });
      }
      setTimeout(() => map.current?.resize(), 60);
    });

    return () => { cancelled = true; };
  }, [to?.lat, to?.lng, fromEmoji, toEmoji]);

  // 🧠 Intelligence : a chaque mouvement, si le livreur est SUR l'itineraire -> on glisse
  // son marqueur. S'il l'a depasse (> 75 m) -> NOUVEL itineraire depuis sa position actuelle,
  // sans jamais retourner en arriere.
  useEffect(() => {
    const m = map.current;
    if (!m || !from || !to || !lineId.current || !coordsRef.current) return;
    markers.current.from?.setLngLat([from.lng, from.lat]);
    const d = distToRouteM(from.lat, from.lng, coordsRef.current);
    if (d <= 75 || Date.now() - rerouteAt.current < 20000) return;
    rerouteAt.current = Date.now();
    let cancelled = false;
    setFlash(true);
    setTimeout(() => setFlash(false), 4000);
    rmLine(m, lineId.current); lineId.current = null;
    fetchRoute(from, to).then((r) => {
      if (cancelled || !map.current) return;
      if (r) {
        coordsRef.current = r.coords;
        lineId.current = addLine(map.current, r.coords, { color: '#0e9f6e', width: 5, opacity: 0.85 });
        setInfo({ distance: r.distance, duration: r.duration });
      } else {
        lineId.current = addLine(map.current, [[from.lat, from.lng], [to.lat, to.lng]], { color: '#0e9f6e', width: 3, dashed: true });
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
    try { m.panTo([from.lng, from.lat], { duration: 500 }); } catch {}
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
  const l1 = useRef(null), l2 = useRef(null);
  const [legs, setLegs] = useState(null);
  const [flash, setFlash] = useState(false);
  const t = useT();

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = createMap(el.current, { zoom: 13 });
    return () => { map.current?.remove(); map.current = null; marks.current = {}; };
  }, []);

  const navApi = useLiveNav(map, live, () => marks.current.d);

  useEffect(() => {
    const m = map.current;
    if (!m || !driverPos || !storePos || !clientPos) return;
    let cancelled = false;
    ['d', 's', 'c'].forEach((k) => { if (marks.current[k]) { marks.current[k].remove(); marks.current[k] = null; } });
    [l1, l2].forEach((ref) => { if (ref.current) { rmLine(m, ref.current); ref.current = null; } });
    // 🧭 live : pastille + flèche de direction sur le livreur, ouverture zoomée sur lui
    marks.current.d = (live ? arrowMarker('#0e9f6e') : emojiMarker('🛵')).setLngLat([driverPos.lng, driverPos.lat]).addTo(m);
    if (live) { glideMarker(marks.current.d); m.jumpTo({ center: [driverPos.lng, driverPos.lat], zoom: 16 }); }
    marks.current.s = emojiMarker('🏪').setLngLat([storePos.lng, storePos.lat]).addTo(m);
    marks.current.c = emojiMarker('🏠').setLngLat([clientPos.lng, clientPos.lat]).addTo(m);
    setLegs(null);
    leg1Ref.current = null;

    Promise.all([fetchRoute(driverPos, storePos), fetchRoute(storePos, clientPos)]).then(([r1, r2]) => {
      if (cancelled || !map.current) return;
      leg1Ref.current = r1 ? r1.coords : null;
      l1.current = addLine(m,
        r1 ? r1.coords : [[driverPos.lat, driverPos.lng], [storePos.lat, storePos.lng]],
        r1 ? { color: '#ef4444', width: 5, opacity: 0.9 } : { color: '#ef4444', width: 3, dashed: true });
      l2.current = addLine(m,
        r2 ? r2.coords : [[storePos.lat, storePos.lng], [clientPos.lat, clientPos.lng]],
        r2 ? { color: '#0e9f6e', width: 5, opacity: 0.9 } : { color: '#0e9f6e', width: 3, dashed: true });
      setLegs([r1, r2]);
      if (!live) fitPts(m, [[driverPos.lat, driverPos.lng], [storePos.lat, storePos.lng], [clientPos.lat, clientPos.lng]], 0.25);
      setTimeout(() => map.current?.resize(), 60);
    });
    return () => { cancelled = true; };
  }, [storePos?.lat, storePos?.lng, clientPos?.lat, clientPos?.lng]);

  // 🧠 Intelligence : le livreur bouge -> sur le trajet rouge ? marqueur glisse.
  // Trajet depasse (> 75 m) -> le segment livreur->magasin est RECALCULE depuis sa position.
  useEffect(() => {
    const m = map.current;
    if (!m || !driverPos || !storePos || !l1.current || !leg1Ref.current) return;
    marks.current.d?.setLngLat([driverPos.lng, driverPos.lat]);
    const d = distToRouteM(driverPos.lat, driverPos.lng, leg1Ref.current);
    if (d <= 75 || Date.now() - rerouteAt.current < 20000) return;
    rerouteAt.current = Date.now();
    let cancelled = false;
    setFlash(true);
    setTimeout(() => setFlash(false), 4000);
    fetchRoute(driverPos, storePos).then((r) => {
      if (cancelled || !map.current || !r) return;
      leg1Ref.current = r.coords;
      rmLine(map.current, l1.current);
      l1.current = addLine(map.current, r.coords, { color: '#ef4444', width: 5, opacity: 0.9 });
      setLegs((pv) => [r, pv?.[1]]);
    });
    return () => { cancelled = true; };
  }, [driverPos?.lat, driverPos?.lng]);

  // 🧭 Mode Uber (live) : la carte suit le livreur — un drag désactive, 📍 réactive
  useEffect(() => {
    const m = map.current;
    const s = navApi.nav.current;
    if (!m || !live || !driverPos || !s.follow || s.zooming) return;
    try { m.panTo([driverPos.lng, driverPos.lat], { duration: 500 }); } catch {}
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

/**
 * Tournee multi-arrêts : legs rouges vers les magasins (recuperer), vertes vers
 * les clients (livrer). stops = sortie de buildTour(). Montre la position du
 * livreur + la sequence 1,2,3...
 */
export function TourMap({ driverPos, stops, height = 340, live = null }) {
  const el = useRef(null);
  const map = useRef(null);
  const { full, toggle } = useMapFullscreen(map);
  const grp = useRef(null);          // {markers: [], lines: []}
  const driverMk = useRef(null);
  const firstLegRef = useRef(null);  // segment en cours (ecart -> recalcul de la tournee)
  const rerouteAt = useRef(0);
  const [legs, setLegs] = useState(null);
  const [flash, setFlash] = useState(false);
  const [redrawToken, setRedrawToken] = useState(0);
  const t = useT();
  const stopsKey = stops.map((s) => s.o.id + s.kind).join('|');

  const clearGrp = () => {
    const g = grp.current; if (!g) return;
    g.markers.forEach((mk) => mk.remove()); g.markers = [];
    g.lines.forEach((id) => rmLine(map.current, id)); g.lines = [];
  };

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = createMap(el.current, { zoom: 13 });
    grp.current = { markers: [], lines: [] };
    return () => { map.current?.remove(); map.current = null; grp.current = null; driverMk.current = null; };
  }, []);

  // 🧭 la flèche du livreur pivote en continu (vue d'ensemble nord en haut)
  useEffect(() => {
    if (!live) return undefined;
    const it = setInterval(() => arrowSetHeading(driverMk.current, live.getHdg ? live.getHdg() : null, 0), 150);
    return () => clearInterval(it);
  }, [!!live]);

  useEffect(() => {
    const m = map.current, g = grp.current;
    if (!m || !g || !driverPos || !stops.length) return;
    let cancelled = false;
    clearGrp();
    setLegs(null);
    firstLegRef.current = null;

    driverMk.current = arrowMarker('#0e9f6e').setLngLat([driverPos.lng, driverPos.lat]).addTo(m);   // 🧭 pastille + flèche de cap
    glideMarker(driverMk.current);
    stops.forEach((s, i) => {
      g.markers.push(stopMarker(s.kind === 'pickup' ? '🏪' : '🏠', i + 1, s.kind).setLngLat([s.lng, s.lat]).addTo(m));
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
          g.lines.push(addLine(map.current, l.coords, l.dist != null && l.dur != null
            ? { color: l.kind === 'pickup' ? '#ef4444' : '#0e9f6e', width: 5, opacity: 0.9 }
            : { color: l.kind === 'pickup' ? '#ef4444' : '#0e9f6e', width: 3, dashed: true }));
        });
        setLegs(ls);
        fitPts(m, pts.map((p) => [p.lat, p.lng]), 0.25);
        setTimeout(() => map.current?.resize(), 60);
      });
    return () => { cancelled = true; };
  }, [stopsKey, redrawToken]);

  // 🧠 Intelligence : le livreur avance -> sur la tournee ? son marqueur glisse.
  // Chemin depasse (> 75 m) -> la tournee ENTIERE est recalculee depuis sa position
  // (arrets re-ordonnes du plus proche au plus loin) sans retour en arriere.
  useEffect(() => {
    const m = map.current;
    if (!m || !driverPos || !grp.current || !firstLegRef.current) return;
    driverMk.current?.setLngLat([driverPos.lng, driverPos.lat]);
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
 * Utilisee cote client (fiche boutique).
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
    map.current = createMap(el.current, { zoom: 12 });
    grp.current = [];
    return () => { map.current?.remove(); map.current = null; grp.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !stores) return;
    grp.current.forEach((mk) => mk.remove()); grp.current = [];
    const pts = stores.filter((s) => s.lat != null && s.lng != null);
    pts.forEach((s) => {
      const mk = storeMarker(s).setLngLat([s.lng, s.lat]).addTo(m);
      mk.getElement().addEventListener('click', (e) => { e.stopPropagation(); selRef.current?.(s); });
      grp.current.push(mk);
    });
    if (pts.length === 1) m.jumpTo({ center: [pts[0].lng, pts[0].lat], zoom: 15 });
    else if (pts.length > 1) fitPts(m, pts.map((s) => [s.lat, s.lng]), 0.25);
    setTimeout(() => map.current?.resize(), 80);
  }, [stores]);

  return (
    <div ref={el} style={full ? FS_STYLE : { position: 'relative', height, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }}>
      <FsBtn full={full} onClick={toggle} />
    </div>
  );
}
