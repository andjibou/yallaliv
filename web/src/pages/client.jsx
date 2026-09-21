import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, Outlet, useSearchParams } from 'react-router-dom';
import TrackMap from '../TrackMap.jsx';
import { api, useT, useLang, useAuth, useCart, usePoll, fmtMoney, fmtDate, toast, notif, pushSubscribe , ph as photoUrl , trErr, distM, etaRange, FieldErr, V, runV, hasErr, UpdatesBanner } from '../lib.jsx';
import { BottomNav, CartBar, StatusBadge, PayBadge, Stepper, Empty, Spinner, BackBtn, LangSwitch, Modal, Stars, SuggestBox, NoPhoto } from '../ui.jsx';
import ChatModal, { LastMsgLine } from '../Chat.jsx';
import PickMap, { reverseGeocode } from '../PickMap.jsx';
import AccountSettings from '../AccountSettings.jsx';
import { StoresMap } from '../RouteMap.jsx';

const TYPE_META = { restaurant: { e: '🍽️', c: '#ef6c4d' }, market: { e: '🛒', c: '#3b82f6' }, pharmacy: { e: '💊', c: '#14b8a6' } };

export function ClientLayout() {
  return (
    <div className="app-client">
      <UpdatesBanner role="client" />
      <Outlet />
      <CartBar />
      <BottomNav />
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

  useEffect(() => {
    const next = new URLSearchParams();
    if (view !== 'stores') next.set('v', view);
    if (type !== 'all') next.set('t', type);
    if (q.trim()) next.set('q', q.trim());
    if (sp.toString() !== next.toString()) setSp(next, { replace: true });
  }, [view, type, q]);

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
      !stores ? (
        <Spinner />
      ) : stores.length === 0 ? (
        <Empty e="🔎" text={t('no_data')} />
      ) : (
        <div className="store-grid" style={{ gridTemplateColumns: '1fr' }}>
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
                    <div className="small" style={{ color: 'var(--brand-dark)', fontWeight: 800 }}>{fmtMoney(p.price)}</div>
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
          const a = await reverseGeocode(p.coords.latitude, p.coords.longitude);
          if (a) setAddress(a.split(',').slice(0, 3).join(', '));
        } catch {}
      },
      () => toast(t('gps_fail'), 'err'),
      { timeout: 6000 }
    );
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
          <textarea className="textarea" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('address_ph') + ' — ex. : 12 rue Saad Zaghloul, Alexandrie'} />
          <FieldErr e={coErr.address} />
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
                  <div style={{ fontWeight: 800 }}>{o.store_name}</div>
                  <div className="muted small">#{o.id} · {fmtDate(o.created_at, lang)}</div>
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
