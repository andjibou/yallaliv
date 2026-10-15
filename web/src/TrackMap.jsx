import React, { useEffect, useRef } from 'react';
import { useMapFullscreen, FsBtn, FS_STYLE } from './MapFullscreen.jsx';
import { createMap, emojiMarker, addLine, rmLine, fitPts } from './MapGl.jsx';
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
    setMk('driver', driverPos, '🛵');

    // Itineraire routier livreur -> client — v39 : recalcul AU PLUS toutes les 5 MINUTES
    // (avant : chaque ~110 m du livreur = 1 appel Routes API facture, ~1 toutes les 13 s !).
    // Le marqueur du livreur continue de glisser en direct (gratuit) entre deux calculs.
    if (driverPos && clientPos) {
      const now = Date.now();
      const ck = (orderId != null ? orderId + '|' : '') + clientPos.lat.toFixed(4) + ',' + clientPos.lng.toFixed(4);
      if (ck !== routeCK.current) { routeCK.current = ck; routeAt.current = 0; }   // nouvelle commande -> recalcul immediat
      const key = ck + '|' + driverPos.lat.toFixed(3) + ',' + driverPos.lng.toFixed(3);
      const draw = (r) => {
        if (!map.current) return;
        if (lineId.current) { rmLine(map.current, lineId.current); lineId.current = null; }
        lineId.current = r
          ? addLine(map.current, r.coords, { color: '#0e9f6e', width: 5, opacity: 0.85 })
          : addLine(map.current, [[driverPos.lat, driverPos.lng], [clientPos.lat, clientPos.lng]], { color: '#0e9f6e', width: 3, dashed: true });
      };
      const memo = orderId != null ? trackMemo.get(orderId) : null;
      if (memo && now - memo.at < 5 * 60e3 && !routeKey.current) {
        routeKey.current = 'memo'; routeAt.current = Date.now();   // reouverture < 5 min : itineraire resservi SANS AUCUN appel (throttle arme)
        draw(memo.r);
      } else if (key !== routeKey.current && now - routeAt.current >= 5 * 60e3) {
        routeKey.current = key; routeAt.current = now;
        fetchRoute(driverPos, clientPos).then((r) => {
          if (orderId != null && r) {
            trackMemo.set(orderId, { at: Date.now(), r });
            if (trackMemo.size > 10) trackMemo.delete(trackMemo.keys().next().value);
          }
          draw(r);
        });
      }
    } else if (lineId.current) {
      rmLine(m, lineId.current);
      lineId.current = null;
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
