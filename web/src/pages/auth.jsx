import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useT, useAuth, useLang, homeFor, toast, api , FieldErr, V, runV, hasErr } from '../lib.jsx';
import { LangSwitch, Spinner, Modal } from '../ui.jsx';

function Brand({ t, small }) {
  return (
    <div className="login-hero">
      <div className="row">
        <div className="logo" style={{ width: 52, height: 52, fontSize: 27 }}>🚀</div>
        <div className="grow">
          <div className="brand-name" style={{ fontSize: 26 }}>Yalla<span className="accent" style={{ color: '#a7f3d0' }}>Liv</span></div>
          <div style={{ fontSize: 13.5, opacity: .92 }}>{t('tagline')}</div>
        </div>
      </div>
      {!small && (
        <div className="row mt12" style={{ gap: 16, fontSize: 21, opacity: .95 }}>
          <span>🍽️</span><span>🛒</span><span>💊</span><span>🛵</span>
        </div>
      )}
    </div>
  );
}

const DEMOS = [
  { icon: '👑', label: 'Super Admin', email: 'admin@yallaliv.com', pass: 'admin123' },
  { icon: '🏪', label: 'Magasin (Resto Al Nil)', email: 'resto@demo.com', pass: 'demo123' },
  { icon: '🛵', label: 'Livreur', email: 'livreur@demo.com', pass: 'demo123' },
  { icon: '🛍️', label: 'Client', email: 'client@demo.com', pass: 'demo123' }
];

// Chronomètre anti brute-force : l'utilisateur VOIT le temps restant avant de pouvoir réessayer
function useRetryLock() {
  const [lockUntil, setLockUntil] = useState(0);
  const [, force] = useState(0);
  useEffect(() => {
    if (lockUntil <= Date.now()) return;
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [lockUntil]);
  const left = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
  const fmt = () => String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
  return { locked: left > 0, fmt, catch: (ex) => { if (ex.retryAfter) setLockUntil(Date.now() + ex.retryAfter * 1000); } };
}
function RetryBanner({ lock, t }) {
  if (!lock.locked) return null;
  return <div className="banner warn mt8">⏳ {t('retry_in')} <b dir="ltr">{lock.fmt()}</b></div>;
}

// Bouton officiel « Continuer avec Google » (Google Identity Services).
// Affiché uniquement si GOOGLE_CLIENT_ID est configuré côté serveur. Silencieux sinon.
function GoogleButton({ onDone }) {
  const t = useT();
  const ref = useRef(null);
  const [cfg, setCfg] = useState(undefined);   // undefined=chargement · null=non configuré · 'xxx'=OK
  useEffect(() => {
    api('/auth/google-client-id').then((d) => setCfg(d.client_id)).catch(() => setCfg(null));
  }, []);
  useEffect(() => {
    if (!cfg || !ref.current) return;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      if (!window.google?.accounts?.id || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: cfg,
        callback: async (resp) => {
          try {
            const d = await api('/auth/google', { method: 'POST', body: { credential: resp.credential } });
            onDone(d);
          } catch (ex) { toast(ex.message, 'err'); }
        }
      });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 290 });
    };
    document.head.appendChild(s);
    return () => { s.remove(); };
  }, [cfg]);
  if (cfg === null) return null;
  return <div ref={ref} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} title={t('or_continue')} />;
}

// Comptes de démonstration : visibles uniquement en développement local (jamais en ligne)
const SHOW_DEMOS = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);

export function Login() {
  const t = useT();
  const nav = useNavigate();
  const { login, user, setUser } = useAuth();
  const lock = useRetryLock();
  const finishGoogle = (d) => {
    localStorage.setItem('yl_token', d.token);
    setUser(d.user);
    toast(t('welcome_back') + ' ' + d.user.name + ' 👋');
    nav(homeFor(d.user));
  };
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [fErr, setFErr] = useState({});   // ⚠️ erreurs par champ (connexion / oublié)
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(null); // {step, email, devCode, busy}
  const [fForm, setFForm] = useState({ email: '', code: '', np: '' });

  const sendCode = async () => {
    const emErr = V(t).email()(fForm.email);
    setFErr({ email: emErr });
    if (emErr) return;
    setForgot((f) => ({ ...f, busy: true }));
    try {
      const r = await api('/auth/forgot', { method: 'POST', body: { email: fForm.email } });
      setForgot({ step: 2, email: fForm.email, devCode: r.dev_code || null, busy: false });
    } catch (ex) { lock.catch(ex); toast(ex.message, 'err'); setForgot((f) => ({ ...f, busy: false })); }
  };
  const doReset = async () => {
    setForgot((f) => ({ ...f, busy: true }));
    try {
      if (fForm.code.replace(/\D/g, '').length < 6) return toast('Code à 6 chiffres requis (ex. : 123456)', 'err');
      if (String(fForm.np || '').length < 5) return toast(V(t).pass()(fForm.np), 'err');
      await api('/auth/reset', { method: 'POST', body: { email: forgot.email, code: fForm.code, new_password: fForm.np } });
      toast(t('reset_ok'));
      setForgot(null);
      setFForm({ email: '', code: '', np: '' });
    } catch (ex) { toast(ex.message, 'err'); setForgot((f) => ({ ...f, busy: false })); }
  };

  if (user) return <div className="center-screen"><Spinner /></div>;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const v = V(t);
    const fe = runV({ email: v.req(t('email_or_phone')), pass: v.req(t('password')) }, { email, pass });
    setFErr(fe);
    if (hasErr(fe)) return;
    setBusy(true);
    try {
      const u = await login(email, pass);
      nav(homeFor(u));
    } catch (ex) { lock.catch(ex); setErr(ex.message); }
    setBusy(false);
  };

  return (
    <div className="auth-wrap">
      <Brand t={t} />
      <div className="card">
        <div className="h2 mb12">{t('login_title')}</div>
        {err && <div className="banner err">{err}</div>}
        <RetryBanner lock={lock} t={t} />
        <form onSubmit={submit}>
          <div className="field">
            <label className="label">{t('email_or_phone')}</label>
            <input className="input" type="text" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nom@email.com · +20 100 000 0000" />
            <FieldErr e={fErr.email} />
          </div>
          <div className="field">
            <label className="label">{t('password')}</label>
            <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} required placeholder="••••••" />
            <FieldErr e={fErr.pass} />
          </div>
          <button className="btn primary block" disabled={busy || lock.locked}>{busy ? '...' : lock.locked ? '⏳ ' + lock.fmt() : t('btn_login')}</button>
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button type="button" className="btn ghost sm" onClick={() => { setFForm((f) => ({ ...f, email: email || '' })); setForgot({ step: 1 }); }}>🔑 {t('forgot_password')}</button>
          </div>
        </form>
        <div className="row spread mt12 small">
          <span className="muted">{t('no_account')}</span>
          <Link to="/register" style={{ color: 'var(--brand)', fontWeight: 700 }}>{t('link_register')}</Link>
        </div>
        <div className="muted small" style={{ textAlign: 'center', margin: '12px 0 6px' }}>— {t('or_continue')} —</div>
        <GoogleButton onDone={finishGoogle} />
      </div>

      {SHOW_DEMOS && (
      <div className="mt16">
        <div className="muted small mb8" style={{ fontWeight: 700 }}>🧪 {t('demo_accounts')}</div>
        {DEMOS.map((d) => (
          <button key={d.email} type="button" className="demo-chip" onClick={() => { setEmail(d.email); setPass(d.pass); }}>
            <span>{d.icon} <b>{d.label}</b></span>
            <span className="muted">{d.email}</span>
          </button>
        ))}
      </div>
      )}

      <div className="row spread mt16">
        <LangSwitch />
      </div>
      <div style={{ textAlign: 'center', marginTop: 8 }}><Link to="/legal" className="muted small">⚖️ {t('cgu_link')}</Link></div>

      <Modal open={!!forgot} onClose={() => setForgot(null)} title={'🔑 ' + t('reset_title')}>
        {forgot?.step === 1 && (
          <>
            <p className="muted small">{t('reset_desc')}</p>
            <div className="field">
              <label className="label">{t('email')}</label>
              <input className="input" type="email" dir="ltr" value={fForm.email} onChange={(e) => setFForm((f) => ({ ...f, email: e.target.value }))} placeholder="ex. : nom@gmail.com" />
              <FieldErr e={fErr.email} />
            </div>
            <RetryBanner lock={lock} t={t} />
            <button className="btn primary block" disabled={forgot.busy || lock.locked || !fForm.email.includes('@')} onClick={sendCode}>{forgot.busy ? '...' : lock.locked ? '⏳ ' + lock.fmt() : '📨 ' + t('send_code')}</button>
          </>
        )}
        {forgot?.step === 2 && (
          <>
            <div className="banner ok mb12">📨 {t('code_sent')} <b dir="ltr">{forgot.email}</b></div>
            {forgot.devCode && (
              <div className="banner warn mb12">💻 {t('dev_code_note')} <b style={{ fontSize: 18, letterSpacing: 3 }} dir="ltr">{forgot.devCode}</b></div>
            )}
            <div className="field">
              <label className="label">{t('reset_code')}</label>
              <input className="input" dir="ltr" inputMode="numeric" maxLength={6} value={fForm.code} onChange={(e) => setFForm((f) => ({ ...f, code: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">{t('new_password')}</label>
              <input className="input" type="password" dir="ltr" value={fForm.np} onChange={(e) => setFForm((f) => ({ ...f, np: e.target.value }))} />
            </div>
            <button className="btn primary block" disabled={forgot.busy || fForm.code.length !== 6 || fForm.np.length < 5} onClick={doReset}>{forgot.busy ? '...' : '✅ ' + t('reset_ok_btn')}</button>
          </>
        )}
      </Modal>
    </div>
  );
}

export function Register() {
  const t = useT();
  const { lang } = useLang();
  const nav = useNavigate();
  const { register, setUser } = useAuth();
  const lock = useRetryLock();
  const [step, setStep] = useState(1);        // 1 = formulaire · 2 = code de confirmation email
  const [devCode, setDevCode] = useState(null);
  const [code, setCode] = useState('');
  const finishGoogle = (d) => {
    localStorage.setItem('yl_token', d.token);
    setUser(d.user);
    toast(t('welcome_back') + ' ' + d.user.name + ' 👋');
    nav(homeFor(d.user));
  };

  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [via, setVia] = useState('email');   // inscription par email ou par téléphone
  const [pass2, setPass2] = useState('');     // confirmation du mot de passe
  const [err, setErr] = useState('');
  const [rErr, setRErr] = useState({});   // ⚠️ erreurs par champ (inscription)
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const body = () => ({
    name: form.name,
    email: via === 'email' ? form.email.trim() : '',
    phone: via === 'phone' ? form.phone.trim() : '',
    password: form.password,
    role: 'client'
  });

  const submit = async (e) => {
    e?.preventDefault?.();
    setErr('');
    const v = V(t);
    const fe = runV({
      name: v.name(t('name')),
      ...(via === 'email' ? { email: v.email(t('email')) } : { phone: v.phone(t('phone')) }),
      password: v.pass(5),
      pass2: (x) => (x !== form.password ? t('password_mismatch') : null),
    }, { ...form, pass2 });
    setRErr(fe);
    if (hasErr(fe)) return;
    if (form.password !== pass2) return setErr(t('password_mismatch'));   // les 2 saisies doivent correspondre
    setBusy(true);
    try {
      // Tout compte commence CLIENT. Le magasin se crée via « Devenir partenaire » (profil client).
      if (via === 'email') {
        // Etape 1 : le serveur envoie un code de confirmation à l'email (en local, le code s'affiche)
        const r = await api('/auth/register', { method: 'POST', body: body() });
        if (r.need_code) { setDevCode(r.dev_code || null); setCode(''); setStep(2); }
      } else {
        const u = await register(body());   // telephone : creation directe
        toast(t('welcome_back') + ' ' + u.name + ' 👋');
        nav(homeFor(u));   // -> /app
      }
    } catch (ex) { lock.catch(ex); setErr(ex.message); }
    setBusy(false);
  };

  const verify = async () => {
    setErr(''); setBusy(true);
    try {
      const d = await api('/auth/register/verify', { method: 'POST', body: { ...body(), code } });
      localStorage.setItem('yl_token', d.token);
      setUser(d.user);
      toast(t('welcome_back') + ' ' + d.user.name + ' 👋');
      nav(homeFor(d.user));
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <div className="auth-wrap">
      <Brand t={t} small />
      <div className="card">
        <div className="h2 mb12">{t('register_title')}</div>
        {err && <div className="banner err">{err}</div>}
        <RetryBanner lock={lock} t={t} />
        {step === 2 ? (
          <>
            <div className="banner ok mb12">📨 {t('code_sent_to')} <b dir="ltr">{form.email}</b></div>
            {devCode && (
              <div className="banner warn mb12">💻 {t('dev_code_note')} <b style={{ fontSize: 18, letterSpacing: 3 }} dir="ltr">{devCode}</b></div>
            )}
            <div className="field">
              <label className="label">{t('reset_code')}</label>
              <input className="input" dir="ltr" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="------" style={{ letterSpacing: 4, fontSize: 18, textAlign: 'center' }} />
            </div>
            <button className="btn primary block" disabled={busy || code.length < 6} onClick={verify}>{busy ? '...' : t('verify_create_btn')}</button>
            <div className="row spread mt8 small">
              <button type="button" className="btn ghost sm" onClick={() => setStep(1)}>← {t('edit')}</button>
              <button type="button" className="btn ghost sm" disabled={busy} onClick={submit}>📨 {t('resend_code')}</button>
            </div>
          </>
        ) : (
        <>
        <GoogleButton onDone={finishGoogle} />
        <div className="muted small" style={{ textAlign: 'center', margin: '10px 0' }}>— {t('or_continue')} —</div>
        <form onSubmit={submit}>
          <div className="field">
            <label className="label">{t('name')}</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="ex. : Ahmed Ali" />
            <FieldErr e={rErr.name} />
          </div>
          <div className="row mb12" style={{ gap: 8 }}>
            <button type="button" className={'chip' + (via === 'email' ? ' on' : '')} onClick={() => setVia('email')}>📧 {t('via_email')}</button>
            <button type="button" className={'chip' + (via === 'phone' ? ' on' : '')} onClick={() => setVia('phone')}>📞 {t('via_phone')}</button>
          </div>
          {via === 'email' ? (
            <div className="field">
              <label className="label">{t('email')}</label>
              <input className="input" type="email" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} required placeholder="ex. : nom@gmail.com" />
              <FieldErr e={rErr.email} />
            </div>
          ) : (
            <div className="field">
              <label className="label">{t('phone')}</label>
              <input className="input" type="tel" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} required placeholder="ex. : 0100 123 4567" />
              <FieldErr e={rErr.phone} />
              <div className="muted small mt4">{t('phone_no_email_note')}</div>
            </div>
          )}
          <div className="field">
            <label className="label">{t('password')}</label>
            <input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={5} placeholder="5 caractères minimum" />
            <FieldErr e={rErr.password} />
          </div>
          <div className="field">
            <label className="label">{t('confirm_password')}</label>
            <input className="input" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} required minLength={5} />
            <FieldErr e={rErr.pass2} />
            {pass2 && form.password && pass2 !== form.password && (
              <div className="banner err mt4" style={{ padding: '5px 10px' }}>⚠️ {t('password_mismatch')}</div>
            )}
          </div>

          <button className="btn primary block" disabled={busy || form.password !== pass2}>{busy ? '...' : t('btn_register')}</button>
          <p className="muted small mt8" style={{ textAlign: 'center', marginBottom: 0 }}>{t('partner_hint')}</p>
        </form>
        </>
        )}
        <div className="row spread mt12 small">
          <span className="muted">{t('have_account')}</span>
          <Link to="/login" style={{ color: 'var(--brand)', fontWeight: 700 }}>{t('link_login')}</Link>
        </div>
      </div>
      <div className="row spread mt16"><LangSwitch /><span className="muted small">{lang === 'ar' ? '🚀 يلا ليف' : '🚀 YallaLiv'}</span></div>
      <div style={{ textAlign: 'center', marginTop: 8 }}><Link to="/legal" className="muted small">⚖️ {t('cgu_link')}</Link></div>
    </div>
  );
}
