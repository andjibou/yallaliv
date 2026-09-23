// ⚙️ v2026.09.23.1 — Pré-requis pour leaflet-rotate (rotation de carte style Uber).
// Le plugin patche l'objet Leaflet GLOBAL (référence `L` de window), pas le module
// bundlé : ce fichier expose donc notre L importé AVANT le chargement du plugin.
import L from 'leaflet';

if (typeof window !== 'undefined' && !window.L) window.L = L;

export default L;
