'use client';
import { useEffect, useRef, useState } from 'react';
import { handleReminder } from '../wish/actions';
import { REMINDER_COPY } from '@/lib/wish';

// One reminder pop-up at a time; the server decides which one (if any) is due
export default function WishReminder({ kind }) {
  const [open, setOpen] = useState(!!kind);
  const cta = useRef(null);
  const copy = REMINDER_COPY[kind];

  const close = (action) => {
    setOpen(false);
    handleReminder(kind, action).catch(() => {});
  };

  useEffect(() => {
    if (!open) return;
    cta.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') close('snoozed'); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !copy) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close('snoozed'); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="wish-reminder-title">
        <p className="overline" style={{ color: 'var(--gold)' }}>Your Wish Is Your Command</p>
        <h2 id="wish-reminder-title">{copy.title}</h2>
        <p style={{ margin: 0 }}>{copy.body}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
          <a ref={cta} className="btn" href={copy.href} onClick={async (e) => { e.preventDefault(); await handleReminder(kind, 'opened').catch(() => {}); window.location.href = copy.href; }}>{copy.cta}</a>
          <button type="button" className="btn ghost" onClick={() => close('snoozed')}>Later</button>
          <button type="button" className="linkbtn" onClick={() => close('dismissed')}>Dismiss for {kind === 'weekly' ? 'this week' : 'today'}</button>
        </div>
      </div>
    </div>
  );
}
