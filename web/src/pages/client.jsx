import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams, useLocation, Outlet, useSearchParams } from 'react-router-dom';
import TrackMap from '../TrackMap.jsx';
import { api, useT, useLang, useAuth, useCart, usePoll, fmtMoney, fmtDate, toast, notif, pushSubscribe , ph as photoUrl , trErr, distM, etaRange, FieldErr, V, runV, hasErr, UpdatesBanner, NotifNag, BellButton, ApkUpdateBanner, processImage, gmapsNavUrl, gmapsSearchUrl } from '../lib.jsx';
import { BottomNav, CartBar, StatusBadge, PayBadge, Stepper, Empty, Spinner, BackBtn, LangSwitch, Modal, Stars, SuggestBox, NoPhoto } from '../ui.jsx';
import ChatModal, { LastMsgLine } from '../Chat.jsx';
import PickMap, { reverseGeocode, geocodeSearch } from '../PickMap.jsx';
import AccountSettings from '../AccountSettings.jsx';
import { StoresMap } from '../RouteMap.jsx';

const TYPE_META = { restaurant: { e: '🍽️', c: '#ef6c4d' }, market: { e: '🛒', c: '#3b82f6' }, pharmacy: { e: '💊', c: '#14b8a6' } };
const SIB_TYPES = ['restaurant', 'market', 'pharmacy'];   // 🧲 v2026.10.08.11 : bande « même catégorie » réservée à ces types de magasins
// 🖼️ v2026.10.08.8 — couverture des magasins SANS photo : image de l'activité
const COVER_IMG = { restaurant: '/stores/restaurant.jpg', market: '/stores/supermarket.jpg', pharmacy: '/stores/pharmacy.jpg', electronics: '/stores/electronics.jpg', appliance: '/stores/appliance.jpg' };
// 🏪 v2026.09.27.1 — cartes magasins de l'accueil (photos réalistes) + départements
const STORE_CARDS = [
  { type: 'restaurant', img: '/stores/restaurant.jpg', key: 'restaurant' },
  { type: 'market', img: '/stores/supermarket.jpg', key: 'supermarket' },
  { type: 'pharmacy', img: '/stores/pharmacy.jpg', key: 'pharmacy' },
  { type: 'electronics', img: '/stores/electronics.jpg', key: 'electronics' },
  { type: 'appliance', img: '/stores/appliance.jpg', key: 'appliance' },
];
const DEPTS = [
  { id: 'property', img: '/dept/property.jpg' },
  { id: 'contracting', img: '/dept/contracting.jpg' },
  { id: 'electronics', img: '/dept/electronics.jpg' },
  { id: 'automotive', img: '/dept/automotive.jpg' },
  { id: 'jobs', img: '/dept/jobs.jpg' },
  { id: 'services', img: '/dept/services.jpg' },
];

// 🛍️ v2026.09.24.3 — Marché (style OLX) : catégories + emojis + lien WhatsApp Égypte
const CAT_EMOJI = { phones: '📱', electronics: '🔌', home: '🏠', fashion: '👕', kids: '🧸', sports: '⚽', beauty: '💄', auto: '🚗', property: '🏢', other: '📦' };   // 🏢 v2026.09.27.2 : immobilier
// 🛍️ v2026.09.26.1 — Marché Phase 1 : sous-catégories (2e niveau), états, attributs par catégorie
const SUBCATS = {
  phones: [['smartphones', '📱'], ['accessories', '🎧'], ['tablets', '🖊️']],
  electronics: [['tv', '📺'], ['audio', '🔊'], ['computers', '💻'], ['gaming', '🎮']],
  home: [['furniture', '🛋️'], ['appliances', '🧺'], ['decor', '🖼️']],
  fashion: [['women', '👗'], ['men', '👔'], ['shoes', '👠'], ['bags', '👜']],
  kids: [['toys', '🧸'], ['clothes', '🧦'], ['gear', '🍼']],
  sports: [['fitness', '🏋️'], ['football', '⚽'], ['outdoor', '🚴']],
  beauty: [['makeup', '💄'], ['skincare', '🧴'], ['fragrance', '🌸']],
  auto: [['cars', '🚗'], ['parts', '🔧'], ['moto', '🏍️']],
  other: [],
};
const SUB_LBL = {
  smartphones: { fr: 'Smartphones', ar: 'موبايلات', en: 'Smartphones' }, accessories: { fr: 'Accessoires', ar: 'إكسسوارات', en: 'Accessories' }, tablets: { fr: 'Tablettes', ar: 'تابلت', en: 'Tablets' },
  tv: { fr: 'TV & écrans', ar: 'تليفزيونات', en: 'TV & displays' }, audio: { fr: 'Audio & son', ar: 'صوتيات', en: 'Audio' }, computers: { fr: 'Ordinateurs', ar: 'كمبيوتر', en: 'Computers' }, gaming: { fr: 'Gaming', ar: 'ألعاب فيديو', en: 'Gaming' },
  furniture: { fr: 'Meubles', ar: 'أثاث', en: 'Furniture' }, appliances: { fr: 'Électroménager', ar: 'أجهزة منزلية', en: 'Appliances' }, decor: { fr: 'Décoration', ar: 'ديكور', en: 'Decor' },
  women: { fr: 'Femme', ar: 'حريمي', en: 'Women' }, men: { fr: 'Homme', ar: 'رجالي', en: 'Men' }, shoes: { fr: 'Chaussures', ar: 'أحذية', en: 'Shoes' }, bags: { fr: 'Sacs', ar: 'حقائب', en: 'Bags' },
  toys: { fr: 'Jouets', ar: 'ألعاب أطفال', en: 'Toys' }, clothes: { fr: 'Vêtements', ar: 'ملابس', en: 'Clothes' }, gear: { fr: 'Puériculture', ar: 'مستلزمات أطفال', en: 'Baby gear' },
  fitness: { fr: 'Fitness', ar: 'لياقة', en: 'Fitness' }, football: { fr: 'Football', ar: 'كرة القدم', en: 'Football' }, outdoor: { fr: 'Plein air', ar: 'أنشطة خارجية', en: 'Outdoor' },
  makeup: { fr: 'Maquillage', ar: 'مكياج', en: 'Makeup' }, skincare: { fr: 'Soins peau', ar: 'عناية بالبشرة', en: 'Skincare' }, fragrance: { fr: 'Parfums', ar: 'عطور', en: 'Fragrance' },
  cars: { fr: 'Voitures', ar: 'عربيات', en: 'Cars' }, parts: { fr: 'Pièces', ar: 'قطع غيار', en: 'Parts' }, moto: { fr: 'Motos', ar: 'موتوسيكلات', en: 'Motorcycles' },
};
const CONDITIONS = [['new', '✨'], ['like_new', '🌟'], ['used', '♻️']];
const COND_LBL = { new: { fr: 'Neuf', ar: 'جديد', en: 'New' }, like_new: { fr: 'Comme neuf', ar: 'شبه جديد', en: 'Like new' }, used: { fr: 'Occasion', ar: 'مستعمل', en: 'Used' } };
const ATTR_FIELDS = { phones: ['brand'], electronics: ['brand'], auto: ['brand'], fashion: ['brand', 'size'], kids: ['size'], beauty: ['brand'], sports: [], home: [], other: [] };
const waLink = (p) => 'https://wa.me/' + String(p || '').replace(/\D/g, '').replace(/^0/, '20');

// 🧭 v2026.09.24.3 — Barre de navigation moderne : Accueil · Commandes · [＋] · Notifications · Paramètres
function ClientNav() {
  const t = useT();
  const [unread, setUnread] = useState(0);
  // 💬 v2026.09.27.1 — l'onglet central bas = MESSAGES (chat marché) ; la cloche 🔔 est remontée dans l'en-tête
  usePoll(() => api('/market/chats').then((d) => setUnread(d.unread || 0)).catch(() => {}), 15000);
  const it = (to, icon, label, end) => (
    <NavLink key={to} to={to} end={end} className={({ isActive }) => 'cnav-item' + (isActive ? ' on' : '')}>
      <span className="ci">{icon}</span>{label}
    </NavLink>
  );
  return (
    <nav className="cnav">
      {it('/app', '🏠', t('home'), true)}
      {it('/app/status', '✨', t('status'))}   {/* ✨ v2026.09.30.2 : icône « nouveau » */}
      <div className="cnav-fab-wrap">
        <NavLink to="/app/publish" className="cnav-fab" title={t('publish')} aria-label={t('publish')}>
            <span style={{ fontSize: 32, lineHeight: 1 }}>＋</span>
            <span style={{ fontSize: 8.5, fontWeight: 800, lineHeight: 1.5 }}>{t('publish')}</span>
          </NavLink>
      </div>
      <NavLink to="/app/chats" className={({ isActive }) => 'cnav-item' + (isActive ? ' on' : '')}>
        <span className="ci">💬{unread > 0 && <span className="cnav-badge">{unread > 99 ? '99+' : unread}</span>}</span>{t('messages')}
      </NavLink>
      {it('/app/orders', '🧾', t('orders_nav'))}   {/* 🧾 v2026.09.30.1 : Commandes remplace Paramètres */}
    </nav>
  );
}

// 🔔👤 v2026.09.27.2 — barre compacte fixe : cloche + profil accessibles sur TOUTES les pages
// (sauf Accueil qui a son grand en-tête, Profil et Paramètres qui sont les pages concernées)
function ClientMiniHeader() {
  const t = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const [unread, setUnread] = useState(0);
  usePoll(() => api('/notifications').then((d) => setUnread(d.unread || 0)).catch(() => {}), 15000);
  if (loc.pathname === '/app' || loc.pathname === '/app/profile' || loc.pathname === '/app/settings') return null;
  return (
    <div className="mini-head">
      <div className="row" style={{ gap: 8 }}>
        <div className="logo" style={{ width: 30, height: 30, fontSize: 15 }}>🚀</div>
        <div className="brand-name" style={{ color: '#fff', fontSize: 15 }}>Yalla<span style={{ color: '#a7f3d0' }}>Liv</span></div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {/* 🌐 v2026.09.27.3 : le sélecteur de langue n'apparaît que sur l'en-tête de l'accueil */}
        <button type="button" className="head-icon" style={{ width: 32, height: 32, fontSize: 14 }} onClick={() => nav('/app/notifications')} title={t('notifications')} aria-label={t('notifications')}>
          🔔{unread > 0 && <span className="dot-badge">{unread > 99 ? '99+' : unread}</span>}
        </button>
        <button type="button" className="head-icon" style={{ width: 32, height: 32, fontSize: 14 }} onClick={() => nav('/app/profile')} title={t('profile')} aria-label={t('profile')}>👤</button>
      </div>
    </div>
  );
}

export function ClientLayout() {
  const loc = useLocation();
  const home = loc.pathname === '/app' || loc.pathname === '/app/';
  return (
    <div className={'app-client' + (home ? ' home-pad' : '')}>
      <ClientMiniHeader />
      <ApkUpdateBanner />   {/* 🔄 v2026.09.29.1 : mise à jour de l'APK visible aussi côté client */}
      <Outlet />
      {/* 📌 v2026.09.30.1 : sur l'ACCUEIL, les bannières d'info sont retirées pour que la section
          finale couvre tout l'écran jusqu'à l'en-tête en bas de page (elles restent sur toutes
          les autres pages). */}
      {!home && <UpdatesBanner role="client" />}
      {!home && <NotifNag role="client" />}
      <CartBar />
      <ClientNav />
    </div>
  );
}

/* ================= HOME (v2026.09.27.1 — refonte : en-tête dégradé, bandeau service, pubs, cartes magasins, départements) ================= */
// 🌐 sélecteur de langue (remplace l'ancien FR ع EN)
function LangSelect() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const LBL = { fr: '🇫🇷 FR', ar: '🇪🇬 ع', en: '🇬🇧 EN' };
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="lang-btn" onClick={() => setOpen((v) => !v)}>{LBL[lang] || '🌐'} ▾</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setOpen(false)} />
          <div className="lang-menu">
            {[['fr', '🇫🇷 Français'], ['ar', '🇪🇬 العربية'], ['en', '🇬🇧 English']].map(([k, l]) => (
              <button key={k} type="button" className={'lang-opt' + (lang === k ? ' on' : '')} onClick={() => { setLang(k); setOpen(false); }}>{l} {lang === k ? '✓' : ''}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// 🔄 carrousel auto-défilant (pubs, cartes magasins) : avance tout seul, pause quand l'utilisateur touche
/* ═══ 🏪 v2026.10.04.2 — outils des pages « catégorie de magasins » & magasin ═══ */
const PER_STORE_ROW = 4;   // 📏 lignes proportionnelles : max 4 produits par magasin et par ligne
const capPerStore = (list, k = PER_STORE_ROW) => {
  const l = list || [];
  if (new Set(l.map((p) => p.store_id)).size <= 1) return l;   // 1 seul magasin : rien à équilibrer → tout afficher
  const c = new Map();
  return l.filter((p) => { const n = c.get(p.store_id) || 0; if (n >= k) return false; c.set(p.store_id, n + 1); return true; });
};
// 🏥 pharmacie : les produits se divisent uniquement en 💊 Médicaments / 💄 Cosmétiques (mots-clés)
const COSM_KEYS = ['cosm', 'beaut', 'makeup', 'maquill', 'parfum', 'shampoo', 'shampoing', 'creme', 'crème', 'soin', 'huile', 'savon', 'lotion', 'hygiene', 'hygiène'];
const pharmaGroup = (p) => (COSM_KEYS.some((k) => ((p.category || '') + ' ' + (p.name || '')).toLowerCase().includes(k)) ? 'cosm' : 'meds');
/* ═══ 🛍️ v2026.10.04.3 — GRILLE PRODUITS 2 colonnes (pages catégorie & magasin) ═══
   Carte compacte : ❤️ favori en haut à droite · grande image (‹ › pour faire défiler
   les photos du produit sans l'ouvrir) · prix gras · nom · ⭐ note · bouton ＋ vert. */
const PFAV_KEY = 'yl_pfavs';
const loadPFavs = () => { try { return JSON.parse(localStorage.getItem(PFAV_KEY) || '{}'); } catch { return {}; } };
const HEART_PATH = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

function PgCard({ p, rating, fav, onFav, onOpen, onAdd }) {
  const [pi, setPi] = useState(0);   // photo affichée (navigation ‹ › sans ouvrir le produit)
  const gal = (p.gallery || (p.photos || []).map((x) => x && x.photo) || []).filter(Boolean);
  const pics = [p.photo, ...gal].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const r = rating ?? p.store_rating ?? p.rating;
  return (
    <div className="pg-card">
      <button type="button" className={'pg-heart' + (fav ? ' on' : '')} aria-label="favori"
        onClick={(e) => { e.stopPropagation(); onFav(p.id); }}>
        <svg viewBox="0 0 24 24"><path d={HEART_PATH} /></svg>
      </button>
      <div className="pg-imgwrap" onClick={() => onOpen(p)}>
        {pics.length
          ? <img src={photoUrl(pics[pi], 'thumb')} alt="" loading="lazy" />
          : <NoPhoto full h={130} radius={9} />}
        {pics.length > 1 && (<>
          <button type="button" className="pg-arrow left" aria-label="photo précédente"
            onClick={(e) => { e.stopPropagation(); setPi((i) => (i - 1 + pics.length) % pics.length); }}>‹</button>
          <button type="button" className="pg-arrow right" aria-label="photo suivante"
            onClick={(e) => { e.stopPropagation(); setPi((i) => (i + 1) % pics.length); }}>›</button>
          <span className="pg-dots">{pics.map((_, i) => <i key={i} className={i === pi ? 'on' : ''} />)}</span>
        </>)}
      </div>
      <div className="pg-foot" onClick={() => onOpen(p)}>
        <div className="pg-info">
          <div className="pg-price">{fmtMoney(p.price)}</div>
          <div className="pg-name">{p.name}</div>
          {r != null && <div className="pg-rate">⭐ {Number(r).toFixed(1)}</div>}
        </div>
        <button type="button" className="pg-add" aria-label="ajouter au panier"
          onClick={(e) => { e.stopPropagation(); onAdd(p); }}>＋</button>
      </div>
    </div>
  );
}

/* ↔️ v2026.10.04.5 : les produits s'affichent en LIGNES HORORALES DÉROULANTES
   (accueil = une seule ligne · catégories/magasins = une ligne par section) */
function ProductGrid({ title, prods, rating, favs, onFav, onOpen, onAdd, grid }) {
  if (!prods || !prods.length) return null;
  return (
    <>
      {title && <div className="h2 mb8 mt12">{title}</div>}
      {/* 🧱 v2026.10.08.8 : grid → GRILLE 2 colonnes (grandes cartes, défilement VERTICAL
          uniquement) ; sans grid → ligne horizontale déroulante (🏆/✨, accueil : inchangées) */}
      <div className={grid ? 'pg-grid' : 'pg-scroll'}>
        {prods.map((p) => (
          <PgCard key={p.id} p={p} rating={rating} fav={!!favs[p.id]} onFav={onFav} onOpen={onOpen} onAdd={onAdd} />
        ))}
      </div>
    </>
  );
}

/* ═══ ↔️ v2026.10.04.7 — DÉFILEMENT AUTOMATIQUE ═══
   • mode="loop" (défaut) : les menus horizontaux (🏪 Magasins par catégorie, 🏪 Magasins,
     🗂️ Produits par catégorie) avancent LENTEMENT (~28 px/s) et de façon CONTINUE en
     BOUCLE : jamais de retour rapide ni de va-et-vient (contenu dupliqué, boucle invisible).
   • mode="page" (📣 pubs) : comme AVANT — chaque pub change D'UN SEUL COUP toutes les
     delay millisecondes (avance d'un cran, puis revient au début). */
/* ═══ 🖼️ v2026.10.04.8 — FICHE PRODUIT (partagée accueil / catégorie / magasin) ═══
   • les photos défilent HORIZONTALEMENT — flèche au milieu qui indique le sens et se
     retourne de l'autre côté quand toutes les photos ont été défilées
   • la description défile dans sa PROPRE boîte verticale (v2026.10.08.9) — tout le
     reste est visible directement · le bouton panier ne déborde JAMAIS */
function ProductDetail({ product, closed, qty, setQty, onAdd, header, siblings, onPick, sibFavs, sibOnFav, sibOnAdd, sibRating, storeType }) {   // 🧲🖼️🛒 v2026.10.08.11 : bande réservée restaurant/pharmacie/supermarché + photo taille réduite + textes supprimés
  const t = useT();
  const galRef = useRef(null);
  const [atEnd, setAtEnd] = useState(false);
  const [zoom, setZoom] = useState(false);   // 🔍 v2026.10.08.9 : visionneuse PLEIN ÉCRAN ouverte ?
  const [zc, setZc] = useState(0);           // photo affichée dans la visionneuse
  const zRef = useRef(null);
  // les photos arrivent sous 2 formats : .gallery (tableau de chaînes — lignes 🏆/✨/grilles)
  // ou .photos (tableaux d'objets — page magasin). On accepte les deux.
  const pics = [product.photo,
    ...((product.gallery || []).filter(Boolean)),
    ...((product.photos || []).map((x) => x && x.photo).filter(Boolean)),
  ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  useEffect(() => { if (galRef.current) galRef.current.scrollLeft = 0; setAtEnd(false); setZoom(false); }, [product.id]);
  const onGal = () => { const el = galRef.current; if (el) setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 6); };
  const gal = (dir) => galRef.current && galRef.current.scrollBy({ left: dir * galRef.current.clientWidth * 0.92, behavior: 'smooth' });
  // 🧲 v2026.10.08.11 : la bande « même catégorie » n'apparaît QUE dans les magasins
  // restaurant / supermarché / pharmacie — éliminée pour tous les autres types.
  const sibs = SIB_TYPES.includes(storeType) ? (siblings || []).filter((p) => p && p.id !== product.id).slice(0, 12) : [];
  // 🔍 v2026.10.08.9 : la visionneuse s'ouvre DIRECTEMENT sur la photo cliquée ; le
  // compteur suit le glissé (photo suivante/précédente). Tap n'importe où = fermer.
  useEffect(() => { if (zoom && zRef.current) zRef.current.scrollTo({ left: zc * zRef.current.clientWidth }); }, [zoom]);
  const onZoomScroll = () => { const el = zRef.current; if (el) setZc(Math.max(0, Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))); };
  return (
    <div className="pd-sheet">
      {/* 🧲 v2026.10.08.11 — produits de la MÊME CATÉGORIE : EN HAUT, carte grise
          arrondie SÉPARÉE du cadre produit par un espace transparent (plus de titre —
          les cartes standard parlent d'elles-mêmes). Défilement indépendant : le
          cadre produit en dessous ne bouge JAMAIS. */}
      {sibs.length > 0 && (
        <div className="pd-sibs-zone">
          <ProductGrid prods={sibs} rating={sibRating} favs={sibFavs || {}} onFav={sibOnFav || (() => {})} onOpen={(p) => onPick?.(p)} onAdd={sibOnAdd || (() => {})} />
        </div>
      )}
      {/* 📌 v2026.10.08.10 — CADRE PRODUIT FIXE : photo 4:5, nom, description, bouton
          panier. Il reste en place quand on fait défiler les produits de la catégorie. */}
      <div className="pd-frame">
      {header}
      <div className="pd-galwrap">
        <div className="pd-gal" ref={galRef} onScroll={onGal}>
          {pics.length
            ? pics.map((src, i) => <img key={i} src={photoUrl(src)} alt="" onClick={() => { setZc(i); setZoom(true); }} />)
            : <div className="pd-nophoto"><NoPhoto w={130} h={130} radius={16} /></div>}
        </div>
        {/* 🔍 v2026.10.08.9 : tap sur la photo → AGRANDISSEMENT PLEIN ÉCRAN (la photo
            ENTIÈRE devient visible — réponse au cadrage cover qui rogne les bords) */}
        {pics.length > 0 && <span className="pd-zoomhint">🔍</span>}
        {pics.length > 1 && (
          <button type="button" className={'pd-nav ' + (atEnd ? 'left' : 'right')} onClick={() => gal(atEnd ? -1 : 1)} aria-label="photos">
            {atEnd ? '‹' : '›'}
          </button>
        )}
      </div>
      <div className="pd-name">{product.name}</div>
      {/* 📜 v2026.10.08.9 — la description défile dans sa PROPRE boîte VERTICALE
          (max 150 px) : le texte ne déborde JAMAIS à droite, on lit la suite en
          glissant DANS la boîte. */}
      {product.description
        ? <div className="pd-desc">{product.description}</div>
        : <div style={{ height: 8 }} />}
      {closed ? (
        <div className="banner warn mt8">{t('store_closed')}</div>
      ) : (
        <div className="row pd-actions" style={{ gap: 10 }}>
          <div className="qty-stepper" style={{ padding: '8px 10px', flex: 'none' }}>
            <button className="qs-btn" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <span style={{ minWidth: 20, textAlign: 'center' }}>{qty}</span>
            <button className="qs-btn" onClick={() => setQty((q) => Math.min(99, q + 1))}>+</button>
          </div>
          <button className="btn primary grow pd-add" onClick={onAdd}>
            <span className="pd-add-l1">🛒 {t('add_to_cart')}</span>
            <span className="pd-add-l2">{fmtMoney(product.price * qty)}</span>
          </button>
        </div>
      )}
      </div>
      {/* 🔍 v2026.10.08.9 — VISIONNEUSE PLEIN ÉCRAN : fond noir, la photo ENTIÈRE est
          visible (contain). Glisser = photo suivante · tap n'importe où = fermer. */}
      {zoom && (
        <div className="pd-zoom" onClick={() => setZoom(false)}>
          <button type="button" className="pd-zoom-close" aria-label="fermer" onClick={() => setZoom(false)}>✕</button>
          <div className="pd-zoom-track" ref={zRef} onScroll={onZoomScroll}>
            {pics.map((src, i) => <img key={i} src={photoUrl(src)} alt="" />)}
          </div>
          {pics.length > 1 && <span className="pd-zoom-count">{zc + 1} / {pics.length}</span>}
        </div>
      )}
    </div>
  );
}

function AutoScroll({ children, className = '', mode = 'loop', delay = 3500 }) {
  const ref = useRef(null);
  const pause = useRef(0);
  const acc = useRef(0);   // 🐌 les navigateurs ignorent les fractions de pixel : on accumule puis on avance d'1 px entier
  const [loop, setLoop] = useState(false);   // duplique le contenu seulement si la ligne déborde
  useEffect(() => {
    if (mode === 'page') {   // 📣 pubs : changement d'un seul coup (comme avant)
      const tm = setInterval(() => {
        if (Date.now() < pause.current) return;
        const el = ref.current;
        if (!el || el.scrollWidth <= el.clientWidth) return;
        const step = el.clientWidth;   // v2026.10.04.8 : la pub change EN ENTIER (pas à moitié)
        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
        el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + step, behavior: 'smooth' });
      }, delay);
      return () => clearInterval(tm);
    }
    let raf = 0, last = 0;
    const tick = (ts) => {
      const el = ref.current;
      if (el) {
        if (!loop && el.scrollWidth > el.clientWidth + 4) setLoop(true);
        if (loop && el.scrollWidth > el.clientWidth + 4 && Date.now() >= pause.current) {
          if (last) {
            const dt = Math.min(64, ts - last);
            acc.current += (28 * dt) / 1000;   // 🐌 ~28 px/seconde : lent et régulier
            const move = Math.floor(acc.current);
            if (move >= 1) {
              el.scrollLeft += move;
              acc.current -= move;
              const half = el.scrollWidth / 2;
              if (el.scrollLeft >= half - 1) el.scrollLeft -= half;   // 🔄 boucle invisible (sans saut)
            }
          }
          last = ts;
        } else { last = 0; acc.current = 0; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loop]);
  return (
    <div ref={ref} className={className}
      onTouchStart={() => { pause.current = Date.now() + 7000; }}
      onMouseDown={() => { pause.current = Date.now() + 7000; }}>
      <span className="asc-copy">{children}</span>
      {mode === 'loop' && loop && <span className="asc-copy" aria-hidden="true">{children}</span>}
    </div>
  );
}

/* ═══ 🔄 v2026.10.04.1 — TIRER POUR ACTUALISER (application Android) ═══
   Dans l'APK : depuis le HAUT de l'accueil (ou de la page Statuts), tirer la page vers le bas
   → actualisation SANS fermer/rouvrir l'application.
   Sur le site web : aucun changement (le navigateur a déjà sa propre actualisation).
   - accueil : rechargement complet (comme rouvrir l'app → tout est frais)
   - statuts : simple re-chargement de la liste (on reste sur la page) */
function usePullToRefresh(onRefresh) {
  const indRef = useRef(null);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  useEffect(() => {
    const cap = typeof window !== 'undefined' && window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;   // 📱 APK uniquement
    const ind = indRef.current;
    const TH = 70;                                  // tirage nécessaire pour déclencher
    let active = false, engaged = false, busy = false, y0 = 0, x0 = 0, dist = 0;
    const paint = (d, spin) => {
      if (!ind) return;
      const p = Math.max(0, Math.min(1, d / TH));
      ind.style.opacity = spin ? '1' : String(Math.min(1, p * 1.6));
      ind.style.transform = 'translate(-50%, ' + (spin ? 30 : Math.round(Math.min(d, 100) * 0.55)) + 'px)' + (spin ? '' : ' rotate(' + Math.round(p * 300) + 'deg)');
      ind.classList.toggle('spin', !!spin);
    };
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 2;
    const overlayOpen = () => !!document.querySelector('.modal-backdrop, .sheet-backdrop, .st-viewer, .alarm-overlay');
    const ts = (e) => {
      if (busy || e.touches.length > 1 || !atTop() || overlayOpen()) { active = false; return; }
      active = true; engaged = false; dist = 0;
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
    };
    const tm = (e) => {
      if (!active || busy) return;
      const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
      if (!engaged) {
        if (!atTop()) { active = false; return; }
        if (dy > 16 && dy > Math.abs(dx) * 1.3) engaged = true;   // geste bien vertical vers le bas
        else return;
      }
      if (e.cancelable) e.preventDefault();       // la page ne défile pas : seul l'indicateur descend
      dist = Math.max(0, (dy - 16) * 0.5);
      paint(dist, false);
    };
    const end = () => {
      if (!active) return;
      active = false;
      if (engaged && dist >= TH && !busy) {
        busy = true; paint(TH, true);
        const done = () => { busy = false; paint(0, false); };
        if (cb.current) Promise.resolve(cb.current()).catch(() => {}).then(done);   // statuts : rechargement doux
        else setTimeout(() => window.location.reload(), 420);                        // accueil : tout recharger
      } else paint(0, false);
      engaged = false; dist = 0;
    };
    document.addEventListener('touchstart', ts, { passive: true });
    document.addEventListener('touchmove', tm, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
    return () => {
      document.removeEventListener('touchstart', ts);
      document.removeEventListener('touchmove', tm);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
    };
  }, []);
  return indRef;
}

export function ClientHome() {
  const t = useT();
  const { lang } = useLang();   // 🏬 v2026.09.30.5 : libellé de la carte selon la langue
  const nav = useNavigate();
  const { user } = useAuth();
  const { add, items, setQty } = useCart();
  const [q, setQ] = useState('');
  const [stores, setStores] = useState(null);
  const [products, setProducts] = useState(null);
  const [ads, setAds] = useState(null);
  const [stypes, setStypes] = useState(null);   // 🏬 v2026.09.30.5 : cartes magasins (superadmin)
  const [immo, setImmo] = useState(null);      // 🏢🚗 immobilier + automotive
  const [gDetail, setGDetail] = useState(null);   // fiche produit ouverte depuis la recherche
  const [gQty, setGQty] = useState(1);
  const [gBig, setGBig] = useState(null);
  const [unread, setUnread] = useState(0);        // 🔔 cloche de l'en-tête
  usePoll(() => api('/notifications').then((d) => setUnread(d.unread || 0)).catch(() => {}), 15000);

  const ptrInd = usePullToRefresh(null);   // 🔄 v2026.10.04.1 : tirer vers le bas = actualiser (APK)
  useEffect(() => {
    api('/stores').then((d) => setStores(d.stores)).catch(() => setStores([]));
    api('/products').then((d) => setProducts(d.products)).catch(() => setProducts([]));
    api('/ads').then((d) => setAds(d.ads)).catch(() => setAds([]));   // 📣 pubs du superadmin
    api('/store-types').then((d) => setStypes(d.types)).catch(() => setStypes([]));   // 🏬 cartes gérées par le superadmin (null = chargement → squelette ; [] = erreur/repli cartes intégrées)
    Promise.all([api('/listings?cat=property'), api('/listings?cat=auto')])
      .then(([p, a2]) => setImmo([...p.listings, ...a2.listings]))
      .catch(() => setImmo([]));
  }, []);
  // 🟩 v2026.09.28.2 : le vert couvre UNIQUEMENT la partie supérieure restante de l'en-tête —
  // la barre d'état / barre d'adresse du téléphone (theme-color) + la zone d'étirement du navigateur.
  // Le reste de la page reste clair.
  useEffect(() => {
    document.documentElement.style.background = '#0e9f6e';   // même vert que le HAUT de l'en-tête (continuité parfaite)
    let meta = document.querySelector('meta[name="theme-color"]');
    const before = meta ? meta.getAttribute('content') : null;
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'theme-color'); document.head.appendChild(meta); }
    meta.setAttribute('content', '#0e9f6e');
    return () => {
      document.documentElement.style.background = '';
      if (before === null) meta.remove(); else meta.setAttribute('content', before);
    };
  }, []);
  // 🎬 v2026.09.30.3 — arrivé en BAS de l'accueil : la page se FIGE (gel en position fixe) et la
  // section Immobilier & Automotive monte PAR-DESSUS, pilotée par le scroll, jusqu'à l'en-tête.
  // 🐛 correctifs .3 : (1) le gel ne peut plus se déclencher pendant le chargement (armement 700 ms),
  // (2) mesure FRAÎCHE juste avant le gel, (3) page plus courte que l'écran → la section redevient
  // une section normale (aucun gel, rien de caché).
  const endSpacerRef = useRef(null);
  const endPanelRef = useRef(null);
  useEffect(() => {
    const panel = endPanelRef.current, spacer = endSpacerRef.current;
    const app = document.querySelector('.app-client');
    if (!panel || !spacer || !app) return;
    let raf = 0, frozen = false, ghost = null, saved = null, armed = false, inlineMode = false;
    const headH = () => { const h = document.querySelector('.home-head'); return h ? h.offsetHeight : 110; };
    const measure = () => {
      const H = Math.max(240, window.innerHeight - headH());
      spacer.style.height = H + 'px';
      panel.style.height = H + 'px';
    };
    const setInline = (on) => {   // page trop courte : section normale, pas d'overlay ni de gel
      if (on === inlineMode) return;
      inlineMode = on;
      panel.classList.toggle('inline', on);
      if (on) { spacer.style.height = '0px'; panel.style.height = 'auto'; panel.style.transform = ''; panel.classList.remove('lift'); }
      else measure();
    };
    const freeze = (startY) => {          // 🧊 la page reste affichée TELLE QUELLE pendant la montée
      frozen = true;
      saved = { pos: app.style.position, top: app.style.top, left: app.style.left, right: app.style.right, h: document.documentElement.scrollHeight };
      app.style.position = 'fixed';
      app.style.top = (-startY) + 'px';
      app.style.left = '0'; app.style.right = '0';
      ghost = document.createElement('div');
      ghost.style.height = saved.h + 'px';   // conserve la hauteur de scroll pendant le gel
      document.body.appendChild(ghost);
    };
    const unfreeze = () => {
      if (!frozen) return;
      frozen = false;
      if (ghost) { ghost.remove(); ghost = null; }
      app.style.position = saved?.pos || ''; app.style.top = saved?.top || ''; app.style.left = saved?.left || ''; app.style.right = saved?.right || '';
    };
    const paint = () => {
      raf = 0;
      if (inlineMode) {
        // la page a pu grandir (images/annonces chargées) → reprendre le mode overlay
        if (armed && !frozen && spacer.getBoundingClientRect().top + window.scrollY - window.innerHeight > 10) setInline(false);
        else return;
      }
      const contentEnd = frozen ? -parseFloat(app.style.top) + window.innerHeight : spacer.getBoundingClientRect().top + window.scrollY;
      let startY = contentEnd - window.innerHeight;
      const H = panel.offsetHeight || 1;
      let p = Math.min(1, Math.max(0, (window.scrollY - startY) / H));
      if (p > 0.04 && !frozen) {   // 🐛 seuil anti-rafales : gel seulement après ~25px passés la fin naturelle
        if (!armed) { panel.style.transform = 'translateY(100%)'; panel.classList.remove('lift'); return; }   // chargement en cours : JAMAIS de gel
        startY = spacer.getBoundingClientRect().top + window.scrollY - window.innerHeight;   // 🐛 mesure FRAÎCHE avant gel
        if (startY <= 10) { setInline(true); unfreeze(); return; }   // page ≤ 1 écran → section normale
        freeze(startY);
        p = Math.min(1, Math.max(0, (window.scrollY - startY) / H));
      }
      if (p <= 0 && frozen) unfreeze();
      panel.style.transform = 'translateY(' + ((1 - p) * 100) + '%)';
      panel.classList.toggle('lift', p > 0.02);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const onResize = () => { if (!frozen && !inlineMode) measure(); paint(); };
    measure(); paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    // 🐛 v2026.09.30.4 : l'armement attendait que TOUTES les images soient chargées — or celles
    // du bas de page sont en chargement différé (elles ne chargent qu'une fois scrolées !) :
    // si l'utilisateur atteignait le fond avant le garde-fou de 4 s, la section ne sortait pas.
    // → armement rapide (900 ms) + re-mesure périodique : la mesure FRAÎCHE au moment du gel
    //   reste la vraie sécurité, peu importe ce qui charge encore.
    const armTm = setTimeout(() => { armed = true; if (!frozen && !inlineMode) measure(); paint(); }, 900);
    const measIt = setInterval(() => { if (!frozen && !inlineMode) { measure(); paint(); } }, 800);   // suit le chargement des images
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); clearInterval(measIt); clearTimeout(armTm); unfreeze(); };
  }, [immo]);
  const [favs, setFavs] = useState(() => loadPFavs());   // ❤️ v2026.10.04.4 : favoris produits (accueil)
  const toggleFav = (pid) => { const n = { ...favs }; if (n[pid]) delete n[pid]; else n[pid] = 1; setFavs(n); try { localStorage.setItem(PFAV_KEY, JSON.stringify(n)); } catch {} };
  const addFromGrid = (p) => {   // 🛒 v2026.10.04.4 : ajout direct depuis la grille de l'accueil
    const stub = { id: p.store_id, name: p.store_name, delivery_fee: p.delivery_fee, min_order: p.min_order || 0 };
    if (!items.length || items[0].store_id === stub.id) { add(p, stub); toast(t('added')); }
    else add(p, stub);   // autre magasin : propose de vider le panier
  };
  // Ouvre la FICHE PRODUIT (pas le magasin) : charge le produit complet + sa boutique
  const openProduct = async (p) => {
    setGDetail({ loading: true });
    try {
      const d = await api('/stores/' + p.store_id);
      const prod = d.products.find((x) => x.id === p.id);
      if (!prod) throw new Error(trErr('Produit introuvable'));
      setGDetail({ store: d.store, product: prod, prods: d.products });   // 🧲 v2026.10.08.8 : produits du magasin gardés pour la bande « même catégorie »
      setGBig(prod.photo || null);
      setGQty(1);
    } catch (e) { setGDetail(null); toast(e.message, 'err'); }
  };
  const addFromGlobal = () => {
    const { store, product } = gDetail;
    const inCart = items.find((i) => i.product_id === product.id && i.store_id === store.id)?.qty || 0;
    if (!items.length || items[0].store_id === store.id) {
      if (inCart === 0) add(product, store);
      setQty(product.id, gQty);
    } else {
      add(product, store); // autre magasin : propose de vider le panier
    }
    toast(t('added'));
    // 🛒 v2026.10.08.10 : la page produit reste OUVERTE après l'ajout au panier
  };

  const hour = new Date().getHours();
  const greet = hour < 12 ? t('good_morning') : hour < 18 ? t('good_afternoon') : t('good_evening');

  return (
    <div>
      {/* 🔄 v2026.10.04.1 — indicateur tirer-pour-actualiser (APK) : visible seulement pendant le geste */}
      <div ref={ptrInd} className="ptr-ind" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="#334155" /></svg>
      </div>

      {/* 🟩 En-tête dégradé vert : logo + sélecteur langue + 🔔 notifications + 👤 profil */}
      <div className="home-head">
        <div className="row spread mb8">
          <div className="row" style={{ gap: 10 }}>
            <div className="logo">🚀</div>
            <div>
              <div className="brand-name" style={{ color: '#fff' }}>Yalla<span style={{ color: '#a7f3d0' }}>Liv</span></div>
              <div className="xsmall" style={{ color: 'rgba(255,255,255,.88)' }}>{greet} {user?.name?.split(' ')[0]} 👋</div>
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <LangSelect />
            <button type="button" className="head-icon" onClick={() => nav('/app/notifications')} title={t('notifications')} aria-label={t('notifications')}>
              🔔{unread > 0 && <span className="dot-badge">{unread > 99 ? '99+' : unread}</span>}
            </button>
            <button type="button" className="head-icon" onClick={() => nav('/app/profile')} title={t('profile')} aria-label={t('profile')}>👤</button>
          </div>
        </div>
        <SuggestBox
          value={q}
          onChange={setQ}
          placeholder={'🔍 ' + t('search_ph')}
          clearTitle={t('clear_search')}
          getSugs={() => {
            const s = q.trim().toLowerCase();
            const st = (stores || []).filter((x) => (x.name || '').toLowerCase().includes(s))
              .map((x) => ({ key: 's' + x.id, icon: x.photo ? <img src={photoUrl(x.photo, 'thumb')} alt="" style={{ width: 24, height: 24, borderRadius: 7, objectFit: 'cover' }} /> : (x.emoji || '🏪'), label: x.name, sub: t('type_' + x.type), st: x }));
            const pr = (products || []).filter((x) => (x.name || '').toLowerCase().includes(s))
              .map((x) => ({ key: 'p' + x.id, icon: x.store_emoji || '🏪', label: x.name, sub: x.store_name, p: x }));
            return [...st, ...pr];
          }}
          onPick={(s) => {
            if (s.p) openProduct(s.p);
            else nav('/app/store/' + s.st.id);
          }}
        />
      </div>

      {/* 🛵 Bandeau : demander un service à un livreur général (acceptation volontaire) */}
      <button type="button" className="svc-banner" onClick={() => nav('/app/service')}>
        <span className="svc-emoji">🛵</span>
        <span className="grow ellipsis" style={{ minWidth: 0, fontWeight: 900, fontSize: 14, color: '#fff' }}>{t('svc_title')}</span>
        <span className="svc-cta">{t('svc_cta')} →</span>
      </button>

      {/* 🧃 Publicités (publiées depuis l'espace superadmin) — défilement automatique + manuel */}
      {ads && ads.length > 0 && (
        <AutoScroll className="ads-row" mode="page">
          {ads.map((a) => (
            <a key={a.id} className="ad-card" href={a.link || '#'} target={a.link && a.link.startsWith('http') ? '_blank' : undefined} rel="noopener">
              <img src={a.image} alt="" />
            </a>
          ))}
        </AutoScroll>
      )}

      {/* 🏪 Magasins par catégorie — v2026.09.30.5 : cartes CARRÉES à icônes, gérées depuis
          l'espace superadmin (ajout / remplacement / suppression). Repli : cartes intégrées. */}
      <div className="h2 mb8 mt12">🏪 {t('stores_by_type')}</div>
      {stypes === null ? (
        /* 🩻 v2026.10.08.8 : SQUELETTE pendant le chargement — avant, les cartes intégrées
           (anciennes photos par défaut) s'affichaient quelques secondes avant d'être
           remplacées par les vraies cartes du superadmin : l'utilisateur voyait d'ANCIENNES
           PHOTOS à chaque ouverture. Maintenant : rien de faux ne s'affiche. */
        <div className="stc-row" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="sty-card"><span className="sty-sk-icon" /><span className="sty-sk-label" /></span>
          ))}
        </div>
      ) : stypes.length > 0 ? (
        <AutoScroll className="stc-row">
          {stypes.map((c) => (
            <button key={c.type} type="button" className="sty-card" onClick={() => nav('/app/stores/' + c.type)} title={lang === 'ar' ? c.label_ar : lang === 'en' ? c.label_en : c.label_fr}>
              <span className="sty-icon"><img src={c.icon} alt="" loading="lazy" /></span>
              <span className="sty-label">{lang === 'ar' ? c.label_ar : lang === 'en' ? c.label_en : c.label_fr}</span>
            </button>
          ))}
        </AutoScroll>
      ) : (
        <AutoScroll className="stc-row">
          {STORE_CARDS.map((c) => (
            <button key={c.type} type="button" className="sty-card" onClick={() => nav('/app/stores/' + c.type)}>
              <span className="sty-icon"><img src={c.img} alt="" loading="lazy" /></span>
              <span className="sty-label">{t('stc_' + c.key)}</span>
            </button>
          ))}
        </AutoScroll>
      )}

      {/* 🛍️ v2026.10.04.4 — produits de l'accueil : MÊME grille 2 colonnes que les magasins
          (❤️ favori · ‹ › photos · prix gras · nom · ⭐ note · bouton ＋ vert) */}
      <ProductGrid title={'🛍️ ' + t('products_row')} prods={(products || []).slice(0, 12)} favs={favs} onFav={toggleFav} onOpen={openProduct} onAdd={addFromGrid} />

      {/* 🧱 Départements */}
      <div className="h2 mb8 mt12">🧱 {t('departments')}</div>
      <div className="dept-grid">
        {DEPTS.map((d) => (
          <button key={d.id} type="button" className="dept-tile" onClick={() => nav('/app/dept/' + d.id)}>
            {d.img
              ? <img src={d.img} alt="" loading="lazy" />
              : <span className="dept-emoji">👥</span>}
            <span>{t('dept_' + d.id)}</span>
          </button>
        ))}
      </div>

      {/* 🏢🚗 v2026.09.30.2 — BANDEAU D'APPEL : en bas de l'accueil, un tap déclenche la montée */}
      <button type="button" className="end-teaser" onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}>
        <span style={{ fontWeight: 900 }}>🏢🚗 {t('immo_auto')}</span>
        <span className="muted small grow" style={{ textAlign: 'end' }}>{t('immo_hint')}</span>
        <span style={{ fontSize: 18 }}>▲</span>
      </button>

      {/* 🎬 espaceur : sa hauteur devient du scroll « supplémentaire » qui pilote la montée du panneau */}
      <div ref={endSpacerRef} />

      {/* 🏢🚗 PANNEAU qui monte PAR-DESSUS la page figée (couvre l'écran jusqu'à l'en-tête) */}
      <div className="end-panel" ref={endPanelRef}>
        <div className="row spread" style={{ alignItems: 'center', padding: '12px 14px 6px' }}>
          <div className="h2">🏢🚗 {t('immo_auto')}</div>
          <button className="btn ghost sm" onClick={() => {
            const sp = endSpacerRef.current;
            const y = sp ? sp.getBoundingClientRect().top + window.scrollY - window.innerHeight - 5 : 0;
            window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
          }}>✕</button>
        </div>
        <div className="end-body">
          {immo === null ? <Spinner /> : immo.length === 0 ? (
            <div className="card" style={{ padding: 18, textAlign: 'center' }}>
              <div className="small" style={{ fontWeight: 800 }}>🏢🚗 {t('immo_auto_empty')}</div>
              <button className="btn primary mt8" onClick={() => nav('/app/publish?cat=property')}>＋ {t('publish')}</button>
            </div>
          ) : (
            <div className="store-grid">
              {immo.map((l) => (
                <div key={l.id} className="card mkt-lcard" onClick={() => nav('/app/market/' + l.id)}>
                  <div className="mkt-lphoto">
                    {l.photos && l.photos[0] ? <img src={l.photos[0]} alt="" /> : <div className="mkt-nophoto">{CAT_EMOJI[l.category] || '📦'}</div>}
                  </div>
                  <div className="mkt-lbody">
                    <div className="small ellipsis" style={{ fontWeight: 800 }}>{l.name}</div>
                    <div style={{ fontWeight: 900, color: 'var(--brand-dark)' }}>{fmtMoney(l.price)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* fiche produit rapide (depuis la recherche) */}
      <Modal open={!!gDetail} onClose={() => setGDetail(null)} className="pd-modal">
        {gDetail?.loading ? <Spinner /> : gDetail?.store && gDetail?.product ? (
          <ProductDetail
            product={gDetail.product} closed={!gDetail.store.is_open} qty={gQty} setQty={setGQty} onAdd={addFromGlobal}
            siblings={(gDetail.prods || []).filter((x) => x.category === gDetail.product.category)}
            onPick={(p) => { setGDetail((g) => ({ ...g, product: p })); setGBig(p.photo || null); setGQty(1); }}
            sibFavs={favs} sibOnFav={toggleFav}
            sibOnAdd={(p) => addFromGrid({ ...p, store_id: gDetail.store.id, store_name: gDetail.store.name, delivery_fee: gDetail.store.delivery_fee, min_order: gDetail.store.min_order || 0 })}
            storeType={gDetail.store.type}

            header={(
              <div className="row wrap" style={{ justifyContent: 'center', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <div className="store-emoji" style={{ width: 26, height: 26, fontSize: 14, background: gDetail.store.color || '#0e9f6e' }}>{gDetail.store.emoji || '🏪'}</div>
                <b className="small ellipsis">{gDetail.store.name}</b>
                <button className="btn ghost sm" onClick={() => { const sid = gDetail.store.id; setGDetail(null); nav('/app/store/' + sid); }}>🏪 {t('open_store')}</button>
              </div>
            )} />
        ) : null}
      </Modal>
    </div>
  );
}

/* ================= STORE ================= */
export function StorePage() {
  const t = useT();
  const { id } = useParams();
  const { add, items, setQty } = useCart();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);
  const [dQty, setDQty] = useState(1);
  const [bigPhoto, setBigPhoto] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [popInfo, setPopInfo] = useState(null);   // ℹ️ v2026.10.04.7 : info longue ouverte dans la bannière ('desc' | 'addr')
  useStickyBelowHead();   // 📌 v2026.10.04.7 : bannière + recherche fixées SOUS l'en-tête vert
  const [pq, setPq] = useState('');   // recherche de produits DANS la boutique
  const [topP, setTopP] = useState(null);        // 🏆 v2026.10.04.2 : plus commandés du magasin
  const [suggP, setSuggP] = useState(undefined); // ✨ v2026.10.04.2 : suggestions (undefined = chargement, null = aucune recherche)
  const [selCat, setSelCat] = useState(null);    // 🗂️ v2026.10.04.2 : catégorie de produits sélectionnée
  const [favs, setFavs] = useState(() => loadPFavs());   // ❤️ v2026.10.04.3 : favoris produits (appareil)

  useEffect(() => {
    setTopP(null); setSuggP(undefined); setSelCat(null);
    api('/stores/' + id).then(setData).catch((e) => setErr(e.message));
    api('/products/top?store_id=' + id).then((d) => setTopP(d.products)).catch(() => setTopP(null));          // 🏆 2.3
    api('/products/suggested?store_id=' + id).then((d) => setSuggP(d.matched ? d.products : null)).catch(() => setSuggP(null));   // ✨ 2.4
  }, [id]);

  const openDetail = (p) => { setDetail(p); setBigPhoto(p.photo || null); setDQty(qtyOf(p.id) || 1); };
  const addFromDetail = () => {
    if (!items.length || items[0].store_id === store.id) {
      if (qtyOf(detail.id) === 0) add(detail, store);
      setQty(detail.id, dQty);
    } else {
      add(detail, store); // autre magasin : propose de vider le panier
    }
    toast(t('added'));
    // 🛒 v2026.10.08.10 : la page produit reste OUVERTE après l'ajout au panier
  };

  // 🏪 v2026.10.08.8 — progression du scroll (0 → 1) : la couverture se rétracte,
  // la carte d'info + la recherche restent fixées en haut (en-tête premium compact).
  // 📌 v2026.10.08.8 — EN-TÊTE 100 % FIXE : la photo + la carte d'info + la recherche
  // ne défilent JAMAIS (l'en-tête 🚀/🔔/👤 reste transparent sur la photo — plus
  // AUCUN état vert ici). Le contenu défile dessous : le décalage est piloté par
  // ResizeObserver (il s'adapte aussi quand la carte 🗺️ s'ouvre dans l'en-tête).
  const fixedRef = useRef(null);
  useEffect(() => {
    document.body.classList.add('yl-sp-cover');
    const el = fixedRef.current;
    const set = () => { if (el) document.documentElement.style.setProperty('--sp-fixed-h', el.offsetHeight + 'px'); };
    set();
    const ro = new ResizeObserver(set);
    if (el) ro.observe(el);
    return () => { ro.disconnect(); document.body.classList.remove('yl-sp-cover'); document.documentElement.style.removeProperty('--sp-fixed-h'); };
  }, []);
  if (err) return <><div className="topbar"><BackBtn /></div><Empty e="😔" text={err} /></>;
  if (!data) return <Spinner />;

  const { store, products } = data;
  const meta = TYPE_META[store.type] || TYPE_META.market;
  const eta = etaRange(store.type, null);   // 🕘 v2026.10.08.8 : durée de livraison affichée dans la carte
  const s = pq.trim().toLowerCase();
  const fProds = s ? products.filter((p) =>
    (p.name || '').toLowerCase().includes(s) || (p.description || '').toLowerCase().includes(s) || (p.category || '').toLowerCase().includes(s)
  ) : products;
  // 🗂️ v2026.10.04.2 — catégories de produits (pharmacie : uniquement 💊 Médicaments / 💄 Cosmétiques)
  const isPharmaStore = store.type === 'pharmacy';
  const cats = [];
  {
    const src = products || [];
    if (isPharmaStore) {
      for (const g of ['meds', 'cosm']) {
        const list = src.filter((p) => pharmaGroup(p) === g);
        if (list.length) cats.push({ label: t(g === 'meds' ? 'pharma_meds' : 'pharma_cosm'), emoji: g === 'meds' ? '💊' : '💄', photo: list.find((x) => x.photo)?.photo || null, prods: list });
      }
    } else {
      const m = new Map();
      for (const p of src) { const k = p.category || '•'; if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
      for (const [c, list] of [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) cats.push({ label: c, emoji: list[0]?.emoji || '📦', photo: list.find((x) => x.photo)?.photo || null, prods: list });
    }
  }
  // sections : par catégorie (pharmacie : 2 groupes) — recherche + filtre par catégorie appliqués
  let byCat = {};
  if (isPharmaStore) {
    for (const g of ['meds', 'cosm']) {
      const list = fProds.filter((p) => pharmaGroup(p) === g);
      if (list.length) byCat[g === 'meds' ? t('pharma_meds') : t('pharma_cosm')] = list;
    }
  } else byCat = groupByCat(fProds);
  if (selCat && byCat[selCat]) byCat = { [selCat]: byCat[selCat] };   // 2.6 : clic sur une carte → SES produits
  // 🏆 2.3 plus commandés (à défaut : produits dispo) · ✨ 2.4 suggestions (à défaut : produits dispo)
  const topRow = topP === null || !products ? null : (topP.length ? topP : products);
  const suggRow = suggP === undefined || !products ? null : (suggP || products);
  const qtyOf = (pid) => items.find((i) => i.product_id === pid && i.store_id === store.id)?.qty || 0;
  const closed = !store.is_open;
  // 🔎 v2026.10.04.2 — journaliser la recherche dans CE magasin (suggestions personnalisées)
  const logSearch = (term) => { const qq = String(term || pq || '').trim(); if (qq.length >= 2) api('/product-searches', { method: 'POST', body: { q: qq, store_id: store.id } }).catch(() => {}); };
  const toggleFav = (pid) => { const n = { ...favs }; if (n[pid]) delete n[pid]; else n[pid] = 1; setFavs(n); try { localStorage.setItem(PFAV_KEY, JSON.stringify(n)); } catch {} };
  const addFromGrid = (p) => {
    if (!items.length || items[0].store_id === store.id) { add(p, store); toast(t('added')); }
    else add(p, store);   // autre magasin : propose de vider le panier
  };

  return (
    <div className="sp-page">
      {/* 🏪 v2026.10.04.6 — bannière PLEINE LARGEUR : le bouton ← est À L'INTÉRIEUR (tout à
          gauche), TOUTES les infos du magasin d'un côté, et la PHOTO du magasin remplit
          l'espace restant. La carte 🗺️ s'ouvre à l'intérieur de la bannière. */}
      {/* 📌 v2026.10.04.7 — bannière du magasin + barre de recherche FIXES en haut.
          La bannière est COLLÉE à l'en-tête VERT (aucun espace au-dessus). */}
      {/* 📌 v2026.10.08.8 — EN-TÊTE FIXE : photo PLEIN CADRE (tous les coins) + carte
          d'info + recherche restent en haut pendant TOUT le défilement. L'en-tête
          🚀/🔔/👤 reste transparent sur la photo (jamais vert sur cette page). */}
      {/* ⚠️ v2026.10.08.8 — le ← est HORS de .sp-fixed (volontairement) : à l'intérieur,
          son z-index 95 serait LOCAL au contexte de .sp-fixed (z-index 79) et l'en-tête
          🚀/🔔/👤 (z-index 90) INTERCEPTAIT LES TAPS → bouton mort sur téléphone. Ici,
          au niveau racine, le ← flotte réellement AU-DESSUS de tout. */}
      <span className="sp-back"><BackBtn /></span>
      <div className="sp-fixed" ref={fixedRef}>
      <div className="sp-cover">
        <img className="sp-bg" src={store.photo ? photoUrl(store.photo, 'full') : (COVER_IMG[store.type] || '/stores/supermarket.jpg')} alt="" />
        <div className="sp-shade" />
      </div>
        {/* 2️⃣ carte d'info flottante en VERRE DÉPOLI : logo vert bordé blanc · nom 24 px ·
            📍 ADRESSE (clic = demander d'ouvrir la carte) · ⭐ note + (avis) · 🕘 durée */}
        <div className="sp-bar" style={{ marginTop: -55 }}>
          <span className="sp-logo">{store.photo
            ? <img src={photoUrl(store.photo, 'thumb')} alt="" />
            : (store.emoji || meta.e)}</span>
          <span className="sp-mid">
            <span className="sp-name">{store.name}{closed && <span className="badge st-cancelled" style={{ marginLeft: 6, fontSize: 10, verticalAlign: 'middle' }}>{t('closed')}</span>}</span>
            <button type="button" className="sp-addr" onClick={() => { if (window.confirm(t('view_store_map_q'))) setShowMap(true); }} title={store.address}>📍 {store.address}</button>
          </span>
          <span className="sp-rate">
            <span className="sp-star">⭐ {Number(store.rating).toFixed(1)}</span>
            {store.reviews_count > 0 && <span className="sp-rc">({store.reviews_count})</span>}
          </span>
          <span className="sp-eta">
            <span className="sp-min">🕘 {eta[0]}–{eta[1]}</span>
            <span className="sp-sub">{t('delivery_fee')}</span>
          </span>
        </div>
        {popInfo && (
          <div className="sb-infopop">
            <span>{popInfo === 'desc' ? store.description : '📍 ' + store.address}</span>
            <a className="btn blue sm" style={{ flex: 'none', padding: '4px 10px' }} href={store.lat != null ? gmapsNavUrl(store.lat, store.lng) : gmapsSearchUrl(store.address)} target="_blank" rel="noopener" title={t('gmaps_open')}>🧭</a>
            <button type="button" onClick={() => setPopInfo(null)} aria-label="fermer">✕</button>
          </div>
        )}
        {showMap && store.lat != null && (
          <div className="store-mapbox">
            <StoresMap stores={[store]} height={200} />
            <button type="button" className="sp-mapclose" onClick={() => setShowMap(false)} aria-label="fermer la carte">✕</button>
          </div>
        )}
        {closed && <div className="banner warn">{t('store_closed')}</div>}
        {/* 4️⃣ recherche blanche 56 px (pleine largeur) */}
        <div className="row sp-searchrow">
          <SuggestBox
            value={pq}
            onChange={setPq}
            placeholder={'🔍 ' + t('search_product_ph')}
            clearTitle={t('clear_search')}
            getSugs={() => fProds.map((p) => ({ key: p.id, icon: p.photo ? <img src={photoUrl(p.photo, 'thumb')} alt="" style={{ width: 24, height: 24, borderRadius: 7, objectFit: 'cover' }} /> : <NoPhoto w={24} h={24} radius={7} />, label: p.name, sub: fmtMoney(p.price), p }))}
            onEnter={logSearch}
            onPick={(x) => { logSearch(x.label); openDetail(x.p); }}
          />
        </div>
      </div>{/* fin sp-fixed */}
      {/* puces secondaires (défilent avec la page) : minimum de commande + description ℹ️.
          L'adresse est désormais DANS la carte d'info (clic → ouvrir la carte 🗺️). */}
      {(store.min_order > 0 || store.description) && (
        <div className="sp-chips">
          {store.min_order > 0 && <span className="badge sb-badge">🧾 {t('min_lbl')} {fmtMoney(store.min_order)}</span>}
          {store.description && (
            <button type="button" className="badge sb-badge sb-more" onClick={() => setPopInfo((v) => (v === 'desc' ? null : 'desc'))} title={store.description}>ℹ️ {store.description}</button>
          )}
        </div>
      )}
      {pq.trim() !== '' && Object.keys(byCat).length === 0 && <div className="mt12"><Empty e="🔎" text={t('no_data')} /></div>}

      {/* 🗂️ 2.2 v2026.10.08.8 — MENU HORIZONTAL des catégories : « Tout » en PREMIER, puis
          une boule par catégorie (pharmacie : 💊/💄). Un tap filtre la grille du dessous. */}
      {!s && cats.length > 0 && (<>
        <div className="h2 mb8 mt12">🗂️ {t('products_by_cat')}</div>
        <AutoScroll className="stc-row">
          {[{ label: null }, ...cats].map((c, i) => (
            <button key={c.label || 'tout'} type="button" className={'sty-card' + ((selCat || null) === c.label ? ' on' : '')} onClick={() => setSelCat(c.label)} title={c.label || t('all')}>
              <span className="sty-icon">{i === 0
                ? <span className="sty-emoji">🗂️</span>
                : c.photo
                  ? <img src={photoUrl(c.photo, 'thumb')} alt="" loading="lazy" />
                  : <span className="sty-emoji">{c.emoji}</span>}</span>
              <span className="sty-label">{c.label || t('all')}</span>
            </button>
          ))}
        </AutoScroll>
      </>)}
      {selCat && (
        <div className="row mt8" style={{ alignItems: 'center', gap: 8 }}>
          <span className="chip on">{selCat}</span>
          <button className="btn ghost sm" onClick={() => setSelCat(null)} title={t('clear_search')}>✕</button>
        </div>
      )}
      {/* 🏆 2.3 plus commandés · ✨ 2.4 suggestions — masquées pendant la recherche ou le filtre */}
      {!s && !selCat && (<>
        <ProductGrid title={'🏆 ' + t('top_ordered')} prods={topRow} rating={store.rating} favs={favs} onFav={toggleFav} onOpen={openDetail} onAdd={addFromGrid} />
        <ProductGrid title={'✨ ' + t('suggested_for_you')} prods={suggRow} rating={store.rating} favs={favs} onFav={toggleFav} onOpen={openDetail} onAdd={addFromGrid} />
      </>)}

      {/* 🧱 v2026.10.08.8 — TOUS les produits (ou la catégorie choisie via le menu) en
          GRILLE 2 colonnes : grandes cartes, défilement VERTICAL uniquement. */}
      <ProductGrid grid prods={Object.values(byCat).flat()} rating={store.rating} favs={favs} onFav={toggleFav} onOpen={openDetail} onAdd={addFromGrid} />

      <Modal open={!!detail} onClose={() => setDetail(null)} className="pd-modal">
        {detail && (
          <ProductDetail product={detail} closed={closed} qty={dQty} setQty={setDQty} onAdd={addFromDetail}
            siblings={products?.filter((p) => p.category === detail.category)} onPick={openDetail}
            sibFavs={favs} sibOnFav={toggleFav} sibOnAdd={addFromGrid} sibRating={store.rating} storeType={store.type} />
        )}
      </Modal>
    </div>
  );
}
// group products by category (no hook: called after conditional returns)
function groupByCat(products) {
  const m = {};
  for (const p of products) {
    const c = p.category || '•';
    (m[c] = m[c] || []).push(p);
  }
  return m;
}

/* ================= CART + CHECKOUT ================= */
export function CartPage() {
  const t = useT();
  const { lang } = useLang();   // 📍 v2026.09.23.7 : géocodage dans la langue de l'app
  const nav = useNavigate();
  const { user, register, setUser } = useAuth();
  const [acct, setAcct] = useState({ name: '', email: '', password: '' });   // compte créé à la commande (invité)
  const [confirmOpen, setConfirmOpen] = useState(false);                     // dernière confirmation avant commande
  const [cPhone, setCPhone] = useState('');
  const { items, setQty, clear, subtotal, store } = useCart();
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState(user?.phone || '');
  const [note, setNote] = useState('');
  const [payment, setPayment] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [sugg, setSugg] = useState(null);       // 📍 v2026.09.23.10 : propositions d'adresses (frappe)
  const suggTm = useRef(null);
  const suggSeq = useRef(0);   // 🛡️ v2026.10.08.8 : une réponse tardive d'une frappe précédente ne peut plus écraser les résultats courants
  const [done, setDone] = useState(null); // 🔑 confirmation finale avec le code de remise
  const [coErr, setCoErr] = useState({});  // ⚠️ erreurs par champ du checkout
  const [card, setCard] = useState({ no: '', exp: '', cvc: '' });
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState(null); // {code, discount, type, value}
  const fmtNo = (v) => v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  const fmtExp = (v) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; };
  const cardOk = payment === 'cash' ||
    (card.no.replace(/\D/g, '').length >= 12 && /^\d{2}\/\d{2}$/.test(card.exp) && card.cvc.length >= 3);

  const useGps = () => {
    if (!navigator.geolocation) return toast(t('gps_fail'), 'err');
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        setGps({ lat: p.coords.latitude, lng: p.coords.longitude });
        toast(t('gps_ok'));
        // 📍 remplir automatiquement le champ adresse avec la position trouvée
        try {
          const a = await reverseGeocode(p.coords.latitude, p.coords.longitude, lang);
          if (a) setAddress(a.split(',').slice(0, 3).join(', '));
        } catch {}
      },
      () => toast(t('gps_fail'), 'err'),
      { timeout: 6000 }
    );
  };

  // 📍 v2026.09.23.10 — AUTOCOMPLÉTION de l'adresse : pendant la frappe, on cherche
  // (Esri + OpenStreetMap, biaisé vers la position GPS / le magasin) et toucher une
  // proposition pose AUTOMATIQUEMENT le point de livraison — coordonnées exactes
  // de la proposition, envoyées avec la commande (le livreur voit le même point).
  const onAddr = (e) => {
    const v = e.target.value;
    setAddress(v);
    clearTimeout(suggTm.current);
    if (v.trim().length < 4) { suggSeq.current++; setSugg(null); return; }
    suggTm.current = setTimeout(async () => {
      const seq = ++suggSeq.current;
      const near = gps || (store?.lat != null ? { lat: store.lat, lng: store.lng } : { lat: 31.2001, lng: 29.9187 });
      try { const r = (await geocodeSearch(v.trim(), lang, near)).slice(0, 6); if (suggSeq.current === seq) setSugg(r); }
      catch { if (suggSeq.current === seq) setSugg(null); }
    }, 500);
  };
  const pickSugg = (r) => {
    setAddress(r.label.split(',').slice(0, 3).join(', '));
    setGps({ lat: r.lat, lng: r.lng });
    setSugg(null);
    toast(t('loc_defined'));
  };

  const total = subtotal - (promo?.discount || 0) + (store?.delivery_fee || 0);
  const belowMin = store && subtotal < store.min_order;
  const acctOk = !!user || (acct.name.trim().length >= 2 && acct.email.includes('@') && acct.password.length >= 5);

  const applyPromo = async () => {
    try {
      const d = await api('/promos/validate', { method: 'POST', body: { code: promoInput, subtotal } });
      setPromo(d);
      toast(t('promo_ok'));
    } catch (ex) {
      setPromo(null);
      toast(ex.message, 'err');
    }
  };

  // « Commander » ouvre D'ABORD une dernière confirmation avec le numéro de téléphone
  // (pré-rempli, modifiable). À la confirmation, le numéro est mémorisé sur le compte :
  // il ne sera plus jamais demandé (juste affiché, modifiable, à chaque commande).
  const openConfirm = () => {
    const v = V(t);
    const errs = runV({
      address: v.req(t('address'), '12 rue Saad Zaghloul, Alexandrie', 5),
      phone: v.phone(),
    }, { address, phone });
    setCoErr(errs);
    if (hasErr(errs)) return;
    setCPhone(phone || user?.phone || ''); setConfirmOpen(true);
  };

  const placeOrder = async () => {
    const v = V(t);
    const perr = v.phone()(String(cPhone || '').trim());
    setCoErr({ phone: perr });
    if (perr) return;
    setBusy(true);
    try {
      const finalPhone = cPhone.trim();
      if (!user) await register({ name: acct.name.trim(), email: acct.email.trim(), password: acct.password, phone: finalPhone, role: 'client', skip_verify: true });   // invité -> compte créé ici (sans code email)
      if (payment === 'card') await new Promise((r) => setTimeout(r, 1300)); // passerelle simulée
      const r = await api('/orders', {
        method: 'POST',
        body: {
          store_id: store.id, address, phone: finalPhone, note, payment,
          client_lat: gps?.lat, client_lng: gps?.lng,
          promo_code: promo?.code,
          items: items.map((i) => ({ product_id: i.product_id, qty: i.qty }))
        }
      });


      if (user && !user.phone) setUser({ ...user, phone: finalPhone });   // mémorisé aussi côté interface (sans recharger)
      setPhone(finalPhone);
      setConfirmOpen(false);
      clear();
      setDone({ id: r.order_id, pin: r.pin }); // 🔑 le client VOIT son code de remise avant tout
    } catch (ex) {
      toast(ex.message, 'err');
    }
    setBusy(false);
  };

  if (!items.length) {
    return (
      <>
        <div className="topbar"><BackBtn /><div className="h2 grow">{t('cart')}</div></div>
        <Empty e="🛒" text={t('cart_empty')} />
        <div className="row"><button className="btn primary block" onClick={() => nav('/app')}>{t('home')}</button></div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <BackBtn />
        <div className="h2 grow">{t('cart')} — {store.name}</div>
        <button className="btn danger sm" onClick={clear}>{t('clear')}</button>
      </div>

      <div className="card mb12">
        {items.map((i) => (
          <div key={i.product_id} className="product-row">
            {i.photo
              ? <img src={photoUrl(i.photo, 'thumb')} alt="" style={{ width: 46, height: 46, borderRadius: 12, objectFit: 'cover' }} />
              : <NoPhoto w={46} h={46} />}
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{i.name}</div>
              <div className="small" style={{ color: 'var(--brand-dark)', fontWeight: 800 }}>{fmtMoney(i.price)}</div>
            </div>
            <div className="qty-stepper">
              <button className="qs-btn" onClick={() => setQty(i.product_id, i.qty - 1)}>−</button>
              <span>{i.qty}</span>
              <button className="qs-btn" onClick={() => setQty(i.product_id, i.qty + 1)}>+</button>
            </div>
          </div>
        ))}
      </div>

      {!user && (
        <div className="card mb12">
          <div className="label mb8">👤 {t('guest_order_title')}</div>
          <p className="muted small" style={{ marginTop: 0 }}>{t('guest_order_desc')}</p>
          <div className="field">
            <label className="label">{t('name')}</label>
            <input className="input" value={acct.name} onChange={(e) => setAcct((a) => ({ ...a, name: e.target.value }))} placeholder={t('name')} />
          </div>
          <div className="field">
            <label className="label">{t('email')}</label>
            <input className="input" type="email" dir="ltr" value={acct.email} onChange={(e) => setAcct((a) => ({ ...a, email: e.target.value }))} placeholder="nom@email.com" />
          </div>
          <div className="field">
            <label className="label">{t('password')}</label>
            <input className="input" type="password" value={acct.password} onChange={(e) => setAcct((a) => ({ ...a, password: e.target.value }))} minLength={5} placeholder="•••••" />
          </div>
          <div className="row spread small mt8">
            <span className="muted">{t('have_account')}</span>
            <Link to="/login" style={{ color: 'var(--brand)', fontWeight: 700 }}>{t('link_login')}</Link>
          </div>
        </div>
      )}

      <div className="card mb12">
        <div className="field">
          <label className="label">📍 {t('address')}</label>
          <textarea className="textarea" value={address} onChange={onAddr} placeholder={t('address_ph') + ' — ex. : 12 rue Saad Zaghloul, Alexandrie'} />
          <FieldErr e={coErr.address} />
          {sugg && sugg.length > 0 && (
            <div className="card" style={{ padding: 0, marginTop: 6, overflow: 'hidden' }}>
              {sugg.map((r, i) => (
                <button key={i} type="button" onClick={() => pickSugg(r)}
                  style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: i < sugg.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', fontSize: 13.5, lineHeight: 1.35 }}>
                  📍 {r.label}
                </button>
              ))}
            </div>
          )}
          {/* 🔎 v2026.09.24.4 — vérification Google Maps : ouvre l'app Google avec le texte
              tapé (lien officiel gratuit) — le client voit la position exacte chez Google,
              puis touche la proposition correspondante ci-dessus. Aucune clé API. */}
          {address.trim().length >= 4 && (
            <button type="button" className="btn ghost sm mt8" style={{ padding: '4px 10px', fontSize: 12, alignSelf: 'flex-start' }}
              onClick={() => window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address.trim()), '_blank')}>
              🔎 {t('verify_gmaps')}
            </button>
          )}
        </div>
        <div className="row mt12 wrap" style={{ gap: 8 }}>
          <button type="button" className="btn ghost sm" onClick={useGps}>🛰️ {t('use_gps')}</button>
          <button type="button" className="btn blue sm" onClick={() => setPickOpen(true)}>🗺️ {t('choose_on_map')}</button>
          {gps && <span className="badge b-active">✓ {t('loc_defined')}</span>}
        </div>
        <div className="field mt12">
          <label className="label">📞 {t('phone')}</label>
          <input className="input" dir="ltr" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="ex. : 0100 123 4567" />
          <FieldErr e={coErr.phone} />
          {user && !user.phone && <div className="banner warn mt8" style={{ padding: '6px 10px' }}>📞 {t('phone_needed_note')}</div>}
        </div>
        <div className="field">
          <label className="label">📝 {t('note')}</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <div className="sec-title">{t('payment')}</div>
      <div className={'pay-opt' + (payment === 'cash' ? ' on' : '')} onClick={() => setPayment('cash')}>
        <span className="e">💵</span>
        <div className="grow"><div style={{ fontWeight: 700 }}>{t('pay_cash')}</div><div className="muted small">{t('pay_cash_desc')}</div></div>
      </div>
      <div className={'pay-opt' + (payment === 'card' ? ' on' : '')} onClick={() => setPayment('card')}>
        <span className="e">💳</span>
        <div className="grow"><div style={{ fontWeight: 700 }}>{t('pay_card')}</div><div className="muted small">{t('pay_card_desc')}</div></div>
      </div>

      {payment === 'card' && (
        <div className="card mt8 mb12">
          <div className="field">
            <label className="label">💳 {t('card_number')}</label>
            <input className="input" inputMode="numeric" dir="ltr" placeholder="4242 4242 4242 4242" value={card.no} onChange={(e) => setCard({ ...card, no: fmtNo(e.target.value) })} />
          </div>
          <div className="row">
            <div className="field grow">
              <label className="label">{t('expiry')}</label>
              <input className="input" dir="ltr" placeholder="12/27" value={card.exp} onChange={(e) => setCard({ ...card, exp: fmtExp(e.target.value) })} />
            </div>
            <div className="field" style={{ width: 120 }}>
              <label className="label">{t('cvc')}</label>
              <input className="input" dir="ltr" inputMode="numeric" maxLength={4} placeholder="123" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '') })} />
            </div>
          </div>
          <div className="muted small">🔒 {t('card_demo')}</div>
        </div>
      )}

      <div className="card mt12">
        <div className="row spread small"><span className="muted">{t('subtotal')}</span><b>{fmtMoney(subtotal)}</b></div>
        {promo && (
          <div className="row spread small mt4">
            <span className="muted">
              🎁 {t('discount')} <span className="badge" style={{ margin: '0 4px' }}>{promo.code}</span>
              <button className="btn danger sm" style={{ padding: '2px 8px' }} onClick={() => { setPromo(null); setPromoInput(''); }}>✕ {t('promo_remove')}</button>
            </span>
            <b style={{ color: 'var(--brand-dark)' }}>−{fmtMoney(promo.discount)}</b>
          </div>
        )}
        <div className="row spread small mt4"><span className="muted">🛵 {t('delivery_fee')}</span><b>{fmtMoney(store.delivery_fee)}</b></div>
        <hr className="divider" />
        <div className="row spread big"><span>{t('total')}</span><span>{fmtMoney(total)}</span></div>
      </div>

      {!promo && (
        <div className="row mt8" style={{ gap: 8 }}>
          <input className="input grow" style={{ textTransform: 'uppercase' }} placeholder={'🎁 ' + t('promo_title')} value={promoInput} onChange={(e) => setPromoInput(e.target.value)} />
          <button className="btn soft" onClick={applyPromo} disabled={!promoInput.trim()}>{t('promo_apply')}</button>
        </div>
      )}

      {belowMin && <div className="banner warn mt12">⚠️ {t('min_order_error')} : {fmtMoney(store.min_order)}</div>}
      {gps && store?.lat != null && (
        <div className="banner ok mt12">🛵 {t('Livraison estimée')} : <b>{etaRange(store.type, distM(store.lat, store.lng, gps.lat, gps.lng)).join('-')} min</b></div>
      )}

      <button className="btn primary block mt12 mb16" disabled={busy || belowMin || !cardOk || !acctOk} onClick={openConfirm}>
        {busy && payment === 'card' ? t('processing_pay') : busy ? '...' : t('place_order')} · {fmtMoney(total)}
      </button>

      <Modal open={!!done} onClose={() => { setDone(null); nav('/app/orders'); }} title={'✅ ' + t('order_placed')}>
        {done && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>🎉</div>
            <div style={{ fontWeight: 800, margin: '6px 0' }}>Commande #{done.id}</div>
            {done.pin && (
              <>
                <div className="muted small">{t('Donnez ce code au livreur à la livraison')}</div>
                <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 6, margin: '8px 0', color: '#059669' }}>{done.pin}</div>
              </>
            )}
            <button className="btn primary block" onClick={() => { setDone(null); nav('/app/orders'); }}>🧾 Voir mes commandes</button>
          </div>
        )}
      </Modal>

      <Modal open={pickOpen} onClose={() => setPickOpen(false)} title={'🗺️ ' + t('choose_on_map')}>
        {pickOpen && (
          <PickMap
            initial={gps || { lat: 31.2001, lng: 29.9187 }}
            onConfirm={async ({ lat, lng, address }) => {
              setGps({ lat, lng });
              if (address) setAddress(address.split(',').slice(0, 3).join(', '));
              toast(t('address_updated'));
              setPickOpen(false);
            }}
          />
        )}
      </Modal>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={'📞 ' + t('confirm_order_title')}>
        <p className="muted small" style={{ marginTop: 0 }}>{t('confirm_phone_msg')}</p>
        <div className="field">
          <label className="label">📞 {t('phone')}</label>
          <input className="input" dir="ltr" type="tel" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="ex. : 0100 123 4567" style={{ fontSize: 17, fontWeight: 700 }} />
          <FieldErr e={coErr.phone} />
        </div>
        <button className="btn primary block mt8" disabled={busy || cPhone.replace(/\D/g, '').length < 8} onClick={placeOrder}>
          {busy ? (payment === 'card' ? t('processing_pay') : '...') : '✅ ' + t('confirm_order_btn')} · {fmtMoney(total)}
        </button>
      </Modal>
    </>
  );
}

/* ================= ORDERS ================= */
export function ClientOrders() {
  const t = useT();
  const { lang } = useLang();
  const { user } = useAuth();
  const [orders, setOrders] = useState(null);
  const [rate, setRate] = useState(null);
  const [stars, setStars] = useState({ store: 5, driver: 5 });
  const [comment, setComment] = useState('');
  const [track, setTrack] = useState(null);
  const [chat, setChat] = useState(null);
  const [tab, setTab] = useState('active');
  const seen = useRef(null);

  usePoll(() => {
    if (!user) return;   // invité : pas de requête
    api('/orders/mine').then((d) => {
      if (seen.current) {
        for (const o of d.orders) {
          if (seen.current[o.id] && seen.current[o.id] !== o.status) notif(`${t('order')} #${o.id}`, t('st_' + o.status));
        }
      }
      const m = {};
      d.orders.forEach((o) => (m[o.id] = o.status));
      seen.current = m;
      setOrders(d.orders);
    }).catch(() => {});
  }, 5000);

  // Rafraîchit la position du livreur pendant que la carte est ouverte
  useEffect(() => {
    if (!track) return;
    const id = setInterval(() => {
      api(`/orders/${track.order.id}/track`).then(setTrack).catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [track?.order?.id]);

  const openTrack = (o) => api(`/orders/${o.id}/track`).then(setTrack).catch((e) => toast(e.message, 'err'));
  const sendReview = async () => {
    try {
      await api(`/orders/${rate.id}/review`, { method: 'POST', body: { store_stars: stars.store, driver_stars: stars.driver, comment } });
      toast(t('thanks_review'));
      setRate(null);
      api('/orders/mine').then((d) => setOrders(d.orders)).catch(() => {});
    } catch (ex) { toast(ex.message, 'err'); }
  };

  const cancel = async (id) => {
    try { await api(`/orders/${id}/cancel`, { method: 'POST' }); toast(t('cancelled_ok')); } catch (ex) { toast(ex.message, 'err'); }
  };

  if (!user) return (
    <>
      <div className="topbar"><div className="h2 grow">📦 {t('my_orders')}</div></div>
      <Empty e="🔐" text={t('login_orders_cta')} />
      <div className="row"><Link to="/login" className="btn primary block">{t('link_login')}</Link></div>
    </>
  );
  if (!orders) return <Spinner />;
  const ACTIVE = ['pending', 'accepted', 'preparing', 'ready', 'assigned', 'picked_up'];
  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const past = orders.filter((o) => !ACTIVE.includes(o.status));
  const list = tab === 'active' ? active : past;
  return (
    <>
      <div className="topbar"><div className="h1 grow">🧾 {t('my_orders')}</div></div>
      <div className="chips">
        <button className={'chip' + (tab === 'active' ? ' on' : '')} onClick={() => setTab('active')}>🛵 {t('tab_active')} ({active.length})</button>
        <button className={'chip' + (tab === 'history' ? ' on' : '')} onClick={() => setTab('history')}>📁 {t('history')} ({past.length})</button>
      </div>
      {list.length === 0 ? (
        <Empty e={tab === 'active' ? '🛵' : '📁'} text={tab === 'active' ? t('orders_empty') : t('no_data')} />
      ) : (
        list.map((o) => (
          <div key={o.id} className="card mb12">
            <div className="row spread">
              <div className="row" style={{ gap: 8 }}>
                <div className="p-emoji" style={{ width: 40, height: 40, fontSize: 20 }}>{o.store_emoji}</div>
                <div>
                  <div style={{ fontWeight: 800 }}>{o.store_name} {o.kind === 'market' && <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontSize: 10 }}>🛍️ {t('market')}</span>}</div>
                  <div className="muted small">#{o.id} · {fmtDate(o.created_at, lang)}{o.pin && ['ready', 'assigned', 'picked_up'].includes(o.status) && <span style={{ color: '#b45309', fontWeight: 800 }}> · 🔑 {o.pin}</span>}</div>
                </div>
              </div>
              <StatusBadge status={o.status} />
            </div>
            <Stepper status={o.status} />
            {ACTIVE.includes(o.status) && o.pin && (
              <div className="banner ok mt8">🔑 {t('Code de remise')} : <b style={{ fontSize: 17, letterSpacing: 2 }}>{o.pin}</b> — {t('Donnez ce code au livreur à la livraison')}</div>
            )}
            <div className="divider" />
            {o.items.map((it) => (
              <div key={it.id} className="row spread small">
                <span>{it.emoji} {it.name} × {it.qty}</span>
                <span className="muted">{fmtMoney(it.price * it.qty)}</span>
              </div>
            ))}
            <div className="row spread mt8">
              <PayBadge o={o} />
              <b className="big">{fmtMoney(o.total)}</b>
            </div>
            {o.driver_name && o.status !== 'delivered' && (
              <div className="banner ok mt8">🛵 {t('driver')} : <b>{o.driver_name}</b> · <a href={'tel:' + o.driver_phone}>{o.driver_phone}</a></div>
            )}
            <div className="row mt8 wrap">
              {['assigned', 'picked_up'].includes(o.status) && (
                <button className="btn blue sm" onClick={() => openTrack(o)}>🗺️ {t('view_map')}</button>
              )}
              {!['cancelled', 'rejected', 'refused'].includes(o.status) && (
                <button className="btn ghost sm" onClick={() => setChat(o)}>💬 {t('detail')}</button>
              )}
              {o.status === 'pending' && (
                <button className="btn danger sm" onClick={() => cancel(o.id)}>{t('cancel')}</button>
              )}
              {o.status === 'delivered' && !o.rev_store && (
                <button className="btn amber sm" onClick={() => { setRate(o); setStars({ store: 5, driver: 5 }); setComment(''); }}>⭐ {t('rate_order')}</button>
              )}
            </div>
            <LastMsgLine o={o} />
            {o.status === 'delivered' && o.rev_store && (
              <div className="row small muted mt8" style={{ gap: 10 }}>
                <span>{t('your_review')} :</span>
                <Stars value={o.rev_store} size={16} />
                {o.rev_driver && <><span>· 🛵</span><Stars value={o.rev_driver} size={16} /></>}
              </div>
            )}
          </div>
        ))
      )}

      <Modal open={!!track} onClose={() => setTrack(null)} title={'🗺️ ' + t('track_title')}>
        {track && (
          <>
            <TrackMap
              storePos={track.order.store_lat != null ? { lat: track.order.store_lat, lng: track.order.store_lng } : null}
              clientPos={track.order.client_lat != null ? { lat: track.order.client_lat, lng: track.order.client_lng } : null}
              driverPos={track.driver_pos ? { lat: track.driver_pos.lat, lng: track.driver_pos.lng } : null}
            />
            <div className="row spread mt12 wrap">
              <StatusBadge status={track.order.status} />
              {track.order.driver_name && (
                <span className="small">🛵 {track.order.driver_name} · <a href={'tel:' + track.order.driver_phone}>{track.order.driver_phone}</a></span>
              )}
            </div>
            {track.order.client_lat != null && (
              <a className="btn blue sm block mt8" href={gmapsNavUrl(track.order.client_lat, track.order.client_lng)} target="_blank" rel="noopener">🧭 {t('gmaps_open')}</a>
            )}
            <Stepper status={track.order.status} />
            {(() => {
              const o = track.order, pos = track.driver_pos;
              const live = pos && ['assigned', 'picked_up'].includes(o.status) && o.client_lat != null
                ? Math.max(1, Math.round((distM(pos.lat, pos.lng, o.client_lat, o.client_lng) / 1000) * (60 / 22) + 2)) : null;
              const fixed = o.store_lat != null && o.client_lat != null
                ? etaRange(o.store_type, distM(o.store_lat, o.store_lng, o.client_lat, o.client_lng)) : null;
              if (live == null && !fixed) return null;
              const eta = live != null
                ? t('Arrive dans') + ' ~' + live + ' min'
                : fixed ? t('Livraison estimée') + ' : ' + fixed[0] + '-' + fixed[1] + ' min' : null;
              if (!eta) return null;
              return <div className="banner ok mt8">🛵 <b>{eta}</b></div>;
            })()}
            {!['delivered', 'cancelled', 'rejected'].includes(track.order.status) && track.order.pin && (
              <div className="banner warn mt8">🔑 {t('Code de remise')} : <b style={{ fontSize: 17, letterSpacing: 2 }}>{track.order.pin}</b></div>
            )}
          </>
        )}
      </Modal>

      <Modal open={!!rate} onClose={() => setRate(null)} title={'⭐ ' + t('rate_order')}>
        {rate && (
          <>
            <div className="row spread mb12">
              <span style={{ fontWeight: 700 }}>{rate.store_emoji} {t('rate_store')}</span>
              <Stars value={stars.store} onChange={(v) => setStars((s) => ({ ...s, store: v }))} />
            </div>
            {rate.driver_id && (
              <div className="row spread mb12">
                <span style={{ fontWeight: 700 }}>🛵 {t('rate_driver')}</span>
                <Stars value={stars.driver} onChange={(v) => setStars((s) => ({ ...s, driver: v }))} />
              </div>
            )}
            <div className="field">
              <textarea className="textarea" placeholder={t('comment_ph')} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <button className="btn primary block" onClick={sendReview}>{t('send')}</button>
          </>
        )}
      </Modal>

      <ChatModal order={chat} onClose={() => setChat(null)} />
    </>
  );
}

/* ================= PROFILE ================= */
export function ClientProfile() {
  const t = useT();
  const nav = useNavigate();
  const { user, logout, setUser } = useAuth();
  const [pOpen, setPOpen] = useState(false);                                  // formulaire « Devenir partenaire »
  const [pForm, setPForm] = useState({ name: '', type: 'restaurant', phone: '', address: '', lat: null, lng: null });
  const [pBusy, setPBusy] = useState(false);
  const [pErr, setPErr] = useState({});   // ⚠️ erreurs par champ du formulaire partenaire
  const [pMapOpen, setPMapOpen] = useState(false);                           // choix de la position sur la carte

  const submitPartner = async () => {
    const v = V(t);
    const errs = runV({
      name: v.name(t('store_name')),
      phone: v.phone(),
      address: v.req(t('address'), '12 rue Saad Zaghloul, Alexandrie', 5),
    }, pForm);
    setPErr(errs);
    if (hasErr(errs)) return;   // les erreurs s'affichent SOUS chaque champ fautif
    setPBusy(true);
    try {
      const d = await api('/partner', { method: 'POST', body: {
        store_name: pForm.name, store_type: pForm.type, store_phone: pForm.phone, store_address: pForm.address,
        store_lat: pForm.lat, store_lng: pForm.lng
      } });
      setUser(d.user);            // le compte devient marchand : la bascule apparaît
      setPOpen(false);
      toast(t('pending_store'));
    } catch (ex) { toast(ex.message, 'err'); }
    setPBusy(false);
  };

  if (!user) return (
    <>
      <div className="topbar"><div className="h1 grow">👤 {t('profile')}</div></div>
      <Empty e="🔐" text={t('login_profile_cta')} />
      <div className="row"><Link to="/login" className="btn primary block">{t('link_login')}</Link></div>
    </>
  );
  return (
    <>
      <div className="topbar"><div className="h1 grow">👤 {t('profile')}</div></div>
      <div className="card row">
        <div className="avatar">{user?.name?.[0]?.toUpperCase()}</div>
        <div className="grow">
          <div className="h2">{user?.name}</div>
          <div className="muted small">{user?.email}</div>
          <div className="muted small">📞 {user?.phone}</div>
        </div>
      </div>
      <div className="card mt12">
        <AccountSettings />
      </div>
      <div className="card mt12">
        <div className="row spread">
          <div style={{ fontWeight: 700 }}>🌐 {t('language')}</div>
          <LangSwitch />
        </div>
      </div>

      {/* ⚙️ v2026.09.30.1 : les réglages (ancienne page Paramètres) sont fusionnés dans le profil */}
      <div className="card mt12">
        <div className="row spread">
          <div style={{ fontWeight: 700 }}>🔔 {t('push_notifs')}</div>
          <BellButton />
        </div>
        <div className="muted small">{t('notif_toggle_hint')}</div>
      </div>
      <div className="card mt12">
        <div style={{ fontWeight: 700 }}>ℹ️ {t('about')}</div>
        <div className="muted small mt4">YallaLiv — livraison &amp; marché 🚀🛍️ · v2026.10.08.8</div>
      </div>

      {user.role === 'client' && (
        <div className="card mt12">
          <div className="label mb4">🏪 {t('partner_title')}</div>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 8 }}>{t('partner_desc')}</p>
          <button className="btn soft block" onClick={() => { setPForm((f) => ({ ...f, phone: user.phone || '' })); setPOpen(true); }}>
            {t('partner_title')} →
          </button>
        </div>
      )}

      {(user.role === 'merchant' || user.role === 'superadmin') && (
        <div className="card mt12">
          <div className="label mb8">🧭 {t('my_spaces')}</div>
          {user.role === 'merchant' && (
            <button className="btn soft block mb8" onClick={() => nav('/merchant')}>🏪 {t('switch_store')}</button>
          )}
          {user.role === 'superadmin' && (
            <button className="btn soft block" onClick={() => nav('/admin')}>👑 {t('switch_admin')}</button>
          )}
        </div>
      )}

      <Modal open={pOpen} onClose={() => setPOpen(false)} title={'🏪 ' + t('partner_title')}>
        <div className="field">
          <label className="label">{t('store_name')}</label>
          <input className="input" value={pForm.name} onChange={(e) => setPForm((f) => ({ ...f, name: e.target.value }))} placeholder="ex. : Restaurant Al Nil" />
          <FieldErr e={pErr.name} />
        </div>
        <div className="field">
          <label className="label">{t('store_type')}</label>
          <select className="select" value={pForm.type} onChange={(e) => setPForm((f) => ({ ...f, type: e.target.value }))}>
            <option value="restaurant">🍽️ {t('type_restaurant')}</option>
            <option value="market">🛒 {t('type_market')}</option>
            <option value="pharmacy">💊 {t('type_pharmacy')}</option>
            <option value="home">🛋️ {t('type_home')}</option>
            <option value="clothes">👕 {t('type_clothes')}</option>
            <option value="electronics">📱 {t('type_electronics')}</option>
            <option value="appliance">🧺 {t('type_appliance')}</option>
          </select>
        </div>
        <div className="field">
          <label className="label">{t('phone')}</label>
          <input className="input" dir="ltr" value={pForm.phone} onChange={(e) => setPForm((f) => ({ ...f, phone: e.target.value }))} placeholder="ex. : 0100 123 4567" />
          <FieldErr e={pErr.phone} />
        </div>
        <div className="field">
          <label className="label">{t('address')}</label>
          <textarea className="textarea" rows={2} value={pForm.address} onChange={(e) => setPForm((f) => ({ ...f, address: e.target.value }))} placeholder={t('address_ph') + ' — ex. : 12 rue Saad Zaghloul, Alexandrie'} />
          <FieldErr e={pErr.address} />
        </div>
        <div className="row wrap mt4" style={{ gap: 8 }}>
          <button type="button" className="btn blue sm" onClick={() => setPMapOpen(true)}>🗺️ {t('choose_on_map')}</button>
          {pForm.lat != null && <span className="badge b-active">✓ {t('loc_defined')}</span>}
        </div>
        <p className="muted small">⏳ {t('pending_store')} · {t('partner_missing_note')}</p>
        <button className="btn primary block mt8" disabled={pBusy} onClick={submitPartner}>
          {pBusy ? '...' : t('partner_submit')}
        </button>
      </Modal>

      <Modal open={pMapOpen} onClose={() => setPMapOpen(false)} title={'🗺️ ' + t('choose_on_map')}>
        {pMapOpen && (
          <PickMap
            initial={{ lat: pForm.lat || 31.2001, lng: pForm.lng || 29.9187 }}
            onConfirm={({ lat, lng, address }) => {
              setPForm((f) => ({ ...f, lat, lng }));
              if (address) setPForm((f) => ({ ...f, address: f.address || address.split(',').slice(0, 3).join(', ') }));
              toast(t('address_updated'));
              setPMapOpen(false);
            }}
          />
        )}
      </Modal>
      <div className="card mt12">
        <div className="row spread">
          <div style={{ fontWeight: 700 }}>🔔 {t('notif_enable')}</div>
          <button className="btn soft sm" onClick={async () => {
            const r = await pushSubscribe();
            toast(r === 'granted' ? t('push_on') : r === 'denied' ? t('push_no') : t('push_fail'), r === 'granted' ? 'ok' : 'err');
          }}>Activate</button>
        </div>
      </div>
      <button className="btn danger block mt16" onClick={logout}>🚪 {t('logout')}</button>
      <div className="muted small mt16" style={{ textAlign: 'center' }}>🚀 YallaLiv · v1.0</div>
    </>
  );
}

// ================= 🛍️ v2026.09.24.3 — Page Marché (toutes les annonces + mes annonces) =================
export function MarketPage() {
  const t = useT(); const { lang } = useLang(); const nav = useNavigate(); const { user } = useAuth();
  const [spM] = useSearchParams();
  const [cat, setCat] = useState(spM.get('cat') || 'all');
  const [sub, setSub] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [pmin, setPmin] = useState('');
  const [pmax, setPmax] = useState('');
  const [showF, setShowF] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [data, setData] = useState(null);
  const [more, setMore] = useState(false);
  const [mine, setMine] = useState(null);
  const [favIds, setFavIds] = useState(null);
  const [near, setNear] = useState(null);        // 📍 Phase 2 : position pour le tri "près de moi"
  const [saved, setSaved] = useState(null);      // 🔔 Phase 2 : recherches sauvegardées
  const [unread, setUnread] = useState(0);       // 💬 Phase 2 : messages non-lus
  const subLbl = (k) => (SUB_LBL[k] ? (SUB_LBL[k][lang] || SUB_LBL[k].fr) : k);
  const condLbl = (k) => (COND_LBL[k] ? (COND_LBL[k][lang] || COND_LBL[k].fr) : '');

  const load = (pg, keep) => {
    if (favOnly) { api('/listings/favorites').then((d) => { setData(d.listings); setMore(false); }).catch(() => setData([])); return; }
    const p = new URLSearchParams();
    if (cat !== 'all') p.set('cat', cat);
    if (sub !== 'all') p.set('sub', sub);
    if (q.trim()) p.set('q', q.trim());
    if (pmin) p.set('price_min', pmin);
    if (pmax) p.set('price_max', pmax);
    if (sort !== 'recent' && sort !== 'near') p.set('sort', sort);
    if (sort === 'near') { p.set('sort', 'near'); if (near) { p.set('lat', String(near.lat)); p.set('lng', String(near.lng)); } }
    p.set('page', String(pg));
    api('/listings?' + p.toString()).then((d) => { setData((old) => (keep && old ? old.concat(d.listings) : d.listings)); setMore(!!d.hasMore); })
      .catch(() => setData([]));
  };
  useEffect(() => { setData(null); load(1, false); }, [cat, sub, sort, favOnly, near]); // eslint-disable-line   // 📍 near en dépendance : recharge quand la position arrive
  useEffect(() => {
    if (!user) return;
    api('/listings/mine').then((d) => setMine(d.listings)).catch(() => {});
    api('/listings/favorites').then((d) => setFavIds(new Set(d.listings.map((l) => l.id)))).catch(() => setFavIds(new Set()));
    api('/market/chats').then((d) => setUnread(d.unread || 0)).catch(() => {});                    // 💬 Phase 2
    api('/saved-searches').then((d) => setSaved(d.searches)).catch(() => {});                      // 🔔 Phase 2
  }, [user]);

  const toggleFav = async (l, e) => {
    if (e) e.stopPropagation();
    if (!user) return nav('/login');
    try {
      const d = await api('/listings/' + l.id + '/fav', { method: 'POST' });
      setFavIds((s) => { const n = new Set(s || []); if (d.fav) n.add(l.id); else n.delete(l.id); return n; });
      if (favOnly) load(1, false);
    } catch (ex) { toast(ex.message, 'err'); }
  };
  const toggle = async (l) => { try { await api('/listings/' + l.id, { method: 'PUT', body: { available: l.available ? 0 : 1 } }); load(1, false); } catch (ex) { toast(ex.message, 'err'); } };
  const del = async (l) => { if (!window.confirm(t('confirm_delete'))) return; try { await api('/listings/' + l.id, { method: 'DELETE' }); toast(t('listing_deleted')); load(1, false); } catch (ex) { toast(ex.message, 'err'); } };
  const renew = async (l) => { try { await api('/listings/' + l.id + '/renew', { method: 'POST' }); toast(t('renewed'), 'ok'); } catch (ex) { toast(ex.message, 'err'); } };
  const onSort = (v) => {   // 📍 "près de moi" : demande la position GPS une seule fois
    if (v === 'near' && !near) {
      if (!navigator.geolocation) return toast(t('mk_gps_no'), 'err');
      navigator.geolocation.getCurrentPosition(
        (pos) => { setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setSort('near'); },   // l'effet [.., near] recharge avec la bonne closure
        () => toast(t('mk_gps_denied'), 'err'),
      );
      return;
    }
    setSort(v);
  };
  const saveSearch = async () => {   // 🔔 Phase 2
    if (favOnly) return;
    try {
      await api('/saved-searches', { method: 'POST', body: { q: q.trim(), cat: cat !== 'all' ? cat : null, sub: sub !== 'all' ? sub : null, price_min: pmin || null, price_max: pmax || null } });
      toast(t('search_saved'), 'ok');
      api('/saved-searches').then((r2) => setSaved(r2.searches));
    } catch (ex) { toast(ex.message, 'err'); }
  };
  const applySearch = (s) => {
    setQ(s.q || ''); setCat(s.cat || 'all'); setSub(s.sub || 'all');
    setPmin(s.price_min != null ? String(s.price_min) : ''); setPmax(s.price_max != null ? String(s.price_max) : '');
    setFavOnly(false); setSort('recent');
    // 🐛 fetch direct avec paramètres explicites (un setTimeout(load) aurait une closure périmée)
    const p = new URLSearchParams();
    if (s.q) p.set('q', s.q);
    if (s.cat && s.cat !== 'all') p.set('cat', s.cat);
    if (s.sub && s.sub !== 'all') p.set('sub', s.sub);
    if (s.price_min != null) p.set('price_min', String(s.price_min));
    if (s.price_max != null) p.set('price_max', String(s.price_max));
    p.set('page', '1');
    setData(null);
    api('/listings?' + p.toString()).then((d) => { setData(d.listings); setMore(!!d.hasMore); }).catch(() => setData([]));
  };
  const rmSearch = async (s, e) => { e.stopPropagation(); try { await api('/saved-searches/' + s.id, { method: 'DELETE' }); setSaved((l) => (l || []).filter((x) => x.id !== s.id)); } catch {} };

  return (
    <div>
      <div className="topbar">
        <BackBtn />
        <div className="grow"><div className="brand-name">🛍️ {t('market')}</div></div>
        <button className="btn ghost sm" style={{ position: 'relative' }} title={t('mk_chats')} onClick={() => nav('/app/chats')}>
          💬 {unread > 0 && <span className="dot-badge">{unread > 99 ? '99+' : unread}</span>}
        </button>
        <button className="btn ghost sm" title={t('my_sales')} onClick={() => nav('/app/sales')}>📦</button>
        <button className="btn primary sm" onClick={() => nav('/app/publish')}>＋ {t('publish')}</button>
      </div>

      <div className="row mb8" style={{ gap: 6 }}>
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); load(1, false); } }}
          placeholder={'🔍 ' + t('search_ph')} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #e3e9f0' }} />
        <button className="btn blue" title={t('search')} onClick={() => load(1, false)}>🔍</button>
        <button className={'btn' + (favOnly ? ' primary' : ' ghost')} title={t('favorites')} onClick={() => setFavOnly((v) => !v)}>❤️</button>
        <button className={'btn' + (showF ? ' primary' : ' ghost')} title={t('sort')} onClick={() => setShowF((v) => !v)}>⚙️</button>
        <button className="btn ghost" title={t('save_search')} onClick={saveSearch}>🔔</button>
      </div>

      {showF && (
        <div className="card mb8" style={{ padding: 10 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <select className="input" value={sort} onChange={(e) => onSort(e.target.value)} style={{ padding: '8px', flexGrow: 1, minWidth: 130 }}>
              <option value="recent">🕐 {t('sort_recent')}</option>
              <option value="price_asc">💰 {t('sort_price_asc')}</option>
              <option value="price_desc">💰 {t('sort_price_desc')}</option>
              <option value="popular">🔥 {t('sort_popular')}</option>
              <option value="near">📍 {t('sort_near')}</option>
            </select>
            <input className="input" dir="ltr" type="number" min="0" value={pmin} onChange={(e) => setPmin(e.target.value)} placeholder={t('price_min')} style={{ minWidth: 90, padding: '8px', flexGrow: 1 }} />
            <input className="input" dir="ltr" type="number" min="0" value={pmax} onChange={(e) => setPmax(e.target.value)} placeholder={t('price_max')} style={{ minWidth: 90, padding: '8px', flexGrow: 1 }} />
            <button className="btn blue" onClick={() => load(1, false)}>✅ {t('apply')}</button>
          </div>
        </div>
      )}

      <div className="row wrap mb8" style={{ gap: 6 }}>
        {[['all', '🛍️'], ...Object.entries(CAT_EMOJI)].map(([k, e]) => (
          <button key={k} className={'chip' + (cat === k && !favOnly ? ' on' : '')} onClick={() => { setCat(k); setSub('all'); setFavOnly(false); }}>{e} {k === 'all' ? t('sub_all') : t('cat_' + k)}</button>
        ))}
      </div>
      {cat !== 'all' && (SUBCATS[cat] || []).length > 0 && !favOnly && (
        <div className="row wrap mb12" style={{ gap: 6 }}>
          {[['all', '•'], ...SUBCATS[cat]].map(([k, e]) => (
            <button key={k} className={'chip sm' + (sub === k ? ' on' : '')} onClick={() => setSub(k)}>{e} {k === 'all' ? t('sub_all') : subLbl(k)}</button>
          ))}
        </div>
      )}
      {user && saved && saved.length > 0 && !favOnly && (
        <div className="row wrap mb8" style={{ gap: 6, alignItems: 'center' }}>
          <span className="muted xsmall" style={{ fontWeight: 800 }}>🔔 {t('saved_searches')} :</span>
          {saved.map((s) => (
            <button key={s.id} className="chip sm" onClick={() => applySearch(s)}>
              {(s.q || '') + (s.cat && s.cat !== 'all' ? ' ' + (CAT_EMOJI[s.cat] || '') : '') + (s.price_max ? ' ≤' + s.price_max : '') || '🔎'}
              <span style={{ marginLeft: 5, opacity: 0.55 }} onClick={(e) => rmSearch(s, e)}>✕</span>
            </button>
          ))}
        </div>
      )}
      {favOnly && <div className="muted small mb12">❤️ {t('favorites')}</div>}

      {user && mine && mine.length > 0 && (
        <div className="card mb12" style={{ padding: 12 }}>
          <div className="h2 mb8">📋 {t('my_listings')}</div>
          {mine.map((l) => (
            <div key={l.id} className="row spread wrap" style={{ padding: '8px 0', borderBottom: '1px dashed #eef2f7', gap: 6 }}>
              <div className="grow" style={{ minWidth: 130, cursor: 'pointer' }} onClick={() => nav('/app/market/' + l.id)}>
                <div className="small" style={{ fontWeight: 700 }}>{CAT_EMOJI[l.category] || '📦'} {l.name} {l.available ? '' : <span className="muted small">(masquée)</span>}</div>
                <div className="muted small">{fmtMoney(l.price)} · 👁 {l.views || 0} · ❤️ {l.favs || 0}</div>
              </div>
              <div className="row wrap" style={{ gap: 4 }}>
                <button className="btn ghost sm" title={t('renew')} onClick={() => renew(l)}>🔄</button>
                <button className="btn ghost sm" onClick={() => nav('/app/publish?edit=' + l.id)}>✏️</button>
                <button className="btn ghost sm" onClick={() => toggle(l)}>{l.available ? '🚫' : '✅'}</button>
                <button className="btn danger sm" onClick={() => del(l)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!data ? <Spinner /> : data.length === 0 ? <Empty e={favOnly ? '❤️' : '🛍️'} text={favOnly ? t('favorites') : t('no_listings')} /> : (
        <div>
          <div className="store-grid">
            {data.map((l) => (
              <div key={l.id} className="card mkt-lcard" onClick={() => nav('/app/market/' + l.id)}>
                <div className="mkt-lphoto">
                  {l.photos && l.photos[0]
                    ? <img src={l.photos[0]} alt="" />
                    : <div className="mkt-nophoto">{CAT_EMOJI[l.category] || '📦'}</div>}
                  <button className={'fav-btn' + (favIds && favIds.has(l.id) ? ' on' : '')} onClick={(e) => toggleFav(l, e)}>❤️</button>
                  {l.condition && <span className="cond-badge">{l.condition === 'new' ? '✨' : l.condition === 'like_new' ? '🌟' : '♻️'} {condLbl(l.condition)}</span>}
                </div>
                <div className="mkt-lbody">
                  <div className="small ellipsis" style={{ fontWeight: 800 }}>{l.name}</div>
                  <div style={{ fontWeight: 900, color: 'var(--brand-dark)' }}>{fmtMoney(l.price)}</div>
                  <div className="muted xsmall ellipsis">👤 {l.seller}{l.subcategory ? ' · ' + subLbl(l.subcategory) : ''}</div>
                  <div className="muted xsmall">👁 {l.views || 0}{l.favs ? ' · ❤️ ' + l.favs : ''}</div>
                </div>
              </div>
            ))}
          </div>
          {more && <button className="btn ghost block mt12" onClick={() => load(Math.ceil(data.length / 20) + 1, true)}>⬇️ {t('load_more')}</button>}
        </div>
      )}
    </div>
  );
}

// ================= 🔍 Fiche annonce (v2026.09.26.1) =================
export function ListingDetailPage() {
  const t = useT(); const { lang } = useLang(); const nav = useNavigate(); const { user } = useAuth();
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [gi, setGi] = useState(0);
  const [fav, setFav] = useState(false);
  const [rep, setRep] = useState(false);       // 🚨 signalement
  const [repR, setRepR] = useState(null);
  const [dlv, setDlv] = useState(false);       // 🛵 Phase 3 : livraison YallaLiv
  const [dAddr, setDAddr] = useState('');
  const [dPhone, setDPhone] = useState(user?.phone || '');
  const [dNote, setDNote] = useState('');
  const [dGps, setDGps] = useState(null);
  const [dSugg, setDSugg] = useState(null);
  const [dBusy, setDBusy] = useState(false);
  const dTm = useRef(null);
  const dSeq = useRef(0);   // 🛡️ v2026.10.08.8 : anti-réponse-périmée
  const subLbl = (k) => (SUB_LBL[k] ? (SUB_LBL[k][lang] || SUB_LBL[k].fr) : k);
  const condLbl = (k) => (COND_LBL[k] ? (COND_LBL[k][lang] || COND_LBL[k].fr) : '');

  useEffect(() => { setD(null); setErr(null); setGi(0); api('/listings/' + id).then(setD).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => { if (user) api('/listings/favorites').then((r) => setFav(r.listings.some((l) => String(l.id) === String(id)))).catch(() => {}); }, [user, id]);

  if (err) return (<div><div className="topbar"><BackBtn /><div className="grow"><div className="brand-name">🛍️ {t('market')}</div></div></div><Empty e="😕" text={err} /></div>);
  if (!d) return (<div><div className="topbar"><BackBtn /></div><Spinner /></div>);
  const l = d.listing;
  const photos = (l.photos || []).filter(Boolean);
  const own = user && (user.id === l.user_id || user.role === 'superadmin');
  const toggleFav = async () => { if (!user) return nav('/login'); try { const r = await api('/listings/' + l.id + '/fav', { method: 'POST' }); setFav(r.fav); } catch (ex) { toast(ex.message, 'err'); } };
  const share = async () => {
    const url = window.location.origin + '/app/market/' + l.id;
    try { if (navigator.share) await navigator.share({ title: l.name, url }); else { await navigator.clipboard.writeText(url); toast(t('link_copied'), 'ok'); } } catch {}
  };
  const onDAddr = (e) => {   // 📍 autocomplétion adresse de livraison (même mécanisme que le panier)
    const v = e.target.value;
    setDAddr(v);
    clearTimeout(dTm.current);
    if (v.trim().length < 4) { dSeq.current++; setDSugg(null); return; }
    dTm.current = setTimeout(async () => {
      const seq = ++dSeq.current;
      const near = dGps || (l.lat != null ? { lat: l.lat, lng: l.lng } : { lat: 31.2001, lng: 29.9187 });
      try { const r = (await geocodeSearch(v.trim(), lang, near)).slice(0, 6); if (dSeq.current === seq) setDSugg(r); }
      catch { if (dSeq.current === seq) setDSugg(null); }
    }, 500);
  };
  const pickDSugg = (r) => { setDAddr(r.label.split(',').slice(0, 3).join(', ')); setDGps({ lat: r.lat, lng: r.lng }); setDSugg(null); };
  const feeEst = dGps && l.lat != null
    ? Math.max(15, Math.min(70, Math.round(20 + Math.max(0, distM(dGps.lat, dGps.lng, l.lat, l.lng) / 1000 - 2) * 2.5)))
    : null;   // base 20 EGP + 2,5 EGP/km au-delà de 2 km
  const orderDelivery = async () => {
    if (dBusy) return;
    if (dAddr.trim().length < 5) return toast(t('addr_too_short'), 'err');
    if (!dGps) return toast(t('loc_required'), 'err');
    if (!dPhone.trim()) return toast(t('listing_phone') + ' ?', 'err');
    setDBusy(true);
    try {
      const r = await api('/market/deliver', { method: 'POST', body: { listing_id: l.id, address: dAddr.trim(), phone: dPhone.trim(), note: dNote.trim(), lat: dGps.lat, lng: dGps.lng, delivery_fee: feeEst || 25 } });
      toast(t('deliver_ok') + ' 🔑 ' + r.pin, 'ok');
      setDlv(false); setDAddr(''); setDGps(null); setDNote('');
      nav('/app/orders');
    } catch (ex) { toast(ex.message, 'err'); }
    setDBusy(false);
  };
  const openChat = async () => {   // 💬 Phase 2 : discussion intégrée avec le vendeur
    try { const r = await api('/market/chat', { method: 'POST', body: { listing_id: l.id } }); nav('/app/chat/' + r.id); }
    catch (ex) { toast(ex.message, 'err'); }
  };
  const sendReport = async () => {
    try { await api('/listings/' + l.id + '/report', { method: 'POST', body: { reason: repR } }); toast(t('report_sent'), 'ok'); setRep(false); setRepR(null); }
    catch (ex) { toast(ex.message, 'err'); }
  };
  const since = d.seller.since ? new Date(d.seller.since).toLocaleDateString(lang === 'ar' ? 'ar-EG' : lang === 'en' ? 'en-GB' : 'fr-FR', { year: 'numeric', month: 'long' }) : '';

  return (
    <div>
      <div className="topbar">
        <BackBtn />
        <div className="grow"><div className="brand-name">🛍️ {t('market')}</div></div>
        <button className={'btn sm ' + (fav ? 'primary' : 'ghost')} onClick={toggleFav}>{fav ? '❤️' : '🤍'}</button>
        <button className="btn ghost sm" onClick={share}>🔗</button>
        {!own && <button className="btn ghost sm" title={t('report')} onClick={() => { setRepR(null); setRep(true); }}>🚨</button>}
      </div>

      {photos.length > 0 ? (
        <div>
          <div className="gal" onScroll={(e) => setGi(Math.round(Math.abs(e.target.scrollLeft) / Math.max(1, e.target.clientWidth)))}>
            {photos.map((p, i) => <img key={i} src={p} alt="" />)}
          </div>
          {photos.length > 1 && (
            <div className="gal-dots">{photos.map((_, i) => <span key={i} className={'g-dot' + (i === gi ? ' on' : '')} />)}</div>
          )}
          <div className="muted xsmall mt4" style={{ textAlign: 'center' }}>{gi + 1}/{photos.length} · 👁 {l.views}</div>
        </div>
      ) : (
        <div className="mkt-nophoto big">{CAT_EMOJI[l.category] || '📦'}</div>
      )}

      <div className="card mt8" style={{ padding: 14 }}>
        <div className="row spread wrap" style={{ gap: 6 }}>
          <div className="h2">{l.name}</div>
          <div className="h2" style={{ color: 'var(--brand-dark)' }}>{fmtMoney(l.price)}</div>
        </div>
        <div className="row wrap mt4" style={{ gap: 6 }}>
          {l.condition && <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>{l.condition === 'new' ? '✨' : l.condition === 'like_new' ? '🌟' : '♻️'} {condLbl(l.condition)}</span>}
          <span className="badge">{CAT_EMOJI[l.category]} {t('cat_' + l.category)}{l.subcategory ? ' · ' + subLbl(l.subcategory) : ''}</span>
          {l.area && (l.lat != null
            ? <a className="badge" style={{ color: 'inherit', textDecoration: 'none' }} href={gmapsNavUrl(l.lat, l.lng)} target="_blank" rel="noopener" title={t('gmaps_open')}>📍 {l.area} 🧭</a>
            : <span className="badge">📍 {l.area}</span>)}
          {l.favs > 0 && <span className="badge">❤️ {l.favs}</span>}
        </div>
        {l.description && <p className="small mt8" style={{ whiteSpace: 'pre-wrap' }}>{l.description}</p>}
        {(l.brand || l.size) && (
          <div className="mt8" style={{ borderTop: '1px dashed #eef2f7', paddingTop: 8 }}>
            <div className="small" style={{ fontWeight: 800 }}>⚙️ {t('details')}</div>
            {l.brand && <div className="small">🏷️ {t('brand')} : <b>{l.brand}</b></div>}
            {l.size && <div className="small">📏 {t('size')} : <b>{l.size}</b></div>}
          </div>
        )}
      </div>

      <div className="card mt8" style={{ padding: 14 }}>
        <div className="row" style={{ gap: 10, cursor: 'pointer' }} onClick={() => nav('/app/seller/' + d.seller.user_id)}>
          <div className="store-emoji" style={{ width: 46, height: 46, fontSize: 22 }}>👤</div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small" style={{ fontWeight: 800 }}>{d.seller.name} {d.seller.verified && <span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}>✓ {t('verified')}</span>}</div>
            <div className="xsmall" style={{ color: '#b45309', fontWeight: 800 }}>{d.seller.stars ? `⭐ ${d.seller.stars} (${d.seller.reviews_count} ${t('n_reviews')})` : '☆ ' + t('no_reviews')}</div>
            <div className="muted xsmall">{t('member_since')} {since} · {d.seller.ads.length + 1} {t('seller_ads')} ›</div>
          </div>
        </div>
        {own ? (
          <div className="row mt8" style={{ gap: 6 }}>
            <button className="btn ghost grow" onClick={() => nav('/app/publish?edit=' + l.id)}>✏️ {t('edit')}</button>
            <button className="btn danger" onClick={async () => { if (window.confirm(t('confirm_delete'))) { try { await api('/listings/' + l.id, { method: 'DELETE' }); toast(t('listing_deleted')); nav('/app/market'); } catch (ex) { toast(ex.message, 'err'); } } }}>🗑️</button>
          </div>
        ) : (
          <>
            <div className="row mt8 wrap" style={{ gap: 6 }}>
              <button className="btn primary grow" onClick={openChat}>💬 {t('chat_btn')}</button>
              <a className="btn blue" href={'tel:' + l.phone} title={t('call')}>📞</a>
              <a className="btn" style={{ background: '#25d366', color: '#fff' }} href={waLink(l.phone)} target="_blank" rel="noopener" title="WhatsApp">🟢</a>
            </div>
            <button className="btn block mt8" style={{ background: '#0f172a', color: '#fff' }} onClick={() => setDlv(true)}>🛵 {t('deliver_btn')}</button>
          </>
        )}
      </div>

      {d.seller.ads.length > 0 && (
        <div className="card mt8" style={{ padding: 14 }}>
          <div className="small mb8" style={{ fontWeight: 800 }}>👤 {d.seller.ads.length} {t('seller_ads')}</div>
          <div className="mkt-mini-ads">
            {d.seller.ads.map((a) => (
              <button key={a.id} className="mkt-mini" onClick={() => nav('/app/market/' + a.id)}>
                {a.photos && a.photos[0] ? <img src={a.photos[0]} alt="" /> : <span>{CAT_EMOJI[a.category] || '📦'}</span>}
                <div className="xsmall ellipsis" style={{ fontWeight: 700 }}>{a.name}</div>
                <div className="xsmall" style={{ color: 'var(--brand-dark)', fontWeight: 800 }}>{fmtMoney(a.price)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="banner ok mt8 mb12">🛡️ {t('safety_tip')}</div>

      <Modal open={dlv} onClose={() => setDlv(false)} title={'🛵 ' + t('deliver_title')}>
        {dlv && (
          <div>
            <div className="banner ok mb8" style={{ fontSize: 12 }}>💡 {t('deliver_pay_note')}</div>
            <div className="field">
              <label className="label">📍 {t('delivery_addr')}</label>
              <input className="input" value={dAddr} onChange={onDAddr} placeholder={t('addr_ph')} />
              {dSugg && dSugg.length > 0 && (
                <div style={{ marginTop: 6, border: '1px solid #eef2f7', borderRadius: 10, overflow: 'hidden' }}>
                  {dSugg.map((r, i) => (
                    <button key={i} type="button" onClick={() => pickDSugg(r)}
                      style={{ display: 'block', width: '100%', textAlign: 'start', padding: '7px 10px', background: 'transparent', border: 'none', borderBottom: i < dSugg.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', fontSize: 12.5 }}>📍 {r.label}</button>
                  ))}
                </div>
              )}
              {dGps && <div className="muted xsmall mt4">✅ {t('loc_set')}</div>}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <div className="field grow"><label className="label">📞 {t('listing_phone')}</label>
                <input className="input" dir="ltr" type="tel" value={dPhone} onChange={(e) => setDPhone(e.target.value)} /></div>
              <div className="field grow"><label className="label">📝 {t('note')}</label>
                <input className="input" value={dNote} onChange={(e) => setDNote(e.target.value)} placeholder="…" /></div>
            </div>
            <div className="row spread mt8" style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 10 }}>
              <span className="small" style={{ fontWeight: 800 }}>🛵 {t('deliver_fee')}</span>
              <span className="small" style={{ fontWeight: 900, color: 'var(--brand-dark)' }}>{feeEst ? '≈ ' + fmtMoney(feeEst) : '≈ ' + fmtMoney(25)}</span>
            </div>
            {dGps && l.lat != null && <div className="muted xsmall mt4">📏 ≈ {Math.max(1, Math.round(distM(dGps.lat, dGps.lng, l.lat, l.lng) / 1000))} km — base 20 EGP + 2,5 EGP/km au-delà de 2 km</div>}
            <button className="btn primary block mt8" disabled={dBusy} onClick={orderDelivery}>{dBusy ? '…' : '🛵 ' + t('deliver_confirm')}</button>
          </div>
        )}
      </Modal>

      <Modal open={rep} onClose={() => setRep(false)} title={'🚨 ' + t('report')}>
        {rep && (
          <div>
            <div className="small mb8" style={{ fontWeight: 700 }}>{t('report_q')}</div>
            {[['scam', '🚫'], ['prohibited', '⛔'], ['price', '💰'], ['other', '❓']].map(([k, em]) => (
              <button key={k} className={'chip' + (repR === k ? ' on' : '')} style={{ display: 'block', width: '100%', textAlign: 'start', marginBottom: 6 }} onClick={() => setRepR(k)}>{em} {t('r_' + k)}</button>
            ))}
            <button className="btn danger block mt8" disabled={!repR} onClick={sendReport}>🚨 {t('report')}</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ================= 💬 Discussions marché (v2026.09.26.2) =================
export function ChatsPage() {
  const t = useT(); const { lang } = useLang(); const nav = useNavigate();
  const [chats, setChats] = useState(null);
  const load = () => api('/market/chats').then((d) => setChats(d.chats)).catch(() => setChats([]));
  useEffect(() => { load(); const tm = setInterval(load, 15000); return () => clearInterval(tm); }, []);
  return (
    <div>
      <div className="topbar">
        <BackBtn />
        <div className="grow"><div className="brand-name">💬 {t('mk_chats')}</div></div>
      </div>
      {!chats ? <Spinner /> : chats.length === 0 ? <Empty e="💬" text={t('mk_none')} /> : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {chats.map((c) => (
            <button key={c.id} className="chat-row" onClick={() => nav('/app/chat/' + c.id)}>
              {c.listing.photo
                ? <img src={c.listing.photo} alt="" />
                : <span className="chat-emoji">🛍️</span>}
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small" style={{ fontWeight: 800 }}>
                  {c.other.name} {c.unread > 0 && <span className="unread-pill">{c.unread}</span>}
                </div>
                <div className="muted xsmall ellipsis">{c.last_msg || '🛍️ ' + c.listing.name}</div>
              </div>
              <div className="muted xsmall" style={{ flexShrink: 0 }}>{c.last_at ? fmtDate(c.last_at, lang) : ''}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ================= 💬 Conversation (acheteur ↔ vendeur) =================
export function ChatPage() {
  const t = useT(); const nav = useNavigate(); const { user } = useAuth();
  const { id } = useParams();
  const [msgs, setMsgs] = useState(null);
  const [txt, setTxt] = useState('');
  const [head, setHead] = useState(null);
  const endRef = useRef(null);
  const load = () => api('/market/chats/' + id).then((d) => setMsgs(d.messages)).catch(() => setMsgs([]));
  useEffect(() => {
    api('/market/chats').then((d) => { const c = d.chats.find((x) => String(x.id) === String(id)); if (c) setHead(c); }).catch(() => {});
    load();
    const tm = setInterval(load, 5000);
    return () => clearInterval(tm);
  }, [id]);
  useEffect(() => { endRef.current && endRef.current.scrollIntoView({ block: 'end' }); }, [msgs && msgs.length]);
  const send = async (val) => {
    const v = (val != null ? val : txt).trim();
    if (!v) return;
    setTxt('');
    try { const r = await api('/market/chats/' + id, { method: 'POST', body: { text: v } }); setMsgs((m) => [...(m || []), r.message]); }
    catch (ex) { toast(ex.message, 'err'); }
  };
  return (
    <div className="chat-page">
      <div className="topbar">
        <BackBtn />
        <div className="grow">
          <div className="brand-name" style={{ fontSize: 15 }}>💬 {head ? head.other.name : '…'}</div>
          {head && (
            <button className="muted xsmall" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => nav('/app/market/' + head.listing.id)}>
              🛍️ {head.listing.name} ›
            </button>
          )}
        </div>
      </div>
      <div className="chat-msgs">
        {msgs === null ? <Spinner /> : msgs.length === 0 ? (
          <div className="card chat-quick">
            <div className="small mb8" style={{ fontWeight: 800 }}>💬 {t('mk_start')}</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {[t('mk_q1'), t('mk_q2'), t('mk_q3')].map((qq) => (
                <button key={qq} className="chip" onClick={() => send(qq)}>{qq}</button>
              ))}
            </div>
          </div>
        ) : msgs.map((m) => (
          <div key={m.id} className={'msg' + (m.sender_id === user.id ? ' me' : '')}>
            {m.text}
            <div className="msg-meta">{m.sender_name}</div>
          </div>
        ))}
        <div ref={endRef}></div>
      </div>
      <div className="chat-input row">
        <input className="input grow" value={txt} onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
          placeholder={t('mk_type')} />
        <button className="btn primary" onClick={() => send()}>➤</button>
      </div>
    </div>
  );
}

// ================= 👤 Profil vendeur public + avis (v2026.09.26.2) =================
export function SellerProfilePage() {
  const t = useT(); const { lang } = useLang(); const nav = useNavigate(); const { user } = useAuth();
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [rvw, setRvw] = useState(false);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  useEffect(() => { setD(null); setErr(null); api('/sellers/' + id).then(setD).catch((e) => setErr(e.message)); }, [id]);
  if (err) return (<div><div className="topbar"><BackBtn /></div><Empty e="😕" text={err} /></div>);
  if (!d) return (<div><div className="topbar"><BackBtn /></div><Spinner /></div>);
  const s = d.seller;
  const since = s.since ? new Date(s.since).toLocaleDateString(lang === 'ar' ? 'ar-EG' : lang === 'en' ? 'en-GB' : 'fr-FR', { year: 'numeric', month: 'long' }) : '';
  const sendReview = async () => {
    try { await api('/sellers/' + id + '/review', { method: 'POST', body: { stars, comment } }); toast(t('review_saved'), 'ok'); setRvw(false); api('/sellers/' + id).then(setD); }
    catch (ex) { toast(ex.message, 'err'); }
  };
  return (
    <div>
      <div className="topbar">
        <BackBtn />
        <div className="grow"><div className="brand-name">👤 {t('seller_profile')}</div></div>
      </div>
      <div className="card mb12" style={{ padding: 16 }}>
        <div className="row" style={{ gap: 12 }}>
          <div className="store-emoji" style={{ width: 56, height: 56, fontSize: 26 }}>👤</div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="h2">{s.name}</div>
            <div className="row wrap mt4" style={{ gap: 6 }}>
              {s.verified && <span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}>✓ {t('verified')}</span>}
              <span className="badge" style={{ color: '#b45309' }}>{s.stars ? `⭐ ${s.stars} (${s.reviews_count})` : '☆ ' + t('no_reviews')}</span>
            </div>
            <div className="muted xsmall mt4">{t('member_since')} {since}</div>
          </div>
        </div>
        <div className="row spread mt12" style={{ textAlign: 'center' }}>
          <div><div style={{ fontWeight: 900, fontSize: 17 }}>📦 {s.ads_count}</div><div className="muted xsmall">{t('ads_count')}</div></div>
          <div><div style={{ fontWeight: 900, fontSize: 17 }}>👁 {s.total_views}</div><div className="muted xsmall">{t('total_views')}</div></div>
          <div><div style={{ fontWeight: 900, fontSize: 17 }}>❤️ {s.total_favs}</div><div className="muted xsmall">{t('favorites')}</div></div>
        </div>
        {user && user.id !== s.id && <button className="btn primary block mt12" onClick={() => setRvw(true)}>⭐ {t('leave_review')}</button>}
      </div>

      <div className="h2 mb8">🛍️ {s.ads_count} {t('seller_ads')}</div>
      <div className="store-grid mb12">
        {d.ads.map((a) => (
          <div key={a.id} className="card mkt-lcard" onClick={() => nav('/app/market/' + a.id)}>
            <div className="mkt-lphoto">
              {a.photos && a.photos[0] ? <img src={a.photos[0]} alt="" /> : <div className="mkt-nophoto">{CAT_EMOJI[a.category] || '📦'}</div>}
            </div>
            <div className="mkt-lbody">
              <div className="small ellipsis" style={{ fontWeight: 800 }}>{a.name}</div>
              <div style={{ fontWeight: 900, color: 'var(--brand-dark)' }}>{fmtMoney(a.price)}</div>
            </div>
          </div>
        ))}
      </div>

      {d.reviews.length > 0 && (
        <div className="card" style={{ padding: 14 }}>
          <div className="small mb8" style={{ fontWeight: 800 }}>⭐ {s.reviews_count} {t('n_reviews')}</div>
          {d.reviews.map((r, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: '1px dashed #eef2f7' }}>
              <div className="small" style={{ fontWeight: 800 }}>{'⭐'.repeat(r.stars)} <span className="muted" style={{ fontWeight: 400 }}>· {r.buyer_name}</span></div>
              {r.comment && <div className="small mt4">{r.comment}</div>}
            </div>
          ))}
        </div>
      )}

      <Modal open={rvw} onClose={() => setRvw(false)} title={'⭐ ' + t('leave_review')}>
        {rvw && (
          <div>
            <div className="row center mb8" style={{ gap: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} style={{ fontSize: 28, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setStars(n)}>{n <= stars ? '⭐' : '☆'}</button>
              ))}
            </div>
            <textarea className="textarea" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('mk_type')} />
            <button className="btn primary block mt8" onClick={sendReview}>✅ {t('save')}</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ================= ＋ Publier / Modifier une annonce =================
export function PublishPage() {
  const t = useT(); const { lang } = useLang(); const nav = useNavigate(); const { user } = useAuth();
  const [sp] = useSearchParams();
  const editId = sp.get('edit');
  const [step, setStep] = useState(1);
  const preCat = sp.get('cat');   // 🏢 v2026.09.27.2 : catégorie présélectionnée (ex. depuis l'accueil)
  const [form, setForm] = useState({ name: '', category: preCat && CAT_EMOJI[preCat] ? preCat : 'other', subcategory: null, condition: null, description: '', price: '', phone: user?.phone || '', brand: '', size: '', area: '', photos: [], lat: null, lng: null });
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(false);   // 🗺️ Phase 2 : position exacte sur la carte
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const subLbl = (k) => (SUB_LBL[k] ? (SUB_LBL[k][lang] || SUB_LBL[k].fr) : k);

  useEffect(() => {
    if (!editId) return;
    api('/listings/mine').then((d) => {
      const l = (d.listings || []).find((x) => String(x.id) === String(editId));
      if (l) setForm({ name: l.name, category: l.category, subcategory: l.subcategory || null, condition: l.condition || null, description: l.description || '', price: String(l.price), phone: l.phone || '', brand: l.brand || '', size: l.size || '', area: l.area || '', photos: (l.photos || []).slice(0, 5), lat: l.lat ?? null, lng: l.lng ?? null });
    }).catch(() => {});
  }, [editId]);

  // 📷 photos compressées côté navigateur (max 1000px, JPEG) — jamais de fichier envoyé au serveur
  const pickPhotos = (e) => {
    const files = [...(e.target.files || [])].slice(0, 5 - form.photos.length);
    if (!files.length) return;
    let done = 0;
    files.forEach((file) => {
      const rd = new FileReader();
      rd.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, 1000 / Math.max(img.width, img.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          setForm((f) => (f.photos.length >= 5 ? f : { ...f, photos: [...f.photos, cv.toDataURL('image/jpeg', 0.82)] }));
          if (++done === files.length) e.target.value = '';
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  };
  const rmPhoto = (i) => setForm((f) => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }));

  const attrFields = ATTR_FIELDS[form.category] || [];
  const canNext2 = form.name.trim().length >= 2 && form.price !== '' && !isNaN(parseFloat(form.price)) && form.phone.trim();

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const body = { name: form.name.trim(), category: form.category, subcategory: form.subcategory, condition: form.condition, description: form.description.trim(), price: parseFloat(form.price), phone: form.phone.trim(), brand: form.brand, size: form.size, area: form.area, photos: form.photos, lat: form.lat, lng: form.lng };
      if (editId) { await api('/listings/' + editId, { method: 'PUT', body }); toast(t('listing_updated'), 'ok'); }
      else { await api('/listings', { method: 'POST', body }); toast(t('listing_published'), 'ok'); }
      nav('/app/market');
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };

  return (
    <div>
      <div className="topbar">
        <BackBtn />
        <div className="grow"><div className="brand-name">{editId ? '✏️ ' + t('edit') : '＋ ' + t('publish')}</div></div>
      </div>

      <div className="row center mb12" style={{ gap: 8 }}>
        {[1, 2, 3].map((s) => <span key={s} className={'step-dot' + (step === s ? ' on' : step > s ? ' done' : '')}>{step > s ? '✓' : s}</span>)}
        <span className="muted small">{t('step')} {step}/3</span>
      </div>

      {step === 1 && (
        <div className="card mb12" style={{ padding: 14 }}>
          <div className="field"><label className="label">📦 {t('listing_cat')}</label>
            <div className="cat-grid">
              {Object.entries(CAT_EMOJI).map(([k, e]) => (
                <button key={k} type="button" className={'cat-big' + (form.category === k ? ' on' : '')} onClick={() => setForm((f) => ({ ...f, category: k, subcategory: null }))}>
                  <span className="cb-e">{e}</span><span className="cb-t">{t('cat_' + k)}</span>
                </button>
              ))}
            </div>
          </div>
          {(SUBCATS[form.category] || []).length > 0 && (
            <div className="field"><label className="label">🏷️ {t('details')}</label>
              <div className="row wrap" style={{ gap: 6 }}>
                {SUBCATS[form.category].map(([k, e]) => (
                  <button key={k} type="button" className={'chip sm' + (form.subcategory === k ? ' on' : '')} onClick={() => set('subcategory', k)}>{e} {subLbl(k)}</button>
                ))}
              </div>
            </div>
          )}
          <div className="field"><label className="label">✨ {t('condition_label')}</label>
            <div className="row wrap" style={{ gap: 6 }}>
              {CONDITIONS.map(([k, e]) => (
                <button key={k} type="button" className={'chip sm' + (form.condition === k ? ' on' : '')} onClick={() => set('condition', k)}>{e} {COND_LBL[k][lang] || COND_LBL[k].fr}</button>
              ))}
            </div>
          </div>
          <button className="btn primary block" onClick={() => setStep(2)}>{t('next')} →</button>
        </div>
      )}

      {step === 2 && (
        <div className="card mb12" style={{ padding: 14 }}>
          <div className="field">
            <label className="label">📷 {t('add_photo')} ({form.photos.length}/5)</label>
            <div className="row wrap" style={{ gap: 8 }}>
              {form.photos.map((p, i) => (
                <div key={i} className="thumb">
                  <img src={p} alt="" />
                  <button type="button" className="thumb-x" onClick={() => rmPhoto(i)}>✕</button>
                  {i === 0 && <span className="thumb-cov">★</span>}
                </div>
              ))}
              {form.photos.length < 5 && (
                <label className="thumb-add">
                  <span style={{ fontSize: 26 }}>＋</span>
                  <input type="file" accept="image/*" multiple onChange={pickPhotos} style={{ display: 'none' }} />
                </label>
              )}
            </div>
          </div>
          <div className="field"><label className="label">📦 {t('listing_name')}</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="ex. : iPhone 12 — très bon état" /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field grow"><label className="label">💰 {t('listing_price')}</label>
              <input className="input" dir="ltr" type="number" min="0" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="0" /></div>
            {attrFields.includes('brand') && (
              <div className="field grow"><label className="label">🏷️ {t('brand')}</label>
                <input className="input" value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="ex. : Apple" /></div>
            )}
            {attrFields.includes('size') && (
              <div className="field grow"><label className="label">📏 {t('size')}</label>
                <input className="input" value={form.size} onChange={(e) => set('size', e.target.value)} placeholder="ex. : L" /></div>
            )}
          </div>
          <div className="field"><label className="label">📝 {t('listing_desc')}</label>
            <textarea className="textarea" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn ghost" onClick={() => setStep(1)}>← {t('prev')}</button>
            <button className="btn primary grow" disabled={!canNext2} onClick={() => setStep(3)}>{t('next')} →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card mb12" style={{ padding: 14 }}>
          <div className="banner ok mb12">💡 {t('sell_hint')}</div>
          <div className="field"><label className="label">📞 {t('listing_phone')}</label>
            <input className="input" dir="ltr" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0100 123 4567" /></div>
          <div className="field"><label className="label">📍 {t('area_label')}</label>
            <div className="row" style={{ gap: 6 }}>
              <input className="input grow" value={form.area} onChange={(e) => set('area', e.target.value)} placeholder="ex. : Smouha, Alexandrie" />
              <button className={'btn' + (form.lat != null ? ' primary' : ' ghost')} title={t('pick_map')} onClick={() => setPick(true)}>🗺️</button>
            </div>
            {form.lat != null && <div className="muted xsmall mt4">✅ {t('loc_set')}</div>}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn ghost" onClick={() => setStep(2)}>← {t('prev')}</button>
            <button className="btn primary grow" disabled={busy} onClick={submit}>{busy ? '…' : (editId ? '✅ ' + t('save') : '🚀 ' + t('publish'))}</button>
          </div>
        </div>
      )}

      <Modal open={pick} onClose={() => setPick(false)} title={'🗺️ ' + t('pick_map')}>
        {pick && (
          <PickMap
            initial={form.lat != null ? { lat: form.lat, lng: form.lng } : { lat: 31.2001, lng: 29.9187 }}
            onConfirm={({ lat, lng, address }) => {
              setForm((f) => ({ ...f, lat, lng, area: f.area || (address ? address.split(',').slice(0, 2).join(', ') : '') }));
              toast(t('loc_set'), 'ok');
              setPick(false);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// ================= 📦 Mes ventes — livraisons marché (v2026.09.26.3) =================
export function SalesPage() {
  const t = useT(); const { lang } = useLang(); const nav = useNavigate();
  const [orders, setOrders] = useState(null);
  const [acc, setAcc] = useState(null);          // commande en cours d'acceptation
  const [pAddr, setPAddr] = useState('');
  const [pGps, setPGps] = useState(null);
  const [pPick, setPPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => api('/market/sales').then((d) => setOrders(d.orders)).catch(() => setOrders([]));
  useEffect(() => { load(); const tm = setInterval(load, 15000); return () => clearInterval(tm); }, []);

  const startAccept = (o) => { setAcc(o); setPAddr(o.store_address || ''); setPGps(o.store_lat != null ? { lat: o.store_lat, lng: o.store_lng } : null); };
  const doAccept = async () => {
    if (busy) return;
    if (pAddr.trim().length < 5) return toast(t('addr_too_short'), 'err');
    if (!pGps) return toast(t('pickup_required'), 'err');
    setBusy(true);
    try {
      await api('/market/orders/' + acc.id + '/accept', { method: 'POST', body: { pickup_address: pAddr.trim(), pickup_lat: pGps.lat, pickup_lng: pGps.lng } });
      toast(t('sale_accepted'), 'ok');
      setAcc(null); setPPick(false); load();
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };
  const decline = async (o) => {
    try { await api('/market/orders/' + o.id + '/decline', { method: 'POST' }); toast(t('sale_declined')); load(); }
    catch (ex) { toast(ex.message, 'err'); }
  };
  const PEND = ['pending']; const ACT = ['ready', 'assigned', 'picked_up'];
  const pend = (orders || []).filter((o) => PEND.includes(o.status));
  const act = (orders || []).filter((o) => ACT.includes(o.status));
  const past = (orders || []).filter((o) => !PEND.includes(o.status) && !ACT.includes(o.status));

  return (
    <div>
      <div className="topbar">
        <BackBtn />
        <div className="grow"><div className="brand-name">📦 {t('my_sales')}</div></div>
      </div>
      {!orders ? <Spinner /> : orders.length === 0 ? <Empty e="📦" text={t('no_sales')} /> : (
        <div>
          {pend.length > 0 && <div className="h2 mb8">🫳 {t('sale_requests')} ({pend.length})</div>}
          {pend.map((o) => (
            <div key={o.id} className="card mb12" style={{ padding: 12, border: '2px solid #fbbf24' }}>
              <div className="row spread wrap">
                <div style={{ fontWeight: 800 }}>🛍️ {o.store_name}</div>
                <span className="badge">#{o.id}</span>
              </div>
              <div className="muted small mt4">👤 {o.client_name} · 📞 {o.phone}</div>
              <div className="small mt4">📍 → {(o.address || '').slice(0, 60)}</div>
              <div className="small">💰 {fmtMoney(o.subtotal)} + 🛵 {fmtMoney(o.delivery_fee)} {t('course')}</div>
              <div className="row mt8" style={{ gap: 6 }}>
                <button className="btn primary grow" onClick={() => startAccept(o)}>✅ {t('accept_sale')}</button>
                <button className="btn danger" onClick={() => decline(o)}>✖</button>
              </div>
            </div>
          ))}
          {act.length > 0 && <div className="h2 mb8 mt12">🛵 {t('tab_active')} ({act.length})</div>}
          {act.map((o) => (
            <div key={o.id} className="card mb12" style={{ padding: 12 }}>
              <div className="row spread wrap">
                <div style={{ fontWeight: 800 }}>🛍️ {o.store_name}</div>
                <StatusBadge status={o.status} />
              </div>
              <div className="muted small mt4">📍 {t('pickup')} : {(o.store_address || '').slice(0, 50)} → 🏠 {(o.address || '').slice(0, 50)}</div>
              {o.driver_name && <div className="small mt4">🛵 {o.driver_name} · 📞 {o.driver_phone}</div>}
              <Stepper status={o.status} />
            </div>
          ))}
          {past.length > 0 && <div className="h2 mb8 mt12">📁 {t('history')} ({past.length})</div>}
          {past.map((o) => (
            <div key={o.id} className="card mb8" style={{ padding: 10 }}>
              <div className="row spread wrap">
                <div className="small" style={{ fontWeight: 800 }}>🛍️ {o.store_name} · #{o.id}</div>
                <StatusBadge status={o.status} />
              </div>
              <div className="muted xsmall mt4">👤 {o.client_name} · {fmtDate(o.created_at, lang)} · 💰 {fmtMoney(o.subtotal)}</div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!acc} onClose={() => { setAcc(null); setPPick(false); }} title={'✅ ' + t('accept_sale')}>
        {acc && (
          <div>
            <div className="banner ok mb8" style={{ fontSize: 12 }}>🛵 {t('pickup_hint')}</div>
            <div className="field">
              <label className="label">📍 {t('pickup_addr')}</label>
              <input className="input" value={pAddr} onChange={(e) => setPAddr(e.target.value)} placeholder="ex. : 15 rue Victor Emmanuel, Smouha" />
              <div className="row mt8" style={{ gap: 6 }}>
                <button className={'btn grow' + (pGps ? ' primary' : ' ghost')} onClick={() => setPPick(true)}>🗺️ {t('pick_map')}</button>
              </div>
              {pGps && <div className="muted xsmall mt4">✅ {t('loc_set')}</div>}
            </div>
            <button className="btn primary block mt8" disabled={busy} onClick={doAccept}>{busy ? '…' : '✅ ' + t('confirm_sale')}</button>
          </div>
        )}
      </Modal>
      <Modal open={pPick} onClose={() => setPPick(false)} title={'🗺️ ' + t('pick_map')}>
        {pPick && (
          <PickMap
            initial={pGps || { lat: 31.2001, lng: 29.9187 }}
            onConfirm={({ lat, lng, address }) => {
              setPGps({ lat, lng });
              setPAddr((a) => a || (address ? address.split(',').slice(0, 2).join(', ') : ''));
              setPPick(false);
              toast(t('loc_set'), 'ok');
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// ================= 🛵 Demande de service à un livreur général (v2026.09.27.1) =================
export function ServiceRequestPage() {
  const t = useT(); const { lang } = useLang(); const nav = useNavigate(); const { user } = useAuth();
  const [desc, setDesc] = useState('');
  const [pAddr, setPAddr] = useState(''); const [pGps, setPGps] = useState(null); const [pSugg, setPSugg] = useState(null);
  const [dAddr, setDAddr] = useState(''); const [dGps, setDGps] = useState(null); const [dSugg, setDSugg] = useState(null);
  const [phone, setPhone] = useState(user?.phone || '');
  const [busy, setBusy] = useState(false);
  const [pPick, setPPick] = useState(false); const [dPick, setDPick] = useState(false);
  const pTm = useRef(null); const dTm = useRef(null);
  const pSeq = useRef(0); const dSeq = useRef(0);   // 🛡️ v2026.10.08.8 : anti-réponse-périmée

  const onAddr = (which) => (e) => {
    const v = e.target.value;
    if (which === 'p') setPAddr(v); else setDAddr(v);
    clearTimeout(which === 'p' ? pTm.current : dTm.current);
    const seqObj = which === 'p' ? pSeq : dSeq;
    if (v.trim().length < 4) { seqObj.current++; if (which === 'p') setPSugg(null); else setDSugg(null); return; }
    const tm = setTimeout(async () => {
      const seq = ++seqObj.current;
      try { const r = (await geocodeSearch(v.trim(), lang, { lat: 31.2001, lng: 29.9187 })).slice(0, 6); if (seqObj.current !== seq) return; if (which === 'p') setPSugg(r); else setDSugg(r); }
      catch { if (seqObj.current === seq) { if (which === 'p') setPSugg(null); else setDSugg(null); } }
    }, 500);
    if (which === 'p') pTm.current = tm; else dTm.current = tm;
  };
  const pick = (which, r) => {
    if (which === 'p') { setPAddr(r.label.split(',').slice(0, 3).join(', ')); setPGps({ lat: r.lat, lng: r.lng }); setPSugg(null); }
    else { setDAddr(r.label.split(',').slice(0, 3).join(', ')); setDGps({ lat: r.lat, lng: r.lng }); setDSugg(null); }
  };
  const feeEst = pGps && dGps
    ? Math.max(15, Math.min(80, Math.round(20 + Math.max(0, distM(pGps.lat, pGps.lng, dGps.lat, dGps.lng) / 1000 - 2) * 2.5)))
    : null;
  const submit = async () => {
    if (busy) return;
    if (desc.trim().length < 5) return toast(t('svc_desc_ph') + ' ?', 'err');
    if (!pGps) return toast(t('pickup_required'), 'err');
    if (!dGps) return toast(t('loc_required'), 'err');
    if (!phone.trim()) return toast(t('listing_phone') + ' ?', 'err');
    setBusy(true);
    try {
      const r = await api('/services', { method: 'POST', body: { description: desc.trim(), pickup_address: pAddr.trim(), pickup_lat: pGps.lat, pickup_lng: pGps.lng, address: dAddr.trim(), lat: dGps.lat, lng: dGps.lng, phone: phone.trim(), delivery_fee: feeEst || 25 } });
      toast(t('deliver_ok') + ' 🔑 ' + r.pin, 'ok');
      nav('/app/orders');
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };
  // ⚠️ fonction APPELÉE (pas un composant imbriqué) : un composant redéclaré à chaque rendu
  // ferait perdre le focus au champ après chaque caractère tapé.
  const addrField = (which, label, val, gps, sugg) => (
    <div className="field">
      <label className="label">{label}</label>
      <div className="row" style={{ gap: 6 }}>
        <input className="input grow" value={val} onChange={onAddr(which)} placeholder={t('addr_ph')} />
        <button type="button" className={'btn' + (gps ? ' primary' : ' ghost')} title={t('pick_map')} onClick={() => (which === 'p' ? setPPick(true) : setDPick(true))}>🗺️</button>
      </div>
      {sugg && sugg.length > 0 && (
        <div style={{ marginTop: 6, border: '1px solid #eef2f7', borderRadius: 10, overflow: 'hidden' }}>
          {sugg.map((r, i) => (
            <button key={i} type="button" onClick={() => pick(which, r)}
              style={{ display: 'block', width: '100%', textAlign: 'start', padding: '7px 10px', background: 'transparent', border: 'none', borderBottom: i < sugg.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', fontSize: 12.5 }}>📍 {r.label}</button>
          ))}
        </div>
      )}
      {gps && <div className="muted xsmall mt4">✅ {t('loc_set')}</div>}
    </div>
  );
  return (
    <div>
      <div className="topbar">
        <BackBtn />
        <div className="grow"><div className="brand-name">🛵 {t('svc_form_title')}</div></div>
      </div>
      <div className="banner ok mb12">💡 {t('svc_pay_note')}</div>
      <div className="card mb12" style={{ padding: 14 }}>
        <div className="field">
          <label className="label">📝 {t('svc_desc')}</label>
          <textarea className="textarea" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('svc_desc_ph')} />
        </div>
        {addrField('p', '📍 ' + t('svc_pickup'), pAddr, pGps, pSugg)}
        {addrField('d', '🏁 ' + t('svc_dropoff'), dAddr, dGps, dSugg)}
        <div className="field">
          <label className="label">📞 {t('listing_phone')}</label>
          <input className="input" dir="ltr" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0100 123 4567" />
        </div>
        <div className="row spread mt8" style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 10 }}>
          <span className="small" style={{ fontWeight: 800 }}>🛵 {t('deliver_fee')}</span>
          <span className="small" style={{ fontWeight: 900, color: 'var(--brand-dark)' }}>{feeEst ? '≈ ' + fmtMoney(feeEst) : '≈ ' + fmtMoney(25)}</span>
        </div>
        {pGps && dGps && <div className="muted xsmall mt4">📏 ≈ {Math.max(1, Math.round(distM(pGps.lat, pGps.lng, dGps.lat, dGps.lng) / 1000))} km — base 20 EGP + 2,5 EGP/km au-delà de 2 km</div>}
        <button className="btn primary block mt8" disabled={busy} onClick={submit}>{busy ? '…' : '🛵 ' + t('svc_send')}</button>
      </div>

      <Modal open={pPick} onClose={() => setPPick(false)} title={'🗺️ ' + t('svc_pickup')}>
        {pPick && (
          <PickMap initial={pGps || { lat: 31.2001, lng: 29.9187 }}
            onConfirm={({ lat, lng, address }) => { setPGps({ lat, lng }); setPAddr((a) => a || (address ? address.split(',').slice(0, 2).join(', ') : '')); setPPick(false); toast(t('loc_set'), 'ok'); }} />
        )}
      </Modal>
      <Modal open={dPick} onClose={() => setDPick(false)} title={'🗺️ ' + t('svc_dropoff')}>
        {dPick && (
          <PickMap initial={dGps || { lat: 31.2001, lng: 29.9187 }}
            onConfirm={({ lat, lng, address }) => { setDGps({ lat, lng }); setDAddr((a) => a || (address ? address.split(',').slice(0, 2).join(', ') : '')); setDPick(false); toast(t('loc_set'), 'ok'); }} />
        )}
      </Modal>
    </div>
  );
}

// ================= 🏪 Magasins par catégorie (v2026.09.27.1) =================
/* 📌 v2026.10.04.7 — l'en-tête VERT (mini-head) est collé en haut de l'écran : les blocs
   fixes (bannière + recherche) se collent JUSTE EN DESSOUS. Hauteur mesurée dynamiquement
   (elle change avec la barre d'état Android / insets). */
function useStickyBelowHead() {
  useEffect(() => {
    const set = () => {
      const m = document.querySelector('.mini-head');
      if (m) document.documentElement.style.setProperty('--mini-h', m.offsetHeight + 'px');
    };
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);
}

/* ═══ 🏪 v2026.10.04.2 — PAGE « MAGASINS PAR CATÉGORIE » ═══
   1️⃣ recherche (magasin OU produit de la catégorie) · 2️⃣ ligne des magasins (cartes rondes)
   3️⃣ les plus commandés · 4️⃣ suggestions personnalisées (recherches du client)
   5️⃣ lignes par nom de produit (pharmacie : 💊 Médicaments / 💄 Cosmétiques)
   📏 lignes proportionnelles au nombre de magasins : max 4 produits par magasin */
export function StoresByTypePage() {
  const t = useT(); const nav = useNavigate();
  const { add, items, setQty } = useCart();
  const { type } = useParams();
  const [stores, setStores] = useState(null);
  const [prods, setProds] = useState(null);      // tous les produits disponibles de la catégorie
  const [top, setTop] = useState(null);          // 🏆 les plus commandés (API)
  const [sugg, setSugg] = useState(undefined);   // ✨ suggestions (undefined = chargement, null = aucune recherche)
  const [q, setQ] = useState('');
  const [gDetail, setGDetail] = useState(null); const [gQty, setGQty] = useState(1); const [gBig, setGBig] = useState(null);
  const [favs, setFavs] = useState(() => loadPFavs());   // ❤️ v2026.10.04.3 : favoris produits (appareil)
  const [selPCat, setSelPCat] = useState(null);   // 🗂️ v2026.10.08.8 : filtre par catégorie de produit (null = Tout)
  const isPharma = type === 'pharmacy';

  useStickyBelowHead();   // 📌 v2026.10.04.7 : bloc fixé SOUS l'en-tête vert
  useEffect(() => {
    setStores(null); setProds(null); setTop(null); setSugg(undefined); setSelPCat(null);
    api('/stores?type=' + type).then((d) => setStores(d.stores)).catch(() => setStores([]));
    api('/products?type=' + type).then((d) => setProds(d.products)).catch(() => setProds([]));
    api('/products/top?type=' + type).then((d) => setTop(d.products)).catch(() => setTop([]));
    api('/products/suggested?type=' + type).then((d) => setSugg(d.matched ? d.products : null)).catch(() => setSugg(null));
  }, [type]);
  const key = { restaurant: 'restaurant', market: 'supermarket', pharmacy: 'pharmacy', electronics: 'electronics', appliance: 'appliance' }[type] || type;

  // 🔎 journaliser la recherche (Entrée ou choix d'une suggestion) → suggestions personnalisées
  const logSearch = (term) => { const s = String(term || q || '').trim(); if (s.length >= 2) api('/product-searches', { method: 'POST', body: { q: s, type } }).catch(() => {}); };
  const toggleFav = (pid) => { const n = { ...favs }; if (n[pid]) delete n[pid]; else n[pid] = 1; setFavs(n); try { localStorage.setItem(PFAV_KEY, JSON.stringify(n)); } catch {} };
  // 🛒 ajout direct depuis la grille (les totaux sont recalculés par le serveur à la commande)
  const addFromGrid = (p) => {
    const stub = { id: p.store_id, name: p.store_name, delivery_fee: p.delivery_fee, min_order: p.min_order || 0 };
    if (!items.length || items[0].store_id === stub.id) { add(p, stub); toast(t('added')); }
    else add(p, stub);   // autre magasin : propose de vider le panier
  };

  // fiche produit rapide (même modale que l'accueil)
  const openProduct = async (p) => {
    setGDetail({ loading: true });
    try {
      const d = await api('/stores/' + p.store_id);
      const prod = d.products.find((x) => x.id === p.id);
      if (!prod) throw new Error(trErr('Produit introuvable'));
      setGDetail({ store: d.store, product: prod, prods: d.products });   // 🧲 v2026.10.08.8 : produits du magasin gardés pour la bande « même catégorie »
      setGBig(prod.photo || null);
      setGQty(1);
    } catch (e) { setGDetail(null); toast(e.message, 'err'); }
  };
  const addFromGlobal = () => {
    const { store, product } = gDetail;
    const inCart = items.find((i) => i.product_id === product.id && i.store_id === store.id)?.qty || 0;
    if (!items.length || items[0].store_id === store.id) {
      if (inCart === 0) add(product, store);
      setQty(product.id, gQty);
    } else {
      add(product, store); // autre magasin : propose de vider le panier
    }
    toast(t('added'));
    // 🛒 v2026.10.08.10 : la page produit reste OUVERTE après l'ajout au panier
  };

  const s = q.trim().toLowerCase();
  const sugStores = !s ? [] : (stores || []).filter((x) => (x.name || '').toLowerCase().includes(s)).slice(0, 6)
    .map((st) => ({ key: 's' + st.id, icon: st.photo ? <img src={photoUrl(st.photo, 'thumb')} alt="" style={{ width: 24, height: 24, borderRadius: 7, objectFit: 'cover' }} /> : (st.emoji || '🏪'), label: st.name, sub: t('type_' + st.type), st }));
  const sugProds = !s ? [] : (prods || []).filter((x) => (x.name || '').toLowerCase().includes(s)).slice(0, 6)
    .map((p) => ({ key: 'p' + p.id, icon: p.photo ? <img src={photoUrl(p.photo, 'thumb')} alt="" style={{ width: 24, height: 24, borderRadius: 7, objectFit: 'cover' }} /> : '📦', label: p.name, sub: fmtMoney(p.price), p }));

  // 📏 proportionnel au nombre de magasins : max 4 produits par magasin dans chaque ligne
  const topRow = top === null || prods === null ? null : capPerStore(top.length ? top : prods);
  const suggRow = sugg === undefined || prods === null ? null : capPerStore(sugg || prods);

  // 5️⃣ v2026.10.08.8 — CATÉGORIES DE PRODUITS (pharmacie : 💊/💄) pour le menu horizontal :
  // « Tout » + une boule par catégorie (ex. pizza) → la grille affiche tous les produits
  // de cette catégorie TOUS MAGASINS CONFONDUS (tous les types de pizza de la catégorie).
  const prodCats = [];
  if (prods) {
    if (isPharma) {
      for (const g of ['meds', 'cosm']) {
        const list = prods.filter((p) => pharmaGroup(p) === g);
        if (list.length) prodCats.push({ label: t(g === 'meds' ? 'pharma_meds' : 'pharma_cosm'), emoji: g === 'meds' ? '💊' : '💄', photo: list.find((x) => x.photo)?.photo || null, prods: list });
      }
    } else {
      const m = new Map();
      for (const p of prods) { const k = p.category || '•'; if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
      for (const [c, list] of [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) prodCats.push({ label: c, emoji: list[0]?.emoji || '📦', photo: list.find((x) => x.photo)?.photo || null, prods: list });
    }
  }

  return (
    <div>
      {/* 📌 v2026.10.04.7 — la barre de recherche et tout ce qui est AU-DESSUS (← + titre
          de la catégorie) restent FIXES en haut pendant le défilement */}
      <div className="sticky-head">
        <div className="sticky-pad">
          <div className="topbar">
            <BackBtn />
            <div className="grow"><div className="brand-name">🏪 {t('stc_' + key)}</div></div>
          </div>

          {/* 1️⃣ recherche : un magasin OU un produit de cette catégorie */}
          <div className="row">
            <SuggestBox value={q} onChange={setQ} onEnter={logSearch} placeholder={'🔍 ' + t('search_store_prod_ph')} clearTitle={t('clear_search')}
              getSugs={() => [...sugStores, ...sugProds]}
              onPick={(x) => { logSearch(x.label); if (x.st) nav('/app/store/' + x.st.id); else openProduct(x.p); }} />
          </div>
        </div>
      </div>

      {stores === null ? <Spinner /> : stores.length === 0 ? <Empty e="🏪" text={t('no_stores_type')} /> : (<>
        {/* 2️⃣ tous les magasins de la catégorie — cartes RONDES comme l'accueil */}
        <div className="h2 mb8 mt12">🏪 {t('stores_row')}</div>
        <AutoScroll className="stc-row">
          {stores.map((st) => (
            <button key={st.id} type="button" className="sty-card" onClick={() => nav('/app/store/' + st.id)} title={st.name}>
              <span className="sty-icon">{st.photo
                ? <img src={photoUrl(st.photo, 'thumb')} alt="" loading="lazy" />
                : <span className="sty-emoji">{st.emoji || '🏪'}</span>}</span>
              <span className="sty-label">{st.name}</span>
            </button>
          ))}
        </AutoScroll>

        {/* 3️⃣ les plus commandés de la catégorie (à défaut : produits disponibles) */}
        <ProductGrid title={'🏆 ' + t('top_ordered')} prods={topRow} favs={favs} onFav={toggleFav} onOpen={openProduct} onAdd={addFromGrid} />
        {/* 4️⃣ suggestions personnalisées (à défaut : produits disponibles) */}
        <ProductGrid title={'✨ ' + t('suggested_for_you')} prods={suggRow} favs={favs} onFav={toggleFav} onOpen={openProduct} onAdd={addFromGrid} />
        {/* 5️⃣ v2026.10.08.8 — MENU HORIZONTAL des catégories (« Tout » en 1er) + GRILLE
            2 colonnes de tous les produits (défilement VERTICAL uniquement). Un tap sur une
            catégorie (ex. pizza) → tous les types de pizza, tous magasins confondus. */}
        {prods !== null && prods.length === 0 && <div className="mt12"><Empty e="🛍️" text={t('no_products_type')} /></div>}
        {prodCats.length > 1 && (<>
          <div className="h2 mb8 mt12">🗂️ {t('products_by_cat')}</div>
          <AutoScroll className="stc-row">
            {[{ label: null }, ...prodCats].map((c, i) => (
              <button key={c.label || 'tout'} type="button" className={'sty-card' + ((selPCat || null) === c.label ? ' on' : '')} onClick={() => setSelPCat(c.label)} title={c.label || t('all')}>
                <span className="sty-icon">{i === 0
                  ? <span className="sty-emoji">🗂️</span>
                  : c.photo
                    ? <img src={photoUrl(c.photo, 'thumb')} alt="" loading="lazy" />
                    : <span className="sty-emoji">{c.emoji}</span>}</span>
                <span className="sty-label">{c.label || t('all')}</span>
              </button>
            ))}
          </AutoScroll>
        </>)}
        <ProductGrid grid prods={(selPCat ? (prodCats.find((c) => c.label === selPCat)?.prods || []) : prods) || []} favs={favs} onFav={toggleFav} onOpen={openProduct} onAdd={addFromGrid} />
      </>)}

      {/* fiche produit rapide (depuis la recherche) */}
      <Modal open={!!gDetail} onClose={() => setGDetail(null)} className="pd-modal">
        {gDetail?.loading ? <Spinner /> : gDetail?.store && gDetail?.product ? (
          <ProductDetail
            product={gDetail.product} closed={!gDetail.store.is_open} qty={gQty} setQty={setGQty} onAdd={addFromGlobal}
            siblings={(gDetail.prods || []).filter((x) => x.category === gDetail.product.category)}
            onPick={(p) => { setGDetail((g) => ({ ...g, product: p })); setGBig(p.photo || null); setGQty(1); }}
            sibFavs={favs} sibOnFav={toggleFav}
            sibOnAdd={(p) => addFromGrid({ ...p, store_id: gDetail.store.id, store_name: gDetail.store.name, delivery_fee: gDetail.store.delivery_fee, min_order: gDetail.store.min_order || 0 })}
            storeType={gDetail.store.type}

            header={(
              <div className="row wrap" style={{ justifyContent: 'center', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <div className="store-emoji" style={{ width: 26, height: 26, fontSize: 14, background: gDetail.store.color || '#0e9f6e' }}>{gDetail.store.emoji || '🏪'}</div>
                <b className="small ellipsis">{gDetail.store.name}</b>
                <button className="btn ghost sm" onClick={() => { const sid = gDetail.store.id; setGDetail(null); nav('/app/store/' + sid); }}>🏪 {t('open_store')}</button>
              </div>
            )} />
        ) : null}
      </Modal>
    </div>
  );
}

// ================= 🧱 Département (v2026.09.27.1 — bientôt disponible) =================
export function DepartmentPage() {
  const t = useT(); const nav = useNavigate();
  const { id } = useParams();
  const dept = DEPTS.find((d) => d.id === id);
  if (!dept) return (<div><div className="topbar"><BackBtn /></div><Empty e="🧱" text="?" /></div>);
  return (
    <div>
      <div className="topbar">
        <BackBtn />
        <div className="grow"><div className="brand-name">🧱 {t('dept_' + dept.id)}</div></div>
      </div>
      <div className="card mb12" style={{ padding: 20, textAlign: 'center' }}>
        {dept.img
          ? <img src={dept.img} alt="" style={{ width: 120, height: 120, borderRadius: 28, objectFit: 'cover', boxShadow: '0 8px 22px rgba(15,23,42,.16)', margin: '0 auto 10px', display: 'block' }} />
          : <div className="dept-emoji" style={{ margin: '0 auto 10px', width: 120, height: 120, fontSize: 54 }}>👥</div>}
        <div className="h2">{t('dept_' + dept.id)}</div>
        <p className="muted small mt8">{t('dept_desc_' + dept.id)}</p>
        <span className="badge mt8" style={{ background: '#fef3c7', color: '#92400e', fontSize: 13, padding: '6px 14px' }}>🚀 {t('coming_soon')}</span>
        <p className="muted xsmall mt8">{t('dept_soon_text')}</p>
        <button className="btn primary block mt12" onClick={() => nav('/app/market')}>🛍️ {t('browse_market')}</button>
      </div>
    </div>
  );
}

// ================= 🔔 Centre de notifications =================
export function NotificationsPage() {
  const t = useT();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const load = () => api('/notifications').then(setData).catch(() => setData({ notifications: [], unread: 0 }));
  usePoll(load, 10000);
  const markAll = async () => { try { await api('/notifications/read', { method: 'POST' }); load(); } catch {} };
  const icon = (k) => (k === 'message' ? '💬' : k === 'order' ? '📦' : '🔔');

  return (
    <div>
      <div className="topbar">
        <BackBtn />
        <div className="grow"><div className="brand-name">🔔 {t('notifications')}</div></div>
        {data?.unread > 0 && <button className="btn ghost sm" onClick={markAll}>✓ {t('mark_all_read')}</button>}
      </div>
      {!data ? <Spinner /> : !data.notifications.length ? <Empty e="🔔" text={t('no_notifs')} /> : data.notifications.map((n) => (
        <div key={n.id} className={'card mb8' + (n.read ? '' : ' notif-unread')} style={{ cursor: 'pointer' }}
          onClick={() => nav(n.url || '/app')}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 22 }}>{icon(n.kind)}</div>
            <div className="grow">
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{n.title}</div>
              <div className="muted small">{n.body}</div>
              <div className="muted small" style={{ fontSize: 11, marginTop: 3 }}>{fmtDate(n.created_at)}</div>
            </div>
            {!n.read && <span style={{ width: 9, height: 9, borderRadius: 99, background: '#dc2626', flexShrink: 0, marginTop: 4 }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

// ================= ⚙️ Paramètres =================
// ✨ v2026.09.30.2 — STATUTS façon WhatsApp : photos ET VIDÉOS, lignes par catégorie.
// Lecteur plein écran avec barre de progression : à la fin d'un statut, enchaîne sur le suivant
// de la MÊME catégorie, puis se ferme. L'anneau vert devient gris une fois le statut ouvert.
export const STATUS_CATS = [
  { id: 'property', emoji: '🏢' }, { id: 'market', emoji: '🛒' }, { id: 'phones', emoji: '📱' },
  { id: 'electronics', emoji: '🔌' }, { id: 'home', emoji: '🏠' }, { id: 'fashion', emoji: '👕' },
  { id: 'kids', emoji: '🧸' }, { id: 'sports', emoji: '⚽' }, { id: 'beauty', emoji: '💄' },
  { id: 'auto', emoji: '🚗' }, { id: 'other', emoji: '📦' },
];
const ST_PHOTO_MS = 5000;   // ⏱️ durée d'affichage d'une photo
const ST_SEEN_KEY = 'yl_st_seen';

function loadSeen() { try { return JSON.parse(localStorage.getItem(ST_SEEN_KEY) || '{}'); } catch { return {}; } }

export function StatusPage() {
  const t = useT();
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [pub, setPub] = useState(false);
  const [form, setForm] = useState({ category: 'property', text: '', photo: null, thumb: null, video: null, videoMime: '' });
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);      // { list, idx } — file des statuts d'une catégorie
  const [progress, setProgress] = useState(0); // 0..1 pour le statut en cours
  const [seen, setSeen] = useState(() => loadSeen());
  const videoRef = useRef(null);
  const load = () => api('/statuses').then((d) => setItems(d.statuses)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  const ptrInd = usePullToRefresh(load);   // 🔄 v2026.10.04.1 : tirer vers le bas = recharger la liste (APK)

  const markSeen = (id) => {
    setSeen((s) => {
      if (s[id]) return s;
      const n = { ...s, [id]: 1 };
      try { localStorage.setItem(ST_SEEN_KEY, JSON.stringify(n)); } catch {}
      return n;
    });
  };

  // ⏱️ progression : photos = 5 s ; vidéos = leur durée réelle (timeupdate)
  useEffect(() => {
    if (!view) return;
    const cur = view.list[view.idx];
    if (!cur) return;
    markSeen(cur.id);
    setProgress(0);
    let raf = 0; const t0 = performance.now();
    const isPhoto = !cur.video;
    if (isPhoto) {
      const tick = () => {
        const p = Math.min(1, (performance.now() - t0) / ST_PHOTO_MS);
        setProgress(p);
        if (p >= 1) { next(); return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => { if (raf) cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.idx, view?.list]);

  const next = () => {
    setView((v) => (!v ? null : v.idx + 1 < v.list.length ? { ...v, idx: v.idx + 1 } : null));   // fin de file -> ferme
  };
  const prev = () => { setView((v) => (v && v.idx > 0 ? { ...v, idx: v.idx - 1 } : v)); };

  // 🧲 v2026.09.30.4 — groupement par UTILISATEUR (comme WhatsApp) : les statuts d'un même
  // utilisateur dans une même catégorie sont COMPILÉS en une seule bulle (compteur), et le
  // lecteur enchaîne SES statuts à lui. Suppression possible à tout moment par l'auteur.
  const groupsOf = (cat) => {
    const m = new Map();
    for (const s of (items || []).filter((x) => x.category === cat)) {
      if (!m.has(s.user_id)) m.set(s.user_id, { user_id: s.user_id, user_name: s.user_name, list: [] });
      m.get(s.user_id).list.push(s);   // items déjà triés du plus récent au plus ancien
    }
    return [...m.values()];
  };
  const openGroup = (g) => setView({ list: g.list, idx: 0 });
  const groupSeen = (g) => g.list.every((s) => seen[s.id]);
  const del = async () => {   // 🗑️ supprimer SON statut (avant même les 24 h)
    if (!cur || !window.confirm(t('confirm_delete'))) return;
    try {
      await api('/statuses/' + cur.id, { method: 'DELETE' });
      setItems((l) => (l || []).filter((x) => x.id !== cur.id));
      const rest = view.list.filter((x) => x.id !== cur.id);
      if (rest.length) setView({ ...view, list: rest, idx: Math.min(view.idx, rest.length - 1) });
      else setView(null);
      toast('🗑️');
    } catch (ex) { toast(ex.message, 'err'); }
  };

  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.type.startsWith('video/')) {
      if (f.size > 3 * 1024 * 1024) { toast(t('video_too_big'), 'err'); return; }
      const rd = new FileReader();
      rd.onload = () => setForm((s) => ({ ...s, video: rd.result, videoMime: f.type, photo: null, thumb: null }));
      rd.readAsDataURL(f);
      return;
    }
    const r = await processImage(f);
    if (r.error) { toast('Photo invalide', 'err'); return; }
    setForm((s) => ({ ...s, photo: r.display, thumb: r.thumb, video: null, videoMime: '' }));
  };
  const post = async () => {
    setBusy(true);
    try {
      const body = form.video
        ? { category: form.category, text: form.text, kind: 'video', video_data: form.video, video_mime: form.videoMime }
        : { category: form.category, text: form.text, kind: 'photo', thumb: form.thumb, display: form.photo };
      await api('/statuses', { method: 'POST', body });
      toast(t('status_posted'));
      setPub(false); setForm({ category: 'property', text: '', photo: null, thumb: null, video: null, videoMime: '' });
      load();
    } catch (ex) { toast(ex.message, 'err'); }
    finally { setBusy(false); }
  };
  const label = (id) => t(id === 'market' ? 'cat_market' : 'cat_' + id);
  const cur = view ? view.list[view.idx] : null;

  return (
    <div>
      {/* 🔄 v2026.10.04.1 — indicateur tirer-pour-actualiser (APK) : visible seulement pendant le geste */}
      <div ref={ptrInd} className="ptr-ind" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="#334155" /></svg>
      </div>
      <div className="topbar">
        <BackBtn />
        <div className="grow"><div className="brand-name">✨ {t('status')}</div></div>
        <button className="btn primary sm" onClick={() => setPub(true)}>＋ {t('status_publish')}</button>
      </div>

      {items === null ? <Spinner /> : items.length === 0 ? (
        <div className="card" style={{ padding: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>✨</div>
          <div className="small" style={{ fontWeight: 800 }}>{t('status_none')}</div>
          <button className="btn primary mt8" onClick={() => setPub(true)}>＋ {t('status_publish')}</button>
        </div>
      ) : (
        STATUS_CATS.map((c) => {
          const groups = groupsOf(c.id);
          if (!groups.length) return null;
          return (
            <div key={c.id} className="mt12">
              <div className="h2 mb8">{c.emoji} {label(c.id)}</div>
              <div className="st-row">
                {groups.map((g) => (
                  <button key={g.user_id} type="button" className="st-bubble" onClick={() => openGroup(g)}>
                    <span className={'st-ring' + (groupSeen(g) ? ' seen' : '')}>
                      <span className="st-thumb">
                        {g.list[0].photo_thumb ? <img src={g.list[0].photo_thumb} alt="" /> : (g.list[0].text || '💬').slice(0, 2)}
                        {g.list[0].video && <span className="st-play">▶</span>}
                      </span>
                    </span>
                    {g.list.length > 1 && <span className="st-count">{g.list.length}</span>}
                    <span className="st-name">{g.user_name}</span>
                    <span className="st-time">{new Date(g.list[0].created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* 📖 LECTEUR PLEIN ÉCRAN (story) : barre de progression, enchaînement auto, fermeture à la fin */}
      {cur && (
        <div className="st-viewer">
          <div className="st-segs">
            {view.list.map((_, i2) => (
              <span key={i2} className="st-seg"><span style={{ width: (i2 < view.idx ? 100 : i2 === view.idx ? progress * 100 : 0) + '%' }} /></span>
            ))}
          </div>
          <div className="row spread st-head">
            <div style={{ fontWeight: 800, color: '#fff' }}>✨ {cur.user_name}</div>
            <div className="row" style={{ gap: 8 }}>
              <span className="muted xsmall" style={{ color: '#cbd5e1' }}>{new Date(cur.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              {cur.user_id === user?.id && <button className="btn ghost sm" onClick={del} title={t('delete')}>🗑️</button>}
              <button className="btn ghost sm" onClick={() => setView(null)}>✕</button>
            </div>
          </div>
          <div className="st-tap left" onClick={prev} />
          <div className="st-tap right" onClick={next} />
          <div className="st-media" onClick={next}>
            {cur.video
              ? <video ref={videoRef} src={cur.video} autoPlay playsInline
                  onTimeUpdate={(e) => setProgress(Math.min(1, e.currentTarget.currentTime / (e.currentTarget.duration || 1)))}
                  onEnded={next}
                  onError={next}
                  onLoadedMetadata={(e) => { e.currentTarget.play().catch(() => { e.currentTarget.muted = true; e.currentTarget.play().catch(() => {}); }); }} />
              : <img src={cur.photo} alt="" />}
          </div>
          {cur.text && <div className="st-caption">{cur.text}</div>}
        </div>
      )}

      {/* publication d'un statut (photo OU vidéo) */}
      <Modal open={pub} onClose={() => setPub(false)} title={'✨ ' + t('status_publish')}>
        <div className="label mb4">{t('category')}</div>
        <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
          {STATUS_CATS.map((c) => (
            <button key={c.id} type="button" className={'chip' + (form.category === c.id ? ' on' : '')} onClick={() => setForm((s) => ({ ...s, category: c.id }))}>{c.emoji} {label(c.id)}</button>
          ))}
        </div>
        <textarea className="input" rows={3} placeholder={t('status_ph')} value={form.text} onChange={(e) => setForm((s) => ({ ...s, text: e.target.value }))} />
        <div className="row mt8" style={{ gap: 8, alignItems: 'center' }}>
          <label className="btn soft" style={{ cursor: 'pointer' }}>
            🖼️ {t('add_photo')}
            <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={pick} />
          </label>
          {form.thumb && <img src={form.thumb} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />}
          {form.video && <span className="small" style={{ fontWeight: 800 }}>🎬 vidéo prête</span>}
        </div>
        <button className="btn primary block mt12" disabled={busy || (!form.text.trim() && !form.photo && !form.video)} onClick={post}>{busy ? '…' : '✅ ' + t('status_publish')}</button>
      </Modal>
    </div>
  );
}

export function SettingsPage() {
  const t = useT();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  return (
    <div>
      <div className="topbar">
        <BackBtn />
        <div className="grow"><div className="brand-name">⚙️ {t('settings')}</div></div>
      </div>

      <div className="card mb12 row spread" style={{ alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800 }}>👤 {t('profile')}</div>
          <div className="muted small">{user?.name} · {user?.phone || user?.email}</div>
        </div>
        <button className="btn blue sm" onClick={() => nav('/app/profile')}>{t('edit')}</button>
      </div>

      <div className="card mb12 row spread" style={{ alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800 }}>🔔 {t('push_notifs')}</div>
          <div className="muted small">{t('notif_toggle_hint')}</div>
        </div>
        <BellButton />
      </div>

      <div className="card mb12 row spread" style={{ alignItems: 'center' }}>
        <div style={{ fontWeight: 800 }}>🌐 {t('language')}</div>
        <LangSwitch />
      </div>

      <div className="card mb12">
        <div style={{ fontWeight: 800 }}>ℹ️ {t('about')}</div>
        <div className="muted small mt4">YallaLiv — livraison &amp; marché 🚀🛍️ · v2026.10.08.8</div>
      </div>

      <button className="btn danger block" onClick={() => { logout(); window.location.href = '/login'; }}>🔓 {t('logout')}</button>
    </div>
  );
}
