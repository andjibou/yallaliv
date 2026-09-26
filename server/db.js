import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- .env (sans dépendance) ----------
if (fs.existsSync(path.join(__dirname, '.env'))) {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][\w.]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

// ---------- Connexion ----------
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/yallaliv';

// bigint (epoch ms, COUNT) -> Number JS
pg.types.setTypeParser(20, (v) => parseInt(v, 10));
// numeric -> Number (moyennes, arrondis)
pg.types.setTypeParser(1700, (v) => parseFloat(v));

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });

// Placeholders style ? -> $1..$n (garder l'écriture SQLite-like)
function expand(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
export async function q(sql, args = []) {
  return pool.query(expand(sql), args);
}
export async function get(sql, args = []) {
  const r = await pool.query(expand(sql), args);
  return r.rows[0];
}
export async function all(sql, args = []) {
  const r = await pool.query(expand(sql), args);
  return r.rows;
}
export async function run(sql, args = []) {
  return pool.query(expand(sql), args); // .rowCount / .rows
}

// ---------- Helpers ----------
export function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}
export async function getSetting(key, fallback) {
  const row = await get('SELECT value FROM settings WHERE key=?', [key]);
  return row ? row.value : fallback;
}
export async function setSetting(key, value) {
  await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, String(value)]);
}

// Coordonnées de référence (centre d'Alexandrie)
export const CITY = { lat: 31.2001, lng: 29.9187 };
const KNOWN_COORDS = {
  'Restaurant Al Nil': [31.1996, 29.8987],
  'Supermarché Alex': [31.2100, 29.9230],
  'Pharmacie Santé+': [31.2030, 29.9100]
};
export function jitter(seed, amt = 0.004) {
  const r = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  return [(r(seed) - 0.5) * 2 * amt, (r(seed + 99) - 0.5) * 2 * amt];
}

// ---------- Schéma ----------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT DEFAULT '',
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  vehicle TEXT DEFAULT '',
  online INTEGER NOT NULL DEFAULT 0,
  store_id INTEGER,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  emoji TEXT DEFAULT '🏪',
  photo TEXT,
  color TEXT DEFAULT '#0e9f6e',
  delivery_fee REAL NOT NULL DEFAULT 10,
  min_order REAL NOT NULL DEFAULT 0,
  is_open INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  rating REAL NOT NULL DEFAULT 4.5,
  lat REAL,
  lng REAL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Général',
  description TEXT DEFAULT '',
  price REAL NOT NULL,
  emoji TEXT DEFAULT '📦',
  available INTEGER NOT NULL DEFAULT 1,
  photo TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS product_photos (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  photo TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL,
  store_id INTEGER NOT NULL,
  driver_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  payment TEXT NOT NULL DEFAULT 'cash',
  paid INTEGER NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL,
  delivery_fee REAL NOT NULL,
  commission REAL NOT NULL,
  total REAL NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  note TEXT DEFAULT '',
  client_lat REAL,
  client_lng REAL,
  promo_code TEXT NOT NULL DEFAULT '',
  discount REAL NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public',
  acknowledged INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '📦',
  price REAL NOT NULL,
  qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE,
  client_id INTEGER NOT NULL,
  store_id INTEGER NOT NULL,
  driver_id INTEGER,
  store_stars INTEGER NOT NULL,
  driver_stars INTEGER,
  comment TEXT DEFAULT '',
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id INTEGER PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  sender_role TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS promos (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  value REAL NOT NULL,
  min_order REAL NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_messages_order ON messages(order_id);

-- 🛍️ v2026.09.24.1 — MARCHÉ (style OLX) : articles publiés par tout utilisateur connecté
CREATE TABLE IF NOT EXISTS listings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT,
  price REAL NOT NULL,
  phone TEXT,
  photo TEXT,
  available INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listings_avail ON listings(available, created_at);

-- 🔔 v2026.09.24.1 — Centre de notifications : chaque push alimente le fil in-app
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  url TEXT DEFAULT '/',
  read INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id, read);

-- ❤️ v2026.09.26.1 — Marché Phase 1 : favoris des annonces
CREATE TABLE IF NOT EXISTS listing_favorites (
  user_id INTEGER NOT NULL,
  listing_id INTEGER NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, listing_id)
);

-- 💬 v2026.09.26.2 — Marché Phase 2 : chat acheteur ↔ vendeur
CREATE TABLE IF NOT EXISTS market_chats (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  seller_id INTEGER NOT NULL,
  buyer_read_at BIGINT NOT NULL DEFAULT 0,
  seller_read_at BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mchats_buyer ON market_chats(buyer_id);
CREATE INDEX IF NOT EXISTS idx_mchats_seller ON market_chats(seller_id);
CREATE TABLE IF NOT EXISTS market_messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
-- ⭐ avis vendeurs (uniquement après avoir discuté)
CREATE TABLE IF NOT EXISTS seller_reviews (
  id SERIAL PRIMARY KEY,
  seller_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  comment TEXT,
  created_at BIGINT NOT NULL,
  UNIQUE (seller_id, buyer_id)
);
-- 🔔 recherches sauvegardées -> alertes à chaque nouvelle annonce
CREATE TABLE IF NOT EXISTS saved_searches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  q TEXT,
  cat TEXT,
  sub TEXT,
  price_min REAL,
  price_max REAL,
  created_at BIGINT NOT NULL
);
-- 🚨 signalements d'annonces (modération superadmin)
CREATE TABLE IF NOT EXISTS listing_reports (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  created_at BIGINT NOT NULL,
  handled INTEGER NOT NULL DEFAULT 0
);
`;

// ---------- Initialisation (appelée au démarrage) ----------
export async function initDb() {
  await pool.query(SCHEMA);
  // Migrations sûres (bases existantes) — ex. store_id pour les livreurs boutique
  await run('ALTER TABLE users ADD COLUMN store_id INTEGER').catch(() => {});
  await run("ALTER TABLE orders ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'").catch(() => {});
  await run('ALTER TABLE orders ADD COLUMN acknowledged INTEGER NOT NULL DEFAULT 0').catch(() => {});
  await run('ALTER TABLE orders ADD COLUMN pin TEXT').catch(() => {});   // 🔑 preuve de remise (P0.4)
  await run('ALTER TABLE orders ADD COLUMN refuse_reason TEXT').catch(() => {});   // ↩️ motif de refus client
  await run('ALTER TABLE products ADD COLUMN qty INTEGER').catch(() => {});              // 📦 quantité visible par le client (NULL = illimité)
  await run('ALTER TABLE products ADD COLUMN via_excel INTEGER NOT NULL DEFAULT 0').catch(() => {});   // 📥 importé par Excel (remplaçable par un nouvel import)
  await run('ALTER TABLE driver_locations ADD COLUMN bearing REAL').catch(() => {});    // 🧭 v2026.09.23.3 : cap du livreur — le magasin voit le bec pivoter (même sur place)
  await run("ALTER TABLE push_subscriptions ADD COLUMN kind TEXT NOT NULL DEFAULT 'web'").catch(() => {});   // 🔔 'web' (VAPID) ou 'fcm' (APK)
  await run('ALTER TABLE push_subscriptions ADD COLUMN fcm_token TEXT').catch(() => {});
  await run('ALTER TABLE stores ADD COLUMN photo TEXT').catch(() => {});
  // 🛵 v2026.09.26.3 — Marché Phase 3 : livraison des articles par YallaLiv
  await run('ALTER TABLE orders ALTER COLUMN store_id DROP NOT NULL').catch(() => {});   // commande marché = sans magasin
  await run("ALTER TABLE orders ADD COLUMN kind TEXT NOT NULL DEFAULT 'store'").catch(() => {});   // 'store' | 'market'
  await run('ALTER TABLE orders ADD COLUMN listing_id INTEGER').catch(() => {});
  await run('ALTER TABLE orders ADD COLUMN seller_id INTEGER').catch(() => {});
  await run('ALTER TABLE orders ADD COLUMN pickup_address TEXT').catch(() => {});   // chez le vendeur
  await run('ALTER TABLE orders ADD COLUMN pickup_lat REAL').catch(() => {});
  await run('ALTER TABLE orders ADD COLUMN pickup_lng REAL').catch(() => {});
  await run('ALTER TABLE users ALTER COLUMN email DROP NOT NULL').catch(() => {});   // comptes par telephone (email NULL)
  // 🛍️ v2026.09.26.1 — Marché Phase 1 : sous-catégories, état, attributs, zone, vues, renouvellement, multi-photos
  await run('ALTER TABLE listings ADD COLUMN subcategory TEXT').catch(() => {});
  await run('ALTER TABLE listings ADD COLUMN condition TEXT').catch(() => {});
  await run('ALTER TABLE listings ADD COLUMN brand TEXT').catch(() => {});
  await run('ALTER TABLE listings ADD COLUMN size TEXT').catch(() => {});
  await run('ALTER TABLE listings ADD COLUMN area TEXT').catch(() => {});
  await run('ALTER TABLE listings ADD COLUMN lat REAL').catch(() => {});
  await run('ALTER TABLE listings ADD COLUMN lng REAL').catch(() => {});
  await run('ALTER TABLE listings ADD COLUMN views INTEGER NOT NULL DEFAULT 0').catch(() => {});
  await run('ALTER TABLE listings ADD COLUMN renewed_at BIGINT').catch(() => {});
  await run('ALTER TABLE listings ADD COLUMN photos TEXT').catch(() => {});   // JSON : jusqu'à 5 photos data-URL
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users (REPLACE(phone, ' ', '')) WHERE phone <> ''")
    .catch((e) => console.warn('⚠️ Index téléphone unique non créé (doublons existants ?):', e.message));
  await run(`CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL
  )`).catch(() => {});
  await run(`CREATE TABLE IF NOT EXISTS photos (
    id SERIAL PRIMARY KEY,
    thumb BYTEA NOT NULL,
    display BYTEA NOT NULL,
    created_at BIGINT NOT NULL
  )`).catch(() => {});
  await run(`CREATE TABLE IF NOT EXISTS email_codes (
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL
  )`).catch(() => {});

  // Seed de démonstration (première exécution, en développement uniquement)
  const { c } = await get('SELECT COUNT(*) AS c FROM users');
  if (c === 0 && process.env.NODE_ENV === 'production') {
    // PRODUCTION : jamais de données démo. Le Super Admin est créé via ADMIN_EMAIL / ADMIN_PASSWORD.
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      await run('INSERT INTO users(name,email,phone,password,role,status,vehicle,online,created_at) VALUES(?,?,?,?,?,?,?,0,?)',
        ['Super Admin', process.env.ADMIN_EMAIL.toLowerCase().trim(), '+20 100 000 0000', hashPassword(process.env.ADMIN_PASSWORD), 'superadmin', 'active', '', Date.now()]);
      console.log('👑 Super Admin créé : ' + process.env.ADMIN_EMAIL);
    } else {
      console.warn('⚠️  BASE VIDE en production : définissez ADMIN_EMAIL et ADMIN_PASSWORD dans les variables d\'environnement, puis redémarrez.');
    }
    return;
  }
  if (c === 0) {
    console.log('🌱 Première exécution : création des données de démonstration...');
    const now = Date.now();
    const insUser = 'INSERT INTO users(name,email,phone,password,role,status,vehicle,online,created_at) VALUES(?,?,?,?,?,?,?,0,?) RETURNING id';
    const superadmin = (await get(insUser, ['Super Admin', 'admin@yallaliv.com', '+20 100 000 0000', hashPassword('admin123'), 'superadmin', 'active', '', now])).id;
    const client = (await get(insUser, ['Karim Client', 'client@demo.com', '+20 100 111 2222', hashPassword('demo123'), 'client', 'active', '', now])).id;
    const client2 = (await get(insUser, ['Sara Demo', 'sara@demo.com', '+20 100 333 4444', hashPassword('demo123'), 'client', 'active', '', now])).id;

    const insStore = `INSERT INTO stores(owner_id,name,type,description,phone,address,emoji,color,delivery_fee,min_order,is_open,status,rating,lat,lng,created_at)
                      VALUES(?,?,?,?,?,?,?,?,?,?,1,'approved',?,?,?,?) RETURNING id`;
    const rOwner = (await get(insUser, ['Ahmed Resto', 'resto@demo.com', '+20 122 111 1111', hashPassword('demo123'), 'merchant', 'active', '', now])).id;
    const mOwner = (await get(insUser, ['Mona Marché', 'marche@demo.com', '+20 122 222 2222', hashPassword('demo123'), 'merchant', 'active', '', now])).id;
    const pOwner = (await get(insUser, ['Dr. Pharma', 'pharma@demo.com', '+20 122 333 3333', hashPassword('demo123'), 'merchant', 'active', '', now])).id;
    const [rLat, rLng] = KNOWN_COORDS['Restaurant Al Nil'];
    const [mLat, mLng] = KNOWN_COORDS['Supermarché Alex'];
    const [pLat, pLng] = KNOWN_COORDS['Pharmacie Santé+'];
    const restoS = (await get(insStore, [rOwner, 'Restaurant Al Nil', 'restaurant', 'Cuisine égyptienne et orientale, plats faits maison', '+20 122 111 1111', '12 rue Saad Zaghloul, Alexandria', '🍽️', '#ef6c4d', 15, 30, 4.7, rLat, rLng, now])).id;
    const marcheS = (await get(insStore, [mOwner, 'Supermarché Alex', 'market', 'Tous vos produits du quotidien, livrés en 30 min', '+20 122 222 2222', '45 avenue El Geish, Alexandria', '🛒', '#3b82f6', 10, 50, 4.5, mLat, mLng, now])).id;
    const pharmaS = (await get(insStore, [pOwner, 'Pharmacie Santé+', 'pharmacy', 'Médicaments et parapharmacie avec pharmacien conseil', '+20 122 333 3333', '8 boulevard Gamal Abdel Nasser', '💊', '#14b8a6', 12, 0, 4.8, pLat, pLng, now])).id;

    const insProd = 'INSERT INTO products(store_id,name,category,description,price,emoji,available,created_at) VALUES(?,?,?,?,?,?,1,?) RETURNING id';
    const prods = [
      [restoS, 'Poulet grillé', 'Plats', 'Demi-poulet mariné aux épices', 120, '🍗'],
      [restoS, 'Koshari', 'Plats', 'Le plat national égyptien', 55, '🍲'],
      [restoS, 'Pizza margherita', 'Plats', 'Tomate, mozzarella, basilic', 95, '🍕'],
      [restoS, 'Shawarma poulet', 'Sandwichs', 'Pain, poulet, sauce tahini', 60, '🌯'],
      [restoS, 'Salade fattouch', 'Entrées', 'Légumes frais croquants', 40, '🥗'],
      [restoS, 'Jus de mangue', 'Boissons', 'Frais 100% naturel', 30, '🥤'],
      [restoS, 'Umm Ali', 'Desserts', 'Dessert égyptien traditionnel', 45, '🍮'],
      [marcheS, 'Riz 1kg', 'Épicerie', 'Riz long grain', 28, '🍚'],
      [marcheS, 'Huile de tournesol 1L', 'Épicerie', 'Huile de cuisson', 65, '🫒'],
      [marcheS, 'Lait 1L', 'Frais', 'Lait entier pasteurisé', 32, '🥛'],
      [marcheS, 'Œufs (6)', 'Frais', 'Œufs fermiers', 35, '🥚'],
      [marcheS, 'Pain baladi (5)', 'Boulangerie', 'Pain égyptien traditionnel', 10, '🥖'],
      [marcheS, 'Bananes 1kg', 'Fruits & Légumes', 'Bananes mûres', 40, '🍌'],
      [marcheS, 'Tomates 1kg', 'Fruits & Légumes', 'Tomates fraîches', 22, '🍅'],
      [marcheS, 'Lessive 2L', 'Ménager', 'Détergent liquide', 85, '🧴'],
      [marcheS, 'Eau 1.5L', 'Boissons', 'Eau minérale', 12, '💧'],
      [pharmaS, 'Paracétamol 500mg', 'Médicaments', 'Boîte de 20 comprimés', 25, '💊'],
      [pharmaS, 'Vitamine C', 'Compléments', 'Effervescents, 20 sachets', 60, '🍊'],
      [pharmaS, 'Masques chirurgicaux (50)', 'Parapharmacie', 'Boîte de 50', 75, '😷'],
      [pharmaS, 'Gel hydroalcoolique', 'Parapharmacie', 'Flacon 250ml', 45, '🧼'],
      [pharmaS, 'Thermomètre digital', 'Matériel', 'Thermomètre médical', 150, '🌡️'],
      [pharmaS, 'Sérum physiologique', 'Parapharmacie', 'Dosettes nasales x20', 30, '🧴']
    ];
    const prodIds = {};
    for (const [sid, name, cat, desc, price, emoji] of prods) {
      prodIds[name] = (await get(insProd, [sid, name, cat, desc, price, emoji, now])).id;
    }

    const insDriverOn = 'INSERT INTO users(name,email,phone,password,role,status,vehicle,online,created_at) VALUES(?,?,?,?,?,?,?,1,?) RETURNING id';
    const insDriverOff = 'INSERT INTO users(name,email,phone,password,role,status,vehicle,online,created_at) VALUES(?,?,?,?,?,?,?,0,?) RETURNING id';
    const driver = (await get(insDriverOn, ['Mostafa Livreur', 'livreur@demo.com', '+20 111 555 6666', hashPassword('demo123'), 'driver', 'active', 'Moto Yamaha', now])).id;
    await get(insDriverOff, ['Nour Livreuse', 'nour@demo.com', '+20 111 777 8888', hashPassword('demo123'), 'driver', 'pending', 'Vélo', now]);

    // Commandes de démo dans différents états
    const insOrder = `INSERT INTO orders(client_id,store_id,driver_id,status,payment,paid,subtotal,delivery_fee,commission,total,address,phone,note,client_lat,client_lng,promo_code,discount,created_at,updated_at)
                      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`;
    const insItem = 'INSERT INTO order_items(order_id,product_id,name,emoji,price,qty) VALUES(?,?,?,?,?,?)';
    const mkOrder = async (o, items) => {
      const id = (await get(insOrder, o)).id;
      for (const it of items) await run(insItem, [id, ...it]);
      return id;
    };
    const cpos = (sid, oid) => {
      const s = { 1: [rLat, rLng], 2: [mLat, mLng], 3: [pLat, pLng] }[sid];
      const [j1, j2] = jitter(oid * 13 + 5, 0.005);
      return [s[0] + j1, s[1] + j2];
    };
    const [c1a, c1b] = cpos(restoS, 1);
    await mkOrder([client, restoS, driver, 'delivered', 'cash', 1, 115, 15, 11.5, 130, '10 rue Ibrahim Sherif, Smouha', '+20 100 111 2222', '', c1a, c1b, '', 0, now - 86400000, now - 82800000],
      [[prodIds['Shawarma poulet'], 'Shawarma poulet', '🌯', 60, 1], [prodIds['Jus de mangue'], 'Jus de mangue', '🥤', 30, 1], [prodIds['Salade fattouch'], 'Salade fattouch', '🥗', 40, 1]]);
    const [c2a, c2b] = cpos(marcheS, 2);
    await mkOrder([client2, marcheS, null, 'pending', 'card', 1, 88, 10, 8.8, 98, '22 rue Abu Keir', '+20 100 333 4444', 'Appeler avant de livrer', c2a, c2b, '', 0, now - 900000, now - 900000],
      [[prodIds['Riz 1kg'], 'Riz 1kg', '🍚', 28, 2], [prodIds['Lait 1L'], 'Lait 1L', '🥛', 32, 1]]);
    const [c3a, c3b] = cpos(pharmaS, 3);
    await mkOrder([client2, pharmaS, null, 'ready', 'cash', 0, 210, 12, 21, 222, '22 rue Abu Keir', '+20 100 333 4444', '', c3a, c3b, '', 0, now - 1800000, now - 600000],
      [[prodIds['Thermomètre digital'], 'Thermomètre digital', '🌡️', 150, 1], [prodIds['Vitamine C'], 'Vitamine C', '🍊', 60, 1]]);
    const [c4a, c4b] = cpos(restoS, 4);
    await mkOrder([client, restoS, driver, 'picked_up', 'cash', 0, 95, 15, 9.5, 110, '10 rue Ibrahim Sherif, Smouha', '+20 100 111 2222', 'Sans oignons svp', c4a, c4b, '', 0, now - 1200000, now - 300000],
      [[prodIds['Pizza margherita'], 'Pizza margherita', '🍕', 95, 1]]);

    // Position du livreur en course (milieu du trajet)
    await run('INSERT INTO driver_locations(driver_id,lat,lng,updated_at) VALUES(?,?,?,?)',
      [driver, (rLat + c4a) / 2, (rLng + c4b) / 2, now]);

    await setSetting('app_name', 'YallaLiv');
    await setSetting('commission_rate', '10');
    await setSetting('currency', 'EGP');
    console.log('✅ Données de démo prêtes.');
  }

  // Codes promo de démo (si aucun)
  const pc = await get('SELECT COUNT(*) AS c FROM promos');
  if (pc.c === 0) {
    const now = Date.now();
    await run(`INSERT INTO promos(code,type,value,min_order,max_uses,active,created_at) VALUES(?,?,?,?,?,1,?)`, ['YALLA10', 'percent', 10, 0, 0, now]);
    await run(`INSERT INTO promos(code,type,value,min_order,max_uses,active,created_at) VALUES(?,?,?,?,?,1,?)`, ['BIENVENUE20', 'fixed', 20, 100, 100, now]);
    console.log('🎁 Codes promo de démo : YALLA10 (-10%) · BIENVENUE20 (-20, min 100)');
  }
}
