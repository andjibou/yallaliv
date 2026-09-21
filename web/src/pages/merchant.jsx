import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiText, downloadCsv, useT, useLang, useAuth, usePoll, fmtMoney, fmtDate, toast, notif, beep, alarm, pushSubscribe, processImage, ph as photoUrl } from '../lib.jsx';
import { StatusBadge, PayBadge, Empty, Spinner, Modal, LangSwitch, NoPhoto } from '../ui.jsx';
import ChatModal, { LastMsgLine } from '../Chat.jsx';
import { BarsChart, compactMoney } from '../Chart.jsx';
import DriversMap from '../DriversMap.jsx';
import RouteMap, { DualRouteMap } from '../RouteMap.jsx';
import PickMap from '../PickMap.jsx';
import AccountSettings from '../AccountSettings.jsx';

export default function MerchantApp() {
  const t = useT();
  const [acct, setAcct] = useState(false);
  const [tab, setTab] = useState('dash');
  const tabs = [
    { id: 'dash', label: '📊 ' + t('dashboard') },
    { id: 'products', label: '📦 ' + t('products') },
    { id: 'drivers', label: '🛵 ' + t('drivers_team') },
    { id: 'settings', label: '🏪 ' + t('store_settings') }
  ];
  return (
    <div className="shell">
      <Top onAccount={() => setAcct(true)} />
      <div className="tabs">
        {tabs.map((x) => (
          <button key={x.id} className={'tab' + (tab === x.id ? ' on' : '')} onClick={() => setTab(x.id)}>{x.label}</button>
        ))}
      </div>
      {tab === 'dash' && <Dashboard />}
      {tab === 'products' && <Products />}
      {tab === 'drivers' && <Drivers />}
      {tab === 'settings' && <StoreSettings />}

      {acct && (
        <Modal open onClose={() => setAcct(false)} title={'👤 ' + t('account_settings')}>
          <AccountSettings />
        </Modal>
      )}
    </div>
  );
}

function Top({ onAccount }) {
  const t = useT();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const bell = async () => {
    const r = await pushSubscribe();
    toast(r === 'granted' ? t('push_on') : r === 'denied' ? t('notif_off') : t('push_fail'), r === 'granted' ? 'ok' : 'err');
  };
  return (
    <div className="topbar">
      <div className="logo">🏪</div>
      <div className="grow">
        <div className="brand-name" style={{ fontSize: 18 }}>{t('store_settings')} · Yalla<span className="accent">Liv</span></div>
        <div className="muted small ellipsis">{user?.name}</div>
      </div>
      <LangSwitch />
      <button className="icon-btn" onClick={() => nav('/app')} title={t('switch_client')}>🛍️</button>
      <button className="icon-btn" onClick={bell} title={t('notif_enable')}>🔔</button>
      <button className="icon-btn" onClick={onAccount} title={t('account_settings')}>👤</button>
      <button className="icon-btn" onClick={logout} title={t('logout')}>🚪</button>
    </div>
  );
}

function StatusBanner({ store }) {
  const t = useT();
  if (store.status === 'pending') return <div className="banner warn">⏳ {t('pending_store')}</div>;
  if (store.status === 'suspended') return <div className="banner err">🚫 {t('suspended')}</div>;
  return null;
}

/* ---------- Dashboard ---------- */
function Dashboard() {
  const t = useT();
  const { lang } = useLang();
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState(null);
  const [series, setSeries] = useState(null);
  const [top, setTop] = useState(null);
  const [chat, setChat] = useState(null);
  const [flt, setFlt] = useState('new');
  const [assign, setAssign] = useState(null); // {order, drivers} — attribution directe
  const seen = useRef(null);
  const [alerts, setAlerts] = useState([]); // nouvelles commandes → overlay plein écran + alarme
  const titleRef = useRef(null);

  useEffect(() => {
    api('/merchant/sales-daily').then((d) => setSeries(d.series)).catch(() => setSeries([]));
    api('/merchant/top-products').then((d) => setTop(d.top)).catch(() => setTop([]));
  }, []);

  // 🚨 Titre d'onglet clignotant tant qu'une commande n'est pas traitée
  useEffect(() => {
    if (titleRef.current == null) titleRef.current = document.title;
    if (!alerts.length) { document.title = titleRef.current; return; }
    let on = true;
    const iv = setInterval(() => { document.title = on ? '🚨 NOUVELLE COMMANDE !' : titleRef.current; on = !on; }, 800);
    return () => { clearInterval(iv); document.title = titleRef.current; };
  }, [alerts.length]);

  usePoll(() => {
    api('/merchant/store').then(setData).catch(() => {});
    api('/merchant/orders').then((d) => {
      const pend = d.orders.filter((o) => o.status === 'pending');
      if (seen.current) {
        for (const o of pend) {
          if (!seen.current[o.id]) {
            notif(`${t('new_order')} #${o.id}`, `${o.client_name} · ${fmtMoney(o.total)}`);
            alarm(12);
            setAlerts((a) => [...a, o]);
          }
        }
      }
      const m = {};
      pend.forEach((o) => (m[o.id] = 1));
      seen.current = m;
      setOrders(d.orders);
    }).catch(() => {});
  }, 5000);

  const exportCsv = async () => {
    try { downloadCsv('commandes.csv', await apiText('/merchant/export')); } catch (e) { toast(e.message, 'err'); }
  };

  if (!data) return <Spinner />;
  if (data.store.status !== 'approved') return <><StatusBanner store={data.store} /><Empty e="⏳" text={t('no_orders')} /></>;

  const today0 = new Date().setHours(0, 0, 0, 0);
  const todays = orders?.filter((o) => o.created_at >= today0) || [];
  const pending = orders?.filter((o) => o.status === 'pending') || [];
  const INFLIGHT = ['accepted', 'preparing', 'ready', 'assigned', 'picked_up'];
  const inFlight = orders?.filter((o) => INFLIGHT.includes(o.status)) || [];
  const done = orders?.filter((o) => ['delivered', 'rejected', 'cancelled'].includes(o.status)) || [];
  const fltList = flt === 'new' ? pending : flt === 'active' ? inFlight : done;
  const revenue = todays.filter((o) => !['rejected', 'cancelled'].includes(o.status)).reduce((s, o) => s + o.total, 0);

  const act = async (id, status, visibility) => {
    try { await api(`/merchant/orders/${id}/status`, { method: 'POST', body: { status, visibility } }); } catch (ex) { toast(ex.message, 'err'); }
    api('/merchant/orders').then((d) => setOrders(d.orders)).catch(() => {});
  };
  const setVis = async (o, visibility) => {
    try { await api(`/merchant/orders/${o.id}/visibility`, { method: 'POST', body: { visibility } }); toast(t('store_updated')); } catch (ex) { toast(ex.message, 'err'); }
    api('/merchant/orders').then((d) => setOrders(d.orders)).catch(() => {});
  };
  const openAssign = async (o) => {
    setAssign({ order: o, drivers: null });
    try {
      const d = await api('/merchant/drivers');
      setAssign({ order: o, drivers: d.drivers.filter((x) => !x.general && x.status === 'active') });
    } catch (ex) { toast(ex.message, 'err'); setAssign(null); }
  };
  const doAssign = async (o, drv) => {
    try {
      let r = await api(`/merchant/orders/${o.id}/assign`, { method: 'POST', body: { driver_id: drv.id } });
      if (r.needs_confirm) {
        if (!window.confirm(t('driver_busy_confirm').replace('{n}', r.active_count))) return;
        r = await api(`/merchant/orders/${o.id}/assign`, { method: 'POST', body: { driver_id: drv.id, force: true } });
      }
      toast(t('assigned_ok') + (r.plan === 'store_first' ? ' · ' + t('plan_store_first') : r.plan === 'finish_current_first' ? ' · ' + t('plan_finish_first') : ''));
      setAssign(null);
      api('/merchant/orders').then((d) => setOrders(d.orders)).catch(() => {});
    } catch (ex) { toast(ex.message, 'err'); }
  };

  return (
    <>
      <div className="stat-grid">
        <div className="stat hl"><div className="v">{pending.length}</div><div className="k">⏳ {t('new_orders')}</div></div>
        <div className="stat"><div className="v">{todays.length}</div><div className="k">📅 {t('today')}</div></div>
        <div className="stat"><div className="v" style={{ fontSize: 18 }}>{fmtMoney(revenue || 0)}</div><div className="k">💰 {t('revenue')}</div></div>
        <div className="stat"><div className="v">⭐ {Number(data.store.rating).toFixed(1)}</div><div className="k">{t('store_note')}</div></div>
      </div>


      <div className="row spread" style={{ margin: '4px 0 10px' }}>
        <div className="sec-title" style={{ margin: 0 }}>🧾 {t('orders')}</div>
        <button className="btn ghost sm" onClick={exportCsv}>⬇️ {t('export_csv')}</button>
      </div>
      <div className="chips">
        <button className={'chip' + (flt === 'new' ? ' on' : '')} onClick={() => setFlt('new')}>⏳ {t('tab_new')} ({pending.length})</button>
        <button className={'chip' + (flt === 'active' ? ' on' : '')} onClick={() => setFlt('active')}>🛵 {t('tab_active')} ({inFlight.length})</button>
        <button className={'chip' + (flt === 'done' ? ' on' : '')} onClick={() => setFlt('done')}>📁 {t('tab_done')} ({done.length})</button>
      </div>

      {!orders?.length ? (
        <Empty e="📦" text={t('no_orders')} />
      ) : fltList.length === 0 ? (
        <Empty e="🗂️" text={t('no_data')} />
      ) : (
        fltList.map((o) => (
          <div key={o.id} className="card mb12">
            <div className="row spread wrap">
              <div className="row" style={{ gap: 8 }}>
                <div className="p-emoji" style={{ width: 40, height: 40, fontSize: 19 }}>👤</div>
                <div>
                  <div style={{ fontWeight: 800 }}>{o.client_name}</div>
                  <div className="muted small">#{o.id} · {fmtDate(o.created_at, lang)}</div>
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {o.pin && <span className="badge">🔑 {o.pin}</span>}
                <StatusBadge status={o.status} />
              </div>
            </div>
            <div className="mt8" style={{ background: '#f8fafc', borderRadius: 12, padding: 10 }}>
              {o.items.map((it) => (
                <div key={it.id} className="row spread small">
                  <span>{it.name} × {it.qty}</span>
                  <span className="muted">{fmtMoney(it.price * it.qty)}</span>
                </div>
              ))}
              <div className="row spread small mt4"><span className="muted">🛵 {t('delivery_fee')}</span><span className="muted">{fmtMoney(o.delivery_fee)}</span></div>
            </div>
            <div className="row spread mt8 small wrap" style={{ gap: 6 }}>
              <span className="muted">📍 {o.address}</span>
              <span>📞 <a href={'tel:' + o.phone}>{o.phone}</a></span>
            </div>
            {o.note && <div className="banner warn mt8" style={{ marginBottom: 0 }}>📝 {o.note}</div>}
            <div className="row spread mt8 wrap">
              <span>
                <PayBadge o={o} /> {o.promo_code && <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>🎁 {o.promo_code} −{fmtMoney(o.discount)}</span>}
              </span>
              <b className="big">{fmtMoney(o.total)}</b>
            </div>
            {o.driver_name && <div className="muted small mt4">🛵 {t('driver')} : {o.driver_name} · {o.driver_phone}</div>}
            <div className="row mt8 wrap">
              {o.status === 'pending' && <>
                <button className="btn primary sm" onClick={() => act(o.id, 'accepted')}>✅ {t('accept')}</button>
                <button className="btn danger sm" onClick={() => act(o.id, 'rejected')}>✕ {t('reject')}</button>
              </>}
              {o.status === 'accepted' && <button className="btn blue sm" onClick={() => act(o.id, 'preparing')}>👨‍🍳 {t('start_preparing')}</button>}
              {o.status === 'preparing' && <>
                <button className="btn amber sm" onClick={() => act(o.id, 'ready', 'private')}>🔒 {t('ready_private')}</button>
                <button className="btn blue sm" onClick={() => act(o.id, 'ready', 'public')}>🌍 {t('ready_public')}</button>
              </>}
              {o.status === 'ready' && <>
                <span className={'badge ' + (o.visibility === 'private' ? 'st-assigned' : 'pay-b')}>
                  {o.visibility === 'private' ? '🔒 ' + t('pub_private') : '🌍 ' + t('pub_public')}
                </span>
                <button className="btn ghost sm" onClick={() => setVis(o, o.visibility === 'private' ? 'public' : 'private')}>
                  {o.visibility === 'private' ? '🌍 → ' + t('pub_public') : '🔒 → ' + t('pub_private')}
                </button>
                <button className="btn soft sm" onClick={() => openAssign(o)}>👤 {t('assign_to')}</button>
              </>}
              <button className="btn ghost sm" onClick={() => setChat(o)}>💬 Chat</button>
            </div>
            <LastMsgLine o={o} />
          </div>
        ))
      )}
      {series && series.length > 0 && (
        <div className="card mb16">
          <div className="h2 mb8">📈 {t('sales14')}</div>
          <BarsChart data={series.map((s) => ({ label: s.label, value: s.revenue }))} fmt={compactMoney} />
          <div className="h2 mb8 mt16">🧾 {t('orders14')}</div>
          <BarsChart data={series.map((s) => ({ label: s.label, value: s.orders }))} color="#0ea5e9" fmt={(v) => v} height={100} />
          {top && top.length > 0 && (
            <>
              <div className="h2 mb8 mt16">🏆 {t('top_products')}</div>
              {top.map((p, i) => (
                <div key={i} className="row spread" style={{ padding: '7px 0', borderBottom: i < top.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <span>{p.name}</span>
                  <span className="muted small">×{p.qty} {t('sold')} · <b>{fmtMoney(p.revenue)}</b></span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <Modal open={!!assign} onClose={() => setAssign(null)} title={'👤 ' + t('assign_title') + ' #' + (assign?.order?.id || '')}>
        {assign?.drivers === null ? <Spinner /> : (assign?.drivers || []).length === 0 ? (
          <Empty e="🛵" text={t('no_private_drivers')} />
        ) : assign.drivers.map((d) => (
          <div key={d.id} className="card row wrap mb12" role="button" style={{ cursor: 'pointer' }} onClick={() => doAssign(assign.order, d)}>
            <div className="avatar" style={{ width: 42, height: 42, fontSize: 17, background: d.online ? 'linear-gradient(135deg,#0e9f6e,#0ea5e9)' : '#94a3b8' }}>🛵</div>
            <div className="grow">
              <div style={{ fontWeight: 800 }}>{d.name}</div>
              <div className="muted small">📞 {d.phone || '—'} · 📦 {d.deliveries} {t('deliveries_done')}</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span className={'badge ' + (d.online ? 'b-active' : '')}>{d.online ? '🟢 ' + t('online') : '⚪ ' + t('offline')}</span>
              {d.active?.length > 0
                ? <span className="badge st-assigned">🛵 {t('driver_on_trip')} · #{d.active[0].id}{d.active.length > 1 ? ` +${d.active.length - 1}` : ''}</span>
                : <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>✅ {t('driver_free')}</span>}
            </div>
          </div>
        ))}
      </Modal>

      {/* 🚨 Mode comptoir : overlay plein écran tant que la nouvelle commande n'est pas vue */}
      {alerts[0] && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ maxWidth: 420, width: '100%', background: '#fff', border: '3px solid #ef4444', textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 44 }}>🚨</div>
            <div style={{ fontSize: 21, fontWeight: 900, margin: '4px 0 2px' }}>NOUVELLE COMMANDE #{alerts[0].id}</div>
            <div style={{ fontSize: 15, margin: '4px 0' }}>👤 {alerts[0].client_name}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#059669', margin: '6px 0' }}>{fmtMoney(alerts[0].total)}</div>
            <div className="small" style={{ opacity: 0.8 }}>🏁 {(alerts[0].address || '').slice(0, 60)}</div>
            {alerts.length > 1 && <div className="small mt4">+ {alerts.length - 1} autre(s) commande(s) en attente</div>}
            <div className="row mt12 wrap" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => { act(alerts[0].id, 'accepted'); setAlerts((a) => a.slice(1)); }}>✅ Accepter la commande</button>
              <button className="btn ghost" onClick={() => setAlerts((a) => a.slice(1))}>👀 Voir dans la liste</button>
            </div>
          </div>
        </div>
      )}

      <ChatModal order={chat} onClose={() => setChat(null)} />
    </>
  );
}

/* ---------- Products ---------- */
const EMPTY_P = { name: '', category: '', price: '', emoji: '📦', description: '', available: true };

function Products() {
  const t = useT();
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null); // null | {..product} | EMPTY_P
  const [photo, setPhoto] = useState(null); // dataURL en attente d'envoi
  const [busy, setBusy] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);

  const refresh = () => api('/merchant/store').then((d) => {
    setData(d);
    setEdit((e) => (e && e.id ? (d.products.find((p) => p.id === e.id) || e) : e));
  }).catch(() => {});
  usePoll(() => { if (!edit) refresh(); }, 8000);
  if (!data) return <Spinner />;

  const pickPhoto = async (file) => {
    if (!file) return;
    const r = await processImage(file); // tout format lisible -> JPEG/PNG optimise (ou GIF tel quel)
    if (r.error === 'format') return toast(t('img_err_format'), 'err');
    if (r.error === 'too_big') return toast(t('img_err_big'), 'err');
    setPhoto(r);   // { thumb, display }
  };

  const addGallery = async (files) => {
    if (!edit?.id) return toast(t('save_first_photos'), 'err');
    const list = [...files];
    if (!list.length) return;
    setGalleryBusy(true);
    let ok = 0;
    for (const f of list) {
      const r = await processImage(f);
      if (r.error) { toast((r.error === 'too_big' ? t('img_err_big') : t('img_err_format')) + ' · ' + f.name, 'err'); continue; }
      try { await api(`/merchant/products/${edit.id}/photos`, { method: 'POST', body: { thumb: r.thumb, display: r.display } }); ok++; }
      catch (ex) { toast(ex.message, 'err'); }
    }
    setGalleryBusy(false);
    if (ok > 0) toast(ok === 1 ? t('photo_added') : t('photos_n_added').replace('{n}', ok));
    refresh();
  };
  const delGallery = async (ph) => {
    try { await api(`/merchant/products/${edit.id}/photos/${ph.id}`, { method: 'DELETE' }); toast(t('photo_removed')); refresh(); }
    catch (ex) { toast(ex.message, 'err'); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...edit, price: parseFloat(edit.price), category: edit.category || 'Général' };
      let saved;
      if (edit.id) saved = (await api('/merchant/products/' + edit.id, { method: 'PUT', body })).product;
      else saved = (await api('/merchant/products', { method: 'POST', body })).product;
      if (photo) {
        try { await api(`/merchant/products/${saved.id}/photo`, { method: 'PUT', body: { thumb: photo.thumb, display: photo.display } }); }
        catch (ex) { toast(ex.message, 'err'); }
      }
      toast(t('saved'));
      setPhoto(null);
      setEdit(null);
      refresh();
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };
  const del = async (p) => {
    try { await api('/merchant/products/' + p.id, { method: 'DELETE' }); toast(t('product_deleted')); refresh(); } catch (ex) { toast(ex.message, 'err'); }
  };

  return (
    <>
      <StatusBanner store={data.store} />
      <div className="row spread mb12">
        <div className="h2">📦 {t('products')} ({data.products.length})</div>
        <button className="btn primary sm" onClick={() => { setEdit({ ...EMPTY_P }); setPhoto(null); }}>＋ {t('add_product')}</button>
      </div>
      <div className="card">
        {data.products.length === 0 && <Empty e="📦" text={t('no_data')} />}
        {data.products.map((p) => (
          <div key={p.id} className="product-row">
            {p.photo
              ? <img className="p-photo" src={photoUrl(p.photo, 'thumb')} alt="" loading="lazy" />
              : <NoPhoto w={46} h={46} />}
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{p.name} {!p.available && <span className="badge st-cancelled">{t('closed')}</span>}</div>
              <div className="muted small">{p.category}</div>
              <div className="small" style={{ color: 'var(--brand-dark)', fontWeight: 800 }}>{fmtMoney(p.price)}</div>
            </div>
            <button className="btn ghost sm" onClick={() => setEdit(p)}>✏️</button>
            <button className="btn danger sm" onClick={() => del(p)}>🗑️</button>
          </div>
        ))}
      </div>

      <Modal open={!!edit} onClose={() => { setEdit(null); setPhoto(null); }} title={edit?.id ? t('edit') : t('add_product')}>
        {edit && (
          <>
            <div className="label mb8">🖼️ {t('main_photo')}</div>
            <div className="row mb12" style={{ gap: 14 }}>
              {photo
                ? <img className="p-photo lg" src={photo?.display} alt="" />
                : edit.photo
                  ? <img className="p-photo lg" src={photoUrl(edit.photo)} alt="" />
                  : <NoPhoto w={76} h={76} radius={15} />}
              <div className="grow col">
                <label className="btn ghost sm" style={{ display: 'inline-flex', width: 'fit-content' }}>
                  📷 {t('upload_photo')}
                  <input type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files[0]); e.target.value = ''; }} />
                </label>
                <span className="muted small">{t('photo_hint')}</span>
              </div>
            </div>

            {edit.id && (
              <div className="mb12">
                <div className="label mb8">🖼️ {t('more_photos')} ({(edit.photos || []).length})</div>
                <div className="row wrap" style={{ gap: 10 }}>
                  {(edit.photos || []).map((ph) => (
                    <div key={ph.id} style={{ position: 'relative' }}>
                      <img className="p-photo" src={photoUrl(ph.photo, 'thumb')} alt="" />
                      <button className="btn danger sm" style={{ position: 'absolute', top: -7, insetInlineEnd: -7, padding: '2px 7px', minWidth: 0 }}
                        onClick={() => delGallery(ph)}>✕</button>
                    </div>
                  ))}
                  <label className={'btn blue sm' + (galleryBusy ? ' soft' : '')} style={{ width: 48, height: 48, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, pointerEvents: galleryBusy ? 'none' : 'auto' }}>
                    {galleryBusy ? '⏳' : '＋'}
                    <input type="file" accept="image/*" multiple hidden onChange={(e) => { addGallery(e.target.files); e.target.value = ''; }} />
                  </label>
                </div>
                <span className="muted small">{t('gallery_hint')}</span>
              </div>
            )}
            <div className="row">
              <div className="field grow">
                <label className="label">{t('product_name')}</label>
                <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </div>
            </div>
            <div className="row">
              <div className="field grow">
                <label className="label">{t('category')}</label>
                <input className="input" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder="Plats, Boissons..." />
              </div>
              <div className="field" style={{ width: 130 }}>
                <label className="label">{t('price')}</label>
                <input className="input" type="number" min="0" step="0.5" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label className="label">{t('description')}</label>
              <input className="input" value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </div>
            <label className="check mb12">
              <input type="checkbox" checked={!!edit.available} onChange={(e) => setEdit({ ...edit, available: e.target.checked })} />
              {t('available')}
            </label>
            <button className="btn primary block" disabled={busy || !edit.name || edit.price === ''} onClick={save}>{t('save')}</button>
          </>
        )}
      </Modal>
    </>
  );
}

/* ---------- Livreurs de la boutique ---------- */
function Drivers() {
  const t = useT();
  const { lang } = useLang();
  const [drivers, setDrivers] = useState(null);
  const [form, setForm] = useState(null);      // {name, phone, password, email}
  const [created, setCreated] = useState(null); // {name, email}
  const [tripView, setTripView] = useState(null); // id du livreur dont on voit le trajet
  const [busy, setBusy] = useState(false);

  const refresh = () => api('/merchant/drivers').then((d) => setDrivers(d.drivers)).catch(() => {});
  usePoll(refresh, 5000);

  const create = async () => {
    setBusy(true);
    try {
      const d = await api('/merchant/drivers', { method: 'POST', body: form });
      toast(t('driver_created'));
      setForm(null);
      setCreated(d.driver);
      refresh();
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };
  const setStatus = async (d, status) => {
    try { await api(`/merchant/drivers/${d.id}/status`, { method: 'PUT', body: { status } }); refresh(); }
    catch (ex) { toast(ex.message, 'err'); }
  };
  const del = async (d) => {
    if (!window.confirm(t('driver_delete_q'))) return;
    try { await api(`/merchant/drivers/${d.id}`, { method: 'DELETE' }); toast(t('product_deleted')); refresh(); }
    catch (ex) { toast(ex.message, 'err'); }
  };

  if (!drivers) return <Spinner />;
  const withPos = drivers.filter((d) => d.lat != null && (d.online || d.active?.length)); // hors ligne → retiré de la carte (sauf course en cours)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const tv = drivers.find((d) => d.id === tripView); // position live (rafraichie toutes les 5s)

  return (
    <>
      <div className="banner ok">💡 {t('team_note')}</div>
      <div className="row spread mb12">
        <div className="h2">🛵 {t('drivers_team')} ({drivers.length})</div>
        <button className="btn primary sm" onClick={() => setForm({ name: '', phone: '', password: '', email: '' })}>＋ {t('add_driver')}</button>
      </div>

      {withPos.length > 0 && (
        <div className="card mb12">
          <div className="row spread wrap mb8">
            <div className="h2">📍 {t('live_positions')} ({withPos.length})</div>
            <div className="row" style={{ gap: 6 }}>
              <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>🔴 → 🏪 {t('tour_pickup')}</span>
              <span className="badge" style={{ background: '#d1fae5', color: '#065f46' }}>🟢 → 🏠 {t('tour_deliver')}</span>
            </div>
          </div>
          <DriversMap drivers={withPos} />
        </div>
      )}

      {drivers.length === 0 ? (
        <Empty e="🛵" text={t('no_drivers')} />
      ) : (
        drivers.map((d) => (
          <div key={d.id} className="card row wrap mb12">
            <div className="avatar" style={{ width: 42, height: 42, fontSize: 17, background: d.online ? 'linear-gradient(135deg,#0e9f6e,#0ea5e9)' : '#94a3b8' }}>🛵</div>
            <div className="grow">
              <div style={{ fontWeight: 800 }}>
                {d.name}{' '}
                {d.general && <span className="badge pay-b">🌍 {t('gdriver_badge')}</span>}{' '}
                <span className={'badge ' + (d.online ? 'b-active' : '')}>{d.online ? '🟢 ' + t('online') : '⚪ ' + t('offline')}</span>{' '}
                {!d.general && <span className={'badge ' + (d.status === 'active' ? 'b-active' : 'b-suspended')}>{d.status === 'active' ? t('active') : t('suspended')}</span>}{' '}
                {d.active?.length > 0 && (
                  <span className="badge st-assigned">🛵 {t('driver_on_trip')} · #{d.active[0].id}{d.active.length > 1 ? ` +${d.active.length - 1}` : ''}</span>
                )}
              </div>
              <div className="muted small">📞 {d.phone || '—'} · 🧾 {d.email}</div>
              <div className="muted small">
                📦 {d.deliveries} {t('deliveries_done')}
                {d.lat != null ? <> · 📍 {t('last_seen')} {fmtDate(d.pos_at, lang)}</> : <> · 📍 {t('no_pos_yet')}</>}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {d.active?.length > 0 && d.lat != null && (
                <button className="btn blue sm" onClick={() => setTripView(d.id)}>🗺️ {t('view_route')}</button>
              )}
              {!d.general && <>
                {d.status === 'active'
                  ? <button className="btn danger sm" onClick={() => setStatus(d, 'suspended')}>🚫 {t('suspend')}</button>
                  : <button className="btn soft sm" onClick={() => setStatus(d, 'active')}>🔄 {t('activate')}</button>}
                <button className="btn ghost sm" onClick={() => del(d)}>🗑️</button>
              </>}
            </div>
          </div>
        ))
      )}

      <Modal open={!!tv} onClose={() => setTripView(null)} title={'🗺️ ' + (tv?.name || '') + ' · ' + t('route')}>
        {tv?.active?.map((o) => (
          <div key={o.id} className="mb12">
            <div className="row spread wrap mb8">
              <b>#{o.id} · {o.status === 'assigned' ? '🏪 ' + t('tour_pickup') : '📦 ' + t('tour_deliver')}</b>
              <StatusBadge status={o.status} />
            </div>
            {o.client_lat != null && o.store_lat != null && tv.lat != null && (
              o.status === 'assigned' ? (
                <DualRouteMap
                  driverPos={{ lat: tv.lat, lng: tv.lng }}
                  storePos={{ lat: o.store_lat, lng: o.store_lng }}
                  clientPos={{ lat: o.client_lat, lng: o.client_lng }}
                />
              ) : (
                <RouteMap from={{ lat: tv.lat, lng: tv.lng }} to={{ lat: o.client_lat, lng: o.client_lng }} fromEmoji="🛵" toEmoji="🏠" />
              )
            )}
            <div className="mt8" style={{ background: '#f8fafc', borderRadius: 12, padding: 10 }}>
              <div className="small">👤 {o.client_name} · 🏠 {o.address}</div>
            </div>
          </div>
        ))}
      </Modal>

      <Modal open={!!form} onClose={() => setForm(null)} title={'➕ ' + t('add_driver')}>
        {form && (
          <>
            <div className="field">
              <label className="label">{t('name')}</label>
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ali Hassan" />
            </div>
            <div className="field">
              <label className="label">{t('phone')}</label>
              <input className="input" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+20 1xx xxx xxxx" />
            </div>
            <div className="row">
              <div className="field grow">
                <label className="label">{t('password')}</label>
                <input className="input" type="text" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="min 5" />
              </div>
              <div className="field grow">
                <label className="label">{t('email')} (optionnel)</label>
                <input className="input" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="auto" />
              </div>
            </div>
            <button className="btn primary block" disabled={busy || !form.name || form.password.length < 5} onClick={create}>{t('save')}</button>
          </>
        )}
      </Modal>

      <Modal open={!!created} onClose={() => setCreated(null)} title={'✅ ' + t('driver_created')}>
        {created && (
          <>
            <div className="banner ok">🛵 <b>{created.name}</b></div>
            <div className="field">
              <label className="label">{t('login_note')}</label>
              <input className="input" dir="ltr" readOnly value={created.email} onFocus={(e) => e.target.select()} />
            </div>
            <p className="muted small">Le livreur se connecte avec cet identifiant et son mot de passe, depuis l'écran de connexion 🚀</p>
          </>
        )}
      </Modal>
    </>
  );
}

/* ---------- Store settings ---------- */
function StoreSettings() {
  const t = useT();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  usePoll(() => {
    api('/merchant/store').then((d) => {
      setData(d);
      if (!form) setForm({ ...d.store });
    }).catch(() => {});
  }, 10000);
  if (!data || !form) return <Spinner />;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await api('/merchant/store', { method: 'PUT', body: form });
      toast(t('store_saved'));
      refreshNow();
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };
  const refreshNow = () => api('/merchant/store').then((d) => { setData(d); setForm({ ...d.store }); }).catch(() => {});
  const uploadStorePhoto = async (file) => {
    if (!file) return;
    const r = await processImage(file);
    if (r.error) return toast(r.error === 'too_big' ? t('img_err_big') : t('img_err_format'), 'err');
    setPhotoBusy(true);
    try { await api('/merchant/store/photo', { method: 'PUT', body: { thumb: r.thumb, display: r.display } }); toast(t('data_saved')); refreshNow(); }
    catch (ex) { toast(ex.message, 'err'); }
    setPhotoBusy(false);
  };
  const removeStorePhoto = async () => {
    setPhotoBusy(true);
    try { await api('/merchant/store/photo', { method: 'PUT', body: { remove: true } }); toast(t('photo_removed')); refreshNow(); }
    catch (ex) { toast(ex.message, 'err'); }
    setPhotoBusy(false);
  };

  return (
    <>
      <StatusBanner store={data.store} />
      <div className="card mb12">
        <div className="label mb8">🖼️ {t('store_photo_lbl')}</div>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          {data.store.photo
            ? <img src={photoUrl(data.store.photo, 'thumb')} alt="" style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'cover', border: '2px solid var(--line)' }} />
            : <div className="store-emoji" style={{ width: 72, height: 72, fontSize: 38, background: form.color || '#0e9f6e' }}>{form.emoji || '🏪'}</div>}
          <div className="grow">
            <label className="btn ghost sm" style={{ display: 'inline-flex', width: 'fit-content' }}>
              {photoBusy ? '⏳ …' : '📷 ' + t('upload_photo')}
              <input type="file" accept="image/*" hidden disabled={photoBusy} onChange={(e) => { uploadStorePhoto(e.target.files[0]); e.target.value = ''; }} />
            </label>
            {data.store.photo && <button className="btn danger sm mt8" disabled={photoBusy} onClick={removeStorePhoto}>🗑️ {t('remove_photo')}</button>}
            <div className="muted small mt8">{t('store_photo_hint')}</div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="row">
          <div className="field" style={{ width: 90 }}>
            <label className="label">{t('emoji_label')}</label>
            <input className="input" value={form.emoji} onChange={(e) => set('emoji', e.target.value)} />
          </div>
          <div className="field grow">
            <label className="label">{t('store_name')}</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="label">{t('description')}</label>
          <textarea className="textarea" value={form.description || ''} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="row">
          <div className="field grow">
            <label className="label">📞 {t('phone')}</label>
            <input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="field" style={{ width: 140 }}>
            <label className="label">{t('price')} 🎨</label>
            <input className="input" type="color" value={form.color || '#0e9f6e'} onChange={(e) => set('color', e.target.value)} style={{ padding: 4, height: 44 }} />
          </div>
        </div>
        <div className="field">
          <label className="label">📍 {t('address')}</label>
          <div className="row">
            <input className="input grow" value={form.address || ''} onChange={(e) => set('address', e.target.value)} />
            <button type="button" className="btn blue sm" onClick={() => setPickOpen(true)}>🗺️</button>
          </div>
          {form.lat != null && (
            <span className="muted small">✓ {t('store_position')} : {Number(form.lat).toFixed(4)}, {Number(form.lng).toFixed(4)}</span>
          )}
        </div>
        <div className="row">
          <div className="field grow">
            <label className="label">🛵 {t('fee_lbl')}</label>
            <input className="input" type="number" min="0" step="0.5" value={form.delivery_fee} onChange={(e) => set('delivery_fee', e.target.value)} />
          </div>
          <div className="field grow">
            <label className="label">🧾 {t('min_lbl')}</label>
            <input className="input" type="number" min="0" step="1" value={form.min_order} onChange={(e) => set('min_order', e.target.value)} />
          </div>
        </div>
        <label className="check mb12">
          <input type="checkbox" checked={!!form.is_open} onChange={(e) => set('is_open', e.target.checked)} />
          {t('open_toggle')}
        </label>
        <button className="btn primary block" disabled={busy} onClick={save}>{t('save')}</button>
      </div>

      <Modal open={pickOpen} onClose={() => setPickOpen(false)} title={'🗺️ ' + t('choose_on_map')}>
        {pickOpen && form && (
          <PickMap
            initial={{ lat: form.lat ?? 31.2001, lng: form.lng ?? 29.9187 }}
            onConfirm={async ({ lat, lng, address }) => {
              set('lat', lat);
              set('lng', lng);
              if (address) set('address', address.split(',').slice(0, 3).join(', '));
              toast(t('address_updated'));
              setPickOpen(false);
            }}
          />
        )}
      </Modal>
    </>
  );
}
