import React, { useEffect, useState } from 'react';

/**
 * Plein écran pour les cartes Leaflet (marchand, livreur, client).
 * ⛶ ouvre la carte sur TOUT l'écran — idéal pour suivre les trajets.
 * ✕ (ou touche Échap) referme. La carte est redimensionnée proprement (invalidateSize).
 */
export function useMapFullscreen(mapRef) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 90);
    return () => clearTimeout(t);
  }, [full]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { full, toggle: () => setFull((v) => !v) };
}

/** Style du conteneur carte en mode plein écran. */
export const FS_STYLE = {
  position: 'fixed', inset: 0, width: '100vw', height: '100vh',
  zIndex: 9990, borderRadius: 0, border: 'none', background: '#eef2f7'
};

/** Bouton flottant ⛶ / ✕ (coin haut-droit de la carte). */
export function FsBtn({ full, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={full ? 'Quitter le plein écran' : 'Carte en plein écran'}
      title={full ? 'Quitter le plein écran' : 'Plein écran'}
      style={{
        position: 'absolute', top: 8, right: 8, zIndex: 1100,
        width: 36, height: 36, borderRadius: 10, border: 'none',
        background: 'rgba(255,255,255,.95)', color: '#0f172a',
        boxShadow: '0 2px 8px rgba(0,0,0,.3)', fontSize: 17, lineHeight: '36px',
        textAlign: 'center', cursor: 'pointer', padding: 0
      }}
    >{full ? '✕' : '⛶'}</button>
  );
}
