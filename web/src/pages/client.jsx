import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams, Outlet, useSearchParams } from 'react-router-dom';
import TrackMap from '../TrackMap.jsx';
import { api, useT, useLang, useAuth, useCart, usePoll, fmtMoney, fmtDate, toast, notif, pushSubscribe , ph as photoUrl , trErr, distM, etaRange, FieldErr, V, runV, hasErr, UpdatesBanner, NotifNag, BellButton } from '../lib.jsx';
import { BottomNav, CartBar, StatusBadge, PayBadge, Stepper, Empty, Spinner, BackBtn, LangSwitch, Modal, Stars, SuggestBox, NoPhoto } from '../ui.jsx';
import ChatModal, { LastMsgLine } from '../Chat.jsx';
import PickMap, { reverseGeocode, geocodeSearch } from '../PickMap.jsx';
import AccountSettings from '../AccountSettings.jsx';
import { StoresMap } from '../RouteMap.jsx';

const TYPE_META = { restaurant: { e: '🍽️', c: '#ef6c4d' }, market: { e: '🛒', c: '#3b82f6' }, pharmacy: { e: '💊', c: '#14b8a6' } };

// 🛍️ v2026.09.24.3 — Marché (style OLX) : catégories + emojis + lien WhatsApp Égypte
const CAT_EMOJI = { phones: '📱', electronics: '🔌', home: '🏠', fashion: '👕', kids: '🧸', sports: '⚽', beauty: '💄', auto: '🚗', other: '📦' };
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
  usePoll(() => api('/notifications').then((d) => setUnread(d.unread || 0)).catch(() => {}), 15000);
  const it = (to, icon, label, end) => (
    <NavLink key={to} to={to} end={end} className={({ isActive }) => 'cnav-item' + (isActive ? ' on' : '')}>
      <span className="ci">{icon}</span>{label}
    </NavLink>
  );
  return (
    <nav className="cnav">
      {it('/app', '🏠', t('home'), true)}
      {it('/app/orders', '🧾', t('orders_nav'))}
      <div className="cnav-fab-wrap">
        <NavLink to="/app/publish" className="cnav-fab" title={t('publish')} aria-label={t('publish')}>
            <span style={{ fontSize: 32, lineHeight: 1 }}>＋</span>
            <span style={{ fontSize: 8.5, fontWeight: 800, lineHeight: 1.5 }}>{t('publish')}</span>
          </NavLink>
      </div>
      <NavLink to="/app/notifications" className={({ isActive }) => 'cnav-item' + (isActive ? ' on' : '')}>
        <span className="ci">🔔{unread > 0 && <span className="cnav-badge">{unread > 99 ? '99+' : unread}</span>}</span>{t('notifications')}
      </NavLink>
      {it('/app/settings', '⚙️', t('settings'))}
    </nav>
  );
}

export function ClientLayout() {
  return (
    <div className="app-client">
      <UpdatesBanner role="client" />
      <NotifNag role="client" />
      <Outlet />
      <CartBar />
      <ClientNav />
    </div>
  );
}

/* ================= HOME ================= */
export function ClientHome() {
  const t = useT();
  const nav = useNavigate();
  const { user } = useAuth();
  const { add, items, setQty } = useCart();
  const [sp, setSp] = useSearchParams();
  const [stores, setStores] = useState(null);
  const [products, setProducts] = useState(null);
  // vue / filtres restaures depuis l'URL : le bouton retour ramene exactement ou on etait
  const [view, setView] = useState(sp.get('v') === 'map' || sp.get('v') === 'products' ? sp.get('v') : 'stores');
  const [type, setType] = useState(sp.get('t') || 'all');
  const [q, setQ] = useState(sp.get('q') || '');
  const [gDetail, setGDetail] = useState(null); // fiche produit ouverte depuis la vue Produits
  const [gQty, setGQty] = useState(1);
  const [gBig, setGBig] = useState(null);

  const prevVT = useRef(view + '|' + type);
  useEffect(() => {
    const next = new URLSearchParams();
    if (view !== 'stores') next.set('v', view);
    if (type !== 'all') next.set('t', type);
    if (q.trim()) next.set('q', q.trim());
    if (sp.toString() !== next.toString()) {
      // changer de VUE ou de filtre = vraie navigation (le retour y revient) · la recherche tape = remplacement
      const isNav = prevVT.current !== view + '|' + type;
      prevVT.current = view + '|' + type;
      setSp(next, { replace: !isNav });
    }
  }, [view, type, q]);
  // ← bouton retour : l'URL rechange → re-synchroniser la vue affichée
  useEffect(() => {
    const sync = () => {
      const v = sp.get('v');
      setView(v === 'map' || v === 'products' ? v : 'stores');
      setType(sp.get('t') || 'all');
      setQ(sp.get('q') || '');
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [sp]);

  // Ouvre la FICHE PRODUIT (pas le magasin) : charge le produit complet + sa boutique
  const openProduct = async (p) => {
    setGDetail({ loading: true });
    try {
      const d = await api('/stores/' + p.store_id);
      const prod = d.products.find((x) => x.id === p.id);
      if (!prod) throw new Error(trErr('Produit introuvable'));
      setGDetail({ store: d.store, product: prod });
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
    setGDetail(null);
  };

  useEffect(() => {
    setStores(null);
    const params = new URLSearchParams();
    if (type !== 'all') params.set('type', type);
    if (q.trim()) params.set('q', q.trim());
    const id = setTimeout(() => {
      api('/stores?' + params.toString()).then((d) => setStores(d.stores)).catch(() => setStores([]));
    }, 250);
    return () => clearTimeout(id);
  }, [type, q]);

  useEffect(() => {
    if (view !== 'products') return;
    setProducts(null);
    const params = new URLSearchParams();
    if (type !== 'all') params.set('type', type);
    if (q.trim()) params.set('q', q.trim());
    const id = setTimeout(() => {
      api('/products?' + params.toString()).then((d) => setProducts(d.products)).catch(() => setProducts([]));
    }, 250);
    return () => clearTimeout(id);
  }, [view, type, q]);

  const chips = [
    { id: 'all', label: t('type_all'), e: '🛍️' },
    { id: 'restaurant', label: t('type_restaurant'), e: '🍽️' },
    { id: 'market', label: t('type_market'), e: '🛒' },
    { id: 'pharmacy', label: t('type_pharmacy'), e: '💊' },
    { id: 'home', label: t('type_home'), e: '🛋️' },
    { id: 'clothes', label: t('type_clothes'), e: '👕' },
    { id: 'electronics', label: t('type_electronics'), e: '📱' }
  ];

  return (
    <>
      <div className="topbar">
        <div className="logo">🚀</div>
        <div className="grow">
          <div className="brand-name">Yalla<span className="accent">Liv</span></div>
          <div className="muted small ellipsis">{t('home_title')} {user?.name?.split(' ')[0]} 👋</div>
        </div>
        <LangSwitch />
        <button className="icon-btn" onClick={() => nav('/app/profile')} title={t('profile')} aria-label={t('profile')} style={{ fontSize: 19 }}>👤</button>
      </div>

      <SuggestBox
        value={q}
        onChange={setQ}
        placeholder={'🔍 ' + (view === 'products' ? t('search_product_ph') : t('search_ph'))}
        clearTitle={t('clear_search')}
        getSugs={() => {
          const s = q.trim().toLowerCase();
          if (view === 'products') {
            return (products || []).filter((p) => (p.name || '').toLowerCase().includes(s) || (p.store_name || '').toLowerCase().includes(s))
              .map((p) => ({ key: 'p' + p.id, icon: p.store_emoji || '🏪', label: p.name, sub: p.store_name, p }));
          }
          return (stores || []).filter((st) => (st.name || '').toLowerCase().includes(s))
            .map((st) => ({ key: 's' + st.id, icon: st.photo ? <img src={photoUrl(st.photo, 'thumb')} alt="" style={{ width: 24, height: 24, borderRadius: 7, objectFit: 'cover' }} /> : (st.emoji || '🏪'), label: st.name, sub: t('type_' + st.type), st }));
        }}
        onPick={(s) => {
          if (s.p) openProduct(s.p);                                   // vue Produits : ouvre la fiche produit
          else nav(`/app/store/${s.st.id}`);                            // vue Magasins/Carte : ouvre la boutique
        }}
      />

      <div className="chips mt12">
        {chips.map((c) => (
          <button key={c.id} className={'chip' + (type === c.id ? ' on' : '')} onClick={() => setType(c.id)}>
            {c.e} {c.label}
          </button>
        ))}
      </div>

      <div className="chips mt12" style={{ gap: 6 }}>
        {[{ id: 'stores', e: '🏪' }, { id: 'map', e: '🗺️' }, { id: 'products', e: '🛍️' }].map((v) => (
          <button key={v.id} className={'chip' + (view === v.id ? ' on' : '')} onClick={() => setView(v.id)} style={{ fontWeight: 800 }}>
            {v.e} {t('tab_' + v.id)}
          </button>
        ))}
      </div>

      {view === 'map' && (
        <div className="card mt12" style={{ padding: 8 }}>
          {!stores ? <Spinner /> : stores.filter((s) => s.lat != null).length === 0
            ? <Empty e="🗺️" text={t('no_data')} />
            : <StoresMap stores={stores} height={430} onSelect={(s) => nav(`/app/store/${s.id}`)} />}
        </div>
      )}

      {view === 'products' && (
        !products ? <Spinner /> : products.length === 0
          ? <Empty e="🔎" text={t('no_data')} />
          : (
            <div className="prod-grid">
              {products.map((p) => (
                <div key={p.id} className="card prod-card" onClick={() => openProduct(p)}>
                  {p.photo
                    ? <img className="prod-photo" src={photoUrl(p.photo, 'thumb')} alt="" loading="lazy" />
                    : <NoPhoto full h={96} radius={10} />}
                  <div className="ellipsis" style={{ fontWeight: 800, marginTop: 6 }}>{p.name}</div>
                  {p.qty != null && <div className="muted small" style={{ marginTop: 2 }}>📦 {p.qty} dispo.</div>}
                  <div className="row mt4" style={{ gap: 6, alignItems: 'center' }}>
                    {p.store_photo
                      ? <img src={photoUrl(p.store_photo, 'thumb')} alt="" style={{ width: 22, height: 22, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      : <div className="store-emoji" style={{ width: 22, height: 22, fontSize: 12, background: p.store_color || '#0e9f6e', flexShrink: 0 }}>{p.store_emoji || '🏪'}</div>}
                    <span className="muted small ellipsis">{p.store_name}</span>
                  </div>
                  <div className="row spread mt4" style={{ alignItems: 'center' }}>
                    <b style={{ color: 'var(--brand-dark)' }}>{fmtMoney(p.price)}</b>
                    <button className="badge" style={{ background: '#dcfce7', color: '#166534', cursor: 'pointer', border: 'none' }}
                      onClick={(e) => { e.stopPropagation(); nav(`/app/store/${p.store_id}`); }}>🏪 {t('open_store')}</button>
                  </div>
                </div>
              ))}
            </div>
          )
      )}

      {view === 'stores' && (
        <div className="card mb12">
          <div className="row spread mb8">
            <div className="h2">🛍️ {t('market')}</div>
            <button className="btn ghost sm" onClick={() => nav('/app/market')}>{t('see_all')} →</button>
          </div>
          {/* 🛍️ v2026.09.24.3 — grandes icônes 3D réalistes par catégorie, défilement gauche/droite */}
          <div className="mkt-cats">
            {Object.keys(CAT_EMOJI).map((k) => (
              <button key={k} type="button" className="mkt-cat" onClick={() => nav('/app/market?cat=' + k)}>
                <img src={'/market/' + k + '.jpg'} alt={t('cat_' + k)} loading="lazy" />
                <span>{t('cat_' + k)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'stores' && (
      !stores ? (
        <Spinner />
      ) : stores.length === 0 ? (
        <Empty e="🔎" text={t('no_data')} />
      ) : (
        <div className="store-grid">
          {stores.map((s) => {
            const meta = TYPE_META[s.type] || TYPE_META.market;
            return (
              <div key={s.id} className="card store-card" onClick={() => nav(`/app/store/${s.id}`)}>
                {s.photo
              ? <img src={photoUrl(s.photo, 'thumb')} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--line)' }} />
              : <div className="store-emoji" style={{ background: s.color || meta.c }}>{s.emoji || meta.e}</div>}
                <div className="grow">
                  <div className="h2 ellipsis">{s.name}</div>
                  <div className="muted small ellipsis">{t('type_' + s.type)} · ⭐ {Number(s.rating).toFixed(1)}</div>
                  <div className="row mt4" style={{ gap: 6 }}>
                    <span className="badge">{meta.e} {s.product_count} {t('products_count')}</span>
                    <span className="badge">{t('delivery_fee')} {fmtMoney(s.delivery_fee)}</span>
                    <span className="badge">⏱ {etaRange(s.type, null).join('-')} min</span>
                  </div>
                </div>
                {!s.is_open && <span className="badge st-cancelled">{t('closed')}</span>}
              </div>
            );
          })}
        </div>
        )
      )}

      <Modal open={!!gDetail} onClose={() => setGDetail(null)} title={t('product_details')}>
        {gDetail?.loading ? <Spinner /> : gDetail?.store && gDetail?.product ? (
          <div style={{ textAlign: 'center' }}>
            <div className="row wrap" style={{ justifyContent: 'center', gap: 8, alignItems: 'center' }}>
              <div className="store-emoji" style={{ width: 26, height: 26, fontSize: 14, background: gDetail.store.color || '#0e9f6e' }}>{gDetail.store.emoji || '🏪'}</div>
              <b className="small ellipsis">{gDetail.store.name}</b>
              <button className="btn ghost sm" onClick={() => { const sid = gDetail.store.id; setGDetail(null); nav(`/app/store/${sid}`); }}>🏪 {t('open_store')}</button>
            </div>
            {gBig
              ? <img src={photoUrl(gBig)} alt="" className="detail-photo" />
              : <NoPhoto w={140} h={140} radius={18} style={{ margin: '0 auto' }} />}
            {(gDetail.product.photos || []).length > 0 && (
              <div className="row wrap mt8" style={{ gap: 8, justifyContent: 'center' }}>
                {gDetail.product.photo && (
                  <img src={photoUrl(gDetail.product.photo, 'thumb')} alt="" className={'p-photo gal-thumb' + (gBig === gDetail.product.photo ? ' on' : '')} onClick={() => setGBig(gDetail.product.photo)} />
                )}
                {gDetail.product.photos.map((ph) => (
                  <img key={ph.id} src={photoUrl(ph.photo, 'thumb')} alt="" className={'p-photo gal-thumb' + (gBig === ph.photo ? ' on' : '')} onClick={() => setGBig(ph.photo)} />
                ))}
              </div>
            )}
            <div className="h2 mt8">{gDetail.product.name}</div>
            <div className="mt4"><span className="badge">{gDetail.product.category}</span></div>
            {gDetail.product.description && <p className="muted mt12" style={{ fontSize: 14.5 }}>{gDetail.product.description}</p>}
            <div className="big mt8" style={{ color: 'var(--brand-dark)' }}>{fmtMoney(gDetail.product.price)}</div>
            {!gDetail.store.is_open ? (
              <div className="banner warn mt12">{t('store_closed')}</div>
            ) : (
              <div className="row mt16" style={{ gap: 12 }}>
                <div className="qty-stepper" style={{ padding: '9px 11px' }}>
                  <button className="qs-btn" onClick={() => setGQty((n) => Math.max(1, n - 1))}>−</button>
                  <span style={{ minWidth: 22, textAlign: 'center' }}>{gQty}</span>
                  <button className="qs-btn" onClick={() => setGQty((n) => Math.min(99, n + 1))}>+</button>
                </div>
                <button className="btn primary grow" onClick={addFromGlobal}>
                  🛒 {t('add_to_cart')} · {fmtMoney(gDetail.product.price * gQty)}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </>
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
  const [pq, setPq] = useState('');   // recherche de produits DANS la boutique

  useEffect(() => {
    api('/stores/' + id).then(setData).catch((e) => setErr(e.message));
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
    setDetail(null);
  };

  if (err) return <><div className="topbar"><BackBtn /></div><Empty e="😔" text={err} /></>;
  if (!data) return <Spinner />;

  const { store, products } = data;
  const meta = TYPE_META[store.type] || TYPE_META.market;
  const s = pq.trim().toLowerCase();
  const fProds = s ? products.filter((p) =>
    (p.name || '').toLowerCase().includes(s) || (p.description || '').toLowerCase().includes(s) || (p.category || '').toLowerCase().includes(s)
  ) : products;
  const byCat = groupByCat(fProds);
  const qtyOf = (pid) => items.find((i) => i.product_id === pid && i.store_id === store.id)?.qty || 0;
  const closed = !store.is_open;

  return (
    <>
      <div className="topbar">
        <BackBtn />
        <div className="grow h2 ellipsis">{store.name}</div>
        {closed && <span className="badge st-cancelled">{t('closed')}</span>}
      </div>

      <div className="store-header" style={{ background: `linear-gradient(135deg, ${store.color || meta.c}, #0f172a)` }}>
        <div className="row">
          {store.photo
            ? <img src={photoUrl(store.photo, 'thumb')} alt="" style={{ width: 62, height: 62, borderRadius: 16, objectFit: 'cover', border: '2px solid rgba(255,255,255,.5)' }} />
            : <div className="store-emoji" style={{ background: 'rgba(255,255,255,.2)', width: 62, height: 62, fontSize: 33 }}>{store.emoji || meta.e}</div>}
          <div className="grow">
            <div className="big">{store.name}</div>
            <div className="small" style={{ opacity: .9 }}>⭐ {Number(store.rating).toFixed(1)} · {t('type_' + store.type)}</div>
          </div>
        </div>
        <div className="small mt8" style={{ opacity: .92 }}>{store.description}</div>
        <div className="row wrap mt8" style={{ gap: 6 }}>
          <span className="badge" style={{ background: 'rgba(255,255,255,.22)', color: '#fff' }}>🛵 {t('delivery_fee')} {fmtMoney(store.delivery_fee)}</span>
          {store.min_order > 0 && <span className="badge" style={{ background: 'rgba(255,255,255,.22)', color: '#fff' }}>🧾 {t('min_lbl')} {fmtMoney(store.min_order)}</span>}
          <span className="badge" style={{ background: 'rgba(255,255,255,.22)', color: '#fff' }}>📍 {store.address}</span>
        </div>
      </div>
      {store.lat != null && (
        <div className="mt12">
          <button className={'chip' + (showMap ? ' on' : '')} onClick={() => setShowMap((v) => !v)} style={{ fontWeight: 800 }}>
            🗺️ {t('tab_map')}
          </button>
        </div>
      )}
      {showMap && store.lat != null && (
        <div className="card mt12" style={{ padding: 8 }}>
          <div className="row spread" style={{ padding: '2px 6px 8px' }}>
            <div className="small" style={{ fontWeight: 800 }}>📍 {t('store_position')}</div>
            <span className="badge">{store.address}</span>
          </div>
          <StoresMap stores={[store]} height={220} />
        </div>
      )}
      {closed && <div className="banner warn">{t('store_closed')}</div>}

      <div className="row mt12">
        <SuggestBox
          value={pq}
          onChange={setPq}
          placeholder={'🔍 ' + t('search_product_ph')}
          clearTitle={t('clear_search')}
          getSugs={() => fProds.map((p) => ({ key: p.id, icon: p.photo ? <img src={photoUrl(p.photo, 'thumb')} alt="" style={{ width: 24, height: 24, borderRadius: 7, objectFit: 'cover' }} /> : <NoPhoto w={24} h={24} radius={7} />, label: p.name, sub: fmtMoney(p.price), p }))}
          onPick={(s) => openDetail(s.p)}                                // ouvre directement la fiche produit
        />
      </div>
      {pq.trim() !== '' && Object.keys(byCat).length === 0 && <div className="mt12"><Empty e="🔎" text={t('no_data')} /></div>}

      {Object.entries(byCat).map(([cat, prods]) => (
        <div key={cat}>
          <div className="sec-title">{cat}</div>
          <div className="card">
            {prods.map((p) => {
              const q = qtyOf(p.id);
              return (
                <div key={p.id} className="product-row">
                  {p.photo
                    ? <img className="p-photo" src={photoUrl(p.photo, 'thumb')} alt="" loading="lazy" onClick={() => openDetail(p)} style={{ cursor: 'pointer' }} />
                    : <div style={{ cursor: 'pointer' }} onClick={() => openDetail(p)}><NoPhoto w={46} h={46} /></div>}
                  <div className="grow" style={{ cursor: 'pointer' }} onClick={() => openDetail(p)}>
                    <div style={{ fontWeight: 700 }}>{p.name} <span className="muted" style={{ fontWeight: 400 }}>ℹ️</span></div>
                    {p.description && <div className="muted small ellipsis">{p.description}</div>}
                    <div className="small" style={{ color: 'var(--brand-dark)', fontWeight: 800 }}>{fmtMoney(p.price)} {p.qty != null && <span className="muted" style={{ fontWeight: 400 }}>· 📦 {p.qty}</span>}</div>
                  </div>
                  {q > 0 ? (
                    <div className="qty-stepper">
                      <button className="qs-btn" onClick={() => setQty(p.id, q - 1)}>−</button>
                      <span>{q}</span>
                      <button className="qs-btn" onClick={() => setQty(p.id, q + 1)} disabled={closed}>+</button>
                    </div>
                  ) : (
                    <button className="add-btn" disabled={closed} onClick={() => { add(p, store); toast(t('added')); }}>+</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={t('product_details')}>
        {detail && (
          <div style={{ textAlign: 'center' }}>
            {bigPhoto
              ? <img src={photoUrl(bigPhoto)} alt="" className="detail-photo" />
              : <NoPhoto w={140} h={140} radius={18} style={{ margin: '0 auto' }} />}
            {(detail.photos || []).length > 0 && (
              <div className="row wrap mt8" style={{ gap: 8, justifyContent: 'center' }}>
                {detail.photo && (
                  <img src={photoUrl(detail.photo, 'thumb')} alt="" className={'p-photo gal-thumb' + (bigPhoto === detail.photo ? ' on' : '')} onClick={() => setBigPhoto(detail.photo)} />
                )}
                {detail.photos.map((ph) => (
                  <img key={ph.id} src={photoUrl(ph.photo, 'thumb')} alt="" className={'p-photo gal-thumb' + (bigPhoto === ph.photo ? ' on' : '')} onClick={() => setBigPhoto(ph.photo)} />
                ))}
              </div>
            )}
            <div className="h2 mt8">{detail.name}</div>
            <div className="mt4"><span className="badge">{detail.category}</span></div>
            {detail.description && <p className="muted mt12" style={{ fontSize: 14.5 }}>{detail.description}</p>}
            <div className="big mt8" style={{ color: 'var(--brand-dark)' }}>{fmtMoney(detail.price)}</div>
            {!closed ? (
              <div className="row mt16" style={{ gap: 12 }}>
                <div className="qty-stepper" style={{ padding: '9px 11px' }}>
                  <button className="qs-btn" onClick={() => setDQty((q) => Math.max(1, q - 1))}>−</button>
                  <span style={{ minWidth: 22, textAlign: 'center' }}>{dQty}</span>
                  <button className="qs-btn" onClick={() => setDQty((q) => Math.min(99, q + 1))}>+</button>
                </div>
                <button className="btn primary grow" onClick={addFromDetail}>
                  🛒 {t('add_to_cart')} · {fmtMoney(detail.price * dQty)}
                </button>
              </div>
            ) : (
              <div className="banner warn mt12">{t('store_closed')}</div>
            )}
          </div>
        )}
      </Modal>
    </>
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
    if (v.trim().length < 4) { setSugg(null); return; }
    suggTm.current = setTimeout(async () => {
      const near = gps || (store?.lat != null ? { lat: store.lat, lng: store.lng } : { lat: 31.2001, lng: 29.9187 });
      try { setSugg((await geocodeSearch(v.trim(), lang, near)).slice(0, 5)); } catch { setSugg(null); }
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
    if (v.trim().length < 4) { setDSugg(null); return; }
    dTm.current = setTimeout(async () => {
      const near = dGps || (l.lat != null ? { lat: l.lat, lng: l.lng } : { lat: 31.2001, lng: 29.9187 });
      try { setDSugg((await geocodeSearch(v.trim(), lang, near)).slice(0, 5)); } catch { setDSugg(null); }
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
          {l.area && <span className="badge">📍 {l.area}</span>}
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
  const [form, setForm] = useState({ name: '', category: 'other', subcategory: null, condition: null, description: '', price: '', phone: user?.phone || '', brand: '', size: '', area: '', photos: [], lat: null, lng: null });
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
        <div className="muted small mt4">YallaLiv — livraison &amp; marché 🚀🛍️ · v2026.09.26.3</div>
      </div>

      <button className="btn danger block" onClick={() => { logout(); window.location.href = '/login'; }}>🔓 {t('logout')}</button>
    </div>
  );
}
