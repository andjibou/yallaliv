# 🚀 Migration vers Vercel (12/09/2026)

## Pourquoi Vercel ?

| | Back4app (avant) | Vercel (maintenant) |
|---|---|---|
| Sommeil | le conteneur s'arrêtait sans prévenir (URL morte 4 fois) | **impossible de s'endormir** (serverless : répond instantanément 24h/24, même après 1 an sans visiteur) |
| URL | a changé 4 fois | **fixe à vie** : `yallaliv.vercel.app` |
| Carte bancaire | non demandée | **non demandée** |
| Prix | 0 € | **0 €** (plan Hobby) |
| Mise à jour | bouton Redeploy | **automatique** à chaque `git push` |
| Données | Neon ✓ | Neon ✓ (**inchangé**) |

## Étape 1 — Extraire les fichiers de migration

Le zip `yallaliv-vercel-2026-09-12.zip` contient 5 fichiers. Extrais-les **dans**
`C:\Users\PCM\Desktop\Workspace\yallaliv` (fusionner les dossiers ; remplacer
`server/index.js` quand Windows le demande) :

- `package.json` — nouveau (racine du projet)
- `vercel.json` — nouveau (racine du projet)
- `api/index.js` — nouveau (adaptateur serverless)
- `server/index.js` — modifié (4 adaptations mineures, testées et validées)
- `MIGRATION_VERCEL.md` — ce guide

## Étape 2 — Pousser sur GitHub (PowerShell)

```powershell
cd C:\Users\PCM\Desktop\Workspace\yallaliv
git add .
git commit -m "Migration Vercel : serverless, jamais endormi"
git push
```

## Étape 3 — Créer le compte Vercel (2 min, SANS carte)

1. **https://vercel.com** → **Sign Up** → **Continue with GitHub** (compte andjibou)
2. C'est tout — aucune carte n'est demandée.

## Étape 4 — Importer le projet

1. Bouton **Add New… → Project**
2. Clique **Import** sur le dépôt **andjibou/yallaliv** (autoriser l'accès si demandé)
3. **Name** : `yallaliv` → l'URL sera **https://yallaliv.vercel.app** ✅ (ce nom est bien à toi)
   ⚠️ **N'AJOUTE JAMAIS de domaine personnalisé** dans Settings → Domains (champ « Add ») :
   un domaine comme `yallaliv.app` est un nom **acheté** chez un registrar (~12 $/an).
   En ajouter un que tu ne possèdes pas → Vercel redirige TOUT ton site vers lui → site mort
   (c'est le bug du 12/09 : « Invalid Configuration », tout le trafic envoyé vers le néant).
4. ⚠️ NE PAS changer le « Root Directory » (laisser la racine du dépôt)
5. Ouvre **Environment Variables** et ajoute les 10 (mêmes valeurs que Back4app) :

| Clé | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | ta chaîne Neon `postgresql://…` |
| `JWT_SECRET` | **le même qu'avant** (important : sinon tout le monde est déconnecté) |
| `ADMIN_EMAIL` | ton email admin |
| `ADMIN_PASSWORD` | le même qu'avant |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `b8dbb2001@smtp-brevo.com` |
| `SMTP_PASS` | ta clé `xkeysib-…` |
| `SMTP_FROM` | `YallaLiv <ton email vérifié>` |

6. **Deploy** → 2-4 minutes → 🎉

## Étape 5 — Vérifier

- Ouvre **https://yallaliv.vercel.app** → le site se charge
- Connecte-toi → tout est là (mêmes comptes, mêmes magasins : la base Neon n'a pas bougé)
- Va sur `/app`, `/legal` → les pages marchent

## Après la migration

- **Mettre à jour le site** = `git push` → Vercel redéploie **tout seul**. Rien à cliquer.
- **UptimeRobot** : devient **optionnel** (plus rien ne dort). Tu peux recréer le moniteur sur
  `https://yallaliv.vercel.app/api/settings/public` juste pour recevoir une ALERTE en cas de panne.
- **GitHub Pages** (`andjibou.github.io`) : optionnel maintenant que l'URL est stable —
  reste utile comme lien court pour les flyers/WhatsApp.
- **Back4app** : plus utilisé — tu peux supprimer l'app (le conteneur est déjà mort).

## Dépannage

| Problème | Solution |
|---|---|
| **Site mort / NOT_FOUND alors que le déploiement est Ready (vert)** | Un **domaine invalide** traîne dans Settings → Domains (ex. `yallaliv.app` = « Invalid Configuration ») → clique sur ce domaine → **Remove** → `yallaliv.vercel.app` remarche immédiatement |
| **NOT_FOUND partout + statut Error (rouge)** dans Deployments | Le build a échoué → clique la ligne rouge → copie le texte de l'erreur et envoie-le à l'assistant |
| **Le site s'affiche mais les données ne chargent pas** (NOT_FOUND sur /api/…) | Root Directory mal réglé : Project → Settings → General → **Root Directory** = **racine du dépôt** (vide) → Save → Deployments → ⋯ → **Redeploy** |
| Le build échoue | Vérifie que les 5 fichiers sont bien poussés (le dépôt GitHub doit contenir `vercel.json` à la racine) |
| Erreur 500 sur l'API | Vérifie `DATABASE_URL` et `JWT_SECRET` dans Project → Settings → Environment Variables → Redeploy |
| Un email ne part pas | Préviens l'assistant : bascule Brevo SMTP → API HTTP (~15 min) |
| Photo refusée (erreur 413) | Photo > 4,5 Mo — retenter plus légère (l'app compresse déjà normalement) |

## Notes honnêtes

- Le plan **Hobby** est officiellement « usage personnel non-commercial ». Sans problème pour
  la phase pilote. Le jour où YallaLiv génère des revenus → plan Pro (20 $/mois) ou nouvelle
  migration (l'assistant s'en occupe — le code reste 100 % portable grâce au Dockerfile).
- Limites gratuites généreuses : 100 Go de trafic et 1 million de requêtes API **par mois** —
  de quoi servir des centaines de commandes par jour.
