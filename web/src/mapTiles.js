import L from 'leaflet';

// 🗺️ v2026.09.23.5 — Fonds de carte communs à TOUTES les cartes de l'app.
//  · 🛰️ Satellite : imagerie Esri World Imagery (plus récente qu'OSM, sans clé API)
//    + noms de rues/villes CARTO par-dessus (transparent) -> rendu type Google Maps.
//  · 🗺️ Plan : fond de plan OpenStreetMap classique.
// Le choix est mémorisé (localStorage) et s'applique à toutes les cartes de l'app.
// Petit bouton ⧉ en bas à gauche de chaque carte pour basculer.
const LAYER_KEY = 'yl_map_layer';

function buildLayers() {
  const plan = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap' });
  const satImg = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' });
  const satLbl = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
    { maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap · © CARTO' });
  const satellite = L.layerGroup([satImg, satLbl]);   // imagerie + noms de rues
  return { '🗺️ Plan': plan, '🛰️ Satellite': satellite };
}

/** Ajoute le fond de carte (+ sélecteur) sur une carte Leaflet. */
export function addBaseLayers(map) {
  const layers = buildLayers();
  let pref = 'sat';   // 🛰️ par défaut : imagerie plus récente
  try { pref = localStorage.getItem(LAYER_KEY) || 'sat'; } catch {}
  (pref === 'plan' ? layers['🗺️ Plan'] : layers['🛰️ Satellite']).addTo(map);
  L.control.layers(layers, null, { position: 'bottomleft', collapsed: true }).addTo(map);
  map.on('baselayerchange', (e) => {
    try { localStorage.setItem(LAYER_KEY, String(e.name).includes('Satellite') ? 'sat' : 'plan'); } catch {}
  });
  return map;
}
