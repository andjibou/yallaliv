import React, { useEffect, useRef } from 'react';
import { createMap, arrowMarker, updateArrowStatus, emojiMarker, addLine, rmLine, fitPts, glideMarker, bindPopup, arrowSetHeading } from './MapGl.jsx';
import { fetchRoute } from './RouteMap.jsx';
import { useMapFullscreen, FsBtn, FS_STYLE } from './MapFullscreen.jsx';

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
 * Carte des livreurs d'une boutique (v2026.10.05.2 : Mapbox GL) : positions en
 * temps réel + bec directionnel qui pivote (cap transmis par le livreur, même
 * arrêté sur place). Anneau coloré = statut.
 * drivers : [{name, phone, online, lat, lng, bearing, active}]
 */
export default function DriversMap({ drivers }) {
  const el = useRef(null);
  const map = useRef(null);
  const { full, toggle } = useMapFullscreen(map);
  const mks = useRef({});        // marqueurs persistants par id livreur
  const stKeys = useRef({});     // dernier statut affiché (pour ne restyler que si nécessaire)
  const fittedFor = useRef('');  // ensemble de livreurs déjà cadré (on ne re-cadre pas à chaque position)
  const routesRef = useRef({ lines: [], markers: [] });   // trajets des livreurs en course
  const driversRef = useRef(drivers);
  driversRef.current = drivers;

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = createMap(el.current, { zoom: 12 });
    return () => { map.current?.remove(); map.current = null; mks.current = {}; stKeys.current = {}; };
  }, []);

  // 🧭 Mise à jour FLUIDE : les marqueurs existants glissent (pas de reconstruction),
  // le bec pivote sur le cap reçu. Cadrage uniquement quand l'ENSEMBLE des livreurs change.
  useEffect(() => {
    const m = map.current;
    if (!m || !drivers) return;
    const seen = new Set();
    const pts = [];
    for (const d of drivers) {
      if (d.lat == null || d.lng == null) continue;
      seen.add(d.id);
      const st = statusOf(d);
      const popup = `<b>${d.name}</b>${d.general ? ' 🌍' : ''}<br>📞 ${d.phone || '—'}<br>${st.dot} ${st.label}${d.active?.length ? `<br>🛵 En course · commande #${d.active[0].id}` : ''}`;
      let mk = mks.current[d.id];
      if (!mk) {
        mk = arrowMarker(st.color, st.dim).setLngLat([d.lng, d.lat]).addTo(m);
        glideMarker(mk);
        bindPopup(mk, popup);
        mks.current[d.id] = mk;
        stKeys.current[d.id] = st.color + st.dim;
      } else {
        mk.setLngLat([d.lng, d.lat]);
        const k = st.color + st.dim;
        if (stKeys.current[d.id] !== k) {   // statut changé (couleur d'anneau) -> restyle sans recréer
          updateArrowStatus(mk, st.color, st.dim);
          stKeys.current[d.id] = k;
        }
        mk.getPopup()?.setHTML(popup);
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
      if (pts.length === 1) m.jumpTo({ center: [pts[0][1], pts[0][0]], zoom: Math.max(m.getZoom() || 14, 14) });
      else if (!prevIds.length || prevIds.length !== pts.length) fitPts(m, pts, 0.35);
    }
  }, [JSON.stringify(drivers)]);

  // Trajets des livreurs en course : rouge = recuperer au magasin, vert = livrer au client.
  // Ne relance PLUS le calcul d'itinéraire à chaque position (poll rapide) mais quand
  // les commandes actives changent, + rafraîchissement géométrie toutes les 30 s.
  const activeKey = (drivers || [])
    .filter((d) => d.active?.length && d.lat != null)
    .flatMap((d) => d.active.map((o) => `${d.id}:${o.id}:${o.status}`))
    .sort().join('|');
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const routes = routesRef.current;
    let cancelled = false;
    const clear = () => {
      routes.lines.forEach((id) => rmLine(m, id)); routes.lines = [];
      routes.markers.forEach((mk) => mk.remove()); routes.markers = [];
    };
    const redraw = async () => {
      clear();
      let grew = false;
      const all = [];
      for (const d of driversRef.current || []) {
        if (cancelled || !d.active?.length || d.lat == null) continue;
        const dp = { lat: d.lat, lng: d.lng };
        all.push([d.lat, d.lng]);
        for (const o of d.active) {
          if (cancelled || o.client_lat == null || o.store_lat == null) continue;
          const sp = { lat: o.store_lat, lng: o.store_lng };
          const cp = { lat: o.client_lat, lng: o.client_lng };
          const line = (r, a, b, color) => {
            routes.lines.push(addLine(m, r ? r.coords : [[a.lat, a.lng], [b.lat, b.lng]],
              r ? { color, width: 4, opacity: 0.85 } : { color, width: 4, opacity: 0.85, dashed: true }));
          };
          if (o.status === 'assigned') {
            line(await fetchRoute(dp, sp).catch(() => null), dp, sp, '#ef4444');
            line(await fetchRoute(sp, cp).catch(() => null), sp, cp, '#0e9f6e');
          } else {
            line(await fetchRoute(dp, cp).catch(() => null), dp, cp, '#0e9f6e');
          }
          const sm = emojiMarker('🏪').setLngLat([sp.lng, sp.lat]).addTo(m);
          bindPopup(sm, `Commande #${o.id} — récupération`);
          const cm = emojiMarker('🏠').setLngLat([cp.lng, cp.lat]).addTo(m);
          bindPopup(cm, `Commande #${o.id} — ${o.client_name || ''}<br>${o.address || ''}`);
          routes.markers.push(sm, cm);
          all.push([sp.lat, sp.lng], [cp.lat, cp.lng]);
          grew = true;
        }
      }
      if (!cancelled && grew && all.length) fitPts(m, all, 0.2);
    };
    redraw();
    const it = setInterval(redraw, 30000);
    return () => { cancelled = true; clearInterval(it); clear(); };
  }, [activeKey]);

  return (
    <div ref={el} style={full ? FS_STYLE : { position: 'relative', height: 320, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }}>
      <FsBtn full={full} onClick={toggle} />
    </div>
  );
}
