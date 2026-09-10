# 🚀 YallaLiv — Plateforme de livraison complète

Système de livraison multi-commerce (restaurants 🍽️, marchés 🛒, pharmacies 💊) avec **4 espaces** :
**Super Admin**, **Magasins**, **Livreurs**, **Clients**.

Application **PWA** : responsive (mobile + PC), installable sur l'écran d'accueil, bilingue **Français / العربية** (avec passage automatique en RTL).

---

## 🔑 Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| 👑 **Super Admin** | `admin@yallaliv.com` | `admin123` |
| 🏪 Magasin (Restaurant Al Nil) | `resto@demo.com` | `demo123` |
| 🏪 Magasin (Supermarché Alex) | `marche@demo.com` | `demo123` |
| 🏪 Magasin (Pharmacie Santé+) | `pharma@demo.com` | `demo123` |
| 🛵 Livreur (validé) | `livreur@demo.com` | `demo123` |
| 🛵 Livreuse (en attente de validation) | `nour@demo.com` | `demo123` |
| 🛍️ Client | `client@demo.com` | `demo123` |

> 💡 Sur la page de connexion, des boutons « comptes de démonstration » remplissent les identifiants en un clic.

---

## ✨ Fonctionnalités par rôle

### 🛍️ Client
- Navigation par type de commerce (restaurant / marché / pharmacie) + recherche
- Catalogue produits par magasin, panier multi-quantités (1 magasin à la fois)
- Commande avec adresse, téléphone, note + **paiement cash à la livraison ou carte en ligne** (simulé)
- **Suivi de commande en temps réel** (rafraîchissement auto toutes les 5 s) : En attente → Acceptée → En préparation → Prête → Livreur en route → Colis récupéré → Livrée
- Annulation tant que la commande est en attente, infos du livreur (nom + téléphone)
- Historique des commandes, profil, changement de langue FR/AR

### 🏪 Magasin (Admin)
- Tableau de bord : nouvelles commandes, commandes du jour, revenu du jour
- Traitement des commandes : Accepter / Refuser → Préparer → Prête (notifications auto via polling)
- Gestion des produits : ajouter / modifier / supprimer / rendre indisponible (emoji, catégorie, prix)
- Réglages du magasin : nom, description, couleur, frais de livraison, commande minimum, **ouvrir/fermer**
- Bandeau d'état : magasin en attente de validation ou suspendu

### 🛵 Livreur
- Validation du compte par le Super Admin avant activation
- Mode **En ligne / Hors ligne**
- Livraisons disponibles (commandes prêtes) : adresses de retrait/livraison, gain affiché
- Cycle : Accepter → Colis récupéré → Livré
- Gains du jour, gains totaux, nombre de livraisons, historique
- Le livreur gagne les frais de livraison de chaque commande livrée

### 👑 Super Admin (toi)
- Vue d'ensemble : **chiffre d'affaires, commissions plateforme, frais de livraison payés aux livreurs**, commandes (total + aujourd'hui), utilisateurs, magasins, livreurs, répartition par statut
- Gestion des utilisateurs : filtrer par rôle, **approuver / suspendre / activer**
- Gestion des magasins : approuver / suspendre / réactiver
- Toutes les commandes de la plateforme en un tableau
- Paramètres globaux : **nom de l'app, devise (EGP, EUR, MAD, XOF…), taux de commission (%)** appliqué automatiquement sur chaque commande

---

## 🆕 Étape 2 — Fonctionnalités avancées

### 🗺️ Suivi GPS en direct
- Le livreur partage sa position toutes les 5 s (GPS réel du téléphone ; à défaut, **trajet simulé** magasin → client pour la démo)
- Le client suit son livreur sur une **carte OpenStreetMap** (Leaflet) : marqueurs 🏪 magasin, 🏠 adresse, 🛵 livreur + itinéraire — bouton « Suivre sur la carte » sur les commandes actives
- Au checkout, le client peut partager sa position GPS précise (bouton « Utiliser ma position »)
- ⚠️ Les tuiles de carte nécessitent une connexion internet

### ⭐ Notes & avis
- Après livraison, le client note le **magasin** et le **livreur** (1-5 ⭐ + commentaire)
- La note du magasin affichée aux clients est **recalculée automatiquement** (moyenne réelle)
- Le livreur voit sa note moyenne ; le Super Admin voit les notes de tous les livreurs

### 📸 Photos produits
- Le magasin upload une vraie photo (JPG/PNG/WebP, max 3 Mo) pour chaque produit
- Stockée dans `server/data/uploads/`, affichée dans la boutique à la place de l'emoji

### 🔔 Notifications + son
- Magasin : notification navigateur + **bip** à chaque nouvelle commande (bouton 🔔 pour activer)
- Livreur : notification + bip quand une nouvelle livraison est disponible
- Client : notification à chaque changement de statut de sa commande

### 💳 Paiement carte réaliste (démo)
- Formulaire numéro/expiration/CVC avec formatage et validation
- Simulation de traitement passerelle (1,3 s) — aucun débit réel
- Prêt à brancher sur Stripe / Paymob / Fawry en production

### 📊 Exports CSV
- Magasin : bouton « Exporter CSV » (toutes ses commandes, compatible Excel)
- Super Admin : export global des ventes de la plateforme

---

## 🆕 Étape 3 — Notifications push, chat, promos & graphiques

### 🔔 Push notifications web (hors ligne)
- Standard **Web Push + VAPID** : le navigateur reçoit les notifications même **app fermée** (PWA installée)
- Clés VAPID générées automatiquement au premier démarrage du serveur
- Déclencheurs : nouvelle commande (magasin), statut changé (client), livraison disponible (livreurs en ligne), **nouveau message de chat**
- Activation : bouton 🔔 (magasin, livreur) ou Profil → Notifications (client) — purge automatique des abonnements expirés
- *Note : nécessite HTTPS + navigateur compatible (Chrome/Edge/Safari) ; l'aperçu intégré peut bloquer la permission*

### 💬 Chat par commande (client ↔ magasin ↔ livreur)
- Une conversation par commande, accessible aux trois participants (+ lecture Super Admin)
- Bulles temps réel (polling 3 s), aperçu du dernier message sur les cartes de commande, **pastille non-lu**, marquage lu automatique

### 🎁 Codes promo
- Créés par le Super Admin : **pourcentage ou montant fixe**, commande minimum, limite d'utilisations (0 = illimité), activer/désactiver, suppression
- Validation côté serveur à l'application **et** à la commande (impossible de tricher)
- Remise sur le sous-total ; la commission plateforme est calculée sur le montant net
- Codes de démo : `YALLA10` (−10 %) · `BIENVENUE20` (−20, min 100)

### 📈 Graphiques de ventes
- Magasin : revenus 14 jours + commandes 14 jours + **top 5 produits**
- Super Admin : CA plateforme 14 jours + commissions 14 jours
- Fait maison en SVG — aucune dépendance ajoutée

---

### 🗺️ Itinéraires routiers réels (OSRM)
- **À l'acceptation d'une livraison** : affichage automatique du **trajet double** — 🛵 position du livreur → 🏪 magasin en **ROUGE**, puis 🏪 magasin → 🏠 client en **VERT**, avec distance + temps de chaque segment
- **Livreur** : bouton « Voir le trajet » sur chaque livraison disponible (ou clic sur l'en-tête de la carte) → itinéraire boutique 🏪 → client 🏠
- Une fois le colis récupéré : trajet vert de la **position actuelle** du livreur jusqu'au client
- **Client** : la carte de suivi affiche le vrai itinéraire (recalculé quand le livreur avance de ~300 m)
- Service **OSRM** public (gratuit, sans clé API) ; repli automatique sur ligne droite si hors ligne

### 🛵 Livreurs privés par boutique
- Chaque magasin crée les comptes de **ses propres livreurs** (onglet « Mes livreurs ») : nom, téléphone, mot de passe — identifiant généré automatiquement (ou email personnalisé), actif immédiatement
- **Carte des positions en temps réel** : le magasin voit tous ses livreurs sur une carte (rafraîchie toutes les 5 s), avec état en ligne/hors ligne, livraisons effectuées, dernière position
- **Trajets des livreurs en course** : dès qu'un livreur a une livraison, son **trajet est dessiné sur la carte** — 🔴 rouge (position → magasin, aller récupérer) puis 🟢 vert (→ client, livrer) — et un bouton « 🗺️ Voir le trajet » ouvre le détail (distance/temps par segment, actualisé en direct). Sans livraison → position seule
- **Livreurs généraux en course pour le magasin** : visibles dans la liste (badge 🌍) **uniquement pendant** qu'ils livrent une commande du magasin — sans bouton de gestion (ils appartiennent à la plateforme)
- Gestion : suspendre / réactiver / supprimer (refusé si le livreur est en course) — réservé aux livreurs du magasin
- **Isolation stricte des données** :
  - Un magasin ne voit **que ses livreurs** (jamais ceux des autres boutiques)
  - Un livreur boutique ne voit **que les livraisons de son magasin** — et ne peut pas accepter celles des autres (erreur bloquée côté serveur)
  - Les livreurs « plateforme » (inscription publique, validés par le Super Admin) restent disponibles pour **tous** les magasins
- Notifications push « livraison prête » envoyées aux livreurs de la boutique + livreurs plateforme en ligne

### 📍 Adresse : saisie manuelle OU épinglage sur la carte (façon Uber)
- Au checkout, le client peut **écrire son adresse** ou cliquer **« Choisir sur la carte »**
- Sélecteur **épingle fixe** (vraie experience Uber) : le pin 📌 reste au centre, l'utilisateur **déplace la carte** ; l'adresse du centre s'affiche automatiquement (Nominatim) à l'arrêt du déplacement
- Bouton 🛰️ pour sauter à sa position GPS, puis **Confirmer** → adresse remplie + coordonnées précises
- **Magasin** : même sélecteur dans Réglages → champ adresse (bouton 🗺️) pour définir **la position de la boutique** (utilisée pour les trajets livreurs) — coordonnées affichées sous le champ

### ℹ️ Fiche produit détaillée + galerie multi-photos
- Clic sur un produit (photo, emoji ou nom) dans la boutique → **grande fiche** : photo grand format, catégorie, description complète, prix
- **Galerie** : le magasin ajoute une **photo principale** (affichée dans la liste) + **autant de photos supplémentaires** qu'il veut (bouton ＋, **sélection multiple en une fois**) — le client les voit en **miniatures cliquables** dans la fiche produit
- **Qualité d'origine conservée** : JPG/PNG/WebP/GIF envoyés **tels quels** (octets d'origine, zéro perte, zéro redimensionnement) ; autres formats (BMP, TIFF, SVG, AVIF…) convertis en **PNG sans perte** à pleine résolution — limite **50 Mo** par photo
- Suppression individuelle des photos (✕ sur la miniature)
- Sélecteur de quantité + bouton **« Ajouter au panier »** avec le total calculé
- Tableau de bord magasin : **commandes en haut** (priorité), **graphiques de ventes en bas**

### 🗂️ Commandes séparées par état
- **Client** (« Mes commandes ») : onglets **🛵 En cours** (x) / **📁 Historique** (x) — les livraisons passées ne mélangent plus avec les actives
- **Magasin** (tableau de bord) : filtres **⏳ Nouvelles** / **🛵 En cours de livraison** (acceptée, en préparation, prête, livreur en route, colis récupéré) / **📁 Terminées** (livrées, refusées, annulées) — avec compteurs en direct

### 🔒 Publication des livraisons : privée, publique ou attribution directe
- À l'étape « Prête », le magasin **choisit parmi 3 options** :
  - **🔒 Prête · mes livreurs** → visible **uniquement** par les livreurs personnels du magasin
  - **🌍 Prête · espace public** → visible **uniquement** par les **livreurs généraux** (les livreurs personnels du magasin ne la voient pas)
  - **👤 Attribuer à…** → **attribution directe** à un livreur personnel choisi (liste avec état en ligne, disponibilité et livraisons en cours)

#### 👤 Attribution directe intelligente
- Si le livreur choisi a **déjà une livraison en cours** → le magasin reçoit une **demande de confirmation** (« lui attribuer quand même ? »)
- Si confirmé, la plateforme **calcule automatiquement** : distance livreur→magasin vs livreur→destination de sa course en cours :
  - **Magasin plus proche** → `store_first` : il retourne au magasin récupérer la nouvelle commande, puis livre les deux (la plus proche d'abord, itinéraire multi-arrêts sur sa carte)
  - **Destination en cours plus proche** → `finish_current_first` : il termine sa livraison, puis repasse au magasin
- Le plan choisi est annoncé au magasin et envoyé au livreur par notification push ; l'itinéraire multi-arrêts optimisé s'affiche sur la carte du livreur (aussi pour les livreurs privés en multi-livraisons)
- Protection : impossible d'attribuer à un livreur d'une autre boutique, un livreur général, ou une commande non prête
- **Bascule possible à tout moment** tant que la commande est prête (bouton 🔒↔🌍 sur la carte de commande)
- **Visibilité par défaut intelligente** : privée si le magasin a des livreurs personnels, publique sinon
- Refus côté serveur si un livreur tente d'accepter une livraison qui n'est pas publiée pour son type
- Notifications push envoyées **uniquement à l'audience choisie**

### 🆕 v8 — Confort de commande et d'inscription
- 📞 **Téléphone demandé UNE SEULE FOIS** : à la première commande, le numéro est mémorisé sur le compte (serveur **et** interface, sans recharger) — les commandes suivantes sont pré-remplies.
- 📋 **Confirmation du mot de passe** à l'inscription (2 saisies, message d'erreur immédiat si différentes, bouton désactivé).
- 📞 **Dernière confirmation avant chaque commande** : « Confirmez votre commande » avec le numéro pré-rempli (modifiable) — le livreur appellera ce numéro. Répétée à chaque commande, même si le numéro est connu.

### 🆕 v7 — Inscription pro : code email, Google, téléphone à la commande
- 📧 **Inscription email = code de confirmation** : le serveur envoie un code à 6 chiffres (Brevo en ligne · code affiché à l'écran en local), compte créé après vérification (`/api/auth/register` → `need_code` puis `/api/auth/register/verify`, code jetable 15 min). Aucun compte créé sans email vérifié.
- 🔵 **Continuer avec Google** : bouton officiel Google Identity Services sur connexion + inscription. Le serveur vérifie le JWT Google (audience = `GOOGLE_CLIENT_ID`), crée/lie le compte (nom + email automatiques). Bouton masqué si `GOOGLE_CLIENT_ID` non configuré (`.env.example` documenté).
- 📞 **Inscription téléphone = directe** (pas de SMS payant — choix 100 % gratuit). Le numéro est validé naturellement à la livraison.
- 🛒 **Téléphone exigé à la commande** : champ mis en avant + note « obligatoire pour la livraison » si le compte n'en a pas ; le numéro saisi est **mémorisé sur le compte** (jamais redemandé).
- 🏪 **Partenaire = formulaire complet** : nom, type, téléphone ET adresse du magasin requis (le téléphone manquant est recopié sur le compte). **🗺️ Choisir sur la carte** : épingle fixe façon Uber, géocodage inverse automatique de l'adresse, badge « ✓ Position précise définie » — la position exacte du magasin est enregistrée (`store_lat`/`store_lng`), essentielle pour la recherche à proximité et les plans de livraison. Sans carte → repli centre-ville.
- ✅ Testé : code email (mauvais code refusé, code consommé, compte créé uniquement après vérification), téléphone direct, checkout invité direct (sans friction), Google non configuré → réponses propres, téléphone mémorisé après commande, partenaire refusé incomplet puis accepté complet.

### 🆕 v6 — Inscription par email OU téléphone
- 📧📞 **Au choix à l'inscription** : nom complet + mot de passe + **email** *ou* **numéro de téléphone** (onglets 📧/📞). Connexion avec l'un ou l'autre (espaces/tirets ignorés).
- 🔒 Unicité : email unique **et** téléphone unique (index PostgreSQL insensible aux espaces) ; doublon → « Numéro déjà utilisé ».
- 👤 Comptes téléphone : email `NULL` (colonne devenue optionnelle) ; l'email peut être **ajouté plus tard** depuis le profil. Récupération de mot de passe des comptes sans email → via le support (le Super Admin définit un mot de passe, fonction existante).
- ✅ Testé : inscription téléphone, connexion par téléphone avec espaces, doublon refusé, téléphone trop court refusé, inscription email inchangée, édition profil sans puis avec email, commande passée par un compte téléphone.

### 🆕 v5 — Un compte = client d'abord, « Devenir partenaire » ensuite
- 🛍️ **Inscription UNIQUEMENT en client** (plus de choix de rôle à l'inscription — comme Uber Eats/Glovo). Tout le monde atterrit dans l'espace client.
- 🏪 **Devenir partenaire** : depuis le profil client, un formulaire crée le magasin (nom, type, téléphone pré-rempli, adresse) — **sans redemander** nom/email/mot de passe. Le compte devient marchand, le magasin passe `pending` et le Super Admin reçoit la notification (`POST /api/partner`).
- 🔀 **Bascule magasin ⇄ client** : bouton 🛍️ dans l'en-tête de l'espace magasin, carte « Mes espaces » dans le profil client. Les marchands (et le Super Admin) peuvent **aussi passer des commandes** côté client. Livreurs exclus (créés par le Super Admin / les magasins, comme avant).
- ✅ Testé : inscription forcée client, partenaire → marchand + magasin en attente, commande passée par un marchand, doublon refusé, Super Admin client OK, livreur bloqué.

### 🆕 Expérience utilisateur v4
- ⏳ **Chronomètre anti brute-force** : après trop de tentatives, l'utilisateur VOIT le temps restant (bannière + bouton désactivé avec compte à rebours mm:ss) sur connexion, inscription et code de récupération. Le serveur renvoie `retry_after` (secondes). Compteurs **séparés par endpoint** (échecs de login ≠ blocage d'inscription).
- 🛍️ **Espace client SANS compte (invité)** : ouverture du site → catalogue client direct (magasins, produits, recherche, panier). Le compte est créé **au moment de commander** (nom + email + mot de passe dans le panier) ; « Déjà un compte ? » propose la connexion. Commandes/Profil → invitation à se connecter. APIs publiques : `/stores`, `/stores/:id`, `/products`, `/settings/public`.
- 🌍 **3 langues : FR / العربية / EN** — détection automatique de la langue du système au premier lancement (modifiable à tout moment). **354 clés × 3 langues** vérifiées par parité, ~60 messages d'erreur serveur traduits côté client (map exacte + préfixes dynamiques), dates localisées, CGU trilingues.
- 🧪 **Comptes de démonstration visibles uniquement en local** (localhost/127.0.0.1) — jamais en ligne.

### 🏗️ Phase 0 — Prêt pour la mise en ligne (100 % gratuit)
- 📸 **Photos en base PostgreSQL** (compatible Render gratuit au disque éphémère) : le client optimise sur SON appareil → **miniature** (320 px, listes/panier) + **version affichage** (1600 px, fiche). Entrée : tout format jusqu'à 50 Mo ; sortie ~100-400 Ko. Servies par `/api/photos/<id>/thumb|full` avec cache immuable 1 an ; lignes purgées à la suppression/remplacement. Anciennes URLs `/uploads/...` toujours servies (compatibilité).
- 🔐 **Mode production sécurisé** : `NODE_ENV=production` → refus de démarrer sans `JWT_SECRET` fort ; **jamais de seed démo** ; le Super Admin est créé via `ADMIN_EMAIL`/`ADMIN_PASSWORD` (testé : 1 user, 0 store, 0 commande).
- 🛡️ **Anti brute-force** (sans dépendance) : login/inscription 10 essais/15 min/IP, mot de passe oublié 5/15 min → 429 + `Retry-After: 900`.
- 📧 **Récupération de mot de passe** : jamais de code en clair en production (SMTP via `SMTP_HOST/PORT/USER/PASS/FROM` — Brevo gratuit 300/j).
- ⚖️ **CGU + politique de confidentialité** bilingues (FR/AR) sur `/legal`, lien depuis connexion et inscription.
- ✅ Tout testé : roundtrip octet/octet thumb/display, purge des lignes orphelines, 400/404/413 propres, blocage exact à la 11ᵉ tentative, démarrage production sans/avec admin env.

### 🧠 Recalcul intelligent d'itinéraire (tous les livreurs)
- Le livreur (privé **ou** général) qui dépasse son chemin de **plus de 75 m** → l'itinéraire est **automatiquement recalculé depuis sa position actuelle** : pas de retour en arrière, la carte se redessine vers la destination (badge « 🔄 Nouvel itinéraire calculé depuis votre position »)
- Sur l'itinéraire → simple glissement du marqueur (aucun recalcul inutile)
- Fonctionne sur **tous les types d'affichage** : trajet simple, trajet double (rouge/vert), tournée multi-arrêts (la tournée entière est ré-optimisée : arrêts re-triés du plus proche au plus loin)
- Anti-spam : 1 recalcul max toutes les 20 s ; tolérance GPS 75 m ; vue client (suivi) recalculée aussi
- Mathématiques validées : distance point↔itinéraire exacte (0 m sur route, 29/95/428 m mesurés vs 28,5/95,1/427,6 m théoriques)

### 🛡️ Robustesse : plus jamais d'écran blanc
- **ErrorBoundary** global + par onglet : si une section crashe, une **carte d'erreur lisible** s'affiche (avec bouton « 🔄 Réessayer ») au lieu d'une page blanche — le reste de l'app reste utilisable, changer d'onglet réinitialise l'erreur
- Durcissement des composants (données manquantes tolérées)

### 🛵 Livreurs généraux — créés par le Super Admin uniquement
- Nouvel onglet **« 🛵 Livreurs généraux »** (Super Admin) : créer (nom, email, téléphone, véhicule, mot de passe), suspendre, supprimer — avec position, note et livraisons
- **Plus d'auto-inscription livreur** sur la page d'inscription (client + magasin uniquement)
- **Confidentialité** : les boutiques ne voient un livreur général que s'il prend une livraison chez elles (nom + téléphone sur la commande) ; le client le voit seulement sur sa propre livraison ; les détails complets (email, position…) restent visibles du Super Admin seul
- Dans l'onglet Utilisateurs, badge **🌍 Général** / **🏪 Boutique** sur chaque livreur

### 🤖 Dispatch automatique des livraisons publiques
- Quand un magasin publie une livraison dans **l'espace public**, la plateforme **l'attribue automatiquement** au livreur général **le plus rapide** : score OSRM = trajet *position du livreur → magasin* + *magasin → client* (durées routières réelles, repli ligne droite si hors ligne)
- **Pas de refus possible** : le livreur général reçoit une **alarme 🚨 plein écran** (son + vibration en boucle) jusqu'à ce qu'il appuie sur **OK** — son itinéraire est modifié automatiquement
- **Multi-livraisons (5 max)** : l'onglet « Mes livraisons » affiche la **tournée optimisée** — carte multi-arrêts numérotée (legs 🔴 rouges vers les magasins, 🟢 vertes vers les clients) triée **du plus proche au plus loin**, avec distance/temps de chaque segment et total
- **Règle d'éligibilité** : bloqué si colis déjà **en main** + 2 récupérations en attente → le livreur redevient éligible dès qu'il livre l'ancien colis ; libre dès qu'une livraison se termine
- Déclencheurs : publication publique, bascule de visibilité, passage en ligne, mise à jour de position (20 s), fin de livraison + filet de sécurité toutes les 30 s
- Les **livreurs de boutique** ne sont pas concernés : ils gardent le flux manuel (accept/refus) sur les livraisons privées de leur magasin

### 🔔 Validation des nouveaux magasins par le Super Admin
- Tout nouveau magasin inscrit commence **non fonctionnel** (statut « en attente ») : invisible des clients, aucune commande possible
- Le Super Admin reçoit une **notification push** à l'inscription + une **bannière 🔔 rouge** en permanence dans son espace (« X magasin(s) en attente → Examiner maintenant ») avec badge 🔴 sur l'onglet Magasins
- Dans l'onglet 🏪 Magasins : les demandes en attente apparaissent **en premier, surlignées en orange**, avec **✅ Approuver** (le magasin devient visible et fonctionnel) ou **❌ Refuser** (magasin + compte supprimés proprement)
- **Fiche complète d'un magasin** : clic sur une carte magasin → toutes ses informations — statut, catégorie, ouvert/fermé, description, **statistiques** (chiffre d'affaires, commission perçue, commandes totales/livrées/en cours, note), **propriétaire** (nom, email, téléphone, date d'inscription), coordonnées + **lien vers la carte OpenStreetMap**, frais/minimum de livraison, **liste de ses livreurs personnels**, **catalogue produits complet** (prix, disponibilité) et **10 dernières commandes**
- Filtre par catégorie côté client : les 6 types ont leur puce de filtrage

### 🗂️ Nouvelles catégories de magasins
- 🍽️ Restaurant · 🛒 Marché · 💊 Pharmacie · **🛋️ Meubles & Électroménager** · **👕 Vêtements** · **📱 Électronique & Accessoires** (téléphones, ordinateurs…)
- Choix à l'inscription du magasin + filtres côté client + badge catégorie

### 🗺️ Position des boutiques + produits avec logo magasin
- **Accueil client, 3 vues au choix** : 🏪 **Magasins** (liste) · 🗺️ **Carte** (toutes les boutiques sur une vraie carte Leaflet — marqueur emoji personnalisé par magasin, clic → fiche boutique) · 🛍️ **Produits** (tous les produits de toutes les boutiques)
- **Chaque produit affiché porte l'indice de son magasin** : logo (emoji dans la couleur du magasin) + nom du magasin + prix — **clic sur la carte → fiche produit complète** (photos, galerie, description, ajout au panier) sans quitter la page ; badge « 🏪 Voir le magasin » pour ouvrir la boutique
- **Recherche avec suggestions automatiques** : pendant la frappe, une liste déroulante propose les résultats correspondants (max 6) — clic sur une boutique → ouvre sa fiche ; clic sur un produit → **ouvre directement sa fiche produit** ; suggestions avec icône, nom et info contextuelle (catégorie/magasin/prix)
- **Recherche adaptée au contexte** : la barre de recherche de l'accueil cherche des **magasins** (vues Magasins/Carte) ou des **produits** (vue Produits — par nom de produit **ou de magasin**) ; **dans une boutique**, une barre de recherche filtre **instantanément les produits de cette boutique** (nom, description, catégorie) avec bouton ✕ pour effacer
- La recherche et les filtres par catégorie fonctionnent sur les **3 vues**
- **Navigation retour fidèle** : la vue active (Magasins/Carte/Produits), la catégorie et la recherche sont **mémorisées dans l'URL** — le bouton ← ramène exactement là où on était (pas au menu principal)
- **Fiche boutique** : bouton **« 🗺️ Carte »** (même style que le menu principal) sous l'en-tête → affiche/masque la carte de position du magasin (📍 marqueur + adresse)

### 🔑 Récupération de mot de passe + paramètres du compte
- **« Mot de passe oublié ? »** sur la page de connexion : email → **code à 6 chiffres** (valable 15 min) → nouveau mot de passe
- **Envoi par email** si SMTP configuré dans `server/.env` (SMTP_HOST/PORT/USER/PASS — ex. Gmail gratuit avec mot de passe d'application, modèle dans `.env.example`) ; **sans SMTP** (mode local) le code s'affiche directement dans la fenêtre
- **Plan B Super Admin** : toutes les demandes de code sont visibles dans son onglet ⚙️ Paramètres (bannière orange, code copiable en un clic) — et il peut **définir lui-même le mot de passe** de n'importe quel utilisateur (bouton 🔑 dans l'onglet Utilisateurs)
- **Paramètres du compte (tous les rôles)** : bouton 👤 (client : page Profil ; magasin/livreur/Super Admin : barre du haut) — changer **nom, email, téléphone** (vérification email unique) et **mot de passe** (avec confirmation de l'actuel)
- Sécurité : pas de divulgation des comptes existants, codes à usage unique supprimés après usage, codes réservés au Super Admin

### 🖼️ Photo de profil des magasins + produits sans emojis
- **Photo de profil du magasin** (onglet 🏪 Magasin → « Photo du magasin ») : upload **tout format** avec compression auto — visible par les clients **partout** : liste des magasins, fiche boutique, marqueurs de la carte, logo sur chaque produit dans la vue Produits, suggestions de recherche ; bouton « Retirer la photo » (retour à l'emoji)
- **Emojis des produits supprimés** : les produits n'ont plus de champ emoji — ils utilisent uniquement leurs **photos** (principale + galerie) ; sans photo, un **placeholder neutre** (icône image grise) s'affiche ; le panier montre aussi la photo du produit
- Vérifié : photo de **31 Mo** stockée et servie **octet pour octet identique** (30 732 638 = 30 732 638) via le site ✓ ; photo de 64 Mo refusée avec un message clair ✓ ; **fiche produit : photo affichée en entier** (`object-fit: contain`, plus de rognage) ✓

---

## 🛠️ Stack technique

| Couche | Technologie |
|---|---|
| Backend | Node.js + Express |
| Base de données | **PostgreSQL** (`pg`) — standard pro, prêt pour la production |
| Auth | Tokens signés HMAC-SHA256 (30 jours), mots de passe scrypt + sel |
| Frontend | React 18 + React Router (Vite) |
| Cartes | Leaflet + OpenStreetMap (sans clé API) |
| i18n | FR / AR maison + RTL automatique |
| PWA | `manifest.webmanifest` + service worker (cache hors-ligne + push) |
| Push | Web Push + VAPID (`web-push`), notifications même app fermée |
| Temps réel | Polling 5 s (simple et robuste) |
| Config | Fichier `server/.env` (DATABASE_URL, PORT, JWT_SECRET) |

---

## 💻 Installation locale (sur ton PC)

### 1. Prérequis (gratuits)
- **Node.js 20+** → https://nodejs.org (version LTS)
- **PostgreSQL 14+** → https://www.postgresql.org/download/
  - *Windows* : installateur graphique, garde le mot de passe `postgres` choisi pendant l'installation
  - *macOS* : `brew install postgresql@17 && brew services start postgresql@17`
  - *Linux* : `sudo apt install postgresql`
  - *Ou via Docker (une ligne)* : `docker run --name yallaliv-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=yallaliv -p 5432:5432 -d postgres:17`

### 2. Créer la base (une seule fois)
```bash
# Linux/macOS :
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" -c "CREATE DATABASE yallaliv;"
# Windows (invite de commande) :
psql -U postgres -c "CREATE DATABASE yallaliv;"
```

### 3. Configurer et lancer
```bash
cd server
cp .env.example .env        # puis adapter DATABASE_URL si besoin
npm install
npm start                   # → crée les tables + données de démo au 1er démarrage

# autre terminal :
cd web
npm install
npm run dev                 # → http://localhost:5173
```

### 4. (Optionnel) Explorer la base avec une interface graphique
- **pgAdmin 4** (inclus avec l'installateur Windows/Mac) ou **DBeaver Community** — gratuits

---

## 🧰 Outils 100 % gratuits recommandés

| Outil | Usage | Gratuit ? |
|---|---|---|
| **VS Code** | Éditeur de code | ✅ |
| **Node.js LTS** | Runtime backend + build front | ✅ |
| **PostgreSQL** | Base de données locale | ✅ open source |
| **pgAdmin 4 / DBeaver** | Interface graphique pour la base | ✅ |
| **Git + GitHub** | Sauvegarde du code + historique des versions | ✅ |
| **Neon** | PostgreSQL hébergé gratuit (0,5 Go, illimité dans le temps) | ✅ |
| **Render** | Hébergement Node.js + site statique gratuits | ✅ |
| **Vercel / Netlify** | Alternative pour le frontend | ✅ |

---

## 🚀 Mise en ligne gratuite (quand tu es prêt)

**Stack recommandée : Neon (base) + Render (app) — 0 €/mois**

1. **Base** : compte sur [neon.tech](https://neon.tech) → créer un projet → copier la chaîne `DATABASE_URL`
2. **Code** : pousser le projet sur GitHub (repo privé ou public)
3. **App** : compte sur [render.com](https://render.com) → *New Web Service* → connecter le repo GitHub :
   - **Build** : `cd web && npm install && npm run build && cd ../server && npm install`
   - **Start** : `node server/index.js`
   - **Variables d'environnement** : `DATABASE_URL` (Neon), `JWT_SECRET` (secret long aléatoire), `PORT=4000`
4. Render donne une URL gratuite `https://ton-app.onrender.com` (HTTPS inclus ✅ — requis pour les push notifications)
5. Les tables + données de démo se créent automatiquement au premier démarrage

*Limites du gratuit (à connaître) : Render endort l'app après ~15 min d'inactivité (1er chargement ~30 s ensuite) ; Neon 0,5 Go. Suffisant pour tester avec de vrais utilisateurs, passer au payant (~5-7 $/mois) quand ça décolle.*

---

## ▶️ Lancer le projet (résumé)

```bash
# Terminal 1 — API (port 4000) — nécessite PostgreSQL démarré
cd server && cp .env.example .env && npm install && npm start

# Terminal 2 — App (port 5173, proxy /api vers le 4000)
cd web && npm install && npm run dev
```

**Production locale (un seul serveur)** :
```bash
cd web && npm run build        # génère web/dist
cd ../server && npm start      # l'API sert aussi le front sur le port 4000
```

La base est **auto-initialisée** (tables + démo) au premier démarrage.
Pour repartir de zéro : `TRUNCATE users, stores, products, orders, order_items, reviews, driver_locations, messages, promos, push_subscriptions, settings RESTART IDENTITY CASCADE;` puis vider le dossier `server/data/uploads/`.

---

## 📁 Structure
```
yallaliv/
├── server/
│   ├── index.js      # API REST complète (auth, clients, magasins, livreurs, super admin)
│   └── db.js         # Connexion PostgreSQL + schéma + seed de démonstration
└── web/
    ├── public/       # manifest PWA, service worker, icône
    └── src/
        ├── lib.jsx   # API client, i18n FR/AR, contexts (auth, panier, réglages)
        ├── ui.jsx    # Composants partagés (stepper, badges, modal, toasts…)
        └── pages/    # auth.jsx · client.jsx · merchant.jsx · driver.jsx · superadmin.jsx
```

## 🔄 Cycle d'une commande
```
Client commande (pending)
  → Magasin : Accepter (accepted) ou Refuser (rejected)
  → Magasin : Préparer (preparing) → Prête (ready)
  → Livreur : Accepter (assigned) → Collet récupéré (picked_up) → Livré (delivered)
  → Cash encaissé = payé ; commission plateforme calculée automatiquement
```

## 🗺️ Pistes pour la suite (étape 4)
- 💳 Brancher un vrai paiement (Stripe / Paymob / Fawry — le flux carte est déjà simulé côté client)
- 🌍 Ajouter l'anglais (3ᵉ langue)
- 🏷️ Fidélité : points, parrainage, soldes créditeurs
- 🍽️ Horaires d'ouverture par magasin + zones de livraison
- 📱 Empaquetage natif (Capacitor) pour App Store / Google Play
