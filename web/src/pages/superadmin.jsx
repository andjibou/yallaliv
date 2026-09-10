import React, { useEffect, useState } from 'react';
import { api, apiText, downloadCsv, useT, useLang, useAuth, usePoll, fmtMoney, fmtDate, toast } from '../lib.jsx';
import { Empty, Spinner, LangSwitch, StatusBadge, PayBadge, Modal, ErrorBoundary } from '../ui.jsx';
import AccountSettings from '../AccountSettings.jsx';
import { BarsChart, compactMoney } from '../Chart.jsx';

export default function AdminApp() {
  const t = useT();
  const [acct, setAcct] = useState(false);
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('dash');
  const [pendStores, setPendStores] = useState(0);
  usePoll(() => api('/admin/stores').then((d) => setPendStores(d.stores.filter((s) => s.status === 'pending').length)).catch(() => {}), 8000);
  const tabs = [
    { id: 'dash', label: '📊 ' + t('sa_dashboard') },
    { id: 'users', label: '👥 ' + t('sa_users') },
    { id: 'stores', label: '🏪 ' + t('sa_stores') + (pendStores ? ` 🔴${pendStores}` : '') },
    { id: 'orders', label: '🧾 ' + t('sa_orders') },
    { id: 'gdrivers', label: '🛵 ' + t('general_drivers') },
    { id: 'promos', label: '🎁 ' + t('promos') },
    { id: 'settings', label: '⚙️ ' + t('sa_settings') }
  ];
  return (
    <div className="shell">
      <div className="topbar">
        <div className="logo">👑</div>
        <div className="grow">
          <div className="brand-name" style={{ fontSize: 18 }}>Super Admin · Yalla<span className="accent">Liv</span></div>
          <div className="muted small ellipsis">{user?.name}</div>
        </div>
        <LangSwitch />
        <button className="icon-btn" onClick={() => setAcct(true)} title={t('account_settings')}>👤</button>
        <button className="icon-btn" onClick={logout} title={t('logout')}>🚪</button>
      </div>
      {pendStores > 0 && (
        <div className="banner warn" style={{ cursor: 'pointer' }} onClick={() => setTab('stores')} role="button">
          🔔 <b>{pendStores}</b> {t('pending_stores')} → <u>{t('review_now')}</u>
        </div>
      )}
      <div className="tabs">
        {tabs.map((x) => (
          <button key={x.id} className={'tab' + (tab === x.id ? ' on' : '')} onClick={() => setTab(x.id)}>{x.label}</button>
        ))}
      </div>
      {acct && (
        <Modal open onClose={() => setAcct(false)} title={'👤 ' + t('account_settings')}>
          <AccountSettings />
        </Modal>
      )}
      <ErrorBoundary key={tab}>
        {tab === 'dash' && <Dash />}
        {tab === 'users' && <Users />}
        {tab === 'stores' && <Stores />}
        {tab === 'orders' && <Orders />}
        {tab === 'gdrivers' && <GeneralDrivers />}
        {tab === 'promos' && <Promos />}
        {tab === 'settings' && <Settings />}
      </ErrorBoundary>
    </div>
  );
}

/* ---------- Dashboard ---------- */
function Dash() {
  const t = useT();
  const { lang } = useLang();
  const [s, setS] = useState(null);
  const [series, setSeries] = useState(null);
  usePoll(() => api('/admin/stats').then(setS).catch(() => {}), 8000);
  useEffect(() => {
    api('/admin/sales-daily').then((d) => setSeries(d.series)).catch(() => setSeries([]));
  }, []);
  if (!s) return <Spinner />;
  return (
    <>
      {series && series.length > 0 && (
        <div className="card mb16">
          <div className="h2 mb8">💰 {t('gmv14')}</div>
          <BarsChart data={series.map((x) => ({ label: x.label, value: x.revenue }))} fmt={compactMoney} />
          <div className="h2 mb8 mt16">🏦 {t('commission14')}</div>
          <BarsChart data={series.map((x) => ({ label: x.label, value: x.commission }))} color="#8b5cf6" fmt={compactMoney} />
        </div>
      )}
      <div className="stat-grid">
        <div className="stat hl"><div className="v" style={{ fontSize: 18 }}>{fmtMoney(s.gmv)}</div><div className="k">💰 {t('gmv')}</div></div>
        <div className="stat hl" style={{ background: 'linear-gradient(135deg,#6d28d9,#8b5cf6)' }}><div className="v" style={{ fontSize: 18 }}>{fmtMoney(s.commission)}</div><div className="k">🏦 {t('commissions')}</div></div>
        <div className="stat"><div className="v">{s.orders_total}</div><div className="k">🧾 {t('total_orders')}</div></div>
        <div className="stat"><div className="v">{s.orders_today}</div><div className="k">📅 {t('orders_today_c')}</div></div>
        <div className="stat"><div className="v">{s.users_total}</div><div className="k">👥 {t('total_users')}</div></div>
        <div className="stat"><div className="v">{s.usersByRole.merchant || 0}</div><div className="k">🏪 {t('total_stores')}</div></div>
        <div className="stat"><div className="v">{(s.usersByRole.driver || 0)}</div><div className="k">🛵 {t('total_drivers')}</div></div>
        <div className="stat"><div className="v" style={{ fontSize: 18 }}>{fmtMoney(s.driver_payouts)}</div><div className="k">🛵 {t('payouts')}</div></div>
      </div>
      <div className="row wrap mb16" style={{ gap: 6 }}>
        {Object.entries(s.ordersByStatus).map(([k, v]) => <span key={k}><StatusBadge status={k} /> <b>{v}</b>&nbsp;&nbsp;</span>)}
      </div>
      <div className="sec-title">🕒 {t('recent_orders')}</div>
      <div className="card">
        {s.recent_orders.length === 0 && <Empty text={t('no_data')} />}
        {s.recent_orders.map((o) => (
          <div key={o.id} className="row spread" style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div className="small grow">
              <b>#{o.id}</b> {o.store_emoji} {o.store_name} → 👤 {o.client_name}
              <span className="muted"> · {fmtDate(o.created_at, lang)}</span>
            </div>
            <StatusBadge status={o.status} />
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- Users ---------- */
const ROLE_BADGE = { client: '🛍️', merchant: '🏪', driver: '🛵', superadmin: '👑' };
function Users() {
  const t = useT();
  const { lang } = useLang();
  const [users, setUsers] = useState(null);
  const [role, setRole] = useState('all');
  usePoll(() => api('/admin/users?role=' + role).then((d) => setUsers(d.users)).catch(() => {}), 8000);

  const setStatus = async (u, status) => {
    try {
      await api(`/admin/users/${u.id}/status`, { method: 'POST', body: { status } });
      toast(t('user_updated'));
      api('/admin/users?role=' + role).then((d) => setUsers(d.users)).catch(() => {});
    } catch (ex) { toast(ex.message, 'err'); }
  };

  if (!users) return <Spinner />;
  const chips = ['all', 'client', 'merchant', 'driver', 'superadmin'].map((r) => (
    <button key={r} className={'chip' + (role === r ? ' on' : '')} onClick={() => setRole(r)}>
      {r === 'all' ? t('all') : (ROLE_BADGE[r] + ' ' + t('role_' + r))}
    </button>
  ));
  return (
    <>
      <div className="chips">{chips}</div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('name')}</th><th>{t('role')}</th><th>{t('status')}</th><th>{t('actions')}</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <b>{u.name}</b>
                  <div className="muted small">{u.email}</div>
                  <div className="muted small">{u.phone} {u.vehicle ? '· ' + u.vehicle : ''}</div>
                  {u.role === 'driver' && u.rating ? <span className="badge">⭐ {u.rating}</span> : null}
                </td>
                <td>
                  <span className="badge">{ROLE_BADGE[u.role]} {t('role_' + u.role)}</span>
                  {u.role === 'driver' && (
                    <span className={'badge ' + (u.store_id ? 'st-assigned' : 'b-active')} style={{ marginInlineStart: 4 }}>
                      {u.store_id ? '🏪 ' + (u.store_name || t('store_driver_badge')) : '🌍 ' + t('gdriver_badge')}
                    </span>
                  )}
                </td>
                <td><span className={'badge b-' + u.status}>{t(u.status === 'active' ? 'active' : u.status === 'pending' ? 'pending' : 'suspended')}</span></td>
                <td>
                  {u.role !== 'superadmin' && (
                    <div className="row" style={{ gap: 6 }}>
                      {u.status === 'pending' && <button className="btn primary sm" onClick={() => setStatus(u, 'active')}>✅ {t('approve')}</button>}
                      {u.status === 'active' && <button className="btn danger sm" onClick={() => setStatus(u, 'suspended')}>🚫 {t('suspend')}</button>}
                      {u.status === 'suspended' && <button className="btn soft sm" onClick={() => setStatus(u, 'active')}>🔄 {t('activate')}</button>}
                      <button className="btn blue sm" title={t('set_password')} onClick={async () => {
                        const np = window.prompt(t('set_password_q') + ' — ' + u.name);
                        if (!np) return;
                        try { await api(`/admin/users/${u.id}/password`, { method: 'POST', body: { password: np } }); toast(t('pass_reset_ok')); }
                        catch (ex) { toast(ex.message, 'err'); }
                      }}>🔑</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- Stores ---------- */
function Stores() {
  const t = useT();
  const { lang } = useLang();
  const [stores, setStores] = useState(null);
  const [detail, setDetail] = useState(null); // fiche complete du magasin
  usePoll(() => api('/admin/stores').then((d) => setStores(d.stores)).catch(() => {}), 8000);

  const openDetail = async (s) => {
    setDetail({ loading: true, id: s.id });
    try { setDetail(await api(`/admin/stores/${s.id}/details`)); }
    catch (ex) { toast(ex.message, 'err'); setDetail(null); }
  };

  const setStatus = async (s, status) => {
    try {
      await api(`/admin/stores/${s.id}/status`, { method: 'POST', body: { status } });
      toast(t('store_updated'));
      api('/admin/stores').then((d) => setStores(d.stores)).catch(() => {});
    } catch (ex) { toast(ex.message, 'err'); }
  };
  const reject = async (s) => {
    if (!window.confirm(t('reject_store_q') + ' « ' + s.name + ' » ?')) return;
    try {
      const r = await api(`/admin/stores/${s.id}/reject`, { method: 'POST' });
      toast(r.mode === 'deleted' ? t('store_rejected') : t('store_suspended'));
      api('/admin/stores').then((d) => setStores(d.stores)).catch(() => {});
    } catch (ex) { toast(ex.message, 'err'); }
  };

  if (!stores) return <Spinner />;
  return (
    <div className="col">
      {stores.map((s) => (
        <div key={s.id} className="card row wrap" role="button" style={{ cursor: 'pointer', ...(s.status === 'pending' ? { border: '2px solid #f59e0b', background: 'linear-gradient(0deg,#fffbeb,#fffbeb)' } : {}) }}
          onClick={() => openDetail(s)}>
          <div className="store-emoji" style={{ background: s.color || '#0e9f6e', width: 48, height: 48, fontSize: 25 }}>{s.emoji}</div>
          <div className="grow">
            <div style={{ fontWeight: 800 }}>{s.name} <span className={'badge b-' + s.status}>{t(s.status === 'approved' ? 'active' : s.status === 'pending' ? 'pending' : 'suspended')}</span></div>
            <div className="muted small">{t('type_' + s.type)} · 👤 {s.owner_name} ({s.owner_email})</div>
            <div className="muted small">📦 {s.product_count} {t('products_count')} · 🛵 {fmtMoney(s.delivery_fee)} · ⭐ {Number(s.rating).toFixed(1)}</div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {s.status === 'pending' && <>
              <button className="btn primary sm" onClick={(e) => { e.stopPropagation(); setStatus(s, 'approved'); }}>✅ {t('approve')}</button>
              <button className="btn danger sm" onClick={(e) => { e.stopPropagation(); reject(s); }}>❌ {t('reject')}</button>
            </>}
            {s.status === 'approved' && <button className="btn danger sm" onClick={(e) => { e.stopPropagation(); setStatus(s, 'suspended'); }}>🚫 {t('suspend')}</button>}
            {s.status === 'suspended' && <button className="btn soft sm" onClick={(e) => { e.stopPropagation(); setStatus(s, 'approved'); }}>🔄 {t('activate')}</button>}
            <button className="btn blue sm" onClick={(e) => { e.stopPropagation(); openDetail(s); }}>ℹ️</button>
          </div>
        </div>
      ))}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={'🏪 ' + (detail?.store?.name || '')}>
        {detail?.loading ? <Spinner /> : detail?.store ? (
          <>
            <div className="row" style={{ gap: 12, alignItems: 'center' }}>
              <div className="store-emoji" style={{ background: detail.store.color || '#0e9f6e', width: 58, height: 58, fontSize: 30 }}>{detail.store.emoji}</div>
              <div className="grow">
                <div className="h2">{detail.store.name}</div>
                <div className="row wrap mt4" style={{ gap: 5 }}>
                  <span className={'badge b-' + detail.store.status}>{t(detail.store.status === 'approved' ? 'active' : detail.store.status === 'pending' ? 'pending' : 'suspended')}</span>
                  <span className="badge">{t('type_' + detail.store.type)}</span>
                  <span className={'badge ' + (detail.store.is_open ? 'b-active' : 'st-cancelled')}>{detail.store.is_open ? '🟢 ' + t('open') : '🔴 ' + t('closed')}</span>
                </div>
              </div>
            </div>
            {detail.store.description && <p className="muted mt8" style={{ fontSize: 14 }}>{detail.store.description}</p>}

            <div className="stat-grid mt8">
              <div className="stat hl"><div className="v">{fmtMoney(detail.stats.revenue)}</div><div className="k">💰 {t('revenue_lbl')}</div></div>
              <div className="stat hl"><div className="v">{fmtMoney(detail.stats.commission_earned)}</div><div className="k">🏦 {t('commission_earned')}</div></div>
              <div className="stat"><div className="v">{detail.stats.orders_total}</div><div className="k">🧾 {t('orders_total')}</div></div>
              <div className="stat"><div className="v">{detail.stats.orders_delivered}</div><div className="k">✅ {t('orders_delivered')}</div></div>
              <div className="stat"><div className="v">{detail.stats.orders_active}</div><div className="k">🛵 {t('tab_active')}</div></div>
              <div className="stat"><div className="v">⭐ {Number(detail.store.rating).toFixed(1)}</div><div className="k">{t('driver_note')}</div></div>
            </div>

            <div className="label mt12">👤 {t('owner_info')}</div>
            <div className="mt4" style={{ background: '#f8fafc', borderRadius: 12, padding: 10 }}>
              <div className="small">👤 <b>{detail.owner?.name}</b> · <span className={'badge ' + (detail.owner?.status === 'active' ? 'b-active' : 'b-suspended')}>{detail.owner?.status === 'active' ? t('active') : t('suspended')}</span></div>
              <div className="small mt4">📧 {detail.owner?.email} · 📞 {detail.owner?.phone || '—'}</div>
              <div className="small mt4 muted">🗓️ {t('joined')} {fmtDate(detail.owner?.created_at, lang)}</div>
            </div>

            <div className="label mt12">ℹ️ {t('store_details_info')}</div>
            <div className="mt4" style={{ background: '#f8fafc', borderRadius: 12, padding: 10 }}>
              <div className="small">📞 {detail.store.phone || '—'} · 🛵 {t('delivery_fee')} {fmtMoney(detail.store.delivery_fee)}</div>
              <div className="small mt4">📍 {detail.store.address || '—'}</div>
              <div className="small mt4">🗺️ {t('store_position')} : {detail.store.lat != null ? `${Number(detail.store.lat).toFixed(4)}, ${Number(detail.store.lng).toFixed(4)} · ` : '— '}
                {detail.store.lat != null && <a href={`https://www.openstreetmap.org/?mlat=${detail.store.lat}&mlon=${detail.store.lng}#map=17/${detail.store.lat}/${detail.store.lng}`} target="_blank" rel="noreferrer">{t('open_in_osm')} ↗</a>}
              </div>
              <div className="small mt4">🧾 {t('min_lbl')} {fmtMoney(detail.store.min_order)} · 📦 {detail.products.length} {t('products_count')}</div>
            </div>

            <div className="label mt12">🛵 {t('drivers_team')} ({detail.drivers.length})</div>
            <div className="mt4" style={{ background: '#f8fafc', borderRadius: 12, padding: 10 }}>
              {detail.drivers.length === 0 ? <div className="muted small">—</div> : detail.drivers.map((d) => (
                <div key={d.id} className="row spread" style={{ padding: '5px 0', borderBottom: '1px dashed #e2e8f0' }}>
                  <div className="small">🛵 {d.name} · 📞 {d.phone || '—'}</div>
                  <div className="small muted">{d.online ? '🟢' : '⚪'} · 📦 {d.deliveries}</div>
                </div>
              ))}
            </div>

            <div className="label mt12">🛍️ {t('products_list')} ({detail.products.length})</div>
            <div className="mt4" style={{ background: '#f8fafc', borderRadius: 12, padding: 10, maxHeight: 210, overflow: 'auto' }}>
              {detail.products.length === 0 ? <div className="muted small">—</div> : detail.products.map((pr) => (
                <div key={pr.id} className="row spread" style={{ padding: '5px 0', borderBottom: '1px dashed #e2e8f0' }}>
                  <div className="small">{pr.photo ? '🖼️' : (pr.emoji || '📦')} {pr.name} <span className="muted">· {pr.category}</span></div>
                  <div className="small" style={{ fontWeight: 700, color: 'var(--brand-dark)' }}>{fmtMoney(pr.price)} {!pr.available && <span className="badge st-cancelled">{t('closed')}</span>}</div>
                </div>
              ))}
            </div>

            <div className="label mt12">🧾 {t('last_orders')}</div>
            <div className="mt4" style={{ background: '#f8fafc', borderRadius: 12, padding: 10 }}>
              {detail.orders.length === 0 ? <div className="muted small">—</div> : detail.orders.map((o) => (
                <div key={o.id} className="row spread" style={{ padding: '5px 0', borderBottom: '1px dashed #e2e8f0' }}>
                  <div className="small">#{o.id} · {o.client_name}</div>
                  <div className="row" style={{ gap: 6 }}><StatusBadge status={o.status} /> <b className="small">{fmtMoney(o.total)}</b></div>
                </div>
              ))}
            </div>

            {detail.store.status === 'pending' && (
              <div className="row mt12" style={{ gap: 8 }}>
                <button className="btn primary grow" onClick={() => { setStatus(detail.store, 'approved'); openDetail(detail.store); }}>✅ {t('approve')}</button>
                <button className="btn danger grow" onClick={() => { reject(detail.store); setDetail(null); }}>❌ {t('reject')}</button>
              </div>
            )}
          </>
        ) : null}
      </Modal>
    </div>
  );
}

/* ---------- Orders ---------- */
function Orders() {
  const t = useT();
  const { lang } = useLang();
  const [orders, setOrders] = useState(null);
  usePoll(() => api('/admin/orders').then((d) => setOrders(d.orders)).catch(() => {}), 8000);
  const exportCsv = async () => {
    try { downloadCsv('ventes_plateforme.csv', await apiText('/admin/export')); } catch (e) { toast(e.message, 'err'); }
  };
  if (!orders) return <Spinner />;
  if (!orders.length) return <Empty text={t('no_data')} />;
  return (
    <>
      <div className="row spread mb12">
        <div className="h2">🧾 {t('sa_orders')} ({orders.length})</div>
        <button className="btn ghost sm" onClick={exportCsv}>⬇️ {t('export_csv')}</button>
      </div>
      <div className="table-wrap">
      <table className="tbl">
        <thead><tr><th>#</th><th>{t('store')}</th><th>{t('client')}</th><th>{t('driver')}</th><th>{t('total')}</th><th>{t('payment')}</th><th>{t('status')}</th><th>{t('date')}</th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td><b>#{o.id}</b></td>
              <td>{o.store_emoji} {o.store_name}</td>
              <td>{o.client_name}<div className="muted small">{o.address}</div></td>
              <td>{o.driver_name || '—'}</td>
              <td><b>{fmtMoney(o.total)}</b><div className="muted small">{t('commissions')}: {fmtMoney(o.commission)}</div></td>
              <td><PayBadge o={o} /></td>
              <td><StatusBadge status={o.status} /></td>
              <td className="muted small">{fmtDate(o.created_at, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

/* ---------- Livreurs generaux (Super Admin uniquement) ---------- */
function GeneralDrivers() {
  const t = useT();
  const { lang } = useLang();
  const [drivers, setDrivers] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => api('/admin/drivers').then((d) => setDrivers(Array.isArray(d?.drivers) ? d.drivers : [])).catch(() => {});
  usePoll(refresh, 8000);

  const create = async () => {
    setBusy(true);
    try {
      await api('/admin/drivers', { method: 'POST', body: form });
      toast(t('gdriver_created'));
      setForm(null);
      refresh();
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };
  const setStatus = async (d, status) => {
    try { await api(`/admin/drivers/${d.id}/status`, { method: 'PUT', body: { status } }); refresh(); } catch (ex) { toast(ex.message, 'err'); }
  };
  const del = async (d) => {
    if (!window.confirm(t('driver_delete_q'))) return;
    try { await api(`/admin/drivers/${d.id}`, { method: 'DELETE' }); refresh(); } catch (ex) { toast(ex.message, 'err'); }
  };

  if (!drivers) return <Spinner />;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <>
      <div className="row spread mb12">
        <div className="h2">🌍 {t('general_drivers')} ({drivers.length})</div>
        <button className="btn primary sm" onClick={() => setForm({ name: '', email: '', phone: '', vehicle: 'Moto', password: '' })}>＋ {t('create_gdriver')}</button>
      </div>
      <div className="banner ok mb12">💡 {t('gdriver_note')}</div>
      {drivers.length === 0 && <Empty e="🛵" text={t('no_data')} />}
      {drivers.map((d) => (
        <div key={d.id} className="card row wrap mb12">
          <div className="avatar" style={{ width: 42, height: 42, fontSize: 17, background: d.online ? 'linear-gradient(135deg,#0e9f6e,#0ea5e9)' : '#94a3b8' }}>🛵</div>
          <div className="grow">
            <div style={{ fontWeight: 800 }}>
              {d.name}{' '}
              <span className={'badge ' + (d.online ? 'b-active' : '')}>{d.online ? '🟢 ' + t('online') : '⚪ ' + t('offline')}</span>{' '}
              <span className={'badge ' + (d.status === 'active' ? 'b-active' : 'b-suspended')}>{d.status === 'active' ? t('active') : t('suspended')}</span>
            </div>
            <div className="muted small">📧 {d.email} · 📞 {d.phone || '—'} · 🏍️ {d.vehicle || '—'}</div>
            <div className="muted small">
              📦 {d.deliveries} {t('deliveries_done')}
              {d.rating ? <> · ⭐ {d.rating}</> : null}
              {d.lat != null && d.pos_at ? <> · 📍 {fmtDate(d.pos_at, lang)}</> : <> · 📍 {t('no_pos_yet')}</>}
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {d.status === 'active'
              ? <button className="btn danger sm" onClick={() => setStatus(d, 'suspended')}>🚫 {t('suspend')}</button>
              : <button className="btn soft sm" onClick={() => setStatus(d, 'active')}>🔄 {t('activate')}</button>}
            <button className="btn ghost sm" onClick={() => del(d)}>🗑️</button>
          </div>
        </div>
      ))}

      <Modal open={!!form} onClose={() => setForm(null)} title={'➕ ' + t('create_gdriver')}>
        {form && (
          <>
            <div className="field">
              <label className="label">{t('name')}</label>
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="field">
              <label className="label">{t('email')}</label>
              <input className="input" type="email" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="livreur@email.com" />
            </div>
            <div className="row">
              <div className="field grow">
                <label className="label">{t('phone')}</label>
                <input className="input" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <div className="field grow">
                <label className="label">{t('vehicle')}</label>
                <select className="select" value={form.vehicle} onChange={(e) => set('vehicle', e.target.value)}>
                  <option value="Moto">🏍️</option><option value="Vélo">🚲</option><option value="Voiture">🚗</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label className="label">{t('password')}</label>
              <input className="input" type="text" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="min 5" />
            </div>
            <button className="btn primary block" disabled={busy || !form.name || !form.email || form.password.length < 5} onClick={create}>{t('save')}</button>
          </>
        )}
      </Modal>
    </>
  );
}

/* ---------- Promos ---------- */
function Promos() {
  const t = useT();
  const [promos, setPromos] = useState(null);
  const [form, setForm] = useState({ code: '', type: 'percent', value: '', min_order: '0', max_uses: '0' });
  const [busy, setBusy] = useState(false);
  usePoll(() => api('/admin/promos').then((d) => setPromos(d.promos)).catch(() => {}), 10000);

  const refresh = () => api('/admin/promos').then((d) => setPromos(d.promos)).catch(() => {});

  const create = async () => {
    setBusy(true);
    try {
      await api('/admin/promos', { method: 'POST', body: { ...form, value: parseFloat(form.value), min_order: parseFloat(form.min_order), max_uses: parseInt(form.max_uses) } });
      toast(t('saved'));
      setForm({ code: '', type: 'percent', value: '', min_order: '0', max_uses: '0' });
      refresh();
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };
  const toggle = async (p) => {
    try { await api('/admin/promos/' + p.id, { method: 'PUT', body: { active: !p.active } }); refresh(); } catch (ex) { toast(ex.message, 'err'); }
  };
  const del = async (p) => {
    try { await api('/admin/promos/' + p.id, { method: 'DELETE' }); refresh(); } catch (ex) { toast(ex.message, 'err'); }
  };

  if (!promos) return <Spinner />;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <>
      <div className="card mb16">
        <div className="h2 mb12">➕ {t('new_promo')}</div>
        <div className="row">
          <div className="field grow">
            <label className="label">{t('promo_title')}</label>
            <input className="input" style={{ textTransform: 'uppercase' }} value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="ETE25" />
          </div>
          <div className="field" style={{ width: 150 }}>
            <label className="label">{t('store_type')}</label>
            <select className="select" value={form.type} onChange={(e) => set('type', e.target.value)}>
              <option value="percent">%</option>
              <option value="fixed">{t('currency_lbl')}</option>
            </select>
          </div>
          <div className="field" style={{ width: 110 }}>
            <label className="label">{t('price')}</label>
            <input className="input" type="number" min="0" value={form.value} onChange={(e) => set('value', e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div className="field grow">
            <label className="label">{t('promo_min')}</label>
            <input className="input" type="number" min="0" value={form.min_order} onChange={(e) => set('min_order', e.target.value)} />
          </div>
          <div className="field grow">
            <label className="label">{t('promo_max')}</label>
            <input className="input" type="number" min="0" value={form.max_uses} onChange={(e) => set('max_uses', e.target.value)} />
          </div>
        </div>
        <button className="btn primary block" disabled={busy || !form.code || !form.value} onClick={create}>{t('save')}</button>
      </div>

      {promos.map((p) => (
        <div key={p.id} className="card row wrap mb12">
          <span className="promo-chip">{p.code}</span>
          <div className="grow">
            <div style={{ fontWeight: 800 }}>
              {p.type === 'percent' ? `−${p.value}%` : `−${fmtMoney(p.value)}`}
              {p.min_order > 0 && <span className="muted small"> · min {fmtMoney(p.min_order)}</span>}
            </div>
            <div className="muted small">{p.used_count}{p.max_uses > 0 ? '/' + p.max_uses : ''} {t('uses')}</div>
          </div>
          <span className={'badge ' + (p.active ? 'b-active' : 'b-suspended')}>{p.active ? '✓' : '✕'}</span>
          <button className={'btn sm ' + (p.active ? 'danger' : 'primary')} onClick={() => toggle(p)}>{p.active ? t('suspend') : t('activate')}</button>
          <button className="btn ghost sm" onClick={() => del(p)}>🗑️</button>
        </div>
      ))}
    </>
  );
}

/* ---------- Settings ---------- */
function Settings() {
  const t = useT();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resets, setResets] = useState([]);
  usePoll(() => api('/admin/settings').then((s) => setForm(f => f || s)).catch(() => {}), 15000);
  usePoll(() => api('/admin/resets').then((d) => setResets(d.resets)).catch(() => {}), 8000);
  if (!form) return <Spinner />;
  const set = (k, v) => setForm({ ...form, [k]: v });
  const save = async () => {
    setBusy(true);
    try { await api('/admin/settings', { method: 'PUT', body: form }); toast(t('settings_saved')); } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };
  return (
    <>
      {resets.length > 0 && (
        <div className="card mb12" style={{ border: '2px solid #f59e0b' }}>
          <div className="h2 mb8">🔑 {t('reset_requests')} ({resets.length})</div>
          {resets.map((r) => (
            <div key={r.id} className="row spread" style={{ padding: '7px 0', borderBottom: '1px dashed #e2e8f0' }}>
              <div className="small">📧 <b dir="ltr">{r.email}</b></div>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span className="badge" style={{ fontSize: 15, letterSpacing: 2, cursor: 'pointer' }} title={t('copy_code')}
                  onClick={() => { navigator.clipboard?.writeText(r.code); toast(t('copied')); }}>🔢 {r.code}</span>
                <span className="muted small">⏳ {Math.max(1, Math.round((r.expires_at - Date.now()) / 60000))} min</span>
              </div>
            </div>
          ))}
          <div className="muted small mt8">💡 {t('reset_requests_note')}</div>
        </div>
      )}
    <div className="card">
      <div className="field">
        <label className="label">🚀 {t('app_name_lbl')}</label>
        <input className="input" value={form.app_name} onChange={(e) => set('app_name', e.target.value)} />
      </div>
      <div className="row">
        <div className="field grow">
          <label className="label">💱 {t('currency_lbl')}</label>
          <select className="select" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
            {['EGP', 'EUR', 'USD', 'MAD', 'DZD', 'TND', 'XOF', 'SAR', 'AED'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field" style={{ width: 160 }}>
          <label className="label">🏦 {t('commission_lbl')}</label>
          <input className="input" type="number" min="0" max="50" step="0.5" value={form.commission_rate} onChange={(e) => set('commission_rate', e.target.value)} />
        </div>
      </div>
      <button className="btn primary block" disabled={busy} onClick={save}>{t('save_settings')}</button>
    </div>
    </>
  );
}
