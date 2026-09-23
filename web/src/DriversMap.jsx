import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchRoute, arrowSetHeading, glideMarker } from './RouteMap.jsx';
import { useMapFullscreen, FsBtn, FS_STYLE } from './MapFullscreen.jsx';

// 🧭 v2026.09.23.3 — Marqueur livreur avec BEC directionnel (comme Uber) :
// la flèche pivote dès que le livreur tourne (même sur place, via la boussole),
// l'anneau coloré = statut (🟢 en ligne · 🟠 vu récemment · ⚪ hors ligne).
const driverArrowIcon = (st) =>
  L.divIcon({
    className: '',
    html: `<div style="position:relative;width:40px;height:40px;${st.dim ? 'filter:grayscale(1);opacity:.55;' : ''}">
      <div class="yl-rot" style="position:absolute;inset:0;transition:transform .3s ease-out;will-change:transform">
        <svg width="40" height="40" viewBox="0 0 40 40" style="position:absolute;inset:0;overflow:visible">
          <path d="M20 -3 L27.5 11.5 L20 8 L12.5 11.5 Z" fill="${st.color}" stroke="#fff" stroke-width="1.6"/>
        </svg>
      </div>
      <div style="position:absolute;top:7px;left:7px;width:26px;height:26px;border-radius:50%;background:#fff;border:3px solid ${st.color};box-shadow:0 2px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:13px">🛵</div>
    </div>`,
    iconSize: [40, 40], iconAnchor: [20, 20]
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
 * Carte des livreurs d'une boutique (positions en temps réel + bec directionnel).
 * drivers : [{name, phone, online, lat, lng, bearing, active}]
 * v2026.09.23.3 : marqueurs PERSISTANTS — ils glissent vers chaque nouvelle position
 * et leur bec pivote (cap transmis par le livreur, même arrêté sur place).
 */
export default function DriversMap({ drivers }) {
  const el = useRef(null);
  const map = useRef(null);
  const { full, toggle } = useMapFullscreen(map);
  const layer = useRef(null);
  const mks = useRef({});        // marqueurs persistants par id livreur
  const stKeys = useRef({});     // dernier statut affiché (pour ne recréer l'icône que si nécessaire)
  const fittedFor = useRef('');  // ensemble de livreurs déjà cadré (on ne re-cadre pas à chaque position)
  const driversRef = useRef(drivers);
  driversRef.current = drivers;

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current).setView([31.2001, 29.9187], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; layer.current = null; mks.current = {}; stKeys.current = {}; };
  }, []);

  // 🧭 Mise à jour FLUIDE : les marqueurs existants glissent (pas de reconstruction),
  // le bec pivote sur le cap reçu. Cadrage uniquement quand l'ENSEMBLE des livreurs change.
  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g || !drivers) return;
    const seen = new Set();
    const pts = [];
    for (const d of drivers) {
      if (d.lat == null || d.lng == null) continue;
      seen.add(d.id);
      const st = statusOf(d);
      const popup = `<b>${d.name}</b>${d.general ? ' 🌍' : ''}<br>📞 ${d.phone || '—'}<br>${st.dot} ${st.label}${d.active?.length ? `<br>🛵 En course · commande #${d.active[0].id}` : ''}`;
      let mk = mks.current[d.id];
      if (!mk) {
        mk = L.marker([d.lat, d.lng], { icon: driverArrowIcon(st) }).addTo(g);
        glideMarker(mk);
        mk.bindPopup(popup);
        mks.current[d.id] = mk;
        stKeys.current[d.id] = st.color + st.dim;
      } else {
        mk.setLatLng([d.lat, d.lng]);
        const k = st.color + st.dim;
        if (stKeys.current[d.id] !== k) {   // statut changé (couleur d'anneau) -> nouvelle icône
          mk.setIcon(driverArrowIcon(st));
          glideMarker(mk);
          stKeys.current[d.id] = k;
        }
        mk.setPopupContent(popup);
      }
      arrowSetHeading(mk, typeof d.bearing === 'number' ? d.bearing : null, 0);
      pts.push([d.lat, d.lng]);
    }
    // livreurs partis de la liste -> marqueurs retirés
    Object.keys(mks.current).forEach((id) => {
      if (!seen.has(+id)) { mks.current[id].remove(); delete mks.current[id]; delete stKeys.current[id]; }
    });
    // cadrage : seulement si l'ensemble des livreurs affichés change (jamais en plein suivi)
    const key = drivers.filter((d) => d.lat != null).map((d) => d.id).sort((a, b) => a - b).join(',');
    if (pts.length && fittedFor.current !== key) {
      const prevIds = fittedFor.current ? fittedFor.current.split(',') : [];
      fittedFor.current = key;
      if (pts.length === 1) m.setView(pts[0], Math.max(m.getZoom() || 14, 14));
      else if (!prevIds.length || prevIds.length !== pts.length) m.fitBounds(L.latLngBounds(pts).pad(0.35));
    }
  }, [JSON.stringify(drivers)]);

  // Trajets des livreurs en course : rouge = recuperer au magasin, vert = livrer au client.
  // 🧭 v2026.09.23.3 : ne relance PLUS OSRM à chaque position (poll rapide) mais quand les
  // commandes actives changent, + rafraîchissement géométrie toutes les 30 s.
  const activeKey = (drivers || [])
    .filter((d) => d.active?.length && d.lat != null)
    .flatMap((d) => d.active.map((o) => `${d.id}:${o.id}:${o.status}`))
    .sort().join('|');
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const routes = L.layerGroup().addTo(m);
    let cancelled = false;
    const stopIcon = (emoji, bg) => L.divIcon({
      className: '',
      html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid ${bg};font-size:14px">${emoji}</div>`,
      iconSize: [26, 26], iconAnchor: [13, 13]
    });
    const redraw = async () => {
      routes.clearLayers();
      let grew = false;
      for (const d of driversRef.current || []) {
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
          grew = true;
        }
      }
      if (!cancelled && grew) {
        const all = [];
        for (const d of driversRef.current || []) { if (d.lat != null) all.push([d.lat, d.lng]); }
        routes.eachLayer((l) => { if (l.getLatLng) all.push([l.getLatLng().lat, l.getLatLng().lng]); });
        if (all.length) m.fitBounds(L.latLngBounds(all).pad(0.2));
      }
    };
    redraw();
    const it = setInterval(redraw, 30000);
    return () => { cancelled = true; clearInterval(it); routes.remove(); };
  }, [activeKey]);

  return (
    <div ref={el} style={full ? FS_STYLE : { position: 'relative', height: 320, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }}>
      <FsBtn full={full} onClick={toggle} />
    </div>
  );
}
