# 🚀 Plan de lancement YallaLiv

## ⛔ Les 5 choses à faire AVANT de mettre en ligne (Phase 0) — ✅ TERMINÉE (voir README, section « Phase 0 »)

| # | Problème constaté | Risque en ligne | Correction |
|---|---|---|---|
| 1 | Photos stockées dans `server/data/uploads/` | **Render (gratuit) = disque éphémère** → toutes les photos effacées à chaque redémarrage/redéploiement | Stocker en base PostgreSQL : **miniature** (listes, ~80 Ko) + **version affichage** (max 1600 px, ~300 Ko). Originaux 50 Mo restent en local/dev. Neon gratuit = 0,5 Go ≈ 1 500+ photos |
| 2 | Le seed démo se lance sur toute base vide | **admin@yallaliv.com / admin123 créé en production** = porte ouverte | Si `NODE_ENV=production` → pas de seed ; le compte Super Admin réel est créé via variables d'env (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) |
| 3 | `JWT_SECRET` par défaut en dur dans le code (`yallaliv-secret-change-me-in-production`) | Quiconque lit le code source peut forger des tokens de n'importe quel utilisateur | Générer un secret aléatoire fort → variable d'environnement sur Render |
| 4 | Récupération de mot de passe : SMTP non configuré | Les codes de récupération ne partent jamais | Compte **Brevo gratuit** (300 mails/jour) → variables `SMTP_HOST/USER/PASS` |
| 5 | Aucune limite sur `/login` | Brute-force des mots de passe | `express-rate-limit` : ~10 tentatives / 15 min / IP |

**Bonus Phase 0** : page CGU + confidentialité (requise plus tard par les stores d'apps, bonne pratique dès le lancement).

## ✅ Ce qui peut ATTENDRE (après le lancement)

- Paiements en ligne (Fawry/InstaPay) → le **paiement à la livraison (COD)** est la norme en Égypte, suffit pour lancer
- Multi-villes, coupons, notifications SMS
- OSRM auto-hébergé → le serveur public gratuit suffit pour un lancement à Alexandrie ; surveiller et basculer vers OpenRouteService (2 500 req/j gratuites) si besoin

## 📱 Apps mobile/PC : APRÈS l'hébergement, pas avant

**Réponse : héberger d'abord.** L'ordre inverse est impossible ou contre-productif :

1. **Une app a besoin du site en ligne** — Capacitor encapsule l'URL du site : sans hébergement, l'app n'a rien à afficher.
2. **La PWA EST déjà l'app mobile ET PC**, gratuitement :
   - Android/iPhone : « Ajouter à l'écran d'accueil » → icône, plein écran, mode hors-ligne, notifications push
   - PC (Edge/Chrome) : « Installer l'application » → fenêtre native, icône dans le menu Démarrer
3. **Les stores coûtent de l'argent** : Google Play 25 $ (unique) + Apple 99 $/an → contraire à la contrainte 100 % gratuit. La PWA contourne les deux.
4. **Corrections 100× plus rapides** : bug PWA = 1 redéploiement (minutes) ; bug app store = nouvelle version + validation (1-7 jours).

**Plus tard, si le business le justifie** : app Android via Capacitor (25 $ une fois) → puis iOS (99 $/an, à évaluer).

## 🗺️ Les 4 phases — **Phase 1 EN COURS** (guide complet : `DEPLOIEMENT.md`)

### Phase 0 — Préparation production ✅ FAITE
Photos en base + mode production sécurisé + anti brute-force + SMTP + CGU. **Reste : re-test local complet par le Super Admin →validation → Phase 1.**

### Phase 1 — Mise en ligne (100 % gratuit) — 🔄 EN COURS
Fichiers prêts : `.gitignore` (secrets exclus), `render.yaml` (blueprint), `DEPLOIEMENT.md` (guide clic par clic). Simulation Render validée : un seul service sert site + API + PWA sur le même port. Étapes : GitHub → Neon → Render → Brevo → UptimeRobot (→ Google optionnel).
| Besoin | Outil gratuit | Quota gratuit |
|---|---|---|
| API + site (1 seul service : Express sert aussi `web/dist`) | **Render** Web Service | 750 h/mois, HTTPS, `yallaliv.onrender.com` |
| Base PostgreSQL | **Neon** | 0,5 Go, sauvegardes |
| Emails (récup. mot de passe) | **Brevo** | 300 mails/jour |
| Monitoring + anti-veille (ping /5 min) | **UptimeRobot** | 50 moniteurs |

Étapes : dépôt GitHub (privé) → Neon (copier l'URL de connexion) → Render (connecter GitHub, variables d'env, build `npm run build` web + `npm install` server) → premier démarrage crée les tables → création du Super Admin réel.

### Phase 2 — Test réel à Alexandrie
Toi (Super Admin) + 1-2 magasins pilotes + 2-3 livreurs + quelques clients réels. Retours → corrections → itérations rapides.

### Phase 3 — Croissance
App Android (Capacitor), domaine propre (~quelques $/an, optionnel), OSRM dédié si volume, paiements en ligne.
