import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchRoute } from './RouteMap.jsx';
import { useMapFullscreen, FsBtn, FS_STYLE } from './MapFullscreen.jsx';

const driverIcon = (st) =>
  L.divIcon({
    html: `<div style="position:relative;font-size:24px;line-height:24px;text-shadow:0 1px 4px rgba(0,0,0,.45);${st.dim ? 'filter:grayscale(1);opacity:.55;' : ''}">🛵<span style="position:absolute;right:-8px;bottom:-1px;width:10px;height:10px;border-radius:50%;background:${st.color};border:1.5px solid #fff"></span></div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

// Fraîcheur de la position : 🟢 live (<1 min) · 🟠 vu il y a X min (<15 min) · ⚪ hors ligne/ancien.
// Un livreur qui verrouille son téléphone reste AFFICHÉ (badge orange) au lieu de disparaître.
const statusOf = (d) => {
  const age = Date.now() - (d.pos_at || 0);
  const mins = Math.max(1, Math.round(age / 60000));
  if (d.online && age < 60 * 1000) return { color: '#22c55e', dot: '🟢', label: 'En ligne', dim: false };
  if (age < 15 * 60 * 1000) return { color: '#f59e0b', dot: '🟠', label: `Vu il y a ${mins} min`, dim: false };
  return { color: '#9ca3af', dot: '⚪', label: d.pos_at ? `Hors ligne · vu il y a ${mins} min` : 'Hors ligne', dim: true };
};

/**
 * Carte des livreurs d'une boutique (positions en temps réel).
 * drivers : [{name, phone, online, lat, lng}]
 */
export default function DriversMap({ drivers }) {
  const el = useRef(null);
  const map = useRef(null);
  const { full, toggle } = useMapFullscreen(map);
  const layer = useRef(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current).setView([31.2001, 29.9187], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    return () => { map.current?.remove(); map.current = null; layer.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !drivers) return;
    if (layer.current) layer.current.remove();
    layer.current = L.layerGroup().addTo(m);
    const pts = [];
    for (const d of drivers) {
      if (d.lat == null || d.lng == null) continue;
      const st = statusOf(d);
      L.marker([d.lat, d.lng], { icon: driverIcon(st) })
        .addTo(layer.current)
        .bindPopup(`<b>${d.name}</b>${d.general ? ' 🌍' : ''}<br>📞 ${d.phone || '—'}<br>${st.dot} ${st.label}${d.active?.length ? `<br>🛵 En course · commande #${d.active[0].id}` : ''}`);
      pts.push([d.lat, d.lng]);
    }
    if (pts.length === 1) m.setView(pts[0], 14);
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.35));
    setTimeout(() => m.invalidateSize(), 50);
  }, [JSON.stringify(drivers)]);

  // Trajets des livreurs en course : rouge = recuperer au magasin, vert = livrer au client
  useEffect(() => {
    const m = map.current;
    if (!m || !drivers) return;
    const routes = L.layerGroup().addTo(m);
    let cancelled = false;
    const stopIcon = (emoji, bg) => L.divIcon({
      className: '',
      html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid ${bg};font-size:14px">${emoji}</div>`,
      iconSize: [26, 26], iconAnchor: [13, 13]
    });
    (async () => {
      for (const d of drivers) {
        if (cancelled || !d.active?.length || d.lat == null) continue;
        const dp = { lat: d.lat, lng: d.lng };
        for (const o of d.active) {
          if (cancelled || o.client_lat == null || o.store_lat == null) continue;
          const sp = { lat: o.store_lat, lng: o.store_lng };
          const cp = { lat: o.client_lat, lng: o.client_lng };
          const line = (r, a, b, color) => L.polyline(r ? r.coords : [[a.lat, a.lng], [b.lat, b.lng]],
            { color, weight: 4, opacity: 0.85, ...(r ? {} : { dashArray: '6 8' }) }).addTo(routes);
          if (o.status === 'assigned') {
            line(await fetchRoute(dp, sp).catch(() => null), dp, sp, '#ef4444');
            line(await fetchRoute(sp, cp).catch(() => null), sp, cp, '#0e9f6e');
          } else {
            line(await fetchRoute(dp, cp).catch(() => null), dp, cp, '#0e9f6e');
          }
          L.marker([sp.lat, sp.lng], { icon: stopIcon('🏪', '#ef4444') }).addTo(routes).bindPopup(`Commande #${o.id} — récupération`);
          L.marker([cp.lat, cp.lng], { icon: stopIcon('🏠', '#0e9f6e') }).addTo(routes).bindPopup(`Commande #${o.id} — ${o.client_name || ''}<br>${o.address || ''}`);
          if (!cancelled) m.fitBounds(L.latLngBounds([...m.getBounds(), [dp.lat, dp.lng], [cp.lat, cp.lng]]).pad(0.2));
        }
      }
    })();
    return () => { cancelled = true; routes.remove(); };
  }, [JSON.stringify(drivers)]);

  return (
    <div ref={el} style={full ? FS_STYLE : { position: 'relative', height: 320, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }}>
      <FsBtn full={full} onClick={toggle} />
    </div>
  );
}
