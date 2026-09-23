import React, { useEffect, useRef, useState } from 'react';
import { api, useT, useLang, useAuth, usePoll, fmtMoney, fmtDate, toast, notif, beep, pushSubscribe , UpdatesBanner, NotifNag, BellButton } from '../lib.jsx';
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
  const lastFixAt = useRef(0);      // 🧭 horodatage du dernier fix GPS (détecte un webview bloqué)
  const wrap180 = (x) => ((x % 360) + 540) % 360 - 180;
  const havM = (a, b) => { const R = 6371000, rad = (x) => (x * Math.PI) / 180; const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng); const hh = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(hh)); };
  // 🧭 v2026.09.23.2 — Cap du livreur, pipeline anti-bruit :
  //  ① en mouvement (vitesse > ~1 m/s) : cap GPS — direction RÉELLE du déplacement ;
  //  ② déplacement lent : cap calculé sur ~12 m de trajet franc (vrai sens du mouvement) ;
  //  ③ à l'arrêt : boussole lissée (stable au repos, vive sur les vrais pivots),
  //     calibrée AUTOMATIQUEMENT contre le cap GPS en roulant (sens + décalage) ;
  //  ④ repli : dernier cap connu.
  // (les chipsets GPS renvoient des caps fantaisistes à l'arrêt — c'était le bec
  //  qui « tournait tout seul » ; à l'arrêt seule la boussole peut suivre un pivot)
  const hdgRef = useRef({ gps: null, gpsAt: 0, gpsSpd: 0, comp: null, compMode: null, compAt: 0, anchor: null, calc: null, calcAt: 0, calSign: 0, calOff: null, cal: null });
  const bestHdg = () => {
    const h = hdgRef.current;
    const now = Date.now();
    if (h.gps != null && now - h.gpsAt < 7000 && h.gpsSpd > 1.1) return h.gps;            // ① cap GPS (en mouvement)
    if (h.calc != null && now - h.calcAt < 15000 && h.gpsSpd > 0.5) return h.calc;        // ② cap calculé (marche lente)
    if (h.comp != null && now - h.compAt < 4000) {                                        // ③ boussole calibrée (à l'arrêt)
      let c = h.comp;
      if (h.calSign) c = ((h.calSign < 0 ? 360 - c : c) + 360) % 360;                    //   sens détecté vs cap GPS
      if (h.calOff != null) c = ((c - h.calOff) + 360) % 360;                            //   décalage appris vs cap GPS
      return c;
    }
    return h.gps != null ? h.gps : h.calc;                                                // ④ dernier connu
  };
  const liveCtl = useRef({ getHdg: bestHdg }).current;   // passé aux cartes (stable entre rendus)
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

  // 📍 v2026.09.23.1 — Position LIVE (fix marqueur figé) :
  //  - service GPS NATIF (APK) : envoie 1 position/s au serveur (arrière-plan inclus) ;
  //  - watchPosition continu : alimente la carte en direct + le cap GPS (heading) ;
  //  - filet APK : si le webview ne fournit rien (limite connue du WebView Capacitor),
  //    on relit la position que le service natif vient d'envoyer au serveur.
  useEffect(() => {
    if (!approved || !online) return;
    let stopped = false;

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

    let lastPut = 0;
    const onFix = (p) => {
      if (stopped) return;
      const { latitude: lat, longitude: lng, heading, accuracy, speed } = p.coords;
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;
      lastFixAt.current = Date.now();
      const h = hdgRef.current;
      const spd = typeof speed === 'number' && !isNaN(speed) ? speed : null;
      h.gpsSpd = spd || 0;

      // ---- 🧭 cap GPS : accepté UNIQUEMENT en vrai déplacement (les chipsets
      //      renvoient des caps aléatoires à l'arrêt -> bec qui pivotait tout seul)
      if (typeof heading === 'number' && !isNaN(heading) && (spd == null || spd > 1.1)) {
        h.gps = (heading + 360) % 360; h.gpsAt = Date.now();
        // 🧭 Calibration auto de la boussole en roulant : on compare ses variations
        // au cap GPS (fiable à vitesse) pour détecter le SENS (certains téléphones
        // l'inversent) et apprendre le décalage. Silencieux, aucun réglage —
        // se complète en ~1 minute de conduite avec quelques virages.
        if (spd != null && spd > 2.2 && h.comp != null && Date.now() - h.compAt < 5000) {
          if (!h.cal) h.cal = { g: h.gps, c: h.comp, at: Date.now(), sumDGDC: 0, sumAbsDG: 0 };
          else if (Date.now() - h.cal.at > 900) {
            const dG = wrap180(h.gps - h.cal.g), dC = wrap180(h.comp - h.cal.c);
            const s = { sumDGDC: h.cal.sumDGDC + dG * dC, sumAbsDG: h.cal.sumAbsDG + Math.abs(dG) };
            if (h.calSign === 0 && s.sumAbsDG > 90) h.calSign = s.sumDGDC >= 0 ? 1 : -1;
            if (h.calSign !== 0) {
              const eff = ((h.calSign < 0 ? 360 - h.comp : h.comp) + 360) % 360;
              const off = wrap180(eff - h.gps);
              h.calOff = h.calOff == null ? off : wrap180(h.calOff + 0.25 * wrap180(off - h.calOff));
            }
            h.cal = { g: h.gps, c: h.comp, at: Date.now(), ...s };
          }
        }
      }

      // ---- 🧭 cap calculé par déplacement FRANC (>= 12 m depuis le point d'ancrage) :
      //      sens réel du mouvement, insensible au « marchandage » GPS de ±5-15 m
      if (!h.anchor) h.anchor = { lat, lng };
      else if (havM(h.anchor, { lat, lng }) > (h.calcAt ? 12 : 6)) {
        const dLat = (lat - h.anchor.lat) * 111320, dLng = (lng - h.anchor.lng) * 111320 * Math.cos((lat * Math.PI) / 180);
        h.calc = ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
        h.calcAt = Date.now();
        h.anchor = { lat, lng };
      }

      // ---- 📍 anti-dérive : fixes imprécis ignorés, et à l'arrêt le marqueur ne
      //      bouge PLUS (le GPS « marchande » de quelques mètres même téléphone posé)
      if (typeof accuracy === 'number' && accuracy > 75) return;   // fix trop mauvais
      const disp = lastPos.current;
      const dm = disp ? havM(disp, { lat, lng }) : Infinity;
      const immobile = (spd != null && spd < 0.75) || (spd == null && dm < 8);
      const send = () => {
        if (stopped) return;
        if (!nativeOk && Date.now() - lastPut > 1500) {
          lastPut = Date.now();
          const b = bestHdg();   // 🧭 cap transmis avec la position (le magasin voit le bec)
          api('/driver/location', { method: 'PUT', body: { lat, lng, ...(typeof b === 'number' ? { bearing: Math.round(b * 10) / 10 } : {}) } }).catch(() => {});
        }
      };
      if (disp != null && immobile) { send(); return; }            // à l'arrêt : affichage figé, serveur à jour
      lastPos.current = { lat, lng };
      setPos({ lat, lng });
      send();
    };
    let watchId = null;
    try {
      if (navigator.geolocation?.watchPosition) watchId = navigator.geolocation.watchPosition(onFix, () => {}, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    } catch {}

    // 📱 APK : le GPS du webview peut se bloquer (position figée) — on relit alors la
    // dernière position envoyée au serveur par le service NATIF (~1 s de fraîcheur).
    const pollSrv = async () => {
      if (stopped || !nativeOk || Date.now() - lastFixAt.current < 4000) return;
      try {
        const d = await api('/api/driver/location');
        if (!stopped && d?.pos && Date.now() - lastFixAt.current >= 4000) {
          lastPos.current = { lat: d.pos.lat, lng: d.pos.lng };
          setPos({ lat: d.pos.lat, lng: d.pos.lng });
        }
      } catch {}
    };
    const pollIt = setInterval(pollSrv, 2000);

    // 🧭 v2026.09.23.3 — APK : le service GPS natif envoie les positions ; le webview
    // envoie le CAP (boussole/cap GPS) -> le magasin voit le bec pivoter en direct,
    // même si le livreur est arrêté sur place. Léger : un nombre toutes les 1.5 s.
    const brgIt = setInterval(() => {
      if (stopped || !nativeOk) return;
      const b = bestHdg();
      if (typeof b === 'number') api('/driver/location', { method: 'PUT', body: { bearing: Math.round(b * 10) / 10 } }).catch(() => {});
    }, 1500);

    // 🧭 Boussole (pivot sur place) : priorité à l'ABSOLUE (boussole vraie), la relative
    // est ignorée dès qu'une absolue est dispo. Lissage adaptatif : très stable au repos
    // (micro-bruit filtré), réponse immédiate sur les vrais pivots/virages. Téléphone trop
    // incliné -> boussole illisible -> événement ignoré.
    const onOrient = (e) => {
      try {
        const h = hdgRef.current;
        const isAbs = e.type === 'deviceorientationabsolute' || e.absolute === true;
        if (!isAbs && h.compMode === 'abs') return;
        if (Math.abs(e.beta || 0) > 65 || Math.abs(e.gamma || 0) > 50) return;
        let raw = typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)
          ? e.webkitCompassHeading
          : (typeof e.alpha === 'number' && !isNaN(e.alpha) ? (360 - e.alpha) % 360 : null);
        if (raw == null) return;
        const ang = (screen.orientation?.angle ?? window.orientation ?? 0) || 0;
        if (ang % 90 === 0 && ang) raw = (raw + ang + 720) % 360;   // écran pivoté : compensation
        if (h.comp == null) h.comp = raw;
        else {
          const d = wrap180(raw - h.comp);
          const a = Math.abs(d) > 40 ? 0.65 : Math.abs(d) > 12 ? 0.38 : 0.14;   // vif sur les virages, stable au repos
          h.comp = (h.comp + d * a + 360) % 360;
        }
        h.compMode = isAbs ? 'abs' : 'rel';
        h.compAt = Date.now();
      } catch {}
    };
    try {
      window.addEventListener('deviceorientationabsolute', onOrient, true);
      window.addEventListener('deviceorientation', onOrient, true);
    } catch {}
    const onVis = () => { if (document.visibilityState === 'visible' && !stopped) pollSrv(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      stopped = true; clearInterval(pollIt); clearInterval(brgIt); document.removeEventListener('visibilitychange', onVis);
      try { window.removeEventListener('deviceorientationabsolute', onOrient, true); } catch {}
      try { window.removeEventListener('deviceorientation', onOrient, true); } catch {}
      try { if (watchId != null && navigator.geolocation?.clearWatch) navigator.geolocation.clearWatch(watchId); } catch {}
      ygStopped = true;
      if (ygStarted) { try { YG?.stop().catch(() => {}); } catch {} }
    };
  }, [approved, online]);

  // Écran maintenu allumé PENDANT une course (suivi GPS continu, téléphone posé sur le guidon).
  // Relâché dès que le livreur verrouille lui-même ou termine sa course. Non vital si indisponible.
  const isNative = !!window.Capacitor?.isNativePlatform?.();
  const YG = isNative ? (window.Capacitor.Plugins?.YallaGps || null) : null;
  const openAppSettings = () => { try { YG?.openSettings?.().catch(() => {}); } catch {} };
  // 🔄 Version minimale de l'APK — si le téléphone a moins, proposer la mise à jour automatique
  const APK_REQUIRED = '3.1.8'; // + FCM : notifications reçues même app fermée
  const [installing, setInstalling] = useState(false);
  const [brandHelp, setBrandHelp] = useState(false); // modal guide par marque
  const [pinAsk, setPinAsk] = useState(null); // 🔑 commande en cours de validation par code
  const [pinCode, setPinCode] = useState('');
  const [refuseAsk, setRefuseAsk] = useState(null); // ↩️ colis refusé par le client
  const [refuseReason, setRefuseReason] = useState('');
  const [brandSel, setBrandSel] = useState(null);
  const detectedBrand = detectBrand();
  const updateApp = () => {
    setInstalling(true);
    YG?.downloadAndInstall?.({ url: window.location.origin + '/apk/latest.apk' })
      .catch((e) => toast('Mise à jour impossible : ' + (e?.message || e), 'err'))
      .finally(() => setInstalling(false));
  };

  // Tableau de bord GPS (app native) : lit le service Java toutes les 4 s
  const [gpsStatus, setGpsStatus] = useState(null);
  useEffect(() => {
    if (!YG) return;
    const read = () => YG.status?.().then(setGpsStatus).catch(() => setGpsStatus({}));
    read();
    const it = setInterval(read, 4000);
    return () => clearInterval(it);
  }, []);
  // 🔐 Assistant d'autorisations (app native) : à l'arrivée dans l'espace livreur,
  // on demande UNE SEULE FOIS chaque autorisation manquante (Android les mémorise pour toujours) :
  // ③ Position « tout le temps » → ① Batterie « Sans restriction » → ② Par-dessus les autres apps.
  const wizardDone = useRef(false);
  useEffect(() => {
    if (!YG || wizardDone.current) return;
    wizardDone.current = true;
    YG.status?.().then((s) => {
      const steps = [];
      if (!s?.permission) steps.push(() => YG.requestPermission?.().catch(() => {}));
      if (!s?.battery) steps.push(() => YG.requestBatteryExemption?.().catch(() => {}));
      if (!s?.overlay) steps.push(() => YG.requestOverlay?.().catch(() => {}));
      // (④ « Démarrage auto » N'EST PAS demandé automatiquement : c'est un réglage constructeur
      //  manuel — il est juste affiché dans la liste de contrôle avec son bouton Activer.)
      steps.forEach((f, i) => setTimeout(f, 900 * (i + 1))); // enchaînées doucement
    }).catch(() => {});
  }, [!!YG]);
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
    try {
      await api('/driver/online', { method: 'PUT', body: { online: v } });
      if (!v) { try { YG?.stop?.().catch(() => {}); } catch {} } // Hors ligne → stoppe le GPS et la notification IMMÉDIATEMENT
    } catch (ex) { setOnline(!v); toast(ex.message, 'err'); }
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
  const act = async (id, status, pin) => {
    let ok = true;
    try {
      await api(`/driver/orders/${id}/status`, { method: 'POST', body: { status, pin } });
      if (status === 'delivered') toast(t('delivered_ok'));
    } catch (ex) { ok = false; toast(ex.message, 'err'); }
    api('/driver/mine').then((d) => setMine(d.orders)).catch(() => {});
    api('/driver/stats').then(setStats).catch(() => {});
    return ok;
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
      <UpdatesBanner role="driver" />
      <NotifNag role="driver" />
      {YG && gpsStatus?.apkVersion && gpsStatus.apkVersion !== APK_REQUIRED && (
        <div className="card" style={{ background: '#e0e7ff', border: '1px solid #6366f1', padding: '10px 14px', fontSize: 13 }}>
          🔄 <b>Mise à jour de l'application disponible</b> (installée : v{gpsStatus.apkVersion} · requise : v{APK_REQUIRED})
          <button className="btn" style={{ padding: '4px 12px', fontSize: 13, marginLeft: 10 }} disabled={installing} onClick={updateApp}>
            {installing ? '⏳ Téléchargement…' : '🔄 Mettre à jour maintenant'}
          </button>
        </div>
      )}
      {YG && online && (() => {
        const age = gpsStatus?.lastUploadAt ? Math.max(0, Math.round((Date.now() - gpsStatus.lastUploadAt) / 1000)) : null;
        const ok = gpsStatus?.running && age != null && age < 20;
        return (
          <div className="card" style={{ background: ok ? '#d1fae5' : '#fffbeb', border: `1px solid ${ok ? '#34d399' : '#fcd34d'}`, padding: '10px 14px', fontSize: 13 }}>
            <b>📍 Service GPS</b> : {gpsStatus == null ? '…' : gpsStatus.running ? 'ACTIF ✅' : 'arrêté'}
            {age != null && <span> · dernier envoi <b>il y a {age} s</b></span>}
            {gpsStatus?.apkVersion && <span> · APK v{gpsStatus.apkVersion}</span>}
            {gpsStatus && !gpsStatus.permission && <span style={{ color: '#b91c1c' }}> · ⚠️ permission position manquante</span>}

            {gpsStatus && (() => {
              const items = [
                { ok: !!gpsStatus.permission, label: '③ GPS en temps réel (chaque seconde)', act: () => YG.requestPermission?.().catch(() => {}) },
                { ok: !!gpsStatus.battery, label: '① Rester éveillé (batterie « Sans restriction »)', act: () => YG.requestBatteryExemption?.().catch(() => {}) },
                { ok: !!gpsStatus.overlay, label: '② Par-dessus les autres applications', act: () => YG.requestOverlay?.().catch(() => {}) },
                (() => {
                  const a4 = gpsStatus.lastUploadAt ? Math.round((Date.now() - gpsStatus.lastUploadAt) / 1000) : null;
                  const ok4 = !!gpsStatus.battery && !!gpsStatus.running;
                  return { ok: ok4, label: `④ Continuer après fermeture de l'app${detectedBrand ? ' · ' + BRANDS[detectedBrand].short : ''}`, act: () => { setBrandSel(detectedBrand || null); setBrandHelp(true); } };
                })(),
                (() => {
                  // ⑤ : accordée à l'installation (RECEIVE_BOOT_COMPLETED) — suffit que l'APK soit à jour
                  const p = (s) => String(s || '').split('.').map(Number);
                  const a = p(gpsStatus.apkVersion), b = p(APK_REQUIRED);
                  const ok5 = a.length >= 3 && b.length >= 3 && (a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]))));
                  return { ok: ok5, label: '⑤ Redémarrage auto après extinction du téléphone', act: () => updateApp() };
                })(),
              ];
              return (
                <div style={{ marginTop: 6 }}>
                  {items.map((it) => (
                    <div key={it.label} className="row" style={{ justifyContent: 'space-between', gap: 6, padding: '2px 0' }}>
                      <span style={{ opacity: 0.9 }}>{it.ok ? '✅' : '⚠️'} {it.label}</span>
                      {!it.ok && <button className="btn" style={{ padding: '2px 10px', fontSize: 12 }} onClick={it.act}>Activer</button>}
                    </div>
                  ))}
                  <button className="btn" style={{ padding: '2px 10px', fontSize: 12, marginTop: 4 }} onClick={openAppSettings}>⚙️ Tous les réglages</button>
                </div>
              );
            })()}
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
              <div className="row mt8 wrap" style={{ gap: 6 }}>
                <a className="btn ghost sm" href={'tel:' + o.phone}>📞 Appeler</a>
                <a className="btn ghost sm" href={waLink(o.phone)} target="_blank" rel="noopener">💬 WhatsApp</a>
                <a className="btn ghost sm" href={navLink(o)} target="_blank" rel="noopener">🧭 Navigation</a>
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
          <TourMap driverPos={pos} stops={tourStops} live={liveCtl} />
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
                {o.status === 'picked_up' && <button className="btn primary block" onClick={() => (o.has_pin ? setPinAsk(o) : act(o.id, 'delivered'))}>🎉 {t('delivered_btn')}{o.has_pin ? ' · 🔑' : ''}</button>}
                {['assigned', 'picked_up'].includes(o.status) && <button className="btn danger sm" onClick={() => { setRefuseAsk(o); setRefuseReason(''); }}>↩️ Refus client</button>}
              </div>
              <div className="row mt8 wrap">
                <button className="btn ghost sm" onClick={() => setChat(o)}>💬 Chat — {o.client_name}</button>
                <a className="btn ghost sm" href={'tel:' + o.phone}>📞 Appeler</a>
                <a className="btn ghost sm" href={waLink(o.phone)} target="_blank" rel="noopener">💬 WhatsApp</a>
                <a className="btn ghost sm" href={navLink(o)} target="_blank" rel="noopener">🧭 Navigation</a>
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
                live={liveCtl}
              />
            ) : (
              <RouteMap
                from={routeView.status === 'picked_up' && (pos || lastPos.current)
                  ? (pos || lastPos.current)
                  : { lat: routeView.store_lat, lng: routeView.store_lng }}
                to={{ lat: routeView.client_lat, lng: routeView.client_lng }}
                fromEmoji={routeView.status === 'picked_up' && (pos || lastPos.current) ? '🛵' : '🏪'}
                toEmoji="🏠"
                live={routeView.status === 'picked_up' && (pos || lastPos.current) ? liveCtl : null}
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

      {/* ↩️ Colis refusé par le client : motif optionnel, le magasin est prévenu */}
      <Modal open={!!refuseAsk} onClose={() => { setRefuseAsk(null); setRefuseReason(''); }} title="↩️ Colis refusé par le client ?">
        <p className="muted small" style={{ marginTop: 0 }}>Le magasin sera prévenu que le colis retourne au magasin.</p>
        <div className="field">
          <label className="label">📝 Motif (optionnel)</label>
          <textarea className="textarea" rows={2} value={refuseReason} onChange={(e) => setRefuseReason(e.target.value)} placeholder="ex. : client absent, a changé d'avis..." />
        </div>
        <button className="btn danger block mt8" onClick={async () => {
          let ok = true;
          try { await api(`/driver/orders/${refuseAsk.id}/refuse`, { method: 'POST', body: { reason: refuseReason } }); toast('Refus enregistré — retour au magasin'); }
          catch (ex) { ok = false; toast(ex.message, 'err'); }
          api('/driver/mine').then((d) => setMine(d.orders)).catch(() => {});
          if (ok) { setRefuseAsk(null); setRefuseReason(''); }
        }}>↩️ Confirmer le refus</button>
      </Modal>

      {/* 🔑 Preuve de livraison : code à 4 chiffres montré au client, saisi par le livreur */}
      <Modal open={!!pinAsk} onClose={() => { setPinAsk(null); setPinCode(''); }} title="🔑 Code de remise du client">
        <p className="muted small" style={{ marginTop: 0 }}>Demandez le code à 4 chiffres au client, puis validez la livraison.</p>
        <input className="input" dir="ltr" inputMode="numeric" maxLength={4} placeholder="••••" value={pinCode}
          style={{ fontSize: 26, fontWeight: 800, letterSpacing: 8, textAlign: 'center' }}
          onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        <button className="btn primary block mt8" disabled={pinCode.length !== 4}
          onClick={async () => { const ok = await act(pinAsk.id, 'delivered', pinCode); if (ok) { setPinAsk(null); setPinCode(''); } }}>
          🎉 Valider la livraison
        </button>
      </Modal>

      <Modal open={brandHelp} onClose={() => setBrandHelp(false)} title="📱 Rester actif après fermeture de l'app">
        <div style={{ fontSize: 13 }}>
          <p style={{ marginTop: 0 }}>
            {detectedBrand
              ? <>Marque détectée : <b>{BRANDS[detectedBrand].name}</b> — voici le chemin exact sur ton téléphone :</>
              : <>Quelle est la <b>marque de ton téléphone</b> ? (pour t'indiquer le bon réglage)</>}
          </p>
          <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
            {Object.entries(BRANDS).map(([k, b]) => (
              <button key={k} className="btn" style={{ padding: '4px 10px', fontSize: 12, outline: brandSel === k ? '2px solid #0e9f6e' : 'none' }} onClick={() => setBrandSel(k)}>{b.short}</button>
            ))}
          </div>
          {brandSel && BRANDS[brandSel] && (
            <ol style={{ margin: '6px 0 12px 18px', padding: 0 }}>
              {BRANDS[brandSel].steps.map((s, i) => <li key={i} style={{ marginBottom: 5 }}>{s}</li>)}
            </ol>
          )}
          {YG && <button className="btn" style={{ padding: '5px 12px', fontSize: 13 }} onClick={() => YG.openSettings?.().catch(() => {})}>⚙️ Ouvrir les réglages Android de YallaLiv</button>}
          <p style={{ opacity: 0.75, marginBottom: 0, marginTop: 10 }}>
            Une fois réglé : glisse l'app pour la fermer — si la notification « Suivi de position actif » reste, c'est gagné ✅
          </p>
        </div>
      </Modal>
    </div>
  );
}

// 📞💬🧭 Liens rapides livreur : appel, WhatsApp, navigation GPS (Google Maps)
const waLink = (ph) => {
  let p = String(ph || '').replace(/\D/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = '2' + p; // Égypte : 01xxxxxxxxx → 201xxxxxxxxx (format international)
  return 'https://wa.me/' + p;
};
const navLink = (o) => {
  // Destination intelligente : avant récupération → le magasin ; après récupération → le client
  const dst = o.status === 'picked_up' && o.client_lat != null
    ? o.client_lat + ',' + o.client_lng
    : o.store_lat != null ? o.store_lat + ',' + o.store_lng : null;
  return dst
    ? 'https://www.google.com/maps/dir/?api=1&destination=' + dst + '&travelmode=driving'
    : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.address || o.store_address || '');
};

// 📱 Guide anti-kill par marque de téléphone (ROMs chinoises surtout).
// Détection automatique depuis la chaîne du navigateur quand c'est possible,
// sinon sélecteur manuel — le livreur voit LE chemin exact de SON téléphone.
const BRANDS = {
  xiaomi: { icon: '📱', short: 'Xiaomi', name: 'Xiaomi / Redmi / POCO', steps: [
    'Ouvre l\'app « Sécurité » (ou « Security ») sur le téléphone',
    'Permissions → Démarrage automatique',
    'Active YallaLiv ✅',
    'Bonus blindage : applications récentes → appui long sur YallaLiv → Épingler 🔒',
  ] },
  oppo: { icon: '📱', short: 'Oppo/Realme', name: 'Oppo / Realme', steps: [
    'Paramètres → Applications → YallaLiv',
    'Batterie → « Autoriser l\'activité en arrière-plan » (ou « Sans restriction »)',
    'Bonus blindage : applications récentes → appui long sur YallaLiv → Épingler 🔒',
  ] },
  vivo: { icon: '📱', short: 'Vivo', name: 'Vivo / iQOO', steps: [
    'Ouvre l\'app « i Manager »',
    'Gestion des applications → Démarrage auto',
    'Active YallaLiv ✅',
    'Bonus blindage : applications récentes → appui long sur YallaLiv → Épingler 🔒',
  ] },
  infinix: { icon: '📱', short: 'Infinix/Tecno', name: 'Infinix / Tecno / itel', steps: [
    'Ouvre l\'app « Phone Master » (ou Paramètres → Applications → YallaLiv)',
    'Démarrage auto → Active YallaLiv ✅',
    'Bonus blindage : applications récentes → appui long sur YallaLiv → Épingler 🔒',
  ] },
  huawei: { icon: '📱', short: 'Huawei/Honor', name: 'Huawei / Honor', steps: [
    'Paramètres → Batterie → Démarrage des applications',
    'YallaLiv → « Gérer manuellement » → active les 3 interrupteurs ✅',
    'Bonus blindage : applications récentes → appui long sur YallaLiv → Épingler 🔒',
  ] },
  samsung: { icon: '📱', short: 'Samsung', name: 'Samsung', steps: [
    'Normalement rien à faire ✅ (Samsung respecte le suivi)',
    'Vérifie juste : Paramètres → Applications → YallaLiv → Batterie → « Non restreint »',
    'Bonus blindage : applications récentes → appui long sur YallaLiv → Épingler 🔒',
  ] },
  other: { icon: '📱', short: 'Autre', name: 'Autre marque', steps: [
    'Applications récentes → appui long sur YallaLiv → Épingler 🔒',
    'Puis Paramètres → Applications → YallaLiv → cherche « Démarrage auto » / « Arrière-plan » → active',
  ] },
};
const detectBrand = () => {
  const ua = (navigator.userAgent || '');
  if (/xiaomi|redmi|poco/i.test(ua)) return 'xiaomi';
  if (/\bRMX\d/i.test(ua) || /realme/i.test(ua)) return 'oppo';
  if (/\bCPH\d/i.test(ua) || /oppo/i.test(ua)) return 'oppo';
  if (/vivo|iqoo/i.test(ua)) return 'vivo';
  if (/infinix|tecno|itel/i.test(ua)) return 'infinix';
  if (/huawei|honor/i.test(ua)) return 'huawei';
  if (/\bSM-[A-Z]\d/i.test(ua)) return 'samsung';
  return null; // inconnu → sélecteur manuel
};

function Top({ t, user, logout, online, onToggle, disabled, onAccount }) {
  return (
    <div className="topbar">
      <div className="logo">🛵</div>
      <div className="grow">
        <div className="brand-name" style={{ fontSize: 18 }}>{t('driver_title')}</div>
        <div className="muted small ellipsis">{user?.name} · {user?.vehicle}</div>
      </div>
      <LangSwitch />
      <BellButton />
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
