import React, { useEffect, useRef, useState } from 'react';
import { api, useT, useAuth, fmtDate, toast } from './lib.jsx';
import { Modal } from './ui.jsx';

/**
 * Chat par commande : client ↔ magasin ↔ livreur.
 * order = commande complète (ou null pour fermer)
 */
export default function ChatModal({ order, onClose }) {
  const t = useT();
  const { user } = useAuth();
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState('');
  const boxRef = useRef(null);

  useEffect(() => {
    if (!order) { setMsgs(null); return; }
    let stopped = false;
    const markSeen = (list) => {
      const last = list[list.length - 1];
      if (last) localStorage.setItem('yl_seen_' + order.id, String(last.id));
    };
    const load = () => api(`/orders/${order.id}/messages`)
      .then((d) => { if (!stopped) { setMsgs(d.messages); markSeen(d.messages); } })
      .catch(() => {});
    load();
    const id = setInterval(load, 3000);
    return () => { stopped = true; clearInterval(id); };
  }, [order?.id]);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [msgs]);

  const send = async () => {
    const v = text.trim();
    if (!v || !order) return;
    setText('');
    try {
      await api(`/orders/${order.id}/messages`, { method: 'POST', body: { text: v } });
      const d = await api(`/orders/${order.id}/messages`);
      setMsgs(d.messages);
      const last = d.messages[d.messages.length - 1];
      if (last) localStorage.setItem('yl_seen_' + order.id, String(last.id));
    } catch (e) { toast(e.message, 'err'); }
  };

  if (!order) return null;
  return (
    <Modal open onClose={onClose} title={`💬 #${order.id} · ${order.store_name || order.client_name || ''}`}>
      <div className="chat-box" ref={boxRef}>
        {!msgs ? (
          <div className="muted small" style={{ textAlign: 'center', padding: 24 }}>…</div>
        ) : msgs.length === 0 ? (
          <div className="muted small" style={{ textAlign: 'center', padding: 24 }}>{t('chat_empty')}</div>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={'chat-msg' + (m.sender_id === user.id ? ' me' : '')}>
              <div className="bubble">{m.text}</div>
              <div className="who">
                {m.sender_id === user.id ? t('you') : `${m.sender_name}`} · {fmtDate(m.created_at)}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="row mt12">
        <input
          className="input grow" placeholder={t('write_msg')} value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn primary" onClick={send}>➤</button>
      </div>
    </Modal>
  );
}

/** Ligne "dernier message" + pastille non-lu pour une carte de commande */
export function LastMsgLine({ o }) {
  const { user } = useAuth();
  if (!o || !o.last_msg) return null;
  const seen = Number(localStorage.getItem('yl_seen_' + o.id) || 0);
  const unread = o.last_sender_id !== user.id && o.last_msg_id > seen;
  return (
    <div className="row mt4" style={{ gap: 6 }}>
      <span className="muted small ellipsis grow">💬 {o.last_msg}</span>
      {unread && <span className="chat-dot" />}
    </div>
  );
}
