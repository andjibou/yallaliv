import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { addBaseLayers } from './mapTiles.js';
import { useT, toast } from './lib.jsx';

/** Géocodage inverse gratuit (Nominatim) : coordonnées → adresse lisible */
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fr`);
    const d = await res.json();
    return d.display_name || null;
  } catch { return null; }
}

/**
 * Sélecteur de position façon Uber :
 * l'épingle 📌 reste FIXE au centre — l'utilisateur déplace la carte.
 * Aperçu automatique de l'adresse trouvée à l'arrêt du déplacement.
 */
export default function PickMap({ initial, onConfirm }) {
  const t = useT();
  const el = useRef(null);
  const map = useRef(null);
  const tm = useRef(null);
  const [pos, setPos] = useState(initial);
  const [addr, setAddr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true }).setView([initial.lat, initial.lng], 16);
    addBaseLayers(map.current);   // 🗺️ v2026.09.23.5 : Plan/Satellite + mémoire du choix

    const upd = () => {
      const c = map.current.getCenter();
      setPos({ lat: c.lat, lng: c.lng });
    };
    map.current.on('move', upd);
    map.current.on('moveend', () => {
      setAddr(null);
      clearTimeout(tm.current);
      tm.current = setTimeout(async () => {
        const c = map.current.getCenter();
        setAddr(await reverseGeocode(c.lat, c.lng));
      }, 350);
    });
    setTimeout(() => map.current?.invalidateSize(), 60);
    return () => { clearTimeout(tm.current); map.current?.remove(); map.current = null; };
  }, []);

  const goToMe = () => {
    if (!navigator.geolocation) return toast(t('gps_fail'), 'err');
    navigator.geolocation.getCurrentPosition(
      (p) => map.current?.setView([p.coords.latitude, p.coords.longitude], 16),
      () => toast(t('gps_fail'), 'err'),
      { timeout: 6000 }
    );
  };

  const confirm = async () => {
    setBusy(true);
    const address = addr || (await reverseGeocode(pos.lat, pos.lng));
    setBusy(false);
    onConfirm({ ...pos, address });
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div ref={el} style={{ height: 320, borderRadius: 14, border: '1px solid #e3e9f0', background: '#eef2f7' }} />
        {/* épingle FIXE au centre — seule la carte bouge */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -100%)',
          fontSize: 36, lineHeight: '36px', pointerEvents: 'none',
          filter: 'drop-shadow(0 4px 5px rgba(0,0,0,.45))', zIndex: 500
        }}>📌</div>
        <button className="btn ghost sm" onClick={goToMe}
          style={{ position: 'absolute', bottom: 10, insetInlineEnd: 10, zIndex: 500 }}>
          🛰️ {t('use_gps')}
        </button>
      </div>
      <p className="muted small mt8">{t('pin_hint')}</p>
      {addr && <div className="banner ok" style={{ marginTop: 8 }}>📍 {addr}</div>}
      <button className="btn primary block mt8" disabled={busy} onClick={confirm}>
        {busy ? '🔎 ' + t('locating') : '✅ ' + t('confirm_location')}
      </button>
    </div>
  );
}
