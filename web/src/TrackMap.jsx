import React, { useEffect, useRef } from 'react';
import { useMapFullscreen, FsBtn, FS_STYLE } from './MapFullscreen.jsx';
import { createMap, emojiMarker, arrowMarker, arrowSetHeading, glideMarker, addLine, rmLine, fitPts, snapToRoute } from './MapGl.jsx';   // 🧭 v48 : arrowMarker/arrowSetHeading/glideMarker — flèche orientée pour l'observateur
import { fetchRoute } from './RouteMap.jsx';

const havM = (a, b) => {   // 🎯 v50 : distance locale (collage seulement en mouvement)
  const R = 6371000, rd = Math.PI / 180;
  const dA = (b.lat - a.lat) * rd, dO = (b.lng - a.lng) * rd;
  const h = Math.sin(dA / 2) ** 2 + Math.cos(a.lat * rd) * Math.cos(b.lat * rd) * Math.sin(dO / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/**
 * Carte de suivi (client / observateur) : position magasin / client / livreur.
 * v41 : pastille collée au trajet + parcouru en gris. v47 : collage chirurgical 30 m,
 * recalcul ≤ 20 s si le livreur quitte le trajet.
 * 🧭 v48 CHIRURGICAL :
 *  • la pastille du livreur est une FLÈCHE orientée par le CAP transmis par le serveur
 *    (l'observateur VOIT le livreur tourner) et GLISSE au lieu de sauter ;
 *  • les marqueurs ne sont plus détruits/recréés à chaque position (plus de clignotement) ;
 *  • le cadrage ne saute PLUS à chaque mise à jour : fait une seule fois (magasin/client
 *    ou 1ère position livreur) — l'observateur peut zoomer et REGARDER le livreur avancer.
 */
// v39 : memoire de suivi — rouvrir le suivi d'une MEME commande dans les 5 min = 0 appel
// (l'itineraire calcule est resservi tel quel ; le marqueur du livreur, lui, reste LIVE).
const trackMemo = new Map();   // orderId -> { at, r }

export default function TrackMap({ storePos, clientPos, driverPos, orderId = null, hdg = null }) {   // 🧭 v48 : hdg = cap du livreur (bearing serveur)
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
  const prevPosT = useRef(null);  // 🎯 v50 : position précédente → collage UNIQUEMENT en mouvement
  const lastSpT = useRef(null);   // 🎯 v50 : dernier découpage → gris avancé dès 10 m
  const fitKey = useRef('');      // 🧭 v48 : cadrage fait UNE fois — plus de saut à chaque position
  const hdgRef = useRef(hdg); hdgRef.current = hdg;   // 🧭 v48 : cap serveur, rafraîchi par le poll

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = createMap(el.current, { zoom: 13, poolKey: 'track' });   // 🧹 v48 : carte DÉTRUITE à la fermeture — 0 carte en arrière-plan, mémoire libérée immédiatement
    return () => { map.current?.remove(); map.current = null; markers.current = {}; };
  }, []);

  // 🧭 v48 : la flèche du livreur PIVOTE en continu (cap serveur) et contre-tourne
  // si l'observateur fait pivoter la carte lui-même.
  useEffect(() => {
    const it = setInterval(() => {
      const mm = map.current; if (!mm) return;
      arrowSetHeading(markers.current.driver, hdgRef.current, mm.getBearing() || 0);
    }, 150);
    return () => clearInterval(it);
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;

    // ── 🧭 v48 : marqueurs PERSISTANTS — créés une fois, DÉPLACÉS ensuite.
    //    Avant : tout était détruit/recréé à CHAQUE position (poll 4 s) → clignotement.
    const setMk = (key, pos, emoji) => {
      if (!pos) { if (markers.current[key]) { markers.current[key].remove(); delete markers.current[key]; } return; }
      if (markers.current[key]) markers.current[key].setLngLat([pos.lng, pos.lat]);
      else markers.current[key] = emojiMarker(emoji).setLngLat([pos.lng, pos.lat]).addTo(m);
    };
    setMk('store', storePos, '🏪');
    setMk('client', clientPos, '🏠');

    // 📌 v41/v47 : pastille COLLÉE au trajet (projection centimétrique, cap → bon côté
    // de la chaussée). 0 appel API.
    const snapS = driverPos && routeCoords.current
      ? snapToRoute(driverPos.lat, driverPos.lng, routeCoords.current, typeof hdgRef.current === 'number' ? hdgRef.current : null)
      : null;
    if (snapS) { try { window.__ylSnapD = Math.round(snapS.d); } catch {} }   // sonde (tests)

    // 🧭 v48 : livreur = PASTILLE + FLÈCHE orientée, qui GLISSE (550 ms) — l'observateur
    // le voit AVANCER et TOURNER, comme le livreur lui-même.
    if (driverPos) {
      // 🎯 v50 : collage UNIQUEMENT EN MOUVEMENT (≥ 4 m depuis la dernière position) —
      // à l'arrêt (devant le magasin, chez le client) : position RÉELLE, jamais
      // « téléportée » jusqu'à 30 m sur la route d'à côté.
      const prevT = prevPosT.current; prevPosT.current = { lat: driverPos.lat, lng: driverPos.lng };
      const movingT = prevT != null && havM(prevT, driverPos) > 4;
      const dp = movingT && snapS && snapS.d <= 20 ? { lat: snapS.lat, lng: snapS.lng } : driverPos;   // 🎯 v50
      if (markers.current.driver) markers.current.driver.setLngLat([dp.lng, dp.lat]);
      else { markers.current.driver = arrowMarker('#0e9f6e').setLngLat([dp.lng, dp.lat]).addTo(m); glideMarker(markers.current.driver, 550); }
    } else if (markers.current.driver) { markers.current.driver.remove(); delete markers.current.driver; }

    // ── 🧭 v48 : cadrage UNE SEULE FOIS (magasin/client connus ou 1ère position livreur).
    //    Avant : fitPts à CHAQUE position → la carte sautait, impossible de zoomer.
    const fk = (storePos ? storePos.lat.toFixed(4) + ',' + storePos.lng.toFixed(4) : '-') + '|' +
               (clientPos ? clientPos.lat.toFixed(4) + ',' + clientPos.lng.toFixed(4) : '-') + '|' +
               (driverPos ? 'd' : '');
    if (fk !== fitKey.current) {
      fitKey.current = fk;
      const pts = [];
      if (storePos) pts.push([storePos.lat, storePos.lng]);
      if (clientPos) pts.push([clientPos.lat, clientPos.lng]);
      if (driverPos) pts.push([driverPos.lat, driverPos.lng]);
      if (pts.length === 1) m.jumpTo({ center: [pts[0][1], pts[0][0]], zoom: 14 });
      else if (pts.length > 1) fitPts(m, pts, 0.35);
    }

    // Itineraire routier livreur -> client — 🚀 v49 : recalcul AU PLUS toutes les 15 s
    // (avant : 5 min) — le trajet suit VRAIMENT le livreur, ETAs toujours à jour.
    if (driverPos && clientPos) {
      const now = Date.now();
      const ck = (orderId != null ? orderId + '|' : '') + clientPos.lat.toFixed(4) + ',' + clientPos.lng.toFixed(4);
      if (ck !== routeCK.current) { routeCK.current = ck; routeAt.current = 0; }   // nouvelle commande -> recalcul immediat
      const key = ck + '|' + driverPos.lat.toFixed(4) + ',' + driverPos.lng.toFixed(4);   // 🚀 v49 : ~11 m (avant ~111 m) → recalcul dès que le livreur avance vraiment
      // 🎨 v41 : dessin découpé — parcouru ⬜ GRIS + restant 🟢 VERT (comme Google Navigation),
      // recalculé LOCALEMENT à chaque mise à jour de position (0 appel API).
      const drawSplit = (coords) => {
        if (!map.current) return;
        if (lineId.current) { rmLine(map.current, lineId.current); lineId.current = null; }
        if (grayId.current) { rmLine(map.current, grayId.current); grayId.current = null; }
        const sp = snapToRoute(driverPos.lat, driverPos.lng, coords, typeof hdgRef.current === 'number' ? hdgRef.current : null);
        snapIdx.current = sp.idx;
        lastSpT.current = { lat: sp.lat, lng: sp.lng };
        try { window.__ylSnapD = Math.round(sp.d); window.__ylGrayEnd = [sp.lat, sp.lng]; } catch {}   // 🎯 v50 : + sonde gris
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
      // 🚀 v49 : MODE LIBRE — recalcul AU PLUS toutes les 15 s (avant : 5 MINUTES) et
      // IMMÉDIAT si le livreur a quitté son trajet. Plus de « mémo 5 min » servi en
      // priorité : à la réouverture on recalcule TOUJOURS frais depuis la position
      // réelle ; le mémo ne sert plus que de SECOURS si OSRM ne répond pas.
      if (key !== routeKey.current && (now - routeAt.current >= 15e3 || (snapS && snapS.d > 30))) {
        routeKey.current = key; routeAt.current = now;
        fetchRoute(driverPos, clientPos, null, true).then((r) => {
          if (r) {
            if (orderId != null) {
              trackMemo.set(orderId, { at: Date.now(), r });
              if (trackMemo.size > 10) trackMemo.delete(trackMemo.keys().next().value);
            }
            routeCoords.current = r.coords;
            drawSplit(r.coords);
          } else {
            const fb = orderId != null ? trackMemo.get(orderId) : null;   // 🛟 secours : OSRM indisponible → dernier trajet connu
            routeCoords.current = fb?.r ? fb.r.coords : null;
            if (fb?.r) drawSplit(fb.r.coords); else drawFlat();
          }
        });
      } else if (routeCoords.current && snapS && snapS.d <= 75 && (snapS.idx !== snapIdx.current || !lastSpT.current || havM(lastSpT.current, { lat: snapS.lat, lng: snapS.lng }) > 10)) {
        drawSplit(routeCoords.current);   // 🔄 🎯 v50 : re-découpage au changement de segment OU dès 10 m parcourus (avant : jusqu'à 200 m de retard sur les portions droites)
      } else if (routeCoords.current && snapS && snapS.d > 30 && (grayId.current || snapIdx.current !== -1)) {
        drawSplit(routeCoords.current);   // 🔄 le livreur s'est écarté : trajet complet reaffiche (gris retire)
      }
    } else {
      if (lineId.current) { rmLine(m, lineId.current); lineId.current = null; }
      if (grayId.current) { rmLine(m, grayId.current); grayId.current = null; }
      routeCoords.current = null;
    }

    setTimeout(() => m.resize(), 60);
  }, [storePos, clientPos, driverPos]);

  return (
    <div ref={el} style={full ? FS_STYLE : { position: 'relative', height: 300, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }}>
      <FsBtn full={full} onClick={toggle} />
    </div>
  );
}
