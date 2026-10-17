import React, { useEffect, useRef } from 'react';
import { useMapFullscreen, FsBtn, FS_STYLE } from './MapFullscreen.jsx';
import { createMap, emojiMarker, addLine, rmLine, fitPts, snapToRoute } from './MapGl.jsx';   // + 📐 v41 snapToRoute
import { fetchRoute } from './RouteMap.jsx';

/**
 * Carte de suivi (v2026.10.05.2 : Mapbox GL) : position magasin / client / livreur.
 * Itinéraire routier réel (Mapbox Directions, repli OSRM) entre le livreur et le
 * client, recalculé quand le livreur bouge significativement (~300 m).
 * Fallback : ligne droite.
 */
// v39 : memoire de suivi — rouvrir le suivi d'une MEME commande dans les 5 min = 0 appel
// (l'itineraire calcule est resservi tel quel ; le marqueur du livreur, lui, reste LIVE).
const trackMemo = new Map();   // orderId -> { at, r }

export default function TrackMap({ storePos, clientPos, driverPos, orderId = null }) {
  const el = useRef(null);
  const map = useRef(null);
  const { full, toggle } = useMapFullscreen(map);
  const markers = useRef({});
  const routeKey = useRef('');
  const routeAt = useRef(0);      // v39 : date du DERNIER calcul (throttle)
  const routeCK = useRef('');     // v39 : commande/destination du dernier calcul (changement = recalcul immediat)
  const lineId = useRef(null);
  const grayId = useRef(null);    // v41 : partie DÉJÀ PARCOURUE (gris, comme Google)
  const routeCoords = useRef(null);   // v41 : géométrie courante (collage de la pastille)
  const snapIdx = useRef(-1);     // v41 : segment du dernier découpage (évite les redraw inutiles)

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = createMap(el.current, { zoom: 13, poolKey: 'track' });   // 🏊 v37 : survit en arrière-plan ≤ 12 h
    return () => { map.current?.remove(); map.current = null; markers.current = {}; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pts = [];
    const setMk = (key, pos, emoji) => {
      if (markers.current[key]) { markers.current[key].remove(); delete markers.current[key]; }
      if (!pos) return;
      markers.current[key] = emojiMarker(emoji).setLngLat([pos.lng, pos.lat]).addTo(m);
      pts.push([pos.lat, pos.lng]);
    };
    setMk('store', storePos, '🏪');
    setMk('client', clientPos, '🏠');
    // 📌 v41 : la pastille du livreur se COLLE au trajet (projection centimétrique — comme
    // Google Navigation) : même un déplacement de quelques centimètres la fait avancer SUR
    // la route, jamais à travers les immeubles. 0 appel API.
    let snapS = null;
    if (driverPos && routeCoords.current) {
      snapS = snapToRoute(driverPos.lat, driverPos.lng, routeCoords.current);
      try { window.__ylSnapD = Math.round(snapS.d); } catch {}   // sonde (tests)
    }
    if (driverPos) setMk('driver', snapS && snapS.d <= 30 ? { lat: snapS.lat, lng: snapS.lng } : driverPos, '🛵');   // 🎯 v47 : collage chirurgical 30 m

    // Itineraire routier livreur -> client — v39 : recalcul AU PLUS toutes les 5 MINUTES
    // (avant : chaque ~110 m du livreur = 1 appel Routes API facture, ~1 toutes les 13 s !).
    // Le marqueur du livreur continue de glisser en direct (gratuit) entre deux calculs.
    if (driverPos && clientPos) {
      const now = Date.now();
      const ck = (orderId != null ? orderId + '|' : '') + clientPos.lat.toFixed(4) + ',' + clientPos.lng.toFixed(4);
      if (ck !== routeCK.current) { routeCK.current = ck; routeAt.current = 0; }   // nouvelle commande -> recalcul immediat
      const key = ck + '|' + driverPos.lat.toFixed(3) + ',' + driverPos.lng.toFixed(3);
      // 🎨 v41 : dessin découpé — parcouru ⬜ GRIS + restant 🟢 VERT (comme Google Navigation),
      // recalculé LOCALEMENT à chaque mise à jour de position (0 appel API).
      const drawSplit = (coords) => {
        if (!map.current) return;
        if (lineId.current) { rmLine(map.current, lineId.current); lineId.current = null; }
        if (grayId.current) { rmLine(map.current, grayId.current); grayId.current = null; }
        const sp = snapToRoute(driverPos.lat, driverPos.lng, coords);
        snapIdx.current = sp.idx;
        try { window.__ylSnapD = Math.round(sp.d); } catch {}
        if (sp.d <= 30) {
          grayId.current = addLine(map.current, sp.before, { color: '#9ca3af', width: 5, opacity: 0.9 });
          lineId.current = addLine(map.current, sp.after, { color: '#0e9f6e', width: 5, opacity: 0.85 });
        } else {
          lineId.current = addLine(map.current, coords, { color: '#0e9f6e', width: 5, opacity: 0.85 });
        }
      };
      const drawFlat = () => {   // secours : ligne droite pointillée
        if (!map.current) return;
        if (lineId.current) { rmLine(map.current, lineId.current); lineId.current = null; }
        if (grayId.current) { rmLine(map.current, grayId.current); grayId.current = null; }
        lineId.current = addLine(map.current, [[driverPos.lat, driverPos.lng], [clientPos.lat, clientPos.lng]], { color: '#0e9f6e', width: 3, dashed: true });
      };
      const memo = orderId != null ? trackMemo.get(orderId) : null;
      if (memo && now - memo.at < 5 * 60e3 && !routeKey.current) {
        routeKey.current = 'memo'; routeAt.current = Date.now();   // reouverture < 5 min : itineraire resservi SANS AUCUN appel (throttle arme)
        routeCoords.current = memo.r ? memo.r.coords : null;
        if (memo.r) drawSplit(memo.r.coords); else drawFlat();
      } else if (key !== routeKey.current && (now - routeAt.current >= 5 * 60e3 || (snapS && snapS.d > 30 && now - routeAt.current >= 20e3))) {   // 🎯 v47 : le livreur a QUITTÉ le trajet → nouvel itinéraire au plus 20 s (plus d'attente 5 min)
        routeKey.current = key; routeAt.current = now;
        fetchRoute(driverPos, clientPos, null, true).then((r) => {   // 🤝 v41 : clé LIVE ~100 m partagée par TOUS les observateurs
          if (orderId != null && r) {
            trackMemo.set(orderId, { at: Date.now(), r });
            if (trackMemo.size > 10) trackMemo.delete(trackMemo.keys().next().value);
          }
          routeCoords.current = r ? r.coords : null;
          if (r) drawSplit(r.coords); else drawFlat();
        });
      } else if (routeCoords.current && snapS && snapS.d <= 75 && snapS.idx !== snapIdx.current) {
        drawSplit(routeCoords.current);   // 🔄 le livreur a changé de segment : re-découpage LOCAL (0 appel)
      } else if (routeCoords.current && snapS && snapS.d > 30 && (grayId.current || snapIdx.current !== -1)) {
        drawSplit(routeCoords.current);   // 🔄 le livreur s'est écarté : trajet complet reaffiche (gris retire)
      }
    } else {
      if (lineId.current) { rmLine(m, lineId.current); lineId.current = null; }
      if (grayId.current) { rmLine(m, grayId.current); grayId.current = null; }
      routeCoords.current = null;
    }

    setTimeout(() => m.resize(), 60);
    if (pts.length === 1) m.jumpTo({ center: [pts[0][1], pts[0][0]], zoom: 14 });
    else if (pts.length > 1) fitPts(m, pts, 0.35);
  }, [storePos, clientPos, driverPos]);

  return (
    <div ref={el} style={full ? FS_STYLE : { position: 'relative', height: 300, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }}>
      <FsBtn full={full} onClick={toggle} />
    </div>
  );
}
