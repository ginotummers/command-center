'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Small "i" button that opens a panel explaining how a page works
export default function InfoButton({ title, children }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; btn.current?.focus(); };
  }, [open]);
  return (
    <>
      <button ref={btn} type="button" className="info-btn" onClick={() => setOpen(true)} aria-label={`How this page works: ${title}`} title="How this page works">i</button>
      {open && createPortal(
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div ref={panel} tabIndex={-1} className="modal info-panel" role="dialog" aria-modal="true" aria-labelledby="info-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h2 id="info-title" style={{ flex: 1, margin: 0 }}>{title}</h2>
              <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div className="info-body">{children}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
