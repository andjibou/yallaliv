# 🚀 Guide de mise en ligne YallaLiv (Phase 1 — 100 % gratuit)

> **Résultat final** : ton site en ligne sur `https://yallaliv-xxxx.back4app.com`, base PostgreSQL Neon, emails Brevo, surveillance UptimeRobot — **0 €/mois**.
> Temps total : ~1 h. Fais les étapes dans l'ordre et préviens ton assistant à chaque blocage.

---

## Étape 1 — GitHub (le code du projet en ligne, dépôt **privé**) ~15 min

1. Crée un compte sur [github.com](https://github.com) (ou connecte-toi).
2. Clique **+** (en haut à droite) → **New repository** :
   - Nom : `yallaliv`
   - Visibilité : **Private** ✅ (important)
   - Ne coche rien d'autre → **Create repository**
3. Installe Git sur ton PC si besoin (PowerShell) :
   ```powershell
   winget install --id Git.Git -e --source winget
   ```
   (redémarre PowerShell après l'installation)
4. Envoie le code (PowerShell) :
   ```powershell
   cd C:\Users\PCM\Desktop\Workspace\yallaliv
   git init
   git add .
   git commit -m "YallaLiv - pret pour la mise en ligne"
   git branch -M main
   git remote add origin https://github.com/TON_COMPTE/yallaliv.git
   git push -u origin main
   ```
   (remplace `TON_COMPTE` par ton nom d'utilisateur GitHub — une fenêtre GitHub s'ouvrira pour se connecter)

✅ Vérification : sur github.com, ton dépôt affiche les dossiers `server/` et `web/` — **sans** `node_modules` ni `.env` (le `.gitignore` les exclut automatiquement).

---

## Étape 2 — Neon (base PostgreSQL gratuite) ~10 min

1. Va sur [neon.com](https://neon.com) → **Sign up with GitHub**.
2. **Create project** :
   - Nom : `yallaliv`
   - Region : **Frankfurt (eu-central-1)** — la plus proche de l'Égypte
3. Sur le dashboard, cherche **Connection string** → copie l'URL complète :
   ```
   postgresql://utilisateur:motdepasse@ep-xxxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
   ⚠️ Garde-la précieusement (presse-papiers ou bloc-notes) — c'est la `DATABASE_URL`.

💡 Gratuit : 0,5 Go de stockage (≈ des milliers de photos optimisées) — largement suffisant pour le lancement.

---

## Étape 3 — Back4app (le site + l'API en ligne, gratuit, SANS carte) ~15 min

> ⚠️ Render demande une carte bancaire même pour le plan gratuit → on utilise **Back4app Containers** :
> 1 conteneur gratuit (0,25 CPU, 256 Mo RAM, 100 Go de transfert/mois), **sans carte**, déploiement GitHub, HTTPS gratuit.
> Le dépôt contient déjà le `Dockerfile` et le `.dockerignore` — rien à configurer côté code.

1. Va sur [back4app.com](https://www.back4app.com) → **Sign up** → **Continue with GitHub** (compte andjibou) → autorise.
2. Sur le dashboard, bouton **NEW APP** (en haut à droite) → choisis **Containers as a Service**.
3. Autorise l'application Back4app sur GitHub en lui donnant accès au dépôt **andjibou/yallaliv**.
4. Sélectionne le dépôt **yallaliv** — Back4app détecte le Dockerfile automatiquement.
5. **Variables d'environnement** — ajoute chacune :

   | Clé | Valeur |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | *(l'URL Neon copiée à l'étape 2, avec `?sslmode=require`)* |
   | `JWT_SECRET` | *(un long texte aléatoire unique — ne le réutilise nulle part ailleurs)* |
   | `ADMIN_EMAIL` | *(ton vrai email — ce sera ton login Super Admin)* |
   | `ADMIN_PASSWORD` | *(un mot de passe FORT)* |

6. **Deploy** → le build Docker dure 3 à 6 min → ton site est en ligne sur une URL du type
   `https://yallaliv-xxxx.back4app.com` (affichée en haut de l'application).
7. Vérification : ouvre l'URL → page de connexion → connecte-toi avec ADMIN_EMAIL / ADMIN_PASSWORD
   → espace Super Admin **vide** (aucun magasin, aucun utilisateur — normal, pas de données démo en production).
8. ⚠️ Change ensuite ton mot de passe (icône 👤 → paramètres du compte).

> 💡 Le plan gratuit s'endort après une période sans visiteurs — l'étape 6 (UptimeRobot) le gardera éveillé.
>
> 🔄 Alternative : si un jour tu obtiens une carte (même une carte débit), Render reste possible
> (Build `cd web && npm install && npm run build && cd ../server && npm install`, Start `cd server && node index.js`,
> mêmes variables) — le code est 100 % compatible avec les deux plateformes.

## Étape 4 — Créer les premiers vrais magasins

En production, la base est vide. Pour tester le cycle complet :
1. Inscription d'un compte test (email + code de confirmation — le code s'affichera à l'écran tant que Brevo n'est pas configuré).
2. Profil → **🏪 Devenir partenaire** → formulaire + position carte.
3. Connecte-toi en Super Admin → **valide le magasin**.
4. Ajoute des produits, commande, livre… tout le cycle est testable en ligne.

---

## Étape 5 — Brevo (emails de confirmation/récupération) ~10 min

> Tant que Brevo n'est pas configuré : les codes de confirmation sont affichés à l'écran (mode dépannage) — le vrai email partira après cette étape.

1. Va sur [brevo.com](https://www.brevo.com) → **Sign up free** (300 emails/jour gratuits).
2. Menu **SMTP & API** → onglet **SMTP** → note :
   - **SMTP Server** : `smtp-relay.brevo.com`
   - **Login** : ton email Brevo (ex. `tonmail@gmail.com`)
   - Clique **Generate SMTP key** → copie la clé (mot de passe SMTP).
3. Sur Render : ton service → **Environment** → ajoute :

   | Clé | Valeur |
   |---|---|
   | `SMTP_HOST` | `smtp-relay.brevo.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | *(ton login Brevo)* |
   | `SMTP_PASS` | *(la clé SMTP générée)* |
   | `SMTP_FROM` | `YallaLiv <tonmail@gmail.com>` |

4. **Save Changes** → Render redéploie (2-3 min).
5. Test : page connexion → **Mot de passe oublié** → entre ton email → tu dois recevoir le code 📬

---

## Étape 6 — UptimeRobot (garder le site éveillé + surveillance) ~5 min

> Le plan gratuit Render **endort le site après 15 min d'inactivité** (1er chargement lent ensuite). Un ping toutes les 5 min le garde réactif.

1. Va sur [uptimerobot.com](https://uptimerobot.com) → **Register** (gratuit, 50 moniteurs).
2. **Add New Monitor** :
   - Type : **HTTPS**
   - URL : `https://TON-URL.back4app.com/api/settings/public`
   - Monitoring interval : **5 minutes**
3. Save. Tu recevras un email si le site tombe (et il restera éveillé).

---

## Étape 7 — Google (optionnel, plus tard) ~10 min

1. [console.cloud.google.com](https://console.cloud.google.com) → crée un projet → **APIs & Services → Credentials** → **Create credentials → OAuth client ID** → type **Web application**.
2. **Authorized JavaScript origins** : ajoute `https://TON-URL.back4app.com` (et `http://localhost:5173` pour tes tests locaux).
3. Copie le **Client ID** → sur Render, variable d'env `GOOGLE_CLIENT_ID` → Save.
4. Le bouton « Continuer avec Google » apparaît automatiquement sur connexion/inscription.

---

## 💰 Récapitulatif des coûts

| Service | Plan | Coût |
|---|---|---|
| GitHub (dépôt privé) | Free | 0 € |
| Neon (PostgreSQL 0,5 Go) | Free | 0 € |
| Back4app (site + API) | Free | 0 € |
| Brevo (300 emails/jour) | Free | 0 € |
| UptimeRobot (50 moniteurs) | Free | 0 € |
| **Total** | | **0 €/mois** |

## 🧯 Dépannage rapide
- **Build Render échoue** → vérifie la Build Command (copier-coller exact) ; les logs sont dans l'onglet « Events/Logs ».
- **« PRODUCTION : JWT_SECRET manquant »** au démarrage → la variable n'est pas définie dans Render (Environment).
- **Site lent au 1er chargement** → normal (réveil gratuit) ; UptimeRobot corrige ça.
- **Erreur base de données** → vérifie `DATABASE_URL` (URL Neon complète avec `?sslmode=require`).
- **Login admin impossible** → vérifie `ADMIN_EMAIL`/`ADMIN_PASSWORD` ; ils ne s'appliquent qu'à la **première** création (base vide).
