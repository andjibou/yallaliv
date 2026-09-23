import React, { useEffect, useRef } from 'react';
import { useMapFullscreen, FsBtn, FS_STYLE } from './MapFullscreen.jsx';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { addBaseLayers } from './mapTiles.js';
import { fetchRoute } from './RouteMap.jsx';

const mkIcon = (emoji) =>
  L.divIcon({
    html: `<div style="font-size:26px;line-height:26px;text-shadow:0 1px 4px rgba(0,0,0,.45)">${emoji}</div>`,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

/**
 * Carte de suivi : position magasin / client / livreur.
 * Itinéraire routier réel (OSRM) entre le livreur et le client, recalculé
 * quand le livreur bouge significativement (~300 m). Fallback : ligne droite.
 */
export default function TrackMap({ storePos, clientPos, driverPos }) {
  const el = useRef(null);
  const map = useRef(null);
  const { full, toggle } = useMapFullscreen(map);
  const markers = useRef({});
  const routeKey = useRef('');

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { attributionControl: true }).setView([31.2001, 29.9187], 13);
    addBaseLayers(map.current);   // 🗺️ v2026.09.23.5 : Plan/Satellite + mémoire du choix
    return () => { map.current?.remove(); map.current = null; markers.current = {}; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pts = [];
    const setMk = (key, pos, emoji) => {
      if (markers.current[key]) { markers.current[key].remove(); delete markers.current[key]; }
      if (!pos) return;
      const ll = [pos.lat, pos.lng];
      markers.current[key] = L.marker(ll, { icon: mkIcon(emoji) }).addTo(m);
      pts.push(ll);
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
          if (markers.current.line) { markers.current.line.remove(); delete markers.current.line; }
          markers.current.line = r
            ? L.polyline(r.coords, { color: '#0e9f6e', weight: 5, opacity: 0.85 }).addTo(map.current)
            : L.polyline([[driverPos.lat, driverPos.lng], [clientPos.lat, clientPos.lng]], { color: '#0e9f6e', dashArray: '6 8', weight: 3 }).addTo(map.current);
        });
      }
    } else if (markers.current.line) {
      markers.current.line.remove();
      delete markers.current.line;
    }

    setTimeout(() => m.invalidateSize(), 60);
    if (pts.length === 1) m.setView(pts[0], 14);
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.35));
  }, [storePos, clientPos, driverPos]);

  return (
    <div ref={el} style={full ? FS_STYLE : { position: 'relative', height: 300, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }}>
      <FsBtn full={full} onClick={toggle} />
    </div>
  );
}
