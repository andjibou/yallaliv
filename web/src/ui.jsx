import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
import { useT, useLang, useCart, fmtMoney , useBackClose } from './lib.jsx';

/** Placeholder neutre pour un produit sans photo (aucun emoji). */
export function NoPhoto({ w = 46, h = 46, radius = 12, full = false, style }) {
  const s = full ? 26 : Math.max(14, Math.round(Math.min(w, h) * 0.52));
  return (
    <div style={{ width: full ? '100%' : w, height: h, borderRadius: radius, background: '#f1f5f9',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px dashed #e2e8f0', ...(style || {}) }}>
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8.5" cy="8.5" r="1.7" />
        <path d="M21 15.5l-4.5-4.5L7 20.5" />
      </svg>
    </div>
  );
}

/**
 * Barre de recherche avec suggestions automatiques pendant la frappe.
 * getSugs() -> [{key, icon, label, sub?, ...data}] ; onPick(suggestion).
 */
export function SuggestBox({ value, onChange, placeholder, getSugs, onPick, clearTitle }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const sugs = (value || '').trim() ? (getSugs() || []).slice(0, 6) : [];
  useEffect(() => {
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  return (
    <div ref={box} style={{ position: 'relative', flexGrow: 1 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <input className="input grow" placeholder={placeholder} value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setOpen(false); }} />
        {(value || '').trim() !== '' && (
          <button type="button" className="btn ghost sm" onClick={() => { onChange(''); setOpen(false); }} title={clearTitle || '✕'}>✕</button>
        )}
      </div>
      {open && sugs.length > 0 && (
        <div className="suggest-list">
          {sugs.map((s) => (
            <button type="button" key={s.key} className="suggest-item"
              onMouseDown={(e) => { e.preventDefault(); setOpen(false); onPick(s); }}>
              <span style={{ fontSize: 17 }}>{s.icon}</span>
              <span className="grow ellipsis">{s.label}</span>
              {s.sub && <span className="muted small ellipsis" style={{ maxWidth: '45%' }}>{s.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Capte tout crash de rendu -> carte d'erreur lisible au lieu d'un ecran blanc
export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error('ErrorBoundary:', err); }
  render() {
    if (this.state.err) {
      return (
        <div className="card mb12" style={{ border: '2px solid #ef4444', textAlign: 'center', padding: 18 }}>
          <div style={{ fontSize: 38 }}>😬</div>
          <div className="h2 mt8">Oups — cette section a eu un problème</div>
          <div className="muted small mt8" style={{ wordBreak: 'break-word' }}>{String(this.state.err?.message || this.state.err)}</div>
          <button className="btn primary mt12" onClick={() => this.setState({ err: null })}>🔄 Réessayer</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Modal({ open, onClose, title, children }) {
  // ← bouton retour (téléphone/navigateur) : ferme la fenêtre au lieu de quitter la page
  useBackClose(open, onClose);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="h2">{title}</div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const t = useT();
  const icons = { pending: '⏳', accepted: '👍', preparing: '🛠️', ready: '✅', assigned: '🛵', picked_up: '📦', delivered: '🎉', rejected: '❌', cancelled: '🚫', refused: '↩️' };
  return <span className={'badge st-' + (status === 'refused' ? 'cancelled' : status)}>{icons[status] || ''} {t('st_' + status)}</span>;
}

export function PayBadge({ o }) {
  const t = useT();
  return (
    <span className="badge pay-b">
      {o.payment === 'card' ? '💳' : '💵'} {o.payment === 'card' ? t('card') : t('cash')} · {o.paid ? t('paid') : t('unpaid')}
    </span>
  );
}

export function Stepper({ status }) {
  const t = useT();
  const steps = ['pending', 'accepted', 'preparing', 'ready', 'assigned', 'picked_up', 'delivered'];
  if (['rejected', 'cancelled', 'refused'].includes(status)) return null;
  const idx = steps.indexOf(status);
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <div key={s} className={'step' + (i < idx ? ' done' : i === idx ? ' now' : '')}>
          <div className="dot">{i < idx ? '✓' : i + 1}</div>
          <div className="lbl">{t('st_' + s)}</div>
        </div>
      ))}
    </div>
  );
}

export function Empty({ e = '🗂️', text }) {
  return <div className="empty"><div className="e">{e}</div>{text}</div>;
}

export function Spinner() { return <div className="spinner" />; }

export function BackBtn() {
  const t = useT();
  const nav = useNavigate();
  return <button className="icon-btn" onClick={() => nav(-1)} title={t('back')}>←</button>;
}

// Bottom navigation for the client app
export function BottomNav() {
  const t = useT();
  const { count } = useCart();
  const items = [
    { to: '/app', label: t('home'), icon: '🏠', end: true },
    { to: '/app/orders', label: t('my_orders'), icon: '🧾' },
    { to: '/app/profile', label: t('profile'), icon: '👤' }
  ];
  return (
    <nav className="bottomnav">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => 'bn-item' + (isActive ? ' on' : '')}>
          <span>{it.icon}</span>{it.label}
        </NavLink>
      ))}
      {count > 0 && null}
    </nav>
  );
}

// Floating cart bar (shown on store page)
export function CartBar() {
  const t = useT();
  const nav = useNavigate();
  const { count, subtotal, store } = useCart();
  const loc = useLocation();
  if (!count || loc.pathname.includes('/cart')) return null;
  return (
    <button className="cart-bar" onClick={() => nav('/app/cart')}>
      <span>🛒 {count}</span>
      <span className="ellipsis">{store?.name}</span>
      <span>· {fmtMoney(subtotal)} →</span>
    </button>
  );
}

// "Change store?" modal when adding a product from another store
export function SwapModal() {
  const t = useT();
  const { swap, confirmSwap, cancelSwap } = useCart();
  return (
    <Modal open={!!swap} onClose={cancelSwap} title={t('cart_replace_title')}>
      <p className="muted">{t('cart_replace_msg')}</p>
      <div className="row mt12">
        <button className="btn danger grow" onClick={confirmSwap}>{t('yes')}</button>
        <button className="btn ghost grow" onClick={cancelSwap}>{t('no')}</button>
      </div>
    </Modal>
  );
}

export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-switch">
      <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
      <button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>ع</button>
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    </div>
  );
}

export function Stars({ value = 0, onChange, size = 22 }) {
  return (
    <span className={'stars' + (onChange ? ' click' : '')} style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          className={'star' + (s <= value ? ' on' : '')}
          onClick={onChange ? () => onChange(s) : undefined}
        >{s <= value ? '★' : '☆'}</span>
      ))}
    </span>
  );
}
