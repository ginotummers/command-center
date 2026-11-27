'use client';
import { useEffect, useRef, useState } from 'react';

const eur = (n) => `€${Math.round(Math.abs(n)).toLocaleString('en-GB')}`;
const dShort = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });

// A clickable line that opens a pop-up with the transactions behind it
// rows: [{ id, date, d (description), eur, bank, cat }]; sign: -1 when money out counts as positive (spending)
export default function Popup({ title, sub, rows = [], sign = -1, className, children, wide, body }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  const total = rows.reduce((a, r) => a + sign * Number(r.eur), 0);
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <button type="button" className={`pop-trigger ${className || ''}`} onClick={() => setOpen(true)}>{children}</button>
      <dialog ref={ref} className={`pop ${wide ? 'wide' : ''}`} onClose={() => setOpen(false)} onClick={(e) => { if (e.target === ref.current) setOpen(false); }}>
        {open && (
          <div className="pop-inner">
            <div className="pop-head">
              <div><h3 style={{ margin: 0 }}>{title}</h3>{(sub || rows.length > 0) && <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{sub || `${rows.length} transaction${rows.length === 1 ? '' : 's'} · ${total < 0 ? '−' : ''}${eur(total)}`}</p>}</div>
              <button type="button" className="pop-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            </div>
            {body}
            {rows.length > 0 && (
              <div className="pop-list">{sorted.map((r) => {
                const v = sign * Number(r.eur);
                return (
                  <div key={r.id} className="pop-row">
                    <span className="muted" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{dShort(r.date)}</span>
                    <span style={{ minWidth: 0 }}>{r.d}{r.cat ? <span className="tag" style={{ marginLeft: 6 }}>{r.cat}</span> : null}<span className="muted" style={{ fontSize: 11, textTransform: 'capitalize', display: 'block' }}>{r.bank}</span></span>
                    <strong className={v < 0 ? 'pos' : ''} style={{ whiteSpace: 'nowrap' }}>{v < 0 ? '+' : ''}{eur(v)}</strong>
                  </div>
                );
              })}</div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
