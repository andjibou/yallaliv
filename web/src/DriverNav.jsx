import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, useT, usePoll } from './lib.jsx';
import RouteMap, { DualRouteMap } from './RouteMap.jsx';

const havM = (a, b) => {
  const R = 6371000, rd = Math.PI / 180;
  const dA = (b.lat - a.lat) * rd, dO = (b.lng - a.lng) * rd;
  const h = Math.sin(dA / 2) ** 2 + Math.cos(a.lat * rd) * Math.cos(b.lat * rd) * Math.sin(dO / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const fmtD = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m');
// Point d'ARRIVÉE de la commande : le magasin tant qu'elle n'est pas récupérée, le client ensuite
const destOf = (o) => (o.status === 'picked_up' ? { lat: o.client_lat, lng: o.client_lng } : { lat: o.store_lat, lng: o.store_lng });

/**
 * 🧭 v42 — NAVIGATION du livreur « comme Google » :
 * • bouton flottant FIXE (bas-droite), visible sur TOUTES les pages de l'espace livreur
 *   dès qu'il passe EN LIGNE ;
 * • clic → carte PLEIN ÉCRAN du pool « drout » (🤝 0 Maps JavaScript en plus : 1 seule
 *   carte / 12 h, réutilisée) : pastille collée au trajet, carte qui TOURN E avec le cap
 *   du livreur (tilt 0 : jamais de bâtiments 3D) ;
 * • bouton 📋 par-dessus la carte : la liste de ses livraisons, TRIÉE par proximité du
 *   point d'ARRIVÉE (la plus proche en premier) — il peut passer une commande en
 *   « récupérée », la marquer « livrée » ou refuser SANS fermer la carte ;
 * • une livraison qui lui est assignée en cours de route s'ajoute AUTOMATIQUEMENT à la
 *   liste (poll 4 s) et la carte recible directement la plus proche.
 */
export default function DriverNav({ online, pos, liveCtl, onAct, onPin, onRefuse }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const [orders, setOrders] = useState(null);
  const posRef = useRef(pos); posRef.current = pos;

  // 🔄 rafraîchissement auto (4 s) : une nouvelle livraison assignée apparaît SANS rien rouvrir
  usePoll(() => {
    if (!open) return;
    api('/driver/mine').then((d) => setOrders((d.orders || []).filter((o) => ['assigned', 'picked_up'].includes(o.status)))).catch(() => {});
  }, 4000);
  useEffect(() => {
    if (!open) return;
    api('/driver/mine').then((d) => setOrders((d.orders || []).filter((o) => ['assigned', 'picked_up'].includes(o.status)))).catch(() => {});
  }, [open]);

  // 🥇 tri par proximité du point d'ARRIVÉE : la livraison à laquelle il est le plus proche en premier
  const sorted = useMemo(() => {
    const p = posRef.current;
    const list = orders || [];
    if (!p) return list;
    return [...list].sort((a, b) => havM(p, destOf(a)) - havM(p, destOf(b)));
  }, [orders, pos?.lat, pos?.lng]);
  const target = sorted[0] || null;
  const navH = (typeof window !== 'undefined' ? window.innerHeight : 640) - 46;   // hauteur EXPLICITE : « 100% » se résolvait à 0 (chaîne de % cassée) → carte cachée

  if (!online) return null;

  const itemStyle = { background: '#f8fafc', borderRadius: 12, padding: 10, marginBottom: 8 };

  return (
    <>
      {/* bouton flottant FIXE — visible sur toutes les pages tant que le livreur est EN LIGNE */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Navigation"
          title="🧭 Navigation"
          style={{ position: 'fixed', bottom: 84, right: 14, zIndex: 70, width: 54, height: 54, borderRadius: '50%', border: 'none', background: '#0e9f6e', color: '#fff', fontSize: 24, lineHeight: '54px', textAlign: 'center', boxShadow: '0 4px 14px rgba(0,0,0,.35)', cursor: 'pointer', padding: 0 }}
        >🧭</button>
      )}

      {/* carte de NAVIGATION plein écran (pool « drout » : la MÊME carte que les vues trajet → 0 chargement en plus) */}
      {open && (
        <div className="dnav-full" style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#eef2f7' }}>
          {target && pos ? (
            target.status === 'assigned' ? (
              <DualRouteMap
                driverPos={pos}
                storePos={{ lat: target.store_lat, lng: target.store_lng }}
                clientPos={{ lat: target.client_lat, lng: target.client_lng }}
                live={liveCtl}
                poolKey="drout"
                orderId={target.id}
                height={navH}
              />
            ) : (
              <RouteMap
                from={pos}
                to={{ lat: target.client_lat, lng: target.client_lng }}
                live={liveCtl}
                poolKey="drout"
                orderId={target.id}
                height={navH}
              />
            )
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontWeight: 800, fontSize: 17 }}>
              {pos ? '🛵 Aucune livraison en cours' : '📡 GPS…'}
            </div>
          )}

          {/* ✕ fermer la navigation */}
          <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" style={{ position: 'absolute', top: 10, left: 10, zIndex: 90, width: 40, height: 40, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,.95)', fontSize: 18, boxShadow: '0 2px 8px rgba(0,0,0,.3)', cursor: 'pointer' }}>✕</button>

          {/* 📋 mes livraisons — SANS fermer la carte */}
          <button type="button" onClick={() => setShowList((v) => !v)} aria-label="Mes livraisons" title="📋 Mes livraisons" style={{ position: 'absolute', bottom: 18, right: 14, zIndex: 90, width: 52, height: 52, borderRadius: '50%', border: 'none', background: showList ? '#fff' : '#0e9f6e', color: showList ? '#0f172a' : '#fff', fontSize: 22, lineHeight: '52px', textAlign: 'center', boxShadow: '0 4px 14px rgba(0,0,0,.35)', cursor: 'pointer', padding: 0 }}>{showList ? '✕' : '📋'}</button>

          {showList && (
            <div style={{ position: 'absolute', bottom: 82, right: 14, zIndex: 90, width: 'min(340px, 92vw)', maxHeight: '55vh', overflowY: 'auto', background: '#fff', borderRadius: 16, padding: 12, boxShadow: '0 8px 30px rgba(0,0,0,.35)' }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>🛵 {t('my_deliveries')} ({sorted.length}) · 🥇 proximité</div>
              {sorted.length === 0 && <div className="muted small">—</div>}
              {sorted.map((o) => {
                const d = pos ? havM(pos, destOf(o)) : null;
                return (
                  <div key={o.id} style={itemStyle}>
                    <div className="row spread">
                      <b>{o.status === 'assigned' ? '📦' : '🏁'} #{o.id}</b>
                      <span className="badge" style={{ background: '#e0f2fe', color: '#075985' }}>{d != null ? fmtD(d) : ''}</span>
                    </div>
                    <div className="small muted mt4">📍 {o.status === 'assigned' ? o.store_name + ' — ' + (o.store_address || '') : o.address}</div>
                    <div className="row mt8" style={{ gap: 6 }}>
                      {o.status === 'assigned' && <button className="btn blue sm grow" onClick={() => onAct(o.id, 'picked_up')}>📦 {t('picked_up_btn')}</button>}
                      {o.status === 'picked_up' && (o.has_pin
                        ? <button className="btn primary sm grow" onClick={() => { setOpen(false); onPin(o); }}>🎉 {t('delivered_btn')} · 🔑</button>
                        : <button className="btn primary sm grow" onClick={() => onAct(o.id, 'delivered')}>🎉 {t('delivered_btn')}</button>)}
                      <button className="btn danger sm" onClick={() => { setOpen(false); onRefuse(o); }}>↩️</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
