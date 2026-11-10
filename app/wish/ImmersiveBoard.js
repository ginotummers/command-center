'use client';
import { useEffect, useState } from 'react';

// Full-screen, distraction-free view of the Vision Board
export default function ImmersiveBoard({ items }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);
  if (!items.length) return null;
  const chief = items.find((i) => i.is_chief);
  const rest = items.filter((i) => !i.is_chief);
  return (
    <>
      <button type="button" className="btn small" onClick={() => setOpen(true)}>Immersive view</button>
      {open && (
        <div className="immersive" role="dialog" aria-modal="true" aria-label="Vision Board">
          <button type="button" className="btn ghost small immersive-close" onClick={() => setOpen(false)}>Close</button>
          {chief && (
            <figure className="immersive-chief">
              <img src={chief.url} alt={chief.title || 'Chief Aim'} />
              <figcaption><span className="overline" style={{ color: 'var(--gold)' }}>Chief Aim</span>{chief.title ? <strong>{chief.title}</strong> : null}</figcaption>
            </figure>
          )}
          <div className="immersive-grid">
            {rest.map((i) => (
              <figure key={i.id}>
                <img src={i.url} alt={i.title || ''} />
                {i.title ? <figcaption>{i.title}</figcaption> : null}
              </figure>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
