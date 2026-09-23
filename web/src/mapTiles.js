import L from 'leaflet';

// 🗺️ v2026.09.23.8 — Fond de carte UNIQUE pour TOUTES les cartes de l'app :
// le plan OpenStreetMap classique (Leaflet | © OpenStreetMap).
// Les autres fonds (satellite Esri, plan détaillé Esri) ont été retirés sur demande.
// Le géocodage (recherche d'adresse) reste indépendant du fond affiché : il continue
// d'interroger Esri + OpenStreetMap pour trouver la MEILLEURE position possible.
export function addBaseLayers(map) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  return map;
}
