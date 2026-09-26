import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import { initDb, q, get, all, run, hashPassword, verifyPassword, getSetting, setSetting, CITY, jitter } from './db.js';
import nodemailer from 'nodemailer';

// Envoi d'email (uniquement si SMTP configure dans .env : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)
async function sendMail(to, code, purpose = 'reset') {
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const tr = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
  const isVerify = purpose === 'verify';
  const title = isVerify ? 'Confirmez votre email' : 'Code de réinitialisation';
  await tr.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'YallaLiv <no-reply@yallaliv.com>',
    to, subject: `YallaLiv — ${title}`,
    text: `Votre code : ${code} (valable 15 minutes)`,
    html: `<div style="font-family:sans-serif;max-width:420px;margin:auto;border:1px solid #e2e8f0;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 6px">${isVerify ? '✅' : '🔄'} YallaLiv</h2>
      <p style="color:#475569">${isVerify ? 'Votre code de confirmation :' : 'Votre code de réinitialisation :'}</p>
      <p style="font-size:30px;font-weight:800;letter-spacing:6px;background:#f0fdf4;border-radius:10px;padding:10px;text-align:center">${code}</p>
      <p style="color:#94a3b8;font-size:13px">Valable 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p></div>`
  });
  return true;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '8mb' }));   // photos = miniature + affichage optimisés côté client (< 5 Mo)

// Filet de sécurité dispatch (serverless : setInterval n'y tourne pas en continu) :
// au passage d'une requête, redistribue les commandes publiques si > 25 s sans vérification.
let _lastReqDispatch = 0;
app.use((req, res, next) => {
  if (Date.now() - _lastReqDispatch > 25000) { _lastReqDispatch = Date.now(); dispatchPublicOrders().catch(() => {}); }
  next();
});

// ---------- CORS (utile si front et API hébergés séparément) ----------
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const SECRET = process.env.JWT_SECRET || 'yallaliv-secret-change-me-in-production';

// ---------- Sécurité production ----------
const IS_PROD = process.env.NODE_ENV === 'production';
if (IS_PROD && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'yallaliv-secret-change-me-in-production')) {
  console.error("⛔ PRODUCTION : JWT_SECRET manquant ou laissé par défaut. Générez-le puis définissez la variable d'environnement :");
  console.error('   node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
}
app.set('trust proxy', 1);   // derrière le proxy Render -> req.ip = IP réelle du client

// Anti brute-force (sans dépendance) : max N requêtes / fenêtre / IP.
// Chaque endpoint a SON PROPRE compteur (un échec de login ne bloque pas l'inscription).
function rateLimit(max, winMs, msg) {
  const bucket = new Map();   // clé = IP, propre à cet endpoint
  return (req, res, next) => {
    const k = req.ip || '?', now = Date.now();
    let e = bucket.get(k);
    if (!e || e.until < now) { e = { n: 0, until: now + winMs }; bucket.set(k, e); }
    if (e.n >= max) {
      const s = Math.ceil((e.until - now) / 1000);
      return res.status(429).set('Retry-After', s).json({ error: msg, retry_after: s });   // retry_after -> chronometre cote client
    }
    e.n++;
    if (bucket.size > 5000) for (const [kk, vv] of bucket) if (vv.until < now) bucket.delete(kk);  // purge périodique
    next();
  };
}
const PORT = process.env.PORT || 4000;

// ---------- Token utils ----------
const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
function signToken(userId) {
  const payload = { uid: userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 };
  const body = b64u(payload);
  return `${body}.${hmac(body)}`;
}
function readToken(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || hmac(body) !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// ---------- Middlewares ----------
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
});
const auth = h(async (req, res, next) => {
  const payload = readToken(req);
  if (!payload) return res.status(401).json({ error: 'Non authentifié' });
  const user = await get('SELECT * FROM users WHERE id=?', [payload.uid]);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  if (user.status === 'suspended') return res.status(403).json({ error: 'Compte suspendu' });
  req.user = user;
  next();
});
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé' });
  next();
};

const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, vehicle: u.vehicle, online: !!u.online, store_id: u.store_id || null });
const round2 = (n) => Math.round(n * 100) / 100;

// ---------- Uploads ----------
const UPLOADS = path.join(__dirname, 'data', 'uploads');
try { fs.mkdirSync(UPLOADS, { recursive: true }); } catch {} // Vercel : FS en lecture seule (anciennes photos locales uniquement)
app.use('/uploads', express.static(UPLOADS));   // compat : anciennes photos locales

// ---------- PHOTOS EN BASE PostgreSQL (compatibles hébergement gratuit au disque éphémère) ----------
// Le client envoie 2 versions optimisées sur SON appareil : thumb (listes) + display (fiche).
const PHOTO_MAX = { thumb: 500 * 1024, display: 3 * 1024 * 1024 };
function decodePhotoPart(dataurl, maxBytes) {
  const m = String(dataurl || '').match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  return buf.length > 0 && buf.length <= maxBytes ? buf : null;
}
async function savePhoto(body) {
  const thumb = decodePhotoPart(body?.thumb, PHOTO_MAX.thumb);
  const display = decodePhotoPart(body?.display, PHOTO_MAX.display);
  if (!thumb || !display) return null;
  const r = await get('INSERT INTO photos(thumb,display,created_at) VALUES(?,?,?) RETURNING id', [thumb, display, Date.now()]);
  return '/api/photos/' + r.id;
}
async function dropPhoto(url) {   // supprime la ligne photo devenue orpheline
  const id = parseInt(String(url || '').split('/').pop(), 10);
  if (Number.isInteger(id)) await run('DELETE FROM photos WHERE id=?', [id]).catch(() => {});
}
app.get(/^\/api\/photos\/(\d+)(?:\/(thumb|full))?$/, h(async (req, res) => {
  const row = await get('SELECT thumb, display FROM photos WHERE id=?', [parseInt(req.params[0], 10)]);
  if (!row) return res.status(404).json({ error: 'Photo introuvable' });
  res.set('Content-Type', 'image/jpeg')
     .set('Cache-Control', 'public, max-age=31536000, immutable')   // chaque photo a un id unique
     .end(req.params[1] === 'thumb' ? row.thumb : row.display);
}));

// ---------- Push (VAPID) ----------
let VAPID = null, VAPID_INIT = null;
// 🛡️ Idempotent + retentable : les requêtes « froides » attendent ici au lieu de crasher
// (race condition : instance Vercel fraîche + base Neon endormie -> VAPID pas encore prêt)
function initVapid() {
  if (!VAPID_INIT) {
    VAPID_INIT = (async () => {
      let pub = await getSetting('vapid_public', '');
      let priv = await getSetting('vapid_private', '');
      if (!pub || !priv) {
        const keys = webpush.generateVAPIDKeys();
        pub = keys.publicKey; priv = keys.privateKey;
        await setSetting('vapid_public', pub);
        await setSetting('vapid_private', priv);
        console.log('🔐 Clés VAPID générées (push notifications)');
      }
      VAPID = { subject: 'mailto:admin@yallaliv.com', publicKey: pub, privateKey: priv };
      webpush.setVapidDetails(VAPID.subject, VAPID.publicKey, VAPID.privateKey);
    })().catch((e) => { console.error('VAPID init:', (e && e.message) || e); VAPID_INIT = null; });
  }
  return VAPID_INIT;
}
// ---------- 🔔 FCM : notifications Android reçues même app fermée (comme WhatsApp) ----------
let FCM_AT = null, FCM_AT_EXP = 0;
async function fcmAccessToken() {
  if (FCM_AT && Date.now() < FCM_AT_EXP) return FCM_AT;
  const pid = process.env.FIREBASE_PROJECT_ID, email = process.env.FIREBASE_CLIENT_EMAIL;
  let key = process.env.FIREBASE_PRIVATE_KEY || '';
  if (!pid || !email || !key) return null;   // pas configuré -> silencieux (web push seul)
  key = key.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const payload = b64({ iss: email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(head + '.' + payload);
  const jwt = head + '.' + payload + '.' + signer.sign(key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('FCM token KO');
  FCM_AT = d.access_token;
  FCM_AT_EXP = Date.now() + ((d.expires_in || 3600) - 120) * 1000;
  return FCM_AT;
}

async function sendFcm(token, title, body) {
  const at = await fcmAccessToken();
  if (!at) return;
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: { title: String(title), body: String(body) } } })
  });
  if (r.status === 404 || r.status === 410) { const e = new Error('jeton FCM expiré'); e.statusCode = r.status; throw e; }
  if (!r.ok) console.error('FCM envoi', r.status, (await r.text().catch(() => '')).slice(0, 200));
}

function pushTo(userIds, title, body, url = '/') {
  (async () => {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return;
    // 🔔 v2026.09.24.1 — centre de notifications : chaque push alimente aussi le fil in-app
    const oidM = String(title).match(/#(\d+)/);
    const kind = String(title).includes('💬') ? 'message' : /[#🛵📦🧾🚨🎉🚫↩️]/.test(String(title)) ? 'order' : 'info';
    ids.forEach((uid) => run('INSERT INTO notifications(user_id,kind,title,body,url,created_at) VALUES(?,?,?,?,?,?)',
      [uid, kind, title, body || '', oidM ? '/app/orders' : (url || '/'), Date.now()]).catch(() => {}));
    if (!VAPID) { await initVapid(); if (!VAPID) return; }   // 🛡️ pas encore prêt -> FCM passe, web push attend le prochain envoi
    const subs = await all(`SELECT * FROM push_subscriptions WHERE user_id IN (${ids.map(() => '?').join(',')})`, ids);
    for (const s of subs) {
      if (s.endpoint && s.endpoint.startsWith('fcm:')) {
        // 🔔 APK : notification FCM (délivrée par Google même app fermée)
        sendFcm(s.fcm_token || s.endpoint.slice(4), title, body).catch((err) => {
          if (err.statusCode === 404 || err.statusCode === 410) run('DELETE FROM push_subscriptions WHERE id=?', [s.id]).catch(() => {});
        });
        continue;
      }
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, url }),
        { vapidDetails: VAPID }
      ).catch((err) => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          run('DELETE FROM push_subscriptions WHERE id=?', [s.id]).catch(() => {});
        }
      });
    }
  })().catch(() => {});
}

// ---------- AUTH ----------
// Validation commune inscription (retourne {error} ou les champs nettoyés)
function regFields(body) {
  const { name, password, email = '', phone = '' } = body;
  const em = String(email || '').toLowerCase().trim();
  const ph = String(phone || '').trim();
  const digits = ph.replace(/[\s-]/g, '');
  if (!name || !password) return { error: 'Champs manquants' };
  if (String(password).length < 5) return { error: 'Mot de passe trop court (min 5)' };
  if (!em && !ph) return { error: 'Email ou téléphone requis' };
  if (em && !em.includes('@')) return { error: 'Email valide requis' };
  if (!em && digits.replace(/\D/g, '').length < 8) return { error: 'Téléphone invalide' };
  return { name: String(name).trim(), password: String(password), em, ph, digits };
}

app.post('/api/auth/register', rateLimit(10, 15 * 60000, 'Trop de tentatives. Réessayez dans quelques minutes.'), h(async (req, res) => {
  // Inscription : nom complet + mot de passe + EMAIL (code de confirmation) OU TÉLÉPHONE (direct). Tout nouveau compte est CLIENT.
  const v = regFields(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  if (v.em && await get('SELECT id FROM users WHERE email=?', [v.em])) return res.status(400).json({ error: 'Email déjà utilisé' });
  if (v.ph && await get("SELECT id FROM users WHERE phone <> '' AND REPLACE(phone, ' ', '') = ?", [v.digits])) return res.status(400).json({ error: 'Numéro déjà utilisé' });

  // Email : envoi d'un code de confirmation (sauf checkout invité -> création directe)
  if (v.em && !req.body.skip_verify) {
    await run('DELETE FROM email_codes WHERE email=?', [v.em]);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await run('INSERT INTO email_codes(email,code,expires_at,created_at) VALUES(?,?,?,?)', [v.em, code, Date.now() + 15 * 60000, Date.now()]);
    let emailed = false;
    if (process.env.SMTP_HOST) emailed = await sendMail(v.em, code, 'verify').catch(() => false);
    if (!emailed && IS_PROD) return res.json({ ok: true, need_code: true, emailed: false });   // jamais de code en clair en production
    return res.json({ ok: true, need_code: true, emailed, ...(emailed ? {} : { dev_code: code }) });
  }

  const u = await get('INSERT INTO users(name,email,phone,password,role,status,vehicle,created_at) VALUES(?,?,?,?,?,?,?,?) RETURNING id',
    [v.name, v.em || null, v.ph, hashPassword(v.password), 'client', 'active', '', Date.now()]);
  const user = await get('SELECT * FROM users WHERE id=?', [u.id]);
  res.json({ token: signToken(user.id), user: publicUser(user) });
}));

// Etape 2 de l'inscription par email : verification du code + creation du compte
app.post('/api/auth/register/verify', rateLimit(10, 15 * 60000, 'Trop de tentatives. Réessayez dans quelques minutes.'), h(async (req, res) => {
  const v = regFields(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  if (!v.em) return res.status(400).json({ error: 'Email valide requis' });
  const r = await get('SELECT * FROM email_codes WHERE email=? AND code=?', [v.em, String(req.body.code || '')]);
  if (!r || r.expires_at < Date.now()) return res.status(400).json({ error: 'Code invalide ou expiré' });
  if (await get('SELECT id FROM users WHERE email=?', [v.em])) return res.status(400).json({ error: 'Email déjà utilisé' });
  await run('DELETE FROM email_codes WHERE email=?', [v.em]);
  const u = await get('INSERT INTO users(name,email,phone,password,role,status,vehicle,created_at) VALUES(?,?,?,?,?,?,?,?) RETURNING id',
    [v.name, v.em, v.ph, hashPassword(v.password), 'client', 'active', '', Date.now()]);
  const user = await get('SELECT * FROM users WHERE id=?', [u.id]);
  res.json({ token: signToken(user.id), user: publicUser(user) });
}));

// ---------- CONTINUER AVEC GOOGLE ----------
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
app.get('/api/auth/google-client-id', h(async (req, res) => res.json({ client_id: GOOGLE_CLIENT_ID || null })));
app.post('/api/auth/google', rateLimit(10, 15 * 60000, 'Trop de tentatives. Réessayez dans quelques minutes.'), h(async (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'Google non configuré' });
  const cred = String(req.body.credential || '');
  if (!cred) return res.status(400).json({ error: 'Token Google invalide' });
  // Vérification du JWT Google (sans dépendance) via l'endpoint tokeninfo
  const info = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(cred))
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!info || !info.email || info.aud !== GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'Token Google invalide' });
  if (String(info.email_verified) !== 'true') return res.status(400).json({ error: 'Email Google non vérifié' });
  const em = String(info.email).toLowerCase().trim();
  let user = await get('SELECT * FROM users WHERE email=?', [em]);
  if (!user) {
    const nm = String(info.name || em.split('@')[0]).trim().slice(0, 60);
    const u = await get('INSERT INTO users(name,email,phone,password,role,status,vehicle,created_at) VALUES(?,?,?,?,?,?,?,?) RETURNING id',
      [nm, em, '', hashPassword(crypto.randomBytes(24).toString('hex')), 'client', 'active', '', Date.now()]);
    user = await get('SELECT * FROM users WHERE id=?', [u.id]);
  }
  res.json({ token: signToken(user.id), user: publicUser(user) });
}));

// ---------- DEVENIR PARTENAIRE : client -> magasin (formulaire dans le profil client) ----------
// Les données de compte (nom, email, téléphone) ne sont PAS redemandées : seules les infos du magasin.
app.post('/api/partner', auth, h(async (req, res) => {
  if (req.user.role === 'merchant') return res.status(400).json({ error: 'Vous avez déjà un magasin' });
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Accès refusé' });
  const { store_name, store_type = 'market', store_address = '' } = req.body;
  const store_phone = String(req.body.store_phone || req.user.phone || '').trim();
  if (!store_name || !String(store_name).trim()) return res.status(400).json({ error: 'Nom du magasin requis (ex. : Restaurant Al Nil)' });
  if (String(store_phone || '').replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Téléphone invalide (ex. : 0100 123 4567)' });
  if (!store_address || !String(store_address).trim()) return res.status(400).json({ error: 'Adresse du magasin requise (ex. : 12 rue Saad Zaghloul, Alexandrie)' });
  if (!req.user.phone) await run('UPDATE users SET phone=? WHERE id=?', [store_phone, req.user.id]);   // complète le compte
  const validTypes = ['restaurant', 'market', 'pharmacy', 'home', 'clothes', 'electronics'];
  const type = validTypes.includes(store_type) ? store_type : 'market';
  const TYPE_EMOJI = { restaurant: '🍽️', pharmacy: '💊', market: '🛒', home: '🛋️', clothes: '👕', electronics: '📱' };
  // Position choisie sur la carte (recommandée : livraison + recherche à proximité). Sinon -> centre-ville.
  let lat = parseFloat(req.body.store_lat), lng = parseFloat(req.body.store_lng);
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) { lat = CITY.lat + (Math.random() - .5) * .03; lng = CITY.lng + (Math.random() - .5) * .03; }
  await run(`INSERT INTO stores(owner_id,name,type,phone,address,emoji,lat,lng,status,created_at) VALUES(?,?,?,?,?,?,?,?, 'pending',?)`,
    [req.user.id, String(store_name).trim(), type, String(store_phone), String(store_address), TYPE_EMOJI[type], lat, lng, Date.now()]);
  await run('UPDATE users SET role=? WHERE id=?', ['merchant', req.user.id]);
  // Notifie le(s) Super Admin(s) : nouveau magasin a valider
  const sas = await all(`SELECT id FROM users WHERE role='superadmin'`);
  pushTo(sas.map((s) => s.id), '🏪 Nouveau magasin à valider', `« ${String(store_name).trim()} » demande à devenir partenaire — approbation requise`);
  const user = await get('SELECT * FROM users WHERE id=?', [req.user.id]);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/login', rateLimit(10, 15 * 60000, 'Trop de tentatives. Réessayez dans quelques minutes.'), h(async (req, res) => {
  // Identifiant : email OU numéro de téléphone (espaces/ tirets ignorés).
  const { password } = req.body;
  const id = String(req.body.email || req.body.identifier || '').trim().toLowerCase();
  const normPhone = id.replace(/[\s-]/g, '');
  const user = await get("SELECT * FROM users WHERE email=? OR (phone <> '' AND REPLACE(phone, ' ', '') = ?)", [id, normPhone]);
  if (!user || !verifyPassword(String(password || ''), user.password)) return res.status(400).json({ error: 'Email ou mot de passe incorrect' });
  if (user.status === 'suspended') return res.status(403).json({ error: 'Compte suspendu, contactez le support' });
  res.json({ token: signToken(user.id), user: publicUser(user) });
}));

// ---------- RECUPERATION DE MOT DE PASSE ----------
// Demande de code : toujours OK (pas de divulgation des comptes existants).
// Si SMTP configure -> email reel. Sinon -> code renvoye (mode local) + visible par le Super Admin.
app.post('/api/auth/forgot', rateLimit(5, 15 * 60000, 'Trop de demandes. Réessayez dans quelques minutes.'), h(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const user = await get('SELECT id FROM users WHERE email=?', [email]);
  if (!user) return res.json({ ok: true, emailed: false });
  await run('DELETE FROM password_resets WHERE email=?', [email]);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await run('INSERT INTO password_resets(email,code,expires_at,created_at) VALUES(?,?,?,?)',
    [email, code, Date.now() + 15 * 60000, Date.now()]);
  let emailed = false;
  if (process.env.SMTP_HOST) emailed = await sendMail(email, code).catch(() => false);
  if (!emailed && IS_PROD) return res.json({ ok: true, emailed: false });   // jamais de code en clair en production
  res.json({ ok: true, emailed, ...(emailed ? {} : { dev_code: code }) });
}));

app.post('/api/auth/reset', h(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const { code, new_password } = req.body;
  const r = await get('SELECT * FROM password_resets WHERE email=? AND code=?', [email, String(code || '')]);
  if (!r || r.expires_at < Date.now()) return res.status(400).json({ error: 'Code invalide ou expiré' });
  if (!new_password || String(new_password).length < 5) return res.status(400).json({ error: 'Mot de passe trop court (min 5)' });
  await run('UPDATE users SET password=? WHERE email=?', [hashPassword(String(new_password)), email]);
  await run('DELETE FROM password_resets WHERE email=?', [email]);
  res.json({ ok: true });
}));

// ---------- PARAMETRES DU COMPTE ----------
app.put('/api/auth/profile', auth, h(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').toLowerCase().trim();
  const phone = String(req.body.phone ?? req.user.phone ?? '');
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  // Comptes créés par email : l'email reste requis. Comptes téléphone : email optionnel (ajout possible plus tard).
  if (req.user.email && !email.includes('@')) return res.status(400).json({ error: 'Nom et email valides requis' });
  if (!req.user.email && email && !email.includes('@')) return res.status(400).json({ error: 'Email valide requis' });
  const newEmail = req.user.email ? email : (email || null);
  if (newEmail && newEmail !== req.user.email) {
    const taken = await get('SELECT id FROM users WHERE email=? AND id<>?', [newEmail, req.user.id]);
    if (taken) return res.status(400).json({ error: 'Email déjà utilisé' });
  }
  const digits = phone.replace(/[\s-]/g, '');
  const myDigits = String(req.user.phone || '').replace(/[\s-]/g, '');
  if (phone && digits !== myDigits) {
    const taken = await get("SELECT id FROM users WHERE phone <> '' AND REPLACE(phone, ' ', '') = ? AND id<>?", [digits, req.user.id]);
    if (taken) return res.status(400).json({ error: 'Numéro déjà utilisé' });
  }
  const u = await get('UPDATE users SET name=?, email=?, phone=? WHERE id=? RETURNING *', [name, newEmail, phone, req.user.id]);
  res.json({ user: publicUser(u) });
}));

app.put('/api/auth/password', auth, h(async (req, res) => {
  const { current, next } = req.body;
  const u = await get('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!u || !verifyPassword(String(current || ''), u.password)) return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  if (!next || String(next).length < 5) return res.status(400).json({ error: 'Mot de passe trop court (min 5)' });
  await run('UPDATE users SET password=? WHERE id=?', [hashPassword(String(next)), u.id]);
  res.json({ ok: true });
}));

app.get('/api/auth/me', auth, h(async (req, res) => {
  const out = publicUser(req.user);
  if (req.user.role === 'merchant') {
    out.store = (await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id])) || null;
  }
  res.json({ user: out });
}));

// ---------- PUBLIC ----------
// 🔔 v2026.09.24.1 — Centre de notifications (fil in-app + badge non-lus)
app.get('/api/notifications', auth, h(async (req, res) => {
  const rows = await all('SELECT id,kind,title,body,url,read,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 60', [req.user.id]);
  const c = await get('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read=0', [req.user.id]);
  res.json({ notifications: rows, unread: c.n });
}));
app.post('/api/notifications/read', auth, h(async (req, res) => {
  await run('UPDATE notifications SET read=1 WHERE user_id=?', [req.user.id]);
  res.json({ ok: true });
}));

// 🛍️ v2026.09.24.1 — MARCHÉ (style OLX) : tout utilisateur connecté publie des articles,
// visibles par tous. Contact direct acheteur → vendeur (appel/WhatsApp), comme OLX.
const LISTING_CATS = ['phones', 'electronics', 'home', 'fashion', 'kids', 'sports', 'beauty', 'auto', 'other'];
// ================= 🛍️ Marché — v2026.09.26.1 Phase 1 : sous-cats, tri, favoris, vues, renouvellement =================
const LISTING_CONDS = ['new', 'like_new', 'used'];
const LISTING_SORTS = {
  recent: 'COALESCE(l.renewed_at, l.created_at) DESC',
  price_asc: 'l.price ASC',
  price_desc: 'l.price DESC',
  popular: 'l.views DESC, COALESCE(l.renewed_at, l.created_at) DESC',
};
const listingPhotos = (l) => {   // compat : photos JSON (Phase 1) ou photo unique (v1)
  try { const a = JSON.parse(l.photos || 'null'); if (Array.isArray(a)) return a.filter(Boolean); } catch {}
  return l.photo ? [l.photo] : [];
};
const cleanPhotos = (arr) => (Array.isArray(arr) ? arr : []).filter((p) => typeof p === 'string' && p.startsWith('data:image/') && p.length < 2200000).slice(0, 5);

app.get('/api/listings', h(async (req, res) => {
  const { q, cat, sub, sort, page } = req.query;
  const pmin = parseFloat(req.query.price_min); const pmax = parseFloat(req.query.price_max);
  const pg = Math.max(1, parseInt(page) || 1); const LIM = 20;
  let sql = `SELECT l.id, l.name, l.category, l.subcategory, l.condition, l.brand, l.size, l.area, l.description, l.price, l.phone, l.photo, l.views, l.renewed_at, l.created_at, l.lat, l.lng, u.name AS seller,
    (SELECT COUNT(*) FROM listing_favorites f WHERE f.listing_id = l.id)::int AS favs
    FROM listings l JOIN users u ON u.id = l.user_id WHERE l.available = 1`;
  const args = [];
  if (cat && cat !== 'all') { sql += ' AND l.category = ?'; args.push(cat); }
  if (sub && sub !== 'all') { sql += ' AND l.subcategory = ?'; args.push(sub); }
  if (!isNaN(pmin) && pmin >= 0) { sql += ' AND l.price >= ?'; args.push(pmin); }
  if (!isNaN(pmax) && pmax > 0) { sql += ' AND l.price <= ?'; args.push(pmax); }
  if (q) { sql += ' AND (l.name ILIKE ? OR l.description ILIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
  const la = parseFloat(req.query.lat); const ln = parseFloat(req.query.lng);   // 📍 Phase 2 : tri par proximité
  if (sort === 'near' && !isNaN(la) && !isNaN(ln)) {
    sql += ` ORDER BY (CASE WHEN l.lat IS NULL THEN 1e12 ELSE ((l.lat - ?) * (l.lat - ?) + (l.lng - ?) * (l.lng - ?)) END) ASC, l.created_at DESC LIMIT ? OFFSET ?`;
    args.push(la, la, ln, ln);
  } else sql += ` ORDER BY ${LISTING_SORTS[sort] || LISTING_SORTS.recent} LIMIT ? OFFSET ?`;
  args.push(LIM + 1, (pg - 1) * LIM);
  const rows = await all(sql, args);
  const hasMore = rows.length > LIM;
  res.json({ listings: rows.slice(0, LIM).map((l) => ({ ...l, photos: listingPhotos(l) })), hasMore });
}));
app.get('/api/listings/mine', auth, h(async (req, res) => {
  const rows = await all(`SELECT l.*, (SELECT COUNT(*) FROM listing_favorites f WHERE f.listing_id = l.id)::int AS favs
    FROM listings l WHERE l.user_id = ? ORDER BY COALESCE(l.renewed_at, l.created_at) DESC`, [req.user.id]);
  res.json({ listings: rows.map((l) => ({ ...l, photos: listingPhotos(l) })) });
}));
app.get('/api/listings/favorites', auth, h(async (req, res) => {
  const rows = await all(`SELECT l.id, l.name, l.category, l.subcategory, l.condition, l.description, l.price, l.phone, l.photo, l.area, l.views, l.created_at, u.name AS seller
    FROM listing_favorites fav JOIN listings l ON l.id = fav.listing_id JOIN users u ON u.id = l.user_id
    WHERE fav.user_id = ? AND l.available = 1 ORDER BY fav.created_at DESC`, [req.user.id]);
  res.json({ listings: rows.map((l) => ({ ...l, photos: listingPhotos(l) })) });
}));
app.post('/api/listings', auth, h(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim().slice(0, 1000);
  const price = parseFloat(req.body.price);
  const phone = String(req.body.phone || req.user.phone || '').trim();
  const category = LISTING_CATS.includes(req.body.category) ? req.body.category : 'other';
  const subcategory = /^[a-z_]{1,30}$/.test(String(req.body.subcategory || '')) ? req.body.subcategory : null;
  const condition = LISTING_CONDS.includes(req.body.condition) ? req.body.condition : null;
  const brand = String(req.body.brand || '').trim().slice(0, 40) || null;
  const size = String(req.body.size || '').trim().slice(0, 20) || null;
  const area = String(req.body.area || '').trim().slice(0, 80) || null;
  const photos = cleanPhotos(req.body.photos != null ? req.body.photos : (req.body.photo ? [req.body.photo] : []));
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Nom de l'article invalide (2 à 80 caractères)" });
  if (isNaN(price) || price < 0 || price > 10000000) return res.status(400).json({ error: 'Prix invalide' });
  if (!phone) return res.status(400).json({ error: 'Téléphone requis pour que les acheteurs vous contactent' });
  const lat = req.body.lat != null && !isNaN(parseFloat(req.body.lat)) && Math.abs(parseFloat(req.body.lat)) <= 90 ? parseFloat(req.body.lat) : null;   // 📍 Phase 2
  const lng = req.body.lng != null && !isNaN(parseFloat(req.body.lng)) && Math.abs(parseFloat(req.body.lng)) <= 180 ? parseFloat(req.body.lng) : null;
  const r = await run('INSERT INTO listings(user_id,name,category,subcategory,condition,brand,size,area,description,price,phone,photo,photos,lat,lng,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id',
    [req.user.id, name, category, subcategory, condition, brand, size, area, description, price, phone, photos[0] || null, JSON.stringify(photos), lat, lng, Date.now()]);
  // 🔔 v2026.09.26.2 — alerte les utilisateurs ayant sauvegardé une recherche correspondante
  try {
    const searches = await all('SELECT * FROM saved_searches WHERE user_id <> ?', [req.user.id]);
    const matches = searches.filter((s) => {
      if (s.q) { const hay = (name + ' ' + description).toLowerCase(); if (!hay.includes(String(s.q).toLowerCase())) return false; }
      if (s.cat && s.cat !== category) return false;
      if (s.sub && s.sub !== subcategory) return false;
      if (s.price_min != null && price < s.price_min) return false;
      if (s.price_max != null && price > s.price_max) return false;
      return true;
    });
    if (matches.length) pushTo(matches.map((m) => m.user_id), '🔔 Marché', `Nouvelle annonce : ${name.slice(0, 60)}`, '/app/market');
  } catch (e) { console.warn('⚠️ alertes recherches :', e.message); }
  res.json({ id: r.rows[0].id });
}));
app.put('/api/listings/:id', auth, h(async (req, res) => {
  const l = await get('SELECT * FROM listings WHERE id=?', [req.params.id]);
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  if (l.user_id !== req.user.id && req.user.role !== 'superadmin') return res.status(403).json({ error: "Ce n'est pas votre annonce" });
  const name = String(req.body.name ?? l.name).trim().slice(0, 80);
  const price = req.body.price != null ? parseFloat(req.body.price) : l.price;
  if (name.length < 2) return res.status(400).json({ error: "Nom de l'article invalide" });
  if (isNaN(price) || price < 0) return res.status(400).json({ error: 'Prix invalide' });
  let oldPhotos; try { oldPhotos = JSON.parse(l.photos || 'null'); } catch { oldPhotos = null; }
  const photos = cleanPhotos(req.body.photos != null ? req.body.photos : (oldPhotos || (l.photo ? [l.photo] : [])));
  await run('UPDATE listings SET name=?, category=?, subcategory=?, condition=?, brand=?, size=?, area=?, description=?, price=?, phone=?, photo=?, photos=?, available=? WHERE id=?', [
    name,
    LISTING_CATS.includes(req.body.category) ? req.body.category : l.category,
    req.body.subcategory !== undefined ? (/^[a-z_]{1,30}$/.test(String(req.body.subcategory || '')) ? req.body.subcategory : null) : l.subcategory,
    req.body.condition !== undefined ? (LISTING_CONDS.includes(req.body.condition) ? req.body.condition : null) : l.condition,
    req.body.brand !== undefined ? (String(req.body.brand || '').trim().slice(0, 40) || null) : l.brand,
    req.body.size !== undefined ? (String(req.body.size || '').trim().slice(0, 20) || null) : l.size,
    req.body.area !== undefined ? (String(req.body.area || '').trim().slice(0, 80) || null) : l.area,
    String(req.body.description ?? l.description ?? '').trim().slice(0, 1000),
    price,
    String(req.body.phone ?? l.phone ?? '').trim(),
    photos[0] || null,
    JSON.stringify(photos),
    req.body.available != null ? (req.body.available ? 1 : 0) : l.available,
    l.id,
  ]);
  res.json({ ok: true });
}));
app.get('/api/listings/:id', h(async (req, res) => {
  const l = await get(`SELECT l.*, u.name AS seller, u.created_at AS seller_since,
    (SELECT COUNT(*) FROM listing_favorites f WHERE f.listing_id = l.id)::int AS favs
    FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = ?`, [req.params.id]);
  if (!l || !l.available) return res.status(404).json({ error: 'Annonce introuvable' });
  await run('UPDATE listings SET views = views + 1 WHERE id = ?', [l.id]);
  const sellerAds = await all('SELECT id, name, price, photo, photos, category FROM listings WHERE user_id = ? AND available = 1 AND id <> ? ORDER BY created_at DESC LIMIT 6', [l.user_id, l.id]);
  const rev = await get('SELECT COUNT(*)::int AS c, COALESCE(AVG(stars),0)::float AS a FROM seller_reviews WHERE seller_id = ?', [l.user_id]);   // ⭐ Phase 2
  res.json({
    listing: { ...l, views: (l.views || 0) + 1, photos: listingPhotos(l) },
    seller: { name: l.seller, verified: !!l.phone, since: l.seller_since, user_id: l.user_id,
      stars: rev.c ? Math.round(rev.a * 10) / 10 : null, reviews_count: rev.c,
      ads: sellerAds.map((a2) => ({ ...a2, photos: listingPhotos(a2) })) },
  });
}));
app.post('/api/listings/:id/fav', auth, h(async (req, res) => {
  const l = await get('SELECT id FROM listings WHERE id = ?', [req.params.id]);
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  const ex = await get('SELECT 1 AS x FROM listing_favorites WHERE user_id = ? AND listing_id = ?', [req.user.id, l.id]);
  if (ex) { await run('DELETE FROM listing_favorites WHERE user_id = ? AND listing_id = ?', [req.user.id, l.id]); return res.json({ fav: false }); }
  await run('INSERT INTO listing_favorites(user_id, listing_id, created_at) VALUES(?,?,?)', [req.user.id, l.id, Date.now()]);
  res.json({ fav: true });
}));
app.post('/api/listings/:id/renew', auth, h(async (req, res) => {
  const l = await get('SELECT * FROM listings WHERE id = ?', [req.params.id]);
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  if (l.user_id !== req.user.id && req.user.role !== 'superadmin') return res.status(403).json({ error: "Ce n'est pas votre annonce" });
  if (l.renewed_at && Date.now() - l.renewed_at < 24 * 3600 * 1000) {
    const hLeft = Math.ceil((24 * 3600 * 1000 - (Date.now() - l.renewed_at)) / 3600000);
    return res.status(400).json({ error: `Renouvellement possible dans ${hLeft} h` });
  }
  await run('UPDATE listings SET renewed_at = ? WHERE id = ?', [Date.now(), l.id]);
  res.json({ ok: true });
}));

// ================= 💬 ⭐ 🔔 🚨 v2026.09.26.2 — Marché Phase 2 : chat, profils, alertes, signalements =================
app.post('/api/market/chat', auth, h(async (req, res) => {   // ouvrir (ou retrouver) une discussion sur une annonce
  const l = await get('SELECT * FROM listings WHERE id = ? AND available = 1', [req.body.listing_id]);
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  if (l.user_id === req.user.id) return res.status(400).json({ error: 'Ce sont vos propres annonces' });
  let c = await get('SELECT * FROM market_chats WHERE listing_id = ? AND buyer_id = ?', [l.id, req.user.id]);
  if (!c) {
    const r = await run('INSERT INTO market_chats(listing_id,buyer_id,seller_id,created_at) VALUES(?,?,?,?) RETURNING id', [l.id, req.user.id, l.user_id, Date.now()]);
    c = { id: r.rows[0].id };
  }
  res.json({ id: c.id });
}));
app.get('/api/market/chats', auth, h(async (req, res) => {
  const me = req.user.id;
  const rows = await all(`SELECT c.*, l.name AS listing_name, l.price AS listing_price, l.photo, l.photos,
    bu.name AS buyer_name, se.name AS seller_name,
    (SELECT m.text FROM market_messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_msg,
    (SELECT m.created_at FROM market_messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
    (SELECT COUNT(*) FROM market_messages m2 WHERE m2.chat_id = c.id AND m2.sender_id <> ? AND m2.created_at > (CASE WHEN c.buyer_id = ? THEN c.buyer_read_at ELSE c.seller_read_at END))::int AS unread
    FROM market_chats c JOIN listings l ON l.id = c.listing_id JOIN users bu ON bu.id = c.buyer_id JOIN users se ON se.id = c.seller_id
    WHERE c.buyer_id = ? OR c.seller_id = ? ORDER BY last_at DESC NULLS LAST`, [me, me, me, me]);
  res.json({
    chats: rows.map((c) => ({
      id: c.id, listing: { id: c.listing_id, name: c.listing_name, price: c.listing_price, photo: (listingPhotos(c))[0] || null },
      other: me === c.buyer_id ? { id: c.seller_id, name: c.seller_name } : { id: c.buyer_id, name: c.buyer_name },
      last_msg: c.last_msg, last_at: c.last_at, unread: c.unread,
    })),
    unread: rows.reduce((s, c) => s + c.unread, 0),
  });
}));
app.get('/api/market/chats/:id', auth, h(async (req, res) => {
  const c = await get('SELECT * FROM market_chats WHERE id = ?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Discussion introuvable' });
  if (c.buyer_id !== req.user.id && c.seller_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé' });
  await run(`UPDATE market_chats SET ${c.buyer_id === req.user.id ? 'buyer_read_at' : 'seller_read_at'} = ? WHERE id = ?`, [Date.now(), c.id]);
  const messages = await all(`SELECT m.*, u.name AS sender_name FROM market_messages m JOIN users u ON u.id = m.sender_id WHERE m.chat_id = ? ORDER BY m.id ASC LIMIT 300`, [c.id]);
  res.json({ messages, me: req.user.id });
}));
app.post('/api/market/chats/:id', auth, h(async (req, res) => {
  const c = await get('SELECT * FROM market_chats WHERE id = ?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Discussion introuvable' });
  if (c.buyer_id !== req.user.id && c.seller_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé' });
  const text = String(req.body.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Message vide' });
  const m = await get('INSERT INTO market_messages(chat_id,sender_id,text,created_at) VALUES(?,?,?,?) RETURNING id', [c.id, req.user.id, text, Date.now()]);
  const other = c.buyer_id === req.user.id ? c.seller_id : c.buyer_id;
  const l = await get('SELECT name FROM listings WHERE id = ?', [c.listing_id]);
  pushTo([other], `💬 ${(l ? l.name : 'Marché').slice(0, 40)}`, `${req.user.name} : ${text.slice(0, 80)}`, `/app/chat/${c.id}`);
  const message = await get('SELECT m.*, u.name AS sender_name FROM market_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?', [m.id]);
  res.json({ message });
}));
app.get('/api/sellers/:id', h(async (req, res) => {   // profil vendeur public
  const u = await get('SELECT id, name, phone, created_at FROM users WHERE id = ?', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'Vendeur introuvable' });
  const ads = await all('SELECT id, name, price, photo, photos, category, views, area FROM listings WHERE user_id = ? AND available = 1 ORDER BY created_at DESC LIMIT 24', [u.id]);
  const st = await get('SELECT COALESCE(SUM(views),0)::int AS views, COUNT(*)::int AS n FROM listings WHERE user_id = ? AND available = 1', [u.id]);
  const favs = await get('SELECT COUNT(*)::int AS n FROM listing_favorites f JOIN listings l ON l.id = f.listing_id WHERE l.user_id = ?', [u.id]);
  const rev = await get('SELECT COUNT(*)::int AS c, COALESCE(AVG(stars),0)::float AS a FROM seller_reviews WHERE seller_id = ?', [u.id]);
  const reviews = await all('SELECT r.stars, r.comment, r.created_at, u.name AS buyer_name FROM seller_reviews r JOIN users u ON u.id = r.buyer_id WHERE r.seller_id = ? ORDER BY r.created_at DESC LIMIT 10', [u.id]);
  res.json({
    seller: { id: u.id, name: u.name, verified: !!u.phone, since: u.created_at,
      stars: rev.c ? Math.round(rev.a * 10) / 10 : null, reviews_count: rev.c,
      total_views: st.views, total_favs: favs.n, ads_count: st.n },
    ads: ads.map((a2) => ({ ...a2, photos: listingPhotos(a2) })),
    reviews,
  });
}));
app.post('/api/sellers/:id/review', auth, h(async (req, res) => {   // ⭐ avis (après avoir discuté)
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas vous noter vous-même' });
  const talked = await get('SELECT 1 AS x FROM market_chats WHERE seller_id = ? AND buyer_id = ? LIMIT 1', [req.params.id, req.user.id]);
  if (!talked) return res.status(400).json({ error: 'Discutez d’abord avec ce vendeur (bouton 💬 Chat) pour pouvoir le noter' });
  const stars = parseInt(req.body.stars, 10);
  if (!(stars >= 1 && stars <= 5)) return res.status(400).json({ error: 'Note invalide (1 à 5 étoiles)' });
  const comment = String(req.body.comment || '').trim().slice(0, 300) || null;
  await run(`INSERT INTO seller_reviews(seller_id,buyer_id,stars,comment,created_at) VALUES(?,?,?,?,?)
    ON CONFLICT (seller_id, buyer_id) DO UPDATE SET stars = EXCLUDED.stars, comment = EXCLUDED.comment, created_at = EXCLUDED.created_at`,
    [req.params.id, req.user.id, stars, comment, Date.now()]);
  pushTo([req.params.id], '⭐ Marché', `${req.user.name} vous a laissé un avis (${stars}★)`, '/app/seller/' + req.params.id);
  res.json({ ok: true });
}));
app.get('/api/saved-searches', auth, h(async (req, res) => {
  res.json({ searches: await all('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]) });
}));
app.post('/api/saved-searches', auth, h(async (req, res) => {
  const cnt = await get('SELECT COUNT(*)::int AS n FROM saved_searches WHERE user_id = ?', [req.user.id]);
  if (cnt.n >= 10) return res.status(400).json({ error: 'Maximum 10 recherches sauvegardées' });
  const q = String(req.body.q || '').trim().slice(0, 60) || null;
  const cat = LISTING_CATS.includes(req.body.cat) ? req.body.cat : null;
  const sub = /^[a-z_]{1,30}$/.test(String(req.body.sub || '')) ? req.body.sub : null;
  const pmin = !isNaN(parseFloat(req.body.price_min)) ? parseFloat(req.body.price_min) : null;
  const pmax = !isNaN(parseFloat(req.body.price_max)) ? parseFloat(req.body.price_max) : null;
  if (!q && !cat && !sub && pmin == null && pmax == null) return res.status(400).json({ error: 'Rien à sauvegarder' });
  const r = await run('INSERT INTO saved_searches(user_id,q,cat,sub,price_min,price_max,created_at) VALUES(?,?,?,?,?,?,?) RETURNING id',
    [req.user.id, q, cat, sub, pmin, pmax, Date.now()]);
  res.json({ id: r.rows[0].id });
}));
app.delete('/api/saved-searches/:id', auth, h(async (req, res) => {
  await run('DELETE FROM saved_searches WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));
const REPORT_REASONS = ['scam', 'prohibited', 'price', 'other'];
app.post('/api/listings/:id/report', auth, h(async (req, res) => {   // 🚨 signaler
  const l = await get('SELECT id, user_id, name FROM listings WHERE id = ?', [req.params.id]);
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  const reason = REPORT_REASONS.includes(req.body.reason) ? req.body.reason : null;
  if (!reason) return res.status(400).json({ error: 'Motif invalide' });
  const note = String(req.body.note || '').trim().slice(0, 200) || null;
  const dup = await get('SELECT 1 AS x FROM listing_reports WHERE listing_id = ? AND user_id = ? AND handled = 0', [l.id, req.user.id]);
  if (dup) return res.status(400).json({ error: 'Vous avez déjà signalé cette annonce' });
  await run('INSERT INTO listing_reports(listing_id,user_id,reason,note,created_at) VALUES(?,?,?,?,?)', [l.id, req.user.id, reason, note, Date.now()]);
  res.json({ ok: true });
}));
app.get('/api/admin/reports', auth, requireRole('superadmin'), h(async (req, res) => {
  const rows = await all(`SELECT r.*, l.name AS listing_name, l.price, l.photo, l.photos, l.available, u.name AS reporter
    FROM listing_reports r JOIN listings l ON l.id = r.listing_id JOIN users u ON u.id = r.user_id
    WHERE r.handled = 0 ORDER BY r.created_at DESC LIMIT 100`);
  res.json({ reports: rows.map((r) => ({ ...r, photos: listingPhotos(r) })) });
}));
app.post('/api/admin/reports/:id', auth, requireRole('superadmin'), h(async (req, res) => {   // traiter : ignorer ou supprimer
  const r = await get('SELECT * FROM listing_reports WHERE id = ?', [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Signalement introuvable' });
  if (req.body.action === 'delete') {
    await run('DELETE FROM market_messages WHERE chat_id IN (SELECT id FROM market_chats WHERE listing_id = ?)', [r.listing_id]);
    await run('DELETE FROM market_chats WHERE listing_id = ?', [r.listing_id]);
    await run('DELETE FROM listing_favorites WHERE listing_id = ?', [r.listing_id]);
    await run('DELETE FROM listings WHERE id = ?', [r.listing_id]);
    await run('UPDATE listing_reports SET handled = 1 WHERE id = ?', [r.id]);
    return res.json({ ok: true, deleted: true });
  }
  await run('UPDATE listing_reports SET handled = 1 WHERE id = ?', [r.id]);
  res.json({ ok: true });
}));

// ================= 🛵 v2026.09.26.3 — Marché Phase 3 : livraison des articles par YallaLiv =================
app.post('/api/market/deliver', auth, requireRole('client', 'merchant', 'superadmin'), h(async (req, res) => {
  const l = await get('SELECT * FROM listings WHERE id = ? AND available = 1', [req.body.listing_id]);
  if (!l) return res.status(404).json({ error: 'Annonce introuvable ou déjà vendue' });
  if (l.user_id === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas vous livrer votre propre annonce' });
  const address = String(req.body.address || '').trim().slice(0, 200);
  const phone = String(req.body.phone || req.user.phone || '').trim();
  const note = String(req.body.note || '').trim().slice(0, 200);
  const clat = parseFloat(req.body.lat); const clng = parseFloat(req.body.lng);
  if (address.length < 5) return res.status(400).json({ error: 'Adresse de livraison trop courte' });
  if (!phone) return res.status(400).json({ error: 'Téléphone requis pour le livreur' });
  if (isNaN(clat) || isNaN(clng)) return res.status(400).json({ error: 'Position de livraison requise (touchez une proposition ou 🗺️)' });
  let fee = parseFloat(req.body.delivery_fee);
  if (isNaN(fee)) fee = 25;
  fee = Math.max(10, Math.min(80, Math.round(fee * 100) / 100));   // fourchette raisonnelle
  const open = await get("SELECT COUNT(*)::int AS n FROM orders WHERE client_id = ? AND kind = 'market' AND status IN ('pending','accepted','preparing','ready','assigned','picked_up')", [req.user.id]);
  if (open.n >= 3) return res.status(400).json({ error: 'Trop de livraisons marché en cours (max 3)' });
  const pin = String(1000 + Math.floor(Math.random() * 9000));   // 🔑 remise à l'acheteur
  const now = Date.now();
  const r = await run(`INSERT INTO orders(kind,listing_id,seller_id,client_id,store_id,driver_id,status,payment,paid,subtotal,delivery_fee,commission,total,address,phone,note,client_lat,client_lng,promo_code,discount,visibility,pin,created_at,updated_at)
    VALUES('market',?,?,?,NULL,NULL,'pending','cash',0,?,?,0,?,?,?,?,?,?,'',0,'public',?,?,?) RETURNING id`,
    [l.id, l.user_id, req.user.id, l.price, fee, l.price + fee, address, phone, note, clat, clng, pin, now, now]);
  const oid = r.rows[0].id;
  await run('INSERT INTO order_items(order_id,product_id,name,emoji,price,qty) VALUES(?,?,?,?,?,?)', [oid, null, l.name, '🛍️', l.price, 1]);
  pushTo([l.user_id], `🛵 Marché — demande de livraison`, `${req.user.name} veut faire livrer « ${l.name.slice(0, 40)} » par YallaLiv — acceptez la demande`, '/app/sales');
  res.json({ order_id: oid, pin, delivery_fee: fee });
}));
app.get('/api/market/sales', auth, h(async (req, res) => {
  const rows = await all(`${ORDER_WITH_JOINS} WHERE o.kind='market' AND o.seller_id=? ORDER BY o.created_at DESC LIMIT 60`, [req.user.id]);
  const orders = await withItems(stripPin(rows));   // le PIN appartient à l'acheteur
  // 📍 pré-remplit le point de récupération depuis l'annonce (si le vendeur n'a rien saisi)
  const lst = await all('SELECT id, lat, lng, area FROM listings WHERE user_id = ?', [req.user.id]);
  const byId = Object.fromEntries(lst.map((l) => [l.id, l]));
  orders.forEach((o) => {
    const l = byId[o.listing_id];
    if (!l) return;
    if (o.store_lat == null && l.lat != null) { o.store_lat = l.lat; o.store_lng = l.lng; }
    if (!o.store_address && l.area) o.store_address = l.area;
  });
  res.json({ orders });
}));
app.post('/api/market/orders/:id/accept', auth, h(async (req, res) => {
  const o = await get(`SELECT o.*, l.lat AS l_lat, l.lng AS l_lng, l.area AS l_area, l.name AS l_name FROM orders o LEFT JOIN listings l ON l.id=o.listing_id WHERE o.id=? AND o.kind='market'`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  if (o.seller_id !== req.user.id) return res.status(403).json({ error: "Ce n'est pas votre vente" });
  if (o.status !== 'pending') return res.status(400).json({ error: 'Demande déjà traitée' });
  const pickup_address = String(req.body.pickup_address || o.pickup_address || o.l_area || '').trim().slice(0, 200);
  if (pickup_address.length < 5) return res.status(400).json({ error: 'Adresse de récupération requise' });
  const plat = req.body.pickup_lat != null && !isNaN(parseFloat(req.body.pickup_lat)) ? parseFloat(req.body.pickup_lat) : (o.pickup_lat != null ? o.pickup_lat : o.l_lat);   // 📍 point : saisi OU annonce
  const plng = req.body.pickup_lng != null && !isNaN(parseFloat(req.body.pickup_lng)) ? parseFloat(req.body.pickup_lng) : (o.pickup_lng != null ? o.pickup_lng : o.l_lng);
  if (plat == null || plng == null) return res.status(400).json({ error: 'Point de récupération requis — définissez-le sur la carte 🗺️' });
  await run(`UPDATE orders SET status='ready', visibility='public', pickup_address=?, pickup_lat=?, pickup_lng=?, updated_at=? WHERE id=?`,
    [pickup_address, plat, plng, Date.now(), o.id]);
  pushTo([o.client_id], `Commande #${o.id}`, '✅ Le vendeur a accepté — un livreur YallaLiv vient chercher votre article 🛵');
  dispatchPublicOrders();   // attribution immédiate
  res.json({ ok: true });
}));
app.post('/api/market/orders/:id/decline', auth, h(async (req, res) => {
  const o = await get(`SELECT * FROM orders WHERE id=? AND kind='market'`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  if (o.seller_id !== req.user.id) return res.status(403).json({ error: "Ce n'est pas votre vente" });
  if (o.status !== 'pending') return res.status(400).json({ error: 'Demande déjà traitée' });
  await run(`UPDATE orders SET status='cancelled', updated_at=? WHERE id=?`, [Date.now(), o.id]);
  pushTo([o.client_id], `Commande #${o.id}`, '🚫 Le vendeur a décliné la demande de livraison');
  res.json({ ok: true });
}));
app.delete('/api/listings/:id', auth, h(async (req, res) => {
  const l = await get('SELECT * FROM listings WHERE id=?', [req.params.id]);
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  if (l.user_id !== req.user.id && req.user.role !== 'superadmin') return res.status(403).json({ error: "Ce n'est pas votre annonce" });
  await run('DELETE FROM listings WHERE id=?', [l.id]);
  res.json({ ok: true });
}));

app.get('/api/settings/public', h(async (req, res) => {
  if (!VAPID) await initVapid();   // 🛡️ attend l'initialisation (instance froide)
  res.json({ app_name: await getSetting('app_name', 'YallaLiv'), currency: await getSetting('currency', 'EGP'), vapid_public: VAPID ? VAPID.publicKey : null });
}));

app.post('/api/push/subscribe', auth, h(async (req, res) => {
  // 🔔 APK : jeton FCM (notifications reçues même app fermée)
  const ft = String(req.body.fcm_token || '').trim();
  if (ft) {
    await run(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,kind,fcm_token,created_at) VALUES(?,?,?,?, 'fcm', ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, fcm_token=excluded.fcm_token`,
      [req.user.id, 'fcm:' + ft, '', '', ft, Date.now()]);
    return res.json({ ok: true });
  }
  const s = req.body.subscription || {};
  if (!s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth) return res.status(400).json({ error: 'Subscription invalide' });
  await run(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,created_at) VALUES(?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`,
    [req.user.id, String(s.endpoint), String(s.keys.p256dh), String(s.keys.auth), Date.now()]);
  res.json({ ok: true });
}));
app.post('/api/push/unsubscribe', auth, h(async (req, res) => {
  await run('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?', [req.user.id, String(req.body.endpoint || '')]);
  res.json({ ok: true });
}));

app.get('/api/stores', h(async (req, res) => {
  const { type, q } = req.query;
  let sql = `SELECT s.*,
    (SELECT COUNT(*) FROM products p WHERE p.store_id=s.id AND p.available=1) AS product_count,
    (SELECT MIN(price) FROM products p WHERE p.store_id=s.id AND p.available=1) AS min_price
    FROM stores s WHERE s.status='approved' AND s.is_open=1`;
  const args = [];
  if (type && type !== 'all') { sql += ' AND s.type=?'; args.push(type); }
  if (q) { sql += ' AND (s.name ILIKE ? OR s.description ILIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY s.rating DESC';
  res.json({ stores: await all(sql, args) });
}));

// attache les photos de galerie aux produits
async function withPhotos(products) {
  if (!products.length) return products;
  const ids = products.map((p) => p.id);
  const photos = await all(`SELECT id, product_id, photo FROM product_photos WHERE product_id IN (${ids.map(() => '?').join(',')})`, ids);
  const byP = {};
  for (const ph of photos) (byP[ph.product_id] = byP[ph.product_id] || []).push(ph);
  return products.map((p) => ({ ...p, photos: byP[p.id] || [] }));
}

// Produits de tous les magasins approuves (vue globale client) : chaque produit
// porte l'indice du magasin (nom, logo emoji, couleur) qui le publie.
app.get('/api/products', h(async (req, res) => {
  const { q, type } = req.query;
  let sql = `SELECT p.id, p.name, p.emoji, p.photo, p.price, p.category, p.store_id,
    s.name AS store_name, s.emoji AS store_emoji, s.color AS store_color, s.photo AS store_photo, s.type AS store_type,
    s.address AS store_address, s.lat AS store_lat, s.lng AS store_lng, s.is_open
    FROM products p JOIN stores s ON s.id = p.store_id
    WHERE p.available = 1 AND s.status = 'approved' AND s.is_open = 1`;
  const args = [];
  if (type && type !== 'all') { sql += ' AND s.type = ?'; args.push(type); }
  if (q) { sql += ' AND (p.name ILIKE ? OR s.name ILIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY s.rating DESC, p.id DESC LIMIT 300';
  res.json({ products: await all(sql, args) });
}));

app.get('/api/stores/:id', h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE id=? AND status=?', [req.params.id, 'approved']);
  if (!store) return res.status(404).json({ error: 'Magasin introuvable' });
  const products = await all('SELECT * FROM products WHERE store_id=? AND available=1 ORDER BY category, name', [store.id]);
  res.json({ store, products: await withPhotos(products) });
}));

// ---------- CLIENT ----------
app.post('/api/orders', auth, requireRole('client', 'merchant', 'superadmin'), h(async (req, res) => {
  const { store_id, items, address, phone, note = '', payment = 'cash' } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Panier vide' });
  if (!String(address || '').trim()) return res.status(400).json({ error: 'Adresse de livraison requise (ex. : 12 rue Saad Zaghloul, Alexandrie)' });
  if (String(phone || '').replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Téléphone invalide (ex. : 0100 123 4567)' });
  const store = await get(`SELECT * FROM stores WHERE id=? AND status='approved'`, [store_id]);
  if (!store) return res.status(400).json({ error: 'Magasin indisponible' });
  if (!store.is_open) return res.status(400).json({ error: 'Magasin fermé actuellement' });

  let subtotal = 0;
  const rows = [];
  for (const it of items) {
    const p = await get('SELECT * FROM products WHERE id=? AND store_id=? AND available=1', [it.product_id, store.id]);
    if (!p) return res.status(400).json({ error: 'Produit indisponible' });
    const qty = Math.max(1, Math.min(99, parseInt(it.qty) || 1));
    subtotal += p.price * qty;
    rows.push([p.id, p.name, p.emoji, p.price, qty]);
  }
  if (subtotal < store.min_order) return res.status(400).json({ error: `Commande minimum: ${store.min_order}` });
  const rate = parseFloat(await getSetting('commission_rate', '10')) || 0;

  // Code promo (revalidé côté serveur)
  let discount = 0, promoCode = '';
  const codeRaw = String(req.body.promo_code || '').trim().toUpperCase();
  if (codeRaw) {
    const promo = await get('SELECT * FROM promos WHERE code=? AND active=1', [codeRaw]);
    if (!promo || (promo.max_uses > 0 && promo.used_count >= promo.max_uses) || subtotal < promo.min_order) {
      return res.status(400).json({ error: 'Code promo invalide ou expiré' });
    }
    discount = promo.type === 'percent' ? round2(subtotal * promo.value / 100) : round2(Math.min(promo.value, subtotal));
    promoCode = promo.code;
    await run('UPDATE promos SET used_count=used_count+1 WHERE id=?', [promo.id]);
  }
  const commission = round2((subtotal - discount) * rate / 100);
  const total = round2(subtotal - discount + store.delivery_fee);
  const now = Date.now();
  const paid = payment === 'card' ? 1 : 0;
  let clat = parseFloat(req.body.client_lat), clng = parseFloat(req.body.client_lng);
  if (!(Math.abs(clat) <= 90 && Math.abs(clng) <= 180)) { clat = null; clng = null; }
  // Visibilite par defaut : privee si le magasin a des livreurs personnels, sinon publique
  const privCount = await get(`SELECT COUNT(*) AS c FROM users WHERE role='driver' AND store_id=? AND status='active'`, [store.id]);
  const visibility = privCount.c > 0 ? 'private' : 'public';
  const pin = String(1000 + Math.floor(Math.random() * 9000)); // 🔑 code de remise : le client le donne au livreur
  const o = await get(`INSERT INTO orders(client_id,store_id,driver_id,status,payment,paid,subtotal,delivery_fee,commission,total,address,phone,note,client_lat,client_lng,promo_code,discount,visibility,pin,created_at,updated_at)
    VALUES(?,?,NULL,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    [req.user.id, store.id, payment, paid, round2(subtotal), store.delivery_fee, commission, total, String(address), String(phone), String(note), clat, clng, promoCode, discount, visibility, pin, now, now]);
  const oid = o.id;
  for (const r of rows) await run('INSERT INTO order_items(order_id,product_id,name,emoji,price,qty) VALUES(?,?,?,?,?,?)', [oid, ...r]);
  if (!req.user.phone && phone) await run('UPDATE users SET phone=? WHERE id=?', [String(phone), req.user.id]);   // mémorise le téléphone
  if (clat == null) {
    const [j1, j2] = jitter(oid * 13 + 5, 0.005);
    await run('UPDATE orders SET client_lat=?, client_lng=? WHERE id=?', [store.lat + j1, store.lng + j2, oid]);
  }
  pushTo([store.owner_id], `🧾 Nouvelle commande #${oid}`, `${req.user.name} · ${total} ${await getSetting('currency', 'EGP')}${promoCode ? ' · 🎁 ' + promoCode : ''}`);
  res.json({ order_id: oid, pin });
}));

const ORDER_WITH_JOINS = `
  SELECT o.*,
    CASE WHEN o.kind='market' THEN COALESCE(l.name, '🛍️ Marché') ELSE s.name END AS store_name,        -- 🛍️ Phase 3 : commande marché = nom de l'article
    CASE WHEN o.kind='market' THEN '🛍️' ELSE s.emoji END AS store_emoji,
    CASE WHEN o.kind='market' THEN 'market' ELSE s.type END AS store_type,
    CASE WHEN o.kind='market' THEN se.phone ELSE s.phone END AS store_phone,                           -- tél vendeur = contact récupération
    CASE WHEN o.kind='market' THEN COALESCE(o.pickup_address, l.area, '') ELSE s.address END AS store_address,
    CASE WHEN o.kind='market' THEN o.pickup_lat ELSE s.lat END AS store_lat,                           -- point de récupération = chez le vendeur
    CASE WHEN o.kind='market' THEN o.pickup_lng ELSE s.lng END AS store_lng,
    c.name AS client_name, d.name AS driver_name, d.phone AS driver_phone, d.vehicle AS driver_vehicle,
    r.store_stars AS rev_store, r.driver_stars AS rev_driver,
    (SELECT m.text FROM messages m WHERE m.order_id=o.id ORDER BY m.id DESC LIMIT 1) AS last_msg,
    (SELECT m.id FROM messages m WHERE m.order_id=o.id ORDER BY m.id DESC LIMIT 1) AS last_msg_id,
    (SELECT m.sender_id FROM messages m WHERE m.order_id=o.id ORDER BY m.id DESC LIMIT 1) AS last_sender_id
  FROM orders o
  LEFT JOIN stores s ON s.id=o.store_id        -- 🛍️ Phase 3 : LEFT JOIN (commandes marché sans magasin)
  LEFT JOIN listings l ON l.id=o.listing_id
  LEFT JOIN users se ON se.id=o.seller_id
  JOIN users c ON c.id=o.client_id
  LEFT JOIN users d ON d.id=o.driver_id
  LEFT JOIN reviews r ON r.order_id=o.id`;

async function withItems(orders) {
  const stmt = 'SELECT * FROM order_items WHERE order_id=?';
  return Promise.all(orders.map(async (o) => ({ ...o, items: await all(stmt, [o.id]) })));
}

app.get('/api/orders/mine', auth, requireRole('client', 'merchant', 'superadmin'), h(async (req, res) => {
  const orders = await all(`${ORDER_WITH_JOINS} WHERE o.client_id=? ORDER BY o.created_at DESC`, [req.user.id]);
  res.json({ orders: await withItems(orders) });
}));

app.post('/api/orders/:id/cancel', auth, requireRole('client', 'merchant', 'superadmin'), h(async (req, res) => {
  const o = await get('SELECT * FROM orders WHERE id=? AND client_id=?', [req.params.id, req.user.id]);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  if (o.status !== 'pending') return res.status(400).json({ error: "Impossible d'annuler maintenant" });
  await run(`UPDATE orders SET status='cancelled', updated_at=? WHERE id=?`, [Date.now(), o.id]);
  if (o.kind === 'market' && o.seller_id) pushTo([o.seller_id], `Commande #${o.id}`, '🚫 Demande de livraison annulée par l’acheteur');   // 🛍️ Phase 3
  res.json({ ok: true });
}));

// ---------- MERCHANT ----------
app.get('/api/merchant/store', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  if (!store) return res.status(404).json({ error: 'Aucun magasin' });
  const products = await all('SELECT * FROM products WHERE store_id=? ORDER BY category, name', [store.id]);
  res.json({ store, products: await withPhotos(products) });
}));

// Photo de profil du magasin (logo) — visible par les clients
app.put('/api/merchant/store/photo', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  if (!store) return res.status(404).json({ error: 'Aucun magasin' });
  if (req.body.remove) {
    if (store.photo?.startsWith('/api/photos/')) await dropPhoto(store.photo);
    const s = await get('UPDATE stores SET photo=NULL WHERE id=? RETURNING *', [store.id]);
    return res.json({ store: s });
  }
  const url = await savePhoto(req.body);
  if (!url) return res.status(400).json({ error: 'Image invalide (PNG/JPG/WebP) ou trop lourde' });
  if (store.photo?.startsWith('/api/photos/')) await dropPhoto(store.photo);
  const s = await get('UPDATE stores SET photo=? WHERE id=? RETURNING *', [url, store.id]);
  res.json({ store: s });
}));

app.put('/api/merchant/store', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  if (!store) return res.status(404).json({ error: 'Aucun magasin' });
  const { name, description, phone, address, emoji, color, delivery_fee, min_order, is_open } = req.body;
  let sql = 'UPDATE stores SET name=?, description=?, phone=?, address=?, emoji=?, color=?, delivery_fee=?, min_order=?, is_open=?';
  const args = [String(name || store.name).trim(), String(description ?? store.description), String(phone ?? store.phone), String(address ?? store.address),
    String(emoji || store.emoji).slice(0, 4), String(color || store.color).slice(0, 9), Math.max(0, parseFloat(delivery_fee) || 0),
    Math.max(0, parseFloat(min_order) || 0), is_open ? 1 : 0];
  // Position du magasin (choisie sur la carte)
  const lat = parseFloat(req.body.lat), lng = parseFloat(req.body.lng);
  if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) { sql += ', lat=?, lng=?'; args.push(lat, lng); }
  sql += ' WHERE id=? RETURNING *';
  args.push(store.id);
  const s = await get(sql, args);
  res.json({ store: s });
}));

app.post('/api/merchant/products', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  if (!store) return res.status(404).json({ error: 'Aucun magasin' });
  const { name, category = 'Général', description = '', price, emoji = '📦', available = true } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nom du produit requis (ex. : Sandwich falafel)' });
  if (price === undefined || isNaN(parseFloat(price)) || parseFloat(price) < 0) return res.status(400).json({ error: 'Prix invalide (ex. : 45.50)' });
  const qty = (req.body.qty === '' || req.body.qty == null || isNaN(parseInt(req.body.qty))) ? null : Math.max(0, parseInt(req.body.qty));
  const p = await get('INSERT INTO products(store_id,name,category,description,price,qty,emoji,available,created_at) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *',
    [store.id, String(name).trim(), String(category), String(description), round2(parseFloat(price)), qty, String(emoji).slice(0, 4), available ? 1 : 0, Date.now()]);
  res.json({ product: p });
}));

app.put('/api/merchant/products/:id', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  const p = await get('SELECT * FROM products WHERE id=? AND store_id=?', [req.params.id, store?.id]);
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  const { name, category, description, price, emoji, available } = req.body;
  const qty = (req.body.qty === '' || req.body.qty == null || isNaN(parseInt(req.body.qty))) ? null : Math.max(0, parseInt(req.body.qty));
  const out = await get('UPDATE products SET name=?, category=?, description=?, price=?, qty=?, emoji=?, available=? WHERE id=? RETURNING *',
    [String(name ?? p.name).trim(), String(category ?? p.category), String(description ?? p.description),
      price !== undefined ? round2(parseFloat(price) || p.price) : p.price,
      req.body.qty === undefined ? p.qty : qty,
      String(emoji ?? p.emoji).slice(0, 4),
      available === undefined ? p.available : (available ? 1 : 0), p.id]);
  res.json({ product: out });
}));

app.delete('/api/merchant/products/:id', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  const p = await get('SELECT * FROM products WHERE id=? AND store_id=?', [req.params.id, store?.id]);
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  await run('DELETE FROM products WHERE id=?', [p.id]);
  res.json({ ok: true });
}));

// 📥 Import produits depuis Excel — le FICHIER n'est jamais stocké : seul le contenu est enregistré.
// replace=1 : remplace UNIQUEMENT les produits importés par Excel (les produits ajoutés manuellement ne sont PAS touchés).
app.post('/api/merchant/products/import', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  if (!store) return res.status(404).json({ error: 'Aucun magasin' });
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  const replace = !!req.body.replace;
  const clean = [];
  let skipped = 0;
  for (const r of rows) {
    const name = String(r?.name ?? '').trim();
    const price = parseFloat(String(r?.price ?? '').replace(',', '.'));
    const q = parseInt(r?.qty, 10);
    const qty = isNaN(q) ? null : Math.max(0, q);
    if (!name || isNaN(price) || price < 0) { skipped++; continue; }   // lignes vides / invalides ignorées
    clean.push([store.id, name, round2(price), qty, Date.now()]);
  }
  if (!clean.length) return res.status(400).json({ error: 'Aucune ligne valide (vérifie les colonnes choisies)' });
  let deleted = 0;
  if (replace) {
    const olds = await all('SELECT * FROM products WHERE store_id=? AND via_excel=1', [store.id]);
    for (const o of olds) {
      const phs = await all('SELECT photo FROM product_photos WHERE product_id=?', [o.id]);
      for (const ph of phs) { if (ph.photo?.startsWith('/api/photos/')) { try { await dropPhoto(ph.photo); } catch {} } }
      await run('DELETE FROM product_photos WHERE product_id=?', [o.id]);
      if (o.photo?.startsWith('/api/photos/')) { try { await dropPhoto(o.photo); } catch {} }
    }
    const d = await run('DELETE FROM products WHERE store_id=? AND via_excel=1', [store.id]);
    deleted = d.rowCount || 0;
  }
  for (const c of clean) {
    await run('INSERT INTO products(store_id,name,price,qty,via_excel,created_at) VALUES(?,?,?,?,1,?)', c);
  }
  res.json({ ok: true, inserted: clean.length, deleted, skipped });
}));

app.get('/api/merchant/orders', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  if (!store) return res.json({ orders: [] });
  const orders = await all(`${ORDER_WITH_JOINS} WHERE o.store_id=? ORDER BY o.created_at DESC LIMIT 100`, [store.id]);
  res.json({ orders: await withItems(orders) });
}));

app.post('/api/merchant/orders/:id/status', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  const o = await get('SELECT * FROM orders WHERE id=? AND store_id=?', [req.params.id, store?.id]);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  const next = req.body.status;
  const allowed = { pending: ['accepted', 'rejected'], accepted: ['preparing'], preparing: ['ready'] };
  if (!allowed[o.status] || !allowed[o.status].includes(next)) return res.status(400).json({ error: 'Transition invalide' });
  let vis = o.visibility;
  if (next === 'ready' && ['private', 'public'].includes(req.body.visibility)) vis = req.body.visibility;
  await run('UPDATE orders SET status=?, visibility=?, updated_at=? WHERE id=?', [next, vis, Date.now(), o.id]);
  const LABELS = { accepted: 'acceptée ✅', preparing: 'en préparation 👨‍🍳', ready: 'prête 🛵', rejected: 'refusée ❌' };
  pushTo([o.client_id], `Commande #${o.id}`, `Votre commande est ${LABELS[next] || next}`);
  if (next === 'ready') await notifyReadyAudience({ ...o, visibility: vis }, store);
  res.json({ ok: true });
}));

// Attribution DIRECTE d'une livraison prete a un livreur PRIVE du magasin.
// Si le livreur a deja une course : 1er appel -> needs_confirm ; force:true -> attribution quand meme
// + calcul du plan : store_first (retour magasin d'abord) ou finish_current_first (terminer sa course d'abord).
// 🚫 Annulation par le magasin : à TOUT moment (même en cours de livraison).
// Si un livreur est en route : il reçoit un message — le colis doit retourner au magasin.
app.post('/api/merchant/orders/:id/cancel', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  if (!store) return res.status(404).json({ error: 'Aucun magasin' });
  const o = await get('SELECT * FROM orders WHERE id=? AND store_id=?', [req.params.id, store.id]);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  if (['delivered', 'cancelled', 'rejected', 'refused'].includes(o.status)) return res.status(400).json({ error: 'Commande déjà terminée' });
  await run(`UPDATE orders SET status='cancelled', updated_at=? WHERE id=?`, [Date.now(), o.id]);
  if (o.driver_id) {
    pushTo([o.driver_id], `🚨 Commande #${o.id} annulée par le magasin`, o.status === 'picked_up'
      ? `Le colis doit RETOURNER au magasin ${store.name} — il est en votre possession`
      : `Livraison annulée — inutile d'aller la chercher`);
  }
  pushTo([o.client_id], `Commande #${o.id}`, '🚫 Votre commande a été annulée par le magasin');
  res.json({ ok: true });
}));

app.post('/api/merchant/orders/:id/assign', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  const o = await get('SELECT * FROM orders WHERE id=? AND store_id=?', [req.params.id, store?.id]);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  if (o.status !== 'ready' || o.driver_id) return res.status(400).json({ error: 'La commande doit être prête et non attribuée' });
  const drvId = parseInt(req.body.driver_id, 10);
  const d = Number.isInteger(drvId)
    ? await get(`SELECT * FROM users WHERE id=? AND role='driver' AND store_id=? AND status='active'`, [drvId, store.id])
    : null;
  if (!d) return res.status(404).json({ error: 'Livreur introuvable parmi vos livreurs personnels' });

  const actives = await all(`SELECT * FROM orders WHERE driver_id=? AND status IN ('assigned','picked_up')`, [d.id]);
  if (actives.length && !req.body.force) {
    return res.json({ needs_confirm: true, active_count: actives.length, active: actives.map((a) => ({ id: a.id, status: a.status })) });
  }

  const r = await run(`UPDATE orders SET driver_id=?, status='assigned', visibility='private', acknowledged=0, updated_at=? WHERE id=? AND status='ready' AND driver_id IS NULL`,
    [d.id, Date.now(), o.id]);
  if (r.rowCount === 0) return res.status(400).json({ error: 'Cette livraison n\u2019est plus disponible' });

  // Plan de trajet si le livreur est deja en course :
  // compare distance livreur->magasin vs livreur->destination de sa course en cours
  let plan = null;
  if (actives.length) {
    const loc = await get('SELECT lat,lng FROM driver_locations WHERE driver_id=?', [d.id]);
    const st = await get('SELECT lat,lng FROM stores WHERE id=?', [o.store_id]);
    if (loc && st && st.lat != null) {
      const storePos = { lat: st.lat, lng: st.lng };
      // destination actuelle du livreur : client s'il porte un colis, sinon son magasin
      const picked = actives.find((a) => a.status === 'picked_up' && a.client_lat != null);
      const cur = picked ? { lat: picked.client_lat, lng: picked.client_lng } : storePos;
      plan = havM(loc, storePos) <= havM(loc, cur) ? 'store_first' : 'finish_current_first';
    }
  }
  const planMsg = plan === 'store_first'
    ? ' — passez d’abord au magasin récupérer la commande'
    : plan === 'finish_current_first' ? ' — terminez votre livraison en cours, puis passez au magasin' : '';
  pushTo([d.id], '📦 Livraison assignée', `Commande #${o.id} · ${store?.name || ''}${planMsg}`);
  pushTo([o.client_id], `Commande #${o.id}`, '🛵 Un livreur vous a été attribué — il arrive !');
  res.json({ ok: true, plan, active_count: actives.length });
}));

// Changement de visibilite d'une commande prete (private <-> public)
app.post('/api/merchant/orders/:id/visibility', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  const o = await get('SELECT * FROM orders WHERE id=? AND store_id=?', [req.params.id, store?.id]);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  if (o.status !== 'ready') return res.status(400).json({ error: 'Publication modifiable seulement quand la commande est prête' });
  const v = req.body.visibility;
  if (!['private', 'public'].includes(v)) return res.status(400).json({ error: 'Visibilité invalide' });
  await run('UPDATE orders SET visibility=?, updated_at=? WHERE id=?', [v, Date.now(), o.id]);
  await notifyReadyAudience({ ...o, visibility: v }, store);
  res.json({ ok: true });
}));

// push selon l'audience : private -> livreurs du magasin ; public -> DISPATCH AUTOMATIQUE
async function notifyReadyAudience(o, store) {
  if (o.visibility === 'private') {
    const rows = await all(`SELECT id FROM users WHERE role='driver' AND status='active' AND online=1 AND store_id=?`, [o.store_id]);
    pushTo(rows.map((d) => d.id), '🛵 Nouvelle livraison disponible', `Commande #${o.id} · ${store?.name || ''}`);
  } else {
    dispatchPublicOrders(); // attribution automatique au livreur general le plus rapide
  }
}

// ---------- DISPATCH AUTOMATIQUE (livraisons publiques -> livreurs generaux) ----------
// Distance a vol d'oiseau (metres) entre deux points
const havM = (a, b) => {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// Duree routiere reelle (OSRM) entre deux points, en secondes. Repli : distance a vol d'oiseau x1.4 a 30 km/h.
async function osrmDuration(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const havM = 2 * R * Math.asin(Math.sqrt(h));
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`, { signal: AbortSignal.timeout(2500) });
    const j = await r.json();
    if (j?.routes?.[0]) return j.routes[0].duration;
  } catch {}
  return (havM * 1.4) / (30 / 3.6); // sec
}

let dispatchBusy = false;
let lastLocDispatch = 0;
// Attribue chaque livraison publique prete au livreur general ELIGIBLE le plus rapide :
// score = duree trajet livreur->magasin + duree magasin->client (OSRM).
// Eligibilite : en ligne, position connue, moins de 5 livraisons actives,
// et PAS (colis deja en main + 2 recuperations en attente) -> bloque jusqu'a livraison de l'ancien colis.
async function dispatchPublicOrders() {
  if (dispatchBusy) return;
  dispatchBusy = true;
  try {
    // Auto-hors-ligne : un livreur "en ligne" sans position fraîche depuis > 10 min passe hors ligne.
    // Il reste AFFICHÉ sur les cartes avec sa dernière position, mais ne reçoit plus de dispatch
    // (téléphone verrouillé/fermé -> le navigateur ne peut plus envoyer la position).
    await run(`UPDATE users SET online=0 WHERE role='driver' AND online=1
      AND EXISTS (SELECT 1 FROM driver_locations dl WHERE dl.driver_id=users.id AND dl.updated_at < ?)`,
      [Date.now() - 10 * 60 * 1000]);
    const orders = await all(`${ORDER_WITH_JOINS} WHERE o.status='ready' AND o.driver_id IS NULL AND o.visibility='public' ORDER BY o.created_at ASC`);
    for (const o of orders) {
      if (o.store_lat == null || o.store_lng == null) continue;
      const drivers = await all(`
        SELECT u.id, u.name,
          dl.lat, dl.lng,
          (SELECT COUNT(*) FROM orders x WHERE x.driver_id=u.id AND x.status IN ('assigned','picked_up')) AS active_count,
          (SELECT COUNT(*) FROM orders x WHERE x.driver_id=u.id AND x.status='assigned') AS n_assigned,
          (SELECT COUNT(*) FROM orders x WHERE x.driver_id=u.id AND x.status='picked_up') AS n_picked
        FROM users u LEFT JOIN driver_locations dl ON dl.driver_id=u.id
        WHERE u.role='driver' AND u.store_id IS NULL AND u.status='active' AND u.online=1`);
      const eligible = drivers.filter((d) => d.lat != null && d.lng != null
        && d.active_count < 5
        && !(d.n_picked >= 1 && d.n_assigned >= 2));
      if (!eligible.length) continue;
      const storePos = { lat: o.store_lat, lng: o.store_lng };
      const clientPos = { lat: o.client_lat, lng: o.client_lng };
      const scored = await Promise.all(eligible.map(async (d) => {
        const [t1, t2] = await Promise.all([
          osrmDuration({ lat: d.lat, lng: d.lng }, storePos),
          clientPos.lat == null ? Promise.resolve(0) : osrmDuration(storePos, clientPos)
        ]);
        return { d, score: t1 + t2 };
      }));
      scored.sort((a, b) => a.score - b.score || a.d.active_count - b.d.active_count);
      const winner = scored[0].d;
      console.log(`📦 dispatch #${o.id} -> ${winner.name} (${Math.round(scored[0].score)}s parmi ${eligible.length} éligibles / ${drivers.length} en ligne)`);
      const r = await run(`UPDATE orders SET driver_id=?, status='assigned', acknowledged=0, updated_at=? WHERE id=? AND status='ready' AND driver_id IS NULL`,
        [winner.id, Date.now(), o.id]);
      if (r.rowCount === 0) continue; // pris entre-temps
      pushTo([winner.id], '🚨 Nouvelle livraison assignée', `Commande #${o.id} · ${o.store_name} — itinéraire mis à jour, appuyez sur OK`);
      pushTo([o.client_id], `Commande #${o.id}`, '🛵 Un livreur vous a été attribué automatiquement — il arrive !');
      if (o.kind === 'market' && o.seller_id) pushTo([o.seller_id], `Commande #${o.id}`, '🛵 Un livreur vient chercher votre article — préparez-le !');   // 🛍️ Phase 3
    }
  } catch (e) { console.error('dispatch:', e.message); }
  finally { dispatchBusy = false; }
}
setInterval(dispatchPublicOrders, 30000); // filet de securite

// ---------- LIVREURS BOUTIQUE (créés et gérés par le magasin) ----------
app.get('/api/merchant/drivers', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT id FROM stores WHERE owner_id=?', [req.user.id]);
  if (!store) return res.json({ drivers: [] });
  // Livreurs personnels de la boutique
  const drivers = await all(`SELECT u.id, u.name, u.email, u.phone, u.status, u.online, u.created_at,
    dl.lat, dl.lng, dl.bearing, dl.updated_at AS pos_at,
    (SELECT COUNT(*) FROM orders o WHERE o.driver_id=u.id AND o.status='delivered') AS deliveries
    FROM users u LEFT JOIN driver_locations dl ON dl.driver_id=u.id
    WHERE u.role='driver' AND u.store_id=? ORDER BY u.created_at DESC`, [store.id]);
  // Livreurs generaux : visibles UNIQUEMENT pendant une course pour cette boutique
  const generals = await all(`SELECT DISTINCT u.id, u.name, u.phone, u.online,
    dl.lat, dl.lng, dl.bearing, dl.updated_at AS pos_at,
    (SELECT COUNT(*) FROM orders o WHERE o.driver_id=u.id AND o.store_id=? AND o.status='delivered') AS deliveries
    FROM users u
    JOIN orders o ON o.driver_id=u.id AND o.store_id=? AND o.status IN ('assigned','picked_up')
    LEFT JOIN driver_locations dl ON dl.driver_id=u.id
    WHERE u.role='driver' AND u.store_id IS NULL AND u.status='active'`, [store.id, store.id]);
  // Livraisons actives de la boutique (pour afficher les TRAJETS)
  const actives = await all(`SELECT o.id, o.driver_id, o.status, o.address, o.client_lat, o.client_lng,
    c.name AS client_name, s.lat AS store_lat, s.lng AS store_lng
    FROM orders o JOIN users c ON c.id=o.client_id JOIN stores s ON s.id=o.store_id
    WHERE o.store_id=? AND o.status IN ('assigned','picked_up')`, [store.id]);
  const byDriver = {};
  actives.forEach((a) => { (byDriver[a.driver_id] = byDriver[a.driver_id] || []).push(a); });
  drivers.forEach((d) => { d.general = false; d.active = byDriver[d.id] || []; });
  generals.forEach((d) => { d.general = true; d.active = byDriver[d.id] || []; });
  res.json({ drivers: [...drivers, ...generals] });
}));

app.post('/api/merchant/drivers', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT id, name FROM stores WHERE owner_id=?', [req.user.id]);
  if (!store) return res.status(404).json({ error: 'Aucun magasin' });
  const { name, phone = '', password, email } = req.body;
  if (!name || !password || String(password).length < 5) return res.status(400).json({ error: 'Nom et mot de passe (min 5 caractères) requis' });
  let login = String(email || '').toLowerCase().trim();
  if (!login) {
    const digits = String(phone).replace(/\D/g, '') || String(Date.now()).slice(-6);
    login = `d${store.id}_${digits}@drivers.yallaliv`;
    while (await get('SELECT 1 FROM users WHERE email=?', [login])) login = `d${store.id}_${digits}${Math.floor(Math.random() * 90 + 10)}@drivers.yallaliv`;
  } else if (await get('SELECT 1 FROM users WHERE email=?', [login])) {
    return res.status(400).json({ error: 'Email déjà utilisé' });
  }
  const d = await get(`INSERT INTO users(name,email,phone,password,role,status,vehicle,online,store_id,created_at)
    VALUES(?,?,?,?,'driver','active','',0,?,?) RETURNING id, name, email, phone, status`,
    [String(name).trim(), login, String(phone), hashPassword(String(password)), store.id, Date.now()]);
  res.json({ driver: d });
}));

app.put('/api/merchant/drivers/:id/status', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT id FROM stores WHERE owner_id=?', [req.user.id]);
  const d = await get(`SELECT * FROM users WHERE id=? AND role='driver' AND store_id=?`, [req.params.id, store?.id]);
  if (!d) return res.status(404).json({ error: 'Livreur introuvable' });
  const status = req.body.status;
  if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  await run('UPDATE users SET status=? WHERE id=?', [status, d.id]);
  res.json({ ok: true });
}));

app.delete('/api/merchant/drivers/:id', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT id FROM stores WHERE owner_id=?', [req.user.id]);
  const d = await get(`SELECT * FROM users WHERE id=? AND role='driver' AND store_id=?`, [req.params.id, store?.id]);
  if (!d) return res.status(404).json({ error: 'Livreur introuvable' });
  const active = await get(`SELECT COUNT(*) AS c FROM orders WHERE driver_id=? AND status IN ('assigned','picked_up')`, [d.id]);
  if (active.c > 0) return res.status(400).json({ error: 'Livreur en course — attendez la fin de la livraison' });
  await run('DELETE FROM driver_locations WHERE driver_id=?', [d.id]);
  await run('DELETE FROM push_subscriptions WHERE user_id=?', [d.id]);
  await run('DELETE FROM users WHERE id=?', [d.id]);
  res.json({ ok: true });
}));

// ---------- DRIVER ----------
app.put('/api/driver/online', auth, requireRole('driver'), h(async (req, res) => {
  if (req.user.status !== 'active') return res.status(403).json({ error: 'Compte en attente de validation' });
  await run('UPDATE users SET online=? WHERE id=?', [req.body.online ? 1 : 0, req.user.id]);
  if (req.body.online && !req.user.store_id) dispatchPublicOrders(); // un general se connecte -> dispatch
  res.json({ ok: true, online: !!req.body.online });
}));

app.put('/api/driver/location', auth, requireRole('driver'), h(async (req, res) => {
  const lat = parseFloat(req.body.lat), lng = parseFloat(req.body.lng), bearing = parseFloat(req.body.bearing);
  const hasPos = !isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const hasBrg = !isNaN(bearing) && bearing >= 0 && bearing < 360;
  if (!hasPos && !hasBrg) return res.status(400).json({ error: 'Coordonnées invalides' });
  if (hasPos) {
    // position (+ cap éventuel) : upsert complet — un envoi SANS cap (service GPS natif)
    // ne touche PAS au cap déjà enregistré par le webview (boussole).
    await run(`INSERT INTO driver_locations(driver_id,lat,lng,bearing,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(driver_id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, updated_at=excluded.updated_at${hasBrg ? ', bearing=excluded.bearing' : ''}`,
      [req.user.id, lat, lng, hasBrg ? bearing : null, Date.now()]);
  } else {
    // 🧭 v2026.09.23.3 — CAP SEUL (APK : le service natif envoie la position, le webview
    // la boussole) : le magasin voit le bec du livreur pivoter, même arrêté sur place.
    await run('UPDATE driver_locations SET bearing=?, updated_at=? WHERE driver_id=?', [bearing, Date.now(), req.user.id]);
  }
  if (!req.user.store_id && Date.now() - lastLocDispatch > 20000) { lastLocDispatch = Date.now(); dispatchPublicOrders(); }
  res.json({ ok: true });
}));

// 📍 v2026.09.23.1 — Dernière position du livreur (lui-même) : l'APK la relit quand le GPS
// du webview reste bloqué (marqueur figé) — le service natif envoie ~1 position/s au PUT
// ci-dessus, la carte reste ainsi live sans toucher à l'APK.
app.get('/api/driver/location', auth, requireRole('driver'), h(async (req, res) => {
  const pos = await get('SELECT lat,lng,bearing,updated_at FROM driver_locations WHERE driver_id=?', [req.user.id]);
  res.json({ pos: pos || null });
}));

// 🔑 Sécurité PIN : le livreur ne voit jamais le code (il doit le demander au client)
const stripPin = (rows) => rows.map((r) => { const has = r.pin != null; delete r.pin; return { ...r, has_pin: has }; });

app.get('/api/driver/available', auth, requireRole('driver'), h(async (req, res) => {
  // Livreur boutique : livraisons PRIVEES de son magasin uniquement
  // Livreur general : livraisons PUBLIQUES de toutes les boutiques uniquement
  if (!req.user.store_id) return res.json({ orders: [], auto: true }); // attribution automatique pour les generaux
  let sql = `${ORDER_WITH_JOINS} WHERE o.status='ready' AND o.driver_id IS NULL`;
  const args = [];
  if (req.user.store_id) { sql += ' AND o.store_id=? AND o.visibility=?'; args.push(req.user.store_id, 'private'); }
  sql += ' ORDER BY o.created_at ASC';
  const orders = await all(sql, args);
  res.json({ orders: await withItems(stripPin(orders)) });
}));

app.get('/api/driver/mine', auth, requireRole('driver'), h(async (req, res) => {
  const orders = await all(`${ORDER_WITH_JOINS} WHERE o.driver_id=? ORDER BY o.updated_at DESC LIMIT 100`, [req.user.id]);
  res.json({ orders: await withItems(stripPin(orders)) });
}));

app.post('/api/driver/orders/:id/accept', auth, requireRole('driver'), h(async (req, res) => {
  if (req.user.status !== 'active') return res.status(403).json({ error: 'Compte non validé' });
  if (!req.user.store_id) return res.status(403).json({ error: 'Attribution automatique : les livraisons publiques vous sont assignées par la plateforme' });
  const target = await get('SELECT * FROM orders WHERE id=?', [req.params.id]);
  if (!target) return res.status(404).json({ error: 'Commande introuvable' });
  if (req.user.store_id && (target.store_id !== req.user.store_id || target.visibility !== 'private')) {
    return res.status(403).json({ error: "Cette livraison n'est pas publiée pour vous" });
  }
  if (!req.user.store_id && target.visibility !== 'public') {
    return res.status(403).json({ error: 'Cette livraison est réservée aux livreurs du magasin' });
  }
  const r = await run(`UPDATE orders SET driver_id=?, status='assigned', updated_at=? WHERE id=? AND status='ready' AND driver_id IS NULL`,
    [req.user.id, Date.now(), req.params.id]);
  if (r.rowCount === 0) return res.status(400).json({ error: "Cette livraison n'est plus disponible" });
  const o = await get('SELECT * FROM orders WHERE id=?', [req.params.id]);
  pushTo([o.client_id], `Commande #${o.id}`, `🛵 ${req.user.name} a pris votre livraison — il arrive !`);
  res.json({ ok: true });
}));

app.post('/api/driver/orders/:id/status', auth, requireRole('driver'), h(async (req, res) => {
  const o = await get('SELECT * FROM orders WHERE id=? AND driver_id=?', [req.params.id, req.user.id]);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  const next = req.body.status;
  const allowed = { assigned: ['picked_up'], picked_up: ['delivered'] };
  if (!allowed[o.status] || !allowed[o.status].includes(next)) return res.status(400).json({ error: 'Transition invalide' });
  if (next === 'delivered' && o.pin && String(req.body.pin || '').trim() !== o.pin) {
    return res.status(400).json({ error: 'Code PIN incorrect — demandez le code au client' });
  }
  const paid = next === 'delivered' && o.payment === 'cash' ? 1 : o.paid;
  await run('UPDATE orders SET status=?, paid=?, updated_at=? WHERE id=?', [next, paid, Date.now(), o.id]);
  if (next === 'picked_up') pushTo([o.client_id], `Commande #${o.id}`, '📦 Colis récupéré — en route vers vous 🛵');
  if (next === 'delivered') pushTo([o.client_id], `Commande #${o.id}`, o.kind === 'market' ? '🎉 Article livré — notez le vendeur ⭐' : '🎉 Livrée ! Bon appétit — notez votre commande ⭐');
  if (o.kind === 'market') {   // 🛍️ Phase 3 : le vendeur suit aussi
    if (next === 'picked_up') pushTo([o.seller_id], `Commande #${o.id}`, '📦 Votre article a été récupéré par le livreur');
    if (next === 'delivered') {
      pushTo([o.seller_id], `Commande #${o.id}`, '🎉 Article livré à l’acheteur ✓ — annonce marquée vendue');
      if (o.listing_id) await run('UPDATE listings SET available=0 WHERE id=?', [o.listing_id]);   // vendu
    }
  }
  if (!req.user.store_id) dispatchPublicOrders(); // un slot se libere -> redistribuer
  res.json({ ok: true });
}));

// ↩️ Colis refusé par le client (signalé par le livreur, motif optionnel)
app.post('/api/driver/orders/:id/refuse', auth, requireRole('driver'), h(async (req, res) => {
  const o = await get('SELECT * FROM orders WHERE id=? AND driver_id=?', [req.params.id, req.user.id]);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  if (!['assigned', 'picked_up'].includes(o.status)) return res.status(400).json({ error: 'Transition invalide' });
  const reason = String(req.body.reason || '').trim().slice(0, 300);
  await run(`UPDATE orders SET status='refused', refuse_reason=?, updated_at=? WHERE id=?`, [reason, Date.now(), o.id]);
  const store = o.store_id != null ? await get('SELECT * FROM stores WHERE id=?', [o.store_id]) : null;
  const backTo = o.kind === 'market' ? [o.seller_id] : [store?.owner_id].filter(Boolean);   // 🛍️ Phase 3
  pushTo(backTo, `↩️ Commande #${o.id} refusée par le client`,
    (reason ? 'Motif : ' + reason + ' · ' : '') + (o.kind === 'market' ? 'Le colis retourne chez le vendeur' : 'Le colis retourne au magasin ' + (store?.name || '')));
  pushTo([o.client_id], `Commande #${o.id}`, '↩️ Colis refusé à la livraison');
  if (!req.user.store_id) dispatchPublicOrders(); // un slot se libère
  res.json({ ok: true });
}));

app.post('/api/driver/orders/:id/ack', auth, requireRole('driver'), h(async (req, res) => {
  const r = await run(`UPDATE orders SET acknowledged=1 WHERE id=? AND driver_id=? AND status='assigned'`, [req.params.id, req.user.id]);
  res.json({ ok: r.rowCount > 0 });
}));

app.get('/api/driver/stats', auth, requireRole('driver'), h(async (req, res) => {
  const r = await get(`SELECT COUNT(*) AS deliveries, COALESCE(SUM(delivery_fee),0) AS earnings FROM orders WHERE driver_id=? AND status='delivered'`, [req.user.id]);
  const today = await get(`SELECT COUNT(*) AS c, COALESCE(SUM(delivery_fee),0) AS sum FROM orders WHERE driver_id=? AND status='delivered' AND updated_at > ?`, [req.user.id, new Date().setHours(0, 0, 0, 0)]);
  const rating = (await get('SELECT ROUND(AVG(driver_stars)::numeric,1)::float8 AS r FROM reviews WHERE driver_id=?', [req.user.id])).r;
  res.json({ ...r, today_deliveries: today.c, today_earnings: today.sum, rating });
}));

// ---------- TRACKING + AVIS ----------
app.get('/api/orders/:id/track', auth, requireRole('client', 'merchant', 'superadmin'), h(async (req, res) => {
  const o = await get(`${ORDER_WITH_JOINS} WHERE o.id=? AND o.client_id=?`, [req.params.id, req.user.id]);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  const pos = o.driver_id ? (await get('SELECT lat,lng,bearing,updated_at FROM driver_locations WHERE driver_id=?', [o.driver_id]) || null) : null;
  res.json({ order: o, driver_pos: pos });
}));

app.post('/api/orders/:id/review', auth, requireRole('client', 'merchant', 'superadmin'), h(async (req, res) => {
  const o = await get('SELECT * FROM orders WHERE id=? AND client_id=?', [req.params.id, req.user.id]);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  if (o.status !== 'delivered') return res.status(400).json({ error: 'Commande non livrée' });
  if (await get('SELECT 1 FROM reviews WHERE order_id=?', [o.id])) return res.status(400).json({ error: 'Commande déjà notée' });
  const ss = Math.min(5, Math.max(1, parseInt(req.body.store_stars) || 0));
  if (!ss) return res.status(400).json({ error: 'Note du magasin requise' });
  let ds = parseInt(req.body.driver_stars);
  if (!(ds >= 1 && ds <= 5)) ds = null;
  await run('INSERT INTO reviews(order_id,client_id,store_id,driver_id,store_stars,driver_stars,comment,created_at) VALUES(?,?,?,?,?,?,?,?)',
    [o.id, req.user.id, o.store_id, o.driver_id, ss, ds, String(req.body.comment || '').slice(0, 300), Date.now()]);
  const avg = (await get('SELECT AVG(store_stars) AS a FROM reviews WHERE store_id=?', [o.store_id])).a;
  await run('UPDATE stores SET rating=? WHERE id=?', [Math.round(avg * 100) / 100, o.store_id]);
  res.json({ ok: true });
}));

// ---------- PHOTO PRODUIT ----------
app.put('/api/merchant/products/:id/photo', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  const p = await get('SELECT * FROM products WHERE id=? AND store_id=?', [req.params.id, store?.id]);
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  const url = await savePhoto(req.body);
  if (!url) return res.status(400).json({ error: 'Image invalide (PNG/JPG/WebP) ou trop lourde' });
  if (p.photo?.startsWith('/api/photos/')) await dropPhoto(p.photo);
  const out = await get('UPDATE products SET photo=? WHERE id=? RETURNING *', [url, p.id]);
  res.json({ product: out });
}));

// ---------- GALERIE PRODUIT (photos supplémentaires) ----------
app.post('/api/merchant/products/:id/photos', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  const p = await get('SELECT * FROM products WHERE id=? AND store_id=?', [req.params.id, store?.id]);
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  const cnt = await get('SELECT COUNT(*) AS c FROM product_photos WHERE product_id=?', [p.id]);
  if (cnt.c >= 5) return res.status(400).json({ error: 'Maximum 5 photos par produit' });   // 🖼️ limite appliquée aussi côté serveur
  const url = await savePhoto(req.body);
  if (!url) return res.status(400).json({ error: 'Image invalide (PNG/JPG/WebP) ou trop lourde' });
  const ph = await get('INSERT INTO product_photos(product_id,photo,created_at) VALUES(?,?,?) RETURNING *', [p.id, url, Date.now()]);
  res.json({ photo: ph });
}));

app.delete('/api/merchant/products/:id/photos/:pid', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  const p = await get('SELECT * FROM products WHERE id=? AND store_id=?', [req.params.id, store?.id]);
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  const phRow = await get('SELECT photo FROM product_photos WHERE id=? AND product_id=?', [req.params.pid, p.id]);
  if (phRow?.photo?.startsWith('/api/photos/')) await dropPhoto(phRow.photo);
  await run('DELETE FROM product_photos WHERE id=? AND product_id=?', [req.params.pid, p.id]);
  res.json({ ok: true });
}));

// ---------- CHAT ----------
async function orderParticipant(user, o) {
  if (user.role === 'superadmin') return true;
  if (user.role === 'client') return o.client_id === user.id;
  if (user.role === 'driver') return o.driver_id === user.id;
  if (user.role === 'merchant') {
    const store = await get('SELECT owner_id FROM stores WHERE id=?', [o.store_id]);
    return store && store.owner_id === user.id;
  }
  return false;
}
app.get('/api/orders/:id/messages', auth, h(async (req, res) => {
  const o = await get('SELECT * FROM orders WHERE id=?', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  if (!(await orderParticipant(req.user, o))) return res.status(403).json({ error: 'Accès refusé' });
  const messages = await all(`SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.order_id=? ORDER BY m.id ASC LIMIT 200`, [o.id]);
  res.json({ messages });
}));
app.post('/api/orders/:id/messages', auth, h(async (req, res) => {
  const o = await get('SELECT * FROM orders WHERE id=?', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  if (!(await orderParticipant(req.user, o))) return res.status(403).json({ error: 'Accès refusé' });
  const text = String(req.body.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Message vide' });
  const m = await get('INSERT INTO messages(order_id,sender_id,sender_role,text,created_at) VALUES(?,?,?,?,?) RETURNING id',
    [o.id, req.user.id, req.user.role, text, Date.now()]);
  const store = await get('SELECT owner_id FROM stores WHERE id=?', [o.store_id]);
  const targets = [o.client_id, o.driver_id, store ? store.owner_id : null].filter((id) => id && id !== req.user.id);
  pushTo(targets, `💬 Commande #${o.id}`, `${req.user.name} : ${text.slice(0, 80)}`);
  const message = await get('SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?', [m.id]);
  res.json({ message });
}));

// ---------- CODES PROMO ----------
app.post('/api/promos/validate', auth, requireRole('client', 'merchant', 'superadmin'), h(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const subtotal = parseFloat(req.body.subtotal) || 0;
  const promo = await get('SELECT * FROM promos WHERE code=? AND active=1', [code]);
  if (!promo) return res.status(400).json({ error: 'Code invalide' });
  if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) return res.status(400).json({ error: 'Code épuisé' });
  if (subtotal < promo.min_order) return res.status(400).json({ error: `Minimum ${promo.min_order} requis` });
  const discount = promo.type === 'percent' ? round2(subtotal * promo.value / 100) : round2(Math.min(promo.value, subtotal));
  res.json({ code: promo.code, type: promo.type, value: promo.value, discount });
}));

app.get('/api/admin/promos', auth, requireRole('superadmin'), h(async (req, res) => {
  res.json({ promos: await all('SELECT * FROM promos ORDER BY created_at DESC') });
}));
app.post('/api/admin/promos', auth, requireRole('superadmin'), h(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const type = req.body.type === 'fixed' ? 'fixed' : 'percent';
  const value = round2(parseFloat(req.body.value) || 0);
  if (code.length < 3) return res.status(400).json({ error: 'Code trop court (min 3)' });
  if (value <= 0) return res.status(400).json({ error: 'Valeur invalide' });
  if (await get('SELECT 1 FROM promos WHERE code=?', [code])) return res.status(400).json({ error: 'Code déjà utilisé' });
  const min_order = Math.max(0, parseFloat(req.body.min_order) || 0);
  const max_uses = Math.max(0, parseInt(req.body.max_uses) || 0);
  const p = await get('INSERT INTO promos(code,type,value,min_order,max_uses,active,created_at) VALUES(?,?,?,?,?,1,?) RETURNING *',
    [code, type, value, min_order, max_uses, Date.now()]);
  res.json({ promo: p });
}));
app.put('/api/admin/promos/:id', auth, requireRole('superadmin'), h(async (req, res) => {
  const p = await get('SELECT * FROM promos WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Code introuvable' });
  if (req.body.active !== undefined) await run('UPDATE promos SET active=? WHERE id=?', [req.body.active ? 1 : 0, p.id]);
  res.json({ ok: true });
}));
app.delete('/api/admin/promos/:id', auth, requireRole('superadmin'), h(async (req, res) => {
  await run('DELETE FROM promos WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- STATS GRAPHIQUES ----------
async function dailySeries(where, args = [], days = 14) {
  const out = [];
  const dayMs = 86400000;
  const startToday = new Date().setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const s = startToday - i * dayMs, e = s + dayMs;
    const r = await get(`SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS orders FROM orders o WHERE created_at>=? AND created_at<? AND status NOT IN ('rejected','cancelled') ${where}`, [s, e, ...args]);
    const c = await get(`SELECT COALESCE(SUM(commission),0) AS commission FROM orders o WHERE created_at>=? AND created_at<? AND status='delivered' ${where}`, [s, e, ...args]);
    const d = new Date(s);
    out.push({ label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, revenue: round2(r.revenue), orders: r.orders, commission: round2(c.commission) });
  }
  return out;
}
app.get('/api/merchant/sales-daily', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT id FROM stores WHERE owner_id=?', [req.user.id]);
  if (!store) return res.json({ series: [] });
  res.json({ series: await dailySeries('AND o.store_id=?', [store.id]) });
}));
app.get('/api/merchant/top-products', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT id FROM stores WHERE owner_id=?', [req.user.id]);
  if (!store) return res.json({ top: [] });
  const top = await all(`SELECT p.name, p.emoji, SUM(oi.qty) AS qty, ROUND(SUM(oi.qty*oi.price)::numeric,2)::float8 AS revenue
    FROM order_items oi JOIN products p ON p.id=oi.product_id JOIN orders o ON o.id=oi.order_id
    WHERE o.store_id=? AND o.status NOT IN ('rejected','cancelled')
    GROUP BY p.id, p.name, p.emoji ORDER BY qty DESC LIMIT 5`, [store.id]);
  res.json({ top });
}));
app.get('/api/admin/sales-daily', auth, requireRole('superadmin'), h(async (req, res) => {
  res.json({ series: await dailySeries('') });
}));

// ---------- EXPORTS CSV ----------
const STATUS_FR = { pending: 'En attente', accepted: 'Acceptée', preparing: 'En préparation', ready: 'Prête', assigned: 'Livreur en route', picked_up: 'Colis récupéré', delivered: 'Livrée', rejected: 'Refusée', cancelled: 'Annulée' };
function toCsv(rows, withStore = false) {
  const cols = ['id', 'date', 'client', 'telephone', 'adresse', 'articles', 'sous_total', 'livraison', 'commission', 'total', 'paiement', 'statut'];
  if (withStore) cols.splice(2, 0, 'magasin', 'livreur');
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = ['\uFEFF' + cols.join(';')];
  for (const o of rows) {
    const d = {
      id: o.id, date: new Date(o.created_at).toLocaleString('fr-FR'), client: o.client_name, telephone: o.phone, adresse: o.address,
      articles: o.items.map((i) => `${i.name} x${i.qty}`).join(', '),
      sous_total: o.subtotal, livraison: o.delivery_fee, commission: o.commission, total: o.total,
      paiement: o.payment === 'card' ? 'Carte' : 'Cash', statut: STATUS_FR[o.status] || o.status
    };
    if (withStore) { d.magasin = o.store_name; d.livreur = o.driver_name || ''; }
    lines.push(cols.map((c) => esc(d[c])).join(';'));
  }
  return lines.join('\r\n');
}
app.get('/api/merchant/export', auth, requireRole('merchant'), h(async (req, res) => {
  const store = await get('SELECT * FROM stores WHERE owner_id=?', [req.user.id]);
  if (!store) return res.status(404).json({ error: 'Aucun magasin' });
  const orders = await withItems(await all(`${ORDER_WITH_JOINS} WHERE o.store_id=? ORDER BY o.created_at DESC`, [store.id]));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="commandes.csv"');
  res.send(toCsv(orders));
}));
app.get('/api/admin/export', auth, requireRole('superadmin'), h(async (req, res) => {
  const orders = await withItems(await all(`${ORDER_WITH_JOINS} ORDER BY o.created_at DESC LIMIT 2000`));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="ventes_plateforme.csv"');
  res.send(toCsv(orders, true));
}));

// ---------- SUPER ADMIN ----------
app.get('/api/admin/stats', auth, requireRole('superadmin'), h(async (req, res) => {
  const one = (sql, ...a) => get(sql, a);
  const usersByRole = {};
  for (const r of await all('SELECT role, COUNT(*) AS c FROM users GROUP BY role')) usersByRole[r.role] = r.c;
  const storesByStatus = {};
  for (const r of await all('SELECT status, COUNT(*) AS c FROM stores GROUP BY status')) storesByStatus[r.status] = r.c;
  const ordersByStatus = {};
  for (const r of await all('SELECT status, COUNT(*) AS c FROM orders GROUP BY status')) ordersByStatus[r.status] = r.c;
  res.json({
    users_total: (await one('SELECT COUNT(*) AS c FROM users')).c,
    usersByRole, storesByStatus, ordersByStatus,
    orders_total: (await one('SELECT COUNT(*) AS c FROM orders')).c,
    orders_today: (await one('SELECT COUNT(*) AS c FROM orders WHERE created_at > ?', new Date().setHours(0, 0, 0, 0))).c,
    gmv: (await one(`SELECT COALESCE(SUM(total),0) AS v FROM orders WHERE status='delivered'`)).v,
    commission: (await one(`SELECT COALESCE(SUM(commission),0) AS v FROM orders WHERE status='delivered'`)).v,
    driver_payouts: (await one(`SELECT COALESCE(SUM(delivery_fee),0) AS v FROM orders WHERE status='delivered'`)).v,
    recent_orders: await withItems(await all(`${ORDER_WITH_JOINS} ORDER BY o.created_at DESC LIMIT 8`))
  });
}));

// ---------- LIVREURS GENERAUX (créés et gérés par le Super Admin uniquement) ----------
app.get('/api/admin/drivers', auth, requireRole('superadmin'), h(async (req, res) => {
  const drivers = await all(`SELECT u.id,u.name,u.email,u.phone,u.vehicle,u.status,u.online,u.created_at,
    dl.lat, dl.lng, dl.bearing, dl.updated_at AS pos_at,
    (SELECT COUNT(*) FROM orders o WHERE o.driver_id=u.id AND o.status='delivered') AS deliveries,
    (SELECT ROUND(AVG(r.driver_stars)::numeric,1)::float8 FROM reviews r WHERE r.driver_id=u.id) AS rating
    FROM users u LEFT JOIN driver_locations dl ON dl.driver_id=u.id
    WHERE u.role='driver' AND u.store_id IS NULL ORDER BY u.created_at DESC`);
  res.json({ drivers });
}));

app.post('/api/admin/drivers', auth, requireRole('superadmin'), h(async (req, res) => {
  const { name, email, phone = '', vehicle = '', password } = req.body;
  if (!name || !password || String(password).length < 5) return res.status(400).json({ error: 'Nom et mot de passe (min 5 caractères) requis' });
  const login = String(email || '').toLowerCase().trim();
  if (!login || !login.includes('@')) return res.status(400).json({ error: 'Email valide requis' });
  if (await get('SELECT 1 FROM users WHERE email=?', [login])) return res.status(400).json({ error: 'Email déjà utilisé' });
  const d = await get(`INSERT INTO users(name,email,phone,password,role,status,vehicle,online,store_id,created_at)
    VALUES(?,?,?,?,'driver','active',?,0,NULL,?) RETURNING id, name, email, phone, vehicle, status`,
    [String(name).trim(), login, String(phone), hashPassword(String(password)), String(vehicle), Date.now()]);
  res.json({ driver: d });
}));

app.put('/api/admin/drivers/:id/status', auth, requireRole('superadmin'), h(async (req, res) => {
  const d = await get(`SELECT * FROM users WHERE id=? AND role='driver' AND store_id IS NULL`, [req.params.id]);
  if (!d) return res.status(404).json({ error: 'Livreur introuvable' });
  const status = req.body.status;
  if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  await run('UPDATE users SET status=? WHERE id=?', [status, d.id]);
  res.json({ ok: true });
}));

app.delete('/api/admin/drivers/:id', auth, requireRole('superadmin'), h(async (req, res) => {
  const d = await get(`SELECT * FROM users WHERE id=? AND role='driver' AND store_id IS NULL`, [req.params.id]);
  if (!d) return res.status(404).json({ error: 'Livreur introuvable' });
  const active = await get(`SELECT COUNT(*) AS c FROM orders WHERE driver_id=? AND status IN ('assigned','picked_up')`, [d.id]);
  if (active.c > 0) return res.status(400).json({ error: 'Livreur en course — attendez la fin de la livraison' });
  await run('DELETE FROM driver_locations WHERE driver_id=?', [d.id]);
  await run('DELETE FROM push_subscriptions WHERE user_id=?', [d.id]);
  await run('DELETE FROM users WHERE id=?', [d.id]);
  res.json({ ok: true });
}));

// Demandes de reinitialisation en cours (codes visibles par le Super Admin uniquement)
app.get('/api/admin/resets', auth, requireRole('superadmin'), h(async (req, res) => {
  const resets = await all('SELECT id,email,code,expires_at,created_at FROM password_resets WHERE expires_at > ? ORDER BY created_at DESC', [Date.now()]);
  res.json({ resets });
}));

// Le Super Admin definit directement un nouveau mot de passe pour un utilisateur
app.post('/api/admin/users/:id/password', auth, requireRole('superadmin'), h(async (req, res) => {
  const u = await get('SELECT * FROM users WHERE id=?', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const p = String(req.body.password || '');
  if (p.length < 5) return res.status(400).json({ error: 'Mot de passe trop court (min 5)' });
  await run('UPDATE users SET password=? WHERE id=?', [hashPassword(p), u.id]);
  res.json({ ok: true });
}));

app.get('/api/admin/users', auth, requireRole('superadmin'), h(async (req, res) => {
  const { role } = req.query;
  let sql = `SELECT id,name,email,phone,role,status,vehicle,online,created_at,store_id,
    (SELECT s.name FROM stores s WHERE s.id=users.store_id) AS store_name,
    (SELECT ROUND(AVG(r.driver_stars)::numeric,1)::float8 FROM reviews r WHERE r.driver_id=users.id) AS rating
    FROM users`;
  const args = [];
  if (role && role !== 'all') { sql += ' WHERE role=?'; args.push(role); }
  sql += ' ORDER BY created_at DESC';
  res.json({ users: await all(sql, args) });
}));

app.post('/api/admin/users/:id/status', auth, requireRole('superadmin'), h(async (req, res) => {
  const u = await get('SELECT * FROM users WHERE id=?', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (u.role === 'superadmin') return res.status(400).json({ error: 'Impossible de modifier un super admin' });
  const status = req.body.status;
  if (!['active', 'pending', 'suspended'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  await run('UPDATE users SET status=? WHERE id=?', [status, u.id]);
  res.json({ ok: true });
}));

app.get('/api/admin/stores', auth, requireRole('superadmin'), h(async (req, res) => {
  const stores = await all(`SELECT s.*, u.name AS owner_name, u.email AS owner_email, u.status AS owner_status,
    (SELECT COUNT(*) FROM products p WHERE p.store_id=s.id) AS product_count
    FROM stores s JOIN users u ON u.id=s.owner_id ORDER BY (s.status='pending') DESC, s.created_at DESC`);
  res.json({ stores });
}));

app.post('/api/admin/stores/:id/status', auth, requireRole('superadmin'), h(async (req, res) => {
  const s = await get('SELECT * FROM stores WHERE id=?', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Magasin introuvable' });
  const status = req.body.status;
  if (!['pending', 'approved', 'suspended'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  await run('UPDATE stores SET status=? WHERE id=?', [status, s.id]);
  res.json({ ok: true });
}));

// Fiche complete d'un magasin (Super Admin)
app.get('/api/admin/stores/:id/details', auth, requireRole('superadmin'), h(async (req, res) => {
  const s = await get('SELECT * FROM stores WHERE id=?', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Magasin introuvable' });
  const owner = await get('SELECT id,name,email,phone,status,created_at FROM users WHERE id=?', [s.owner_id]);
  const stats = await get(`SELECT COUNT(*) AS orders_total,
    COUNT(*) FILTER (WHERE status='delivered') AS orders_delivered,
    COUNT(*) FILTER (WHERE status IN ('pending','accepted','preparing','ready','assigned','picked_up')) AS orders_active,
    COALESCE(SUM(total) FILTER (WHERE status='delivered'),0)::float8 AS revenue,
    COALESCE(SUM(commission) FILTER (WHERE status='delivered'),0)::float8 AS commission_earned
    FROM orders WHERE store_id=?`, [s.id]);
  const products = await all('SELECT id,name,category,price,available,emoji,photo FROM products WHERE store_id=? ORDER BY category, name', [s.id]);
  const drivers = await all(`SELECT u.id,u.name,u.phone,u.online,u.status,
    (SELECT COUNT(*) FROM orders o WHERE o.driver_id=u.id AND o.status='delivered') AS deliveries
    FROM users u WHERE u.role='driver' AND u.store_id=?`, [s.id]);
  const orders = await all(`SELECT o.id,o.status,o.total,o.created_at,c.name AS client_name
    FROM orders o JOIN users c ON c.id=o.client_id WHERE o.store_id=? ORDER BY o.id DESC LIMIT 10`, [s.id]);
  res.json({ store: s, owner, stats, products, drivers, orders });
}));

app.post('/api/admin/stores/:id/reject', auth, requireRole('superadmin'), h(async (req, res) => {
  const s = await get('SELECT * FROM stores WHERE id=?', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Magasin introuvable' });
  if (s.status !== 'pending') return res.status(400).json({ error: 'Seul un magasin en attente peut être refusé' });
  const ord = await get('SELECT COUNT(*) AS c FROM orders WHERE store_id=?', [s.id]);
  if (ord.c > 0) { // activite deja existante -> on suspend au lieu de supprimer
    await run('UPDATE stores SET status=? WHERE id=?', ['suspended', s.id]);
    await run('UPDATE users SET status=? WHERE id=?', ['suspended', s.owner_id]);
    return res.json({ ok: true, mode: 'suspended' });
  }
  // magasin neuf : suppression propre (photos, produits, store, compte proprietaire)
  await run('DELETE FROM product_photos WHERE product_id IN (SELECT id FROM products WHERE store_id=?)', [s.id]);
  await run('DELETE FROM products WHERE store_id=?', [s.id]);
  await run('DELETE FROM push_subscriptions WHERE user_id=?', [s.owner_id]);
  await run('DELETE FROM stores WHERE id=?', [s.id]);
  await run('DELETE FROM users WHERE id=? AND role=?', [s.owner_id, 'merchant']);
  res.json({ ok: true, mode: 'deleted' });
}));

app.get('/api/admin/orders', auth, requireRole('superadmin'), h(async (req, res) => {
  const orders = await all(`${ORDER_WITH_JOINS} ORDER BY o.created_at DESC LIMIT 200`);
  res.json({ orders: await withItems(orders) });
}));

app.get('/api/admin/settings', auth, requireRole('superadmin'), h(async (req, res) => {
  res.json({ app_name: await getSetting('app_name', 'YallaLiv'), commission_rate: await getSetting('commission_rate', '10'), currency: await getSetting('currency', 'EGP') });
}));

app.put('/api/admin/settings', auth, requireRole('superadmin'), h(async (req, res) => {
  const { app_name, commission_rate, currency } = req.body;
  if (app_name) await setSetting('app_name', String(app_name).trim().slice(0, 30));
  if (commission_rate !== undefined) await setSetting('commission_rate', String(Math.max(0, Math.min(50, parseFloat(commission_rate) || 0))));
  if (currency) await setSetting('currency', String(currency).trim().toUpperCase().slice(0, 5));
  res.json({ ok: true });
}));

// ---------- Static (production build) ----------
const dist = [
  path.join(__dirname, '..', 'web', 'dist'),        // local + Docker (comme avant)
  path.join(__dirname, '..', '..', 'web', 'dist'),  // bundle Vercel
  path.join(__dirname, 'web', 'dist'),              // bundle Vercel (variante)
].find((p) => fs.existsSync(p));
if (dist) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|uploads).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get(/^\/(?!api|uploads).+/, (req, res) => res.redirect('/')); // serverless sans dist : retour accueil
}

export default app; // Vercel : importé par api/index.js (export au niveau module)

// ---------- Démarrage ----------
initDb()
  .then(initVapid)
  .then(() => {
    // Corps trop volumineux ou erreur inattendue -> reponse JSON propre
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Requête trop volumineuse (max 8 Mo)' });
  console.error('Erreur serveur:', err?.message);
  res.status(500).json({ error: 'Erreur serveur' });
});

if (!process.env.VERCEL) app.listen(PORT, '0.0.0.0', () => console.log(`🚀 API YallaLiv (PostgreSQL) sur le port ${PORT}`)); // Vercel : pas d'écoute, l'app est exportée
  })
  .catch((err) => {
    console.error('❌ Impossible d\'initialiser la base :', err.message);
    console.error('   → Vérifie que PostgreSQL est démarré et DATABASE_URL correct dans server/.env');
    process.exit(1);
  });
