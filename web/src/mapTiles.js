import L from 'leaflet';

// 🗺️ v2026.09.23.6 — Fonds de carte communs à TOUTES les cartes de l'app.
// 100 % SANS clé API, SANS compte, SANS carte bancaire.
//  · 🛰️ Satellite (hybride) : imagerie Esri World Imagery + routes Esri
//    (World Transportation) + noms de rues/villes Esri (Boundaries and Places).
//    Ces 3 couches Esri sont conçues pour se superposer -> remplace les étiquettes
//    CARTO, qui affichent désormais un filigrane « API KEY REQUIRED » sans clé
//    (politique CARTO d'août 2026). Aucune dépendance CARTO ne reste.
//  · 🛣️ Plan détaillé : Esri World Street Map (données rues Esri/HERE, rendu clair).
//  · 🗺️ Plan : OpenStreetMap classique.
// Le choix est mémorisé (localStorage) et s'applique à toutes les cartes de l'app.
// Petit bouton ⧉ en bas à gauche de chaque carte pour basculer.
const LAYER_KEY = 'yl_map_layer';

function buildLayers() {
  const E = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  const plan = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap' });
  const rue = L.tileLayer(`${E}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    { maxZoom: 19, attribution: 'Esri, HERE, Garmin, OpenStreetMap' });
  const satImg = L.tileLayer(`${E}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' });
  const satRoads = L.tileLayer(`${E}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`,
    { maxZoom: 19, attribution: '' });          // routes tracées par-dessus l'imagerie
  const satLbl = L.tileLayer(`${E}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    { maxZoom: 19, attribution: '' });          // noms de villes/rues par-dessus l'imagerie
  const hybride = L.layerGroup([satImg, satRoads, satLbl]);
  return { '🛰️ Satellite': hybride, '🛣️ Plan détaillé': rue, '🗺️ Plan': plan };
}

/** Ajoute le fond de carte (+ sélecteur) sur une carte Leaflet. */
export function addBaseLayers(map) {
  const layers = buildLayers();
  let pref = 'sat';   // 🛰️ hybride par défaut : imagerie récente + routes lisibles
  try { pref = localStorage.getItem(LAYER_KEY) || 'sat'; } catch {}
  (pref === 'plan' ? layers['🗺️ Plan'] : pref === 'rue' ? layers['🛣️ Plan détaillé'] : layers['🛰️ Satellite']).addTo(map);
  L.control.layers(layers, null, { position: 'bottomleft', collapsed: true }).addTo(map);
  map.on('baselayerchange', (e) => {
    try {
      const n = String(e.name);
      localStorage.setItem(LAYER_KEY, n.includes('Satellite') ? 'sat' : n.includes('détaillé') ? 'rue' : 'plan');
    } catch {}
  });
  return map;
}
