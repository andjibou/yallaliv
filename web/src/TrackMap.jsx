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
export default function TrackMap({ storePos, clientPos, driverPos }) {
  const el = useRef(null);
  const map = useRef(null);
  const { full, toggle } = useMapFullscreen(map);
  const markers = useRef({});
  const routeKey = useRef('');
  const lineId = useRef(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = createMap(el.current, { zoom: 13 });
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

    // Itinéraire routier livreur → client (recalcul si le livreur a bougé de ~300 m)
    if (driverPos && clientPos) {
      const key = [driverPos.lat.toFixed(3), driverPos.lng.toFixed(3)].join(',');
      if (key !== routeKey.current) {
        routeKey.current = key;
        fetchRoute(driverPos, clientPos).then((r) => {
          if (!map.current) return;
          if (lineId.current) { rmLine(map.current, lineId.current); lineId.current = null; }
          lineId.current = r
            ? addLine(map.current, r.coords, { color: '#0e9f6e', width: 5, opacity: 0.85 })
            : addLine(map.current, [[driverPos.lat, driverPos.lng], [clientPos.lat, clientPos.lng]], { color: '#0e9f6e', width: 3, dashed: true });
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
