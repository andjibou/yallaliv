import React, { useState } from 'react';
import { api, useT, useAuth, toast , FieldErr, V, runV, hasErr } from './lib.jsx';

/**
 * Parametres du compte (tous roles) : identite (nom, email, telephone)
 * + changement de mot de passe (avec verification de l'actuel).
 */
export default function AccountSettings() {
  const t = useT();
  const { user, setUser } = useAuth();
  const [f, setF] = useState({ name: user?.name || '', phone: user?.phone || '', email: user?.email || '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const [e1, setE1] = useState({});   // erreurs infos perso
  const [e2, setE2] = useState({});   // erreurs mot de passe
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const saveData = async () => {
    const v = V(t);
    const e = runV({ name: v.name(t('name')), phone: v.phone(), email: v.emailOpt() }, f);
    setE1(e);
    if (hasErr(e)) return;
    setBusy(true);
    try {
      const d = await api('/auth/profile', { method: 'PUT', body: f });
      setUser(d.user);
      toast(t('data_saved'));
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };
  const savePw = async () => {
    const v = V(t);
    const e = runV({ current: v.req(t('current_password')), next: v.pass(5) }, pw);
    setE2(e);
    if (hasErr(e)) return;
    setBusy(true);
    try {
      await api('/auth/password', { method: 'PUT', body: pw });
      toast(t('password_changed'));
      setPw({ current: '', next: '' });
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };

  return (
    <div>
      <div className="label mb8">👤 {t('account_info')}</div>
      <div className="field">
        <label className="label">{t('name')}</label>
        <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="ex. : Ahmed Ali" />
          <FieldErr e={e1.name} />
      </div>
      <div className="field">
        <label className="label">{t('email')}</label>
        <input className="input" type="email" dir="ltr" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="ex. : nom@gmail.com" />
          <FieldErr e={e1.email} />
      </div>
      <div className="field">
        <label className="label">{t('phone')}</label>
        <input className="input" dir="ltr" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="ex. : 0100 123 4567" />
          <FieldErr e={e1.phone} />
      </div>
      <button className="btn primary block" disabled={busy || !f.name.trim() || !f.email.includes('@')} onClick={saveData}>
        💾 {t('save')}
      </button>

      <div className="label mb8 mt16">🔑 {t('change_password')}</div>
      <div className="field">
        <label className="label">{t('current_password')}</label>
        <input className="input" type="password" dir="ltr" value={pw.current} onChange={(e) => setPw((x) => ({ ...x, current: e.target.value }))} />
          <FieldErr e={e2.current} />
      </div>
      <div className="field">
        <label className="label">{t('new_password')}</label>
        <input className="input" type="password" dir="ltr" value={pw.next} onChange={(e) => setPw((x) => ({ ...x, next: e.target.value }))} placeholder="5 caractères minimum" />
          <FieldErr e={e2.next} />
      </div>
      <button className="btn blue block" disabled={busy || !pw.current || pw.next.length < 5} onClick={savePw}>
        🔑 {t('change_password')}
      </button>
    </div>
  );
}
