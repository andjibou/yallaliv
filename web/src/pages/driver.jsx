import React, { useEffect, useRef, useState } from 'react';
import { api, useT, useLang, useAuth, usePoll, fmtMoney, fmtDate, toast, notif, beep, pushSubscribe } from '../lib.jsx';
import { Empty, Spinner, LangSwitch, StatusBadge, PayBadge, Modal } from '../ui.jsx';
import ChatModal, { LastMsgLine } from '../Chat.jsx';
import RouteMap, { DualRouteMap, TourMap, buildTour } from '../RouteMap.jsx';
import AccountSettings from '../AccountSettings.jsx';

export default function DriverApp() {
  const t = useT();
  const [acct, setAcct] = useState(false);
  const { user, logout } = useAuth();
  const [online, setOnline] = useState(!!user.online);
  const [tab, setTab] = useState(user.store_id == null ? 'mine' : 'available');
  const [avail, setAvail] = useState(null);
  const [mine, setMine] = useState(null);
  const [stats, setStats] = useState(null);
  const [chat, setChat] = useState(null);
  const [routeView, setRouteView] = useState(null);
  const [alarm, setAlarm] = useState(null);
  const [pos, setPos] = useState(null);
  const alarmTick = useRef(null);
  const alarmId = useRef(null);
  const lastPos = useRef(null);
  const seenAv = useRef(null);
  const activeRef = useRef(null);

  const approved = user.status === 'active';
  const isGeneral = user.store_id == null;

  usePoll(() => {
    if (!approved) return;
    api('/driver/available').then((d) => {
      if (seenAv.current && online) {
        for (const o of d.orders) {
          if (!seenAv.current[o.id]) { notif(t('new_delivery'), `#${o.id} · ${fmtMoney(o.delivery_fee)}`); beep(); }
        }
      }
      const m = {};
      d.orders.forEach((o) => (m[o.id] = 1));
      seenAv.current = m;
      setAvail(d.orders);
    }).catch(() => {});
    api('/driver/mine').then((d) => {
      setMine(d.orders);
      if (isGeneral) {
        const un = d.orders.find((o) => o.status === 'assigned' && !o.acknowledged);
        if (un) startAlarm(un);
      }
    }).catch(() => {});
    api('/driver/stats').then(setStats).catch(() => {});
  }, 5000);

  // ---- Alarme dispatch automatique (livreur general) ----
  const stopAlarm = () => { if (alarmTick.current) { clearInterval(alarmTick.current); alarmTick.current = null; } };
  const startAlarm = (o) => {
    if (alarmId.current === o.id) return;
    alarmId.current = o.id;
    setAlarm(o);
    const ring = () => { beep(); try { navigator.vibrate?.([300, 200, 300, 200, 300]); } catch {} };
    ring();
    alarmTick.current = setInterval(ring, 2000);
    notif('🚨 ' + t('alarm_title'), `#${o.id} · ${o.store_name}`);
  };
  const ackAlarm = async () => {
    stopAlarm();
    const id = alarmId.current;
    alarmId.current = null;
    setAlarm(null);
    if (id) { try { await api(`/driver/orders/${id}/ack`, { method: 'POST' }); toast(t('ack_ok')); } catch (ex) { toast(ex.message, 'err'); } }
    api('/driver/mine').then((d) => setMine(d.orders)).catch(() => {});
  };
  useEffect(() => stopAlarm, []);

  // Livraison active (pour la simulation de trajet)
  activeRef.current = mine?.find((o) => ['assigned', 'picked_up'].includes(o.status)) || null;

  // Diffusion de la position : GPS réel si dispo, sinon trajet simulé magasin → client
  useEffect(() => {
    if (!approved || !online) return;
    let stopped = false;

    // 📱 APP NATIVE ANDROID : service GPS NATIF (YallaGps) — envoi direct Java au serveur,
    // 1 position/seconde, indépendant du navigateur : survit au verrouillage et à l'arrière-plan.
    let nativeOk = false; // vrai dès que le service natif envoie lui-même les positions
    let ygStarted = false; let ygStopped = false;
    if (YG) {
      const token = localStorage.getItem('yl_token');
      const url = window.location.origin + '/api/driver/location';
      if (token) {
        YG.start({ url, token })
          .then(() => { if (ygStopped) { try { YG.stop().catch(() => {}); } catch {} } else { ygStarted = true; nativeOk = true; } })
          .catch(async (e) => {
            if (String(e?.message || e).includes('PERMISSION')) {
              try { const r = await YG.requestPermission(); if (r?.granted) { await YG.start({ url, token }); if (!ygStopped) { ygStarted = true; nativeOk = true; } else YG.stop().catch(() => {}); } } catch {}
            }
          });
      }
    }

    // 🌐 NAVIGATEUR / PWA : boucle 1 s + reprise au déverrouillage (filet de sécurité)
    const send = () => {
      const done = (lat, lng) => {
        lastPos.current = { lat, lng };
        setPos({ lat, lng });
        if (!stopped && !nativeOk) api('/driver/location', { method: 'PUT', body: { lat, lng } }).catch(() => {});
      };
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (p) => done(p.coords.latitude, p.coords.longitude),
          () => {}, // GPS indisponible (intérieur d'un bâtiment…) : PAS de simulation —
                    // on conserve la dernière position réelle (les badges de fraîcheur gèrent l'affichage)
          { timeout: 4000, maximumAge: 1000, enableHighAccuracy: true }
        );
      }
    };
    send();
    const id = setInterval(send, 1000); // suivi à la seconde
    // Reprise immédiate : au déverrouillage du téléphone / retour sur l'app, on renvoie la position tout de suite
    const onVis = () => { if (document.visibilityState === 'visible' && !stopped) send(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopped = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis);
      ygStopped = true;
      if (ygStarted) { try { YG?.stop().catch(() => {}); } catch {} } // stoppe le service GPS natif
    };
  }, [approved, online]);

  // Écran maintenu allumé PENDANT une course (suivi GPS continu, téléphone posé sur le guidon).
  // Relâché dès que le livreur verrouille lui-même ou termine sa course. Non vital si indisponible.
  const isNative = !!window.Capacitor?.isNativePlatform?.();
  const YG = isNative ? (window.Capacitor.Plugins?.YallaGps || null) : null;
  const openAppSettings = () => { try { YG?.openSettings?.().catch(() => {}); } catch {} };
  // Tableau de bord GPS (app native) : lit le service Java toutes les 4 s
  const [gpsStatus, setGpsStatus] = useState(null);
  useEffect(() => {
    if (!YG) return;
    const read = () => YG.status?.().then(setGpsStatus).catch(() => setGpsStatus({}));
    read();
    const it = setInterval(read, 4000);
    return () => clearInterval(it);
  }, []);
  const wakeRef = useRef(null);
  const enCourse = !!activeRef.current;
  useEffect(() => {
    const grab = async () => {
      if (!online || !enCourse || document.visibilityState !== 'visible') return;
      try { wakeRef.current = await navigator.wakeLock?.request?.('screen'); } catch {}
    };
    grab();
    const onVis = () => { if (document.visibilityState === 'visible') grab(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      try { wakeRef.current?.release?.(); } catch {}
      wakeRef.current = null;
    };
  }, [online, enCourse]);

  const toggleOnline = async () => {
    const v = !online;
    setOnline(v);
    try { await api('/driver/online', { method: 'PUT', body: { online: v } }); } catch (ex) { setOnline(!v); toast(ex.message, 'err'); }
  };
  const accept = async (o) => {
    try {
      await api(`/driver/orders/${o.id}/accept`, { method: 'POST' });
      toast(t('accepted_ok'));
      setRouteView({ ...o, status: 'assigned' });   // affiche le trajet double immediatement
    } catch (ex) { toast(ex.message, 'err'); }
    api('/driver/available').then((d) => setAvail(d.orders)).catch(() => {});
    api('/driver/mine').then((d) => setMine(d.orders)).catch(() => {});
  };
  const act = async (id, status) => {
    try {
      await api(`/driver/orders/${id}/status`, { method: 'POST', body: { status } });
      if (status === 'delivered') toast(t('delivered_ok'));
    } catch (ex) { toast(ex.message, 'err'); }
    api('/driver/mine').then((d) => setMine(d.orders)).catch(() => {});
    api('/driver/stats').then(setStats).catch(() => {});
  };

  if (!approved) {
    return (
      <div className="shell">
        <Top t={t} user={user} logout={logout} online={false} onToggle={() => {}} disabled onAccount={() => setAcct(true)} />
        <div className="banner warn">⏳ {t('waiting_validation')}</div>
        <Empty e="🛵" text={t('waiting_validation')} />
      </div>
    );
  }

  const activeList = (mine || []).filter((o) => ['assigned', 'picked_up'].includes(o.status));
  const tourStops = pos ? buildTour(pos, activeList) : [];
  const showTour = isGeneral ? tourStops.length > 0 : tourStops.length >= 2; // prives : carte seulement en multi-livraisons
  const tabs = isGeneral ? [
    { id: 'mine', label: '🛵 ' + t('my_deliveries') + (activeList.length ? ` (${activeList.length})` : '') },
    { id: 'history', label: '📁 ' + t('history') }
  ] : [
    { id: 'available', label: '📋 ' + t('available_d') + (avail?.length ? ` (${avail.length})` : '') },
    { id: 'mine', label: '🛵 ' + t('my_deliveries') },
    { id: 'history', label: '📁 ' + t('history') }
  ];

  return (
    <div className="shell">
      <Top t={t} user={user} logout={logout} online={online} onToggle={toggleOnline} onAccount={() => setAcct(true)} />
      {isNative && !YG && (
        <div className="card" style={{ background: '#fee2e2', border: '1px solid #ef4444', padding: '10px 14px', fontSize: 13 }}>
          🔴 <b>APK ANCIEN détecté</b> — cette application ne contient pas le service GPS natif (vérifie : réglages Android → YallaLiv → version doit être <b>3.0</b>). Installe le nouvel APK fourni par l'administrateur, puis reconnecte-toi.
        </div>
      )}
      {YG && (() => {
        const age = gpsStatus?.lastUploadAt ? Math.max(0, Math.round((Date.now() - gpsStatus.lastUploadAt) / 1000)) : null;
        const ok = gpsStatus?.running && age != null && age < 20;
        return (
          <div className="card" style={{ background: ok ? '#d1fae5' : '#fffbeb', border: `1px solid ${ok ? '#34d399' : '#fcd34d'}`, padding: '10px 14px', fontSize: 13 }}>
            <b>📍 Service GPS</b> : {gpsStatus == null ? '…' : gpsStatus.running ? 'ACTIF ✅' : 'arrêté'}
            {age != null && <span> · dernier envoi <b>il y a {age} s</b></span>}
            {gpsStatus?.apkVersion && <span> · APK v{gpsStatus.apkVersion}</span>}
            {gpsStatus && !gpsStatus.permission && <span style={{ color: '#b91c1c' }}> · ⚠️ permission position manquante</span>}
            <div style={{ marginTop: 6, opacity: 0.85 }}>
              Position « <b>Autoriser tout le temps</b> » · Batterie « <b>Sans restriction</b> »
              <button className="btn" style={{ padding: '3px 10px', fontSize: 12, marginLeft: 8 }} onClick={openAppSettings}>⚙️</button>
            </div>
          </div>
        );
      })()}
      <div className="stat-grid">
        <div className="stat hl"><div className="v" style={{ fontSize: 18 }}>{fmtMoney(stats?.today_earnings || 0)}</div><div className="k">💰 {t('today_earnings')}</div></div>
        <div className="stat"><div className="v" style={{ fontSize: 18 }}>{fmtMoney(stats?.earnings || 0)}</div><div className="k">🏆 {t('total_earnings')}</div></div>
        <div className="stat"><div className="v">{stats?.deliveries || 0}</div><div className="k">📦 {t('deliveries_count')}</div></div>
        {stats?.rating ? <div className="stat"><div className="v">⭐ {stats.rating}</div><div className="k">{t('driver_note')}</div></div> : null}
      </div>
      <div className="banner ok">{isGeneral ? <>🤖 {t('auto_assign_note')}</> : <>💡 {t('earnings_note')}</>}</div>
      <div className="tabs">
        {tabs.map((x) => (
          <button key={x.id} className={'tab' + (tab === x.id ? ' on' : '')} onClick={() => setTab(x.id)}>{x.label}</button>
        ))}
      </div>

      {tab === 'available' && (
        !avail ? <Spinner /> : avail.length === 0
          ? <Empty e="😴" text={t('none_available')} />
          : avail.map((o) => (
            <div key={o.id} className="card mb12">
              <div className="row spread wrap" onClick={() => o.store_lat != null && o.client_lat != null && setRouteView(o)} style={{ cursor: 'pointer' }}>
                <div style={{ fontWeight: 800 }}>{o.store_emoji} {o.store_name} → #{o.id}</div>
                <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>💰 {t('fee_earned')} {fmtMoney(o.delivery_fee)}</span>
              </div>
              <div className="mt8" style={{ background: '#f8fafc', borderRadius: 12, padding: 10 }}>
                <div className="small">📍 <b>{t('pickup')} :</b> {o.store_name} — {o.store_address}</div>
                <div className="small mt4">🏁 <b>{t('dropoff')} :</b> {o.address}</div>
                <div className="small mt4">👤 {o.client_name} · <a href={'tel:' + o.phone}>📞 {o.phone}</a></div>
                {o.items.map((it) => <div key={it.id} className="muted small mt4">{it.emoji} {it.name} × {it.qty}</div>)}
              </div>
              <div className="row mt8">
                {o.store_lat != null && o.client_lat != null && (
                  <button className="btn blue grow" onClick={() => setRouteView(o)}>🗺️ {t('view_route')}</button>
                )}
                <button className="btn primary grow" disabled={!online} onClick={() => accept(o)}>
                  {online ? '✅ ' + t('accept_d') : '🔌 ' + t('offline')}
                </button>
              </div>
            </div>
          ))
      )}

      {tab === 'mine' && showTour && (
        <div className="card mb12">
          <div className="row spread mb8 wrap">
            <div style={{ fontWeight: 800 }}>🧭 {t('tour_title')} ({tourStops.length})</div>
            <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>🔴 {t('tour_pickup')}</span>
            <span className="badge" style={{ background: '#d1fae5', color: '#065f46' }}>🟢 {t('tour_deliver')}</span>
          </div>
          <TourMap driverPos={pos} stops={tourStops} />
          <div className="mt8">
            {tourStops.map((s, i) => (
              <div key={s.o.id + '-' + s.kind} className="row spread" style={{ padding: '7px 0', borderBottom: '1px dashed #eef2f7' }}>
                <div className="small" style={{ fontWeight: 700 }}>{i + 1}. {s.kind === 'pickup' ? '🏪' : '🏠'} {s.kind === 'pickup' ? s.o.store_name : (s.o.address || '').slice(0, 36)}</div>
                <span className="badge" style={{ background: s.kind === 'pickup' ? '#fee2e2' : '#d1fae5', color: s.kind === 'pickup' ? '#b91c1c' : '#065f46' }}>#{s.o.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'mine' && (
        !mine ? <Spinner /> : mine.filter((o) => ['assigned', 'picked_up'].includes(o.status)).length === 0
          ? <Empty e="🛵" text={t('none_available')} />
          : mine.filter((o) => ['assigned', 'picked_up'].includes(o.status)).map((o) => (
            <div key={o.id} className="card mb12">
              <div className="row spread wrap">
                <div style={{ fontWeight: 800 }}>{o.store_emoji} {o.store_name} → #{o.id}</div>
                <StatusBadge status={o.status} />
              </div>
              <div className="mt8" style={{ background: '#f8fafc', borderRadius: 12, padding: 10 }}>
                <div className="small">📍 <b>{t('pickup')} :</b> {o.store_name} — {o.store_address}</div>
                <div className="small mt4">🏁 <b>{t('dropoff')} :</b> {o.address}</div>
                <div className="small mt4">👤 {o.client_name} · <a href={'tel:' + o.phone}>📞 {o.phone}</a></div>
                <div className="small mt4">💰 {t('fee_earned')} : <b>{fmtMoney(o.delivery_fee)}</b> · <PayBadge o={o} /></div>
                {o.items.map((it) => <div key={it.id} className="muted small mt4">{it.emoji} {it.name} × {it.qty}</div>)}
              </div>
              <div className="row mt8">
                {o.status === 'assigned' && <button className="btn blue block" onClick={() => act(o.id, 'picked_up')}>📦 {t('picked_up_btn')}</button>}
                {o.status === 'picked_up' && <button className="btn primary block" onClick={() => act(o.id, 'delivered')}>🎉 {t('delivered_btn')}</button>}
              </div>
              <div className="row mt8 wrap">
                <button className="btn ghost sm" onClick={() => setChat(o)}>💬 Chat — {o.client_name}</button>
                {o.store_lat != null && o.client_lat != null && (
                  <button className="btn blue sm" onClick={() => setRouteView(o)}>🗺️ {t('view_route')}</button>
                )}
              </div>
              <LastMsgLine o={o} />
            </div>
          ))
      )}

      {tab === 'history' && (
        !mine ? <Spinner /> : mine.filter((o) => o.status === 'delivered').length === 0
          ? <Empty e="📁" text={t('no_data')} />
          : <div className="card">{mine.filter((o) => o.status === 'delivered').map((o) => (
            <div key={o.id} className="row spread" style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div className="small">
                <b>#{o.id}</b> {o.store_emoji} {o.store_name} → {o.client_name}
              </div>
              <div className="small" style={{ fontWeight: 800, color: 'var(--brand-dark)' }}>+{fmtMoney(o.delivery_fee)}</div>
            </div>
          ))}</div>
      )}

      {alarm && (
        <div className="alarm-overlay" role="alertdialog">
          <div className="alarm-box">
            <div className="alarm-ring">🚨</div>
            <div className="h2" style={{ margin: '6px 0 2px' }}>{t('alarm_title')}</div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>#{alarm.id} · {alarm.store_emoji} {alarm.store_name}</div>
            <div className="muted small mt8">📍 <b>{t('pickup')} :</b> {alarm.store_address}</div>
            <div className="muted small mt4">🏁 <b>{t('dropoff')} :</b> {alarm.address}</div>
            <div className="small mt4">💰 {t('fee_earned')} : <b>{fmtMoney(alarm.delivery_fee)}</b></div>
            <button className="btn primary block mt12 alarm-btn" onClick={ackAlarm}>✅ OK — {t('alarm_ok')}</button>
            <div className="muted small mt8">{t('alarm_hint')}</div>
          </div>
        </div>
      )}

      {acct && (
        <Modal open onClose={() => setAcct(false)} title={'👤 ' + t('account_settings')}>
          <AccountSettings />
        </Modal>
      )}
      <ChatModal order={chat} onClose={() => setChat(null)} />

      <Modal open={!!routeView} onClose={() => setRouteView(null)} title={'🗺️ ' + t('route') + ' #' + (routeView?.id || '')}>
        {routeView && (
          <>
            {routeView.status === 'assigned' && (pos || lastPos.current) ? (
              <DualRouteMap
                driverPos={pos || lastPos.current}
                storePos={{ lat: routeView.store_lat, lng: routeView.store_lng }}
                clientPos={{ lat: routeView.client_lat, lng: routeView.client_lng }}
              />
            ) : (
              <RouteMap
                from={routeView.status === 'picked_up' && (pos || lastPos.current)
                  ? (pos || lastPos.current)
                  : { lat: routeView.store_lat, lng: routeView.store_lng }}
                to={{ lat: routeView.client_lat, lng: routeView.client_lng }}
                fromEmoji={routeView.status === 'picked_up' && (pos || lastPos.current) ? '🛵' : '🏪'}
                toEmoji="🏠"
              />
            )}
            <div className="mt12" style={{ background: '#f8fafc', borderRadius: 12, padding: 10 }}>
              <div className="small">📍 <b>{t('pickup')} :</b> {routeView.store_name} — {routeView.store_address}</div>
              <div className="small mt4">🏁 <b>{t('dropoff')} :</b> {routeView.address}</div>
              <div className="small mt4">👤 {routeView.client_name} · <a href={'tel:' + routeView.phone}>📞 {routeView.phone}</a></div>
              <div className="small mt4">💰 {t('fee_earned')} : <b>{fmtMoney(routeView.delivery_fee)}</b></div>
            </div>
            {routeView.status === 'ready' && (
              <button className="btn primary block mt12" disabled={!online} onClick={() => accept(routeView)}>
                {online ? '✅ ' + t('accept_d') : '🔌 ' + t('offline')}
              </button>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

function Top({ t, user, logout, online, onToggle, disabled, onAccount }) {
  const bell = async () => {
    const r = await pushSubscribe();
    toast(r === 'granted' ? t('push_on') : r === 'denied' ? t('notif_off') : t('push_fail'), r === 'granted' ? 'ok' : 'err');
  };
  return (
    <div className="topbar">
      <div className="logo">🛵</div>
      <div className="grow">
        <div className="brand-name" style={{ fontSize: 18 }}>{t('driver_title')}</div>
        <div className="muted small ellipsis">{user?.name} · {user?.vehicle}</div>
      </div>
      <LangSwitch />
      <button className="icon-btn" onClick={bell} title={t('notif_enable')}>🔔</button>
      {onAccount && <button className="icon-btn" onClick={onAccount} title={t('account_settings')}>👤</button>}
      {!disabled && (
        <div className="row" style={{ gap: 7 }}>
          <span className={'badge ' + (online ? 'b-active' : '')}>{online ? '🟢 ' + t('online') : '⚪ ' + t('offline')}</span>
          <button className={'switch' + (online ? ' on' : '')} onClick={onToggle} aria-label="online" />
        </div>
      )}
      <button className="icon-btn" onClick={logout} title={t('logout')}>🚪</button>
    </div>
  );
}
