# 🗺️ Plan intégration GOOGLE MAPS — YallaLiv (v2026.10.05.3)

> **✅ DÉCISIONS (05/10/2026)** : **TOUT GOOGLE** (cartes + géocodage + itinéraires) · **Mapbox gardé en secours automatique** · **plafond 0 $ garanti** (quotas verrouillés au gratuit) · carte bancaire Google Cloud acceptée par l'user · clé via **variable d'environnement** (plus de push bloqué).

## 1. Architecture à 3 étages (jamais de carte morte)

```
Moteur cartes    : Google Maps JS  →  Mapbox GL  →  fond OSM raster
Recherche adresse: Google Geocoder →  Mapbox     →  Esri + Photon + Nominatim
Géocodage inverse: Google Geocoder →  Mapbox     →  Esri + Nominatim
Itinéraires      : Google Routes API→  Mapbox    →  OSRM public
```
- Clé Google absente / quota du jour atteint / erreur → **bascule automatique** à l'étage suivant. L'utilisateur ne voit rien casser.
- `MapGl.jsx` devient une **façade** : les 8 composants carte (PickMap, RouteMap, DualRouteMap, TourMap, StoresMap, TrackMap, DriversMap + plein écran) ne changent PAS — seul le moteur derrière change.

## 2. Coûts (verrouillés à 0 $)

| API Google | Gratuit/mois | Verrou quota conseillé | Au-delà (si verrou levé) |
|---|---|---|---|
| Maps JavaScript (cartes) | 10 000 chargements | **320/jour** | 7 $/1 000 |
| Geocoding (recherche) | 10 000 requêtes | **320/jour** | 5 $/1 000 |
| Routes API — Compute Routes (itinéraires) | 10 000 requêtes | **320/jour** | 5 $/1 000 |

320/jour × 31 ≈ 9 920 < 10 000 → **0 $ garanti** ; au-delà du quota du jour → bascule Mapbox/moteurs gratuits. + **alerte budget 1 $** dans Google Cloud (email à 50 %).

## 3. Étapes côté user (compte Google Cloud)

1. **console.cloud.google.com** → se connecter → créer un projet « yallaliv »
2. **Facturation** : ajouter un compte de facturation (carte bancaire — exigée par Google, même pour le gratuit)
3. **APIs & Services → Library** → activer EXACTEMENT ces 3 API :
   - **Maps JavaScript API** (« Maps for your website ») — les cartes
   - **Geocoding API** (« Convert between addresses and geographic coordinates ») — la recherche d'adresse
   - **Routes API** (« Performance optimized versions of the Directions and Distance Matrix APIs ») — les itinéraires
   
   ⚠️ **NE PAS chercher « Directions API »** : elle est passée *Legacy/End of Sale* le 05/10/2026 —
   elle n'apparaît même plus dans la liste des nouveaux projets comme le nôtre. La Routes API la
   remplace (notre code l'utilise déjà). N'activer AUCUNE autre API (Embed, Static, Places, SDK…) :
   chaque API activée en plus = une surface de quota/facturation à surveiller pour rien.
4. **APIs & Services → Credentials → Create credentials → API key** → copier la clé (`AIza…`)
5. *(recommandé)* **Restreindre la clé** : HTTP referrers → `yallaliv.vercel.app/*` + `localhost:5173/*`
6. **Quotas** (par API → Edit quotas ou Quota tab) : plafonner à **320 requêtes/jour**
7. **Billing → Budgets** : budget 1 $, alerte email à 50 %
8. **Vercel** : Settings → Environment Variables → `VITE_GMAPS_KEY` = la clé (Production + Preview)

## 4. Implémentation (notre côté)

| Fichier | Changement |
|---|---|
| **`MapGoogle.jsx`** (nouveau) | Moteur Google : chargement du script (injection manuelle, zéro dépendance npm), adaptateur carte avec API Mapbox-like (`jumpTo/panTo/setBearing/getCenter/on/off/resize`), marqueurs HTML emoji/flèche/arrêt/boutique (OverlayView — mêmes visuels), polylines (pleines/pointillées), InfoWindow, rotation Uber via `setHeading` (cartes vectorielles), Geocoder + **Routes API `computeRoutes`** (fetch direct navigateur, CORS vérifié, field mask minimal, TRAFFIC_AWARE = SKU Essentials 10k/mois, décodage polyline intégré) |
| **`MapGl.jsx`** | Devient **façade 3 étages** : `createMap()` → Google si `VITE_GMAPS_KEY`, sinon Mapbox si `VITE_MAPBOX_TOKEN`, sinon OSM. Marqueurs intelligents (même objet DOM pour les 2 moteurs). `gForward/gReverse/gRoute` Google avec repli Mapbox |
| **`PickMap.jsx`** | Recherche : Google en tête (si clé) + Esri + Photon + Nominatim. Inverse : Google → Mapbox → Esri/Nominatim |
| **`RouteMap.jsx`** | `fetchRoute` : Google Routes API (trafic) → Mapbox → OSRM |
| `client.jsx` / `App.jsx` | version v2026.10.05.3 |
| AUCUN rebuild APK | L'API JS tourne dans le WebView (server.url = site Vercel) |
| `package.json` | **inchangé** (chargement script manuel — pas de dépendance Google) |

## 5. Ce qui ne change pas
- Boutons 🧭 Google Maps (ouverture directe app) et 🔎 — inchangés
- Pubs (.7), fiche produit (.8), recherche multi-moteurs de secours, gardes anti-périmé
- APK : aucune action

## 6. Tests
- **Sans clé** (maintenant) : la façade doit retomber sur Mapbox → suite de non-régression verte
- **Avec clé** (dès réception) : suite **v316** complète — cartes Google rendues, marqueurs, itinéraires Google (badge distance/durée), recherche Google en tête, langue arabe, rotation Uber, bascule de secours simulée (clé invalide → Mapbox), régressions .1/.2/.7/.8
