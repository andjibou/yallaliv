# 📱 Application Android « YallaLiv Livreur » (16/09/2026)

## C'est quoi ?
Une VRAIE application Android (installable depuis l'écran d'accueil, comme Uber) qui :
- affiche ton site YallaLiv existant (même comptes, mêmes données Neon) ;
- ajoute le **GPS en arrière-plan** : un service natif + une notification maintiennent
  l'envoi de la position **même téléphone verrouillé ou écran éteint** → le livreur
  reste visible en permanence sur la carte 🟢 ;
- se met à jour automatiquement : chaque `git push` (site) est immédiatement actif
  DANS l'app, sans réinstaller l'APK.

Pour les marchands/clients dans un navigateur : **rien ne change** (le pont natif ne
s'active que dans l'app Android).

## Étape 1 — Déployer (déjà fait si tu as poussé le zip)
Extraire le zip dans `C:\Users\PCM\Desktop\Workspace\yallaliv` (fusionner), puis :
```
git add .
git commit -m "Application Android livreur (GPS arriere-plan)"
git push
```
→ Vercel redéploie le site (le pont natif doit être en ligne AVANT d'utiliser l'APK).

## Étape 2 — Construire l'APK (gratuit, dans le cloud GitHub)
1. GitHub → dépôt **andjibou/yallaliv** → onglet **Actions**
2. Le workflow **« Build APK Android (Livreur) »** démarre tout seul après le push
   (~10-15 min) — sinon : le sélectionner → **Run workflow**
3. Quand il est vert ✅ → clique la run → tout en bas, **Artifacts** →
   **YallaLiv-Livreur-APK** → téléchargement (c'est un .zip contenant `YallaLiv-Livreur.apk`)
4. Dézippe → tu obtiens **YallaLiv-Livreur.apk**

## Étape 3 — Installer sur le téléphone du livreur
1. Transfère l'APK (WhatsApp à soi-même, câble USB, Google Drive…)
2. Sur le téléphone : ouvre l'APK → Android demande d'autoriser les **sources inconnues**
   → Autoriser → Installer
3. Ouvre l'app **YallaLiv Livreur** → connexion compte livreur → bouton **En ligne**

## Étape 4 — Permissions CRITIQUES (à faire avec le livreur, 1 fois)
1. **Position** : quand l'app la demande → choisir **« Toujours » / « Autoriser tout le temps »**
   (si seulement « Pendant l'utilisation » → le suivi s'arrête écran éteint)
2. **Notifications** : Autoriser (c'est la notification qui maintient le GPS en vie)
3. **Batterie** (Xiaomi, Samsung, Oppo…) : Paramètres → Applications → YallaLiv Livreur →
   Batterie → **« Sans restriction »** (sinon le système tue le suivi)

## 🔴 MISE À JOUR v2 (17/09/2026) — GPS NATIF AUTONOME — RÉINSTALLATION OBLIGATOIRE
Le suivi est désormais assuré par un **service Android natif** (code Java) qui :
- envoie la position **chaque seconde** (directement, sans passer par le navigateur) ;
- survit au **verrouillage**, à l'**arrière-plan** et aux **killers de batterie** (redémarrage auto) ;
- s'arrête proprement quand le livreur passe **Hors ligne**.

⚠️ **Le code natif a changé → il faut RECONSTRUIRE et RÉINSTALLER l'APK**
(same procédure : push → onglet Actions → Artifacts → installer le nouvel APK par-dessus l'ancien).

## Test de validation
1. Livreur En ligne (app ouverte) → 🟢 sur la carte + notification « Suivi de position actif »
2. Verrouiller le téléphone 10 min → le point bouge ENCORE (service natif, 1 position/s)
2. **Verrouiller le téléphone, le mettre dans la poche** → rouler à scooter 10 min
3. Sur la carte marchand : le point **bouge encore**, badge reste frais 🟢
4. Livreur passe Hors ligne → la notification GPS disparaît (respect de la vie privée + batterie)

## Dépannage
| Problème | Solution |
|---|---|
| Position s'arrête écran éteint | 1) réinstaller le DERNIER APK (v2 service natif) 2) batterie « Sans restriction » (bannière ⚙️ dans l'app) 3) ne pas glisser-fermer l'app |
| Pas de notification « YallaLiv suit votre position » | Le livreur est hors ligne, ou notifications bloquées |
| L'app affiche « Connexion Internet indisponible » | Réseau absent — l'app a besoin du réseau (le site est dedans) |
| Le build GitHub Actions échoue | Ouvre la run rouge → copie les logs → à l'assistant |

## Notes honnêtes
- **Play Store** : publication = 25 $ une fois + carte bancaire → remis à plus tard.
  L'installation directe APK fonctionne sur TOUTES les marques Android (Samsung, Xiaomi,
  Oppo, Realme, Infinix, Huawei sans Google Play…).
- **APK « debug »** : signé en mode debug (installable partout) — parfait pour le pilote.
  Une signature « release » propre pourra être faite avant une distribution large.
- **iPhone** : possible ensuite avec la même base (Capacitor gère iOS) MAIS compilation
  = Mac (ou service cloud payant) + compte Apple Developer 99 $/an pour l'App Store.
  En attendant, les livreurs iPhone utilisent la PWA dans Safari.
- **Fichiers clés** : tout est dans **`app-android/`** (ce dossier est autonome) ·
  `.github/workflows/build-android.yml` (build cloud — GitHub impose cet emplacement) ·
  `web/src/pages/driver.jsx` (pont natif — point d'entrée obligatoire côté site)
