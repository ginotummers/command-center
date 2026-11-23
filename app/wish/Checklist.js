'use client';
import { useEffect, useState, useTransition } from 'react';
import { toggleCheck } from './actions';
import { PRACTICE_STEPS, FORMULA } from '@/lib/wish';

const SOURCE_LABEL = { tracker: 'Master Reference', formula: 'Master Reference', personal: 'My routine' };

function Item({ item, checked, onToggle, pending }) {
  const id = `chk-${item.id}`;
  return (
    <li className={`wish-item${checked ? ' done' : ''}`}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onToggle(item.id, e.target.checked)} disabled={pending} />
      <label htmlFor={id} className="wish-item-text">
        <span>{item.text}</span>
        <span className="wish-meta">
          <span className={`wish-src ${item.source === 'personal' ? 'own' : ''}`}>{SOURCE_LABEL[item.source]}</span>
          {item.ref ? <span>{item.ref}</span> : null}
        </span>
        {item.note ? <span className="wish-note">{item.note}</span> : null}
      </label>
      {item.link === 'board' && <a className="wish-jump" href="/wish?tab=dreams#board">Vision Board →</a>}
      {item.practice && (
        <details className="wish-steps">
          <summary>Show the steps</summary>
          <ol>{PRACTICE_STEPS.map(([t, d]) => <li key={t}><strong>{t}.</strong> {d}</li>)}</ol>
          <details className="wish-steps inner">
            <summary>The full Manifesting Formula (Master Reference, Section 7)</summary>
            <ol>{FORMULA.map(([t, d], i) => <li key={t} className={i >= 7 && i <= 9 ? 'hl' : ''}><strong>{t}.</strong> {d}</li>)}</ol>
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Steps 1–7 you set up once (on paper). Steps 8–10 are this daily practice; 11–12 are what you keep doing.</p>
          </details>
        </details>
      )}
    </li>
  );
}

// sections: [{ id, title, blurb, items, defaultOpen }]
export default function Checklist({ periodType, periodStart, sections, initialChecked }) {
  const [checked, setChecked] = useState(() => new Set(initialChecked));
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(() => Object.fromEntries(sections.map((s) => [s.id, !!s.defaultOpen])));

  // Opening /wish?tab=daily#evening expands and scrolls to that section
  useEffect(() => {
    const h = window.location.hash.replace('#', '');
    if (h && sections.some((s) => s.id === h)) {
      setOpen((o) => ({ ...o, [h]: true }));
      setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }, [sections]);

  const onToggle = (itemId, value) => {
    setError(null);
    setChecked((prev) => { const n = new Set(prev); value ? n.add(itemId) : n.delete(itemId); return n; });
    startTransition(async () => {
      try { await toggleCheck(periodType, periodStart, itemId, value); }
      catch {
        setChecked((prev) => { const n = new Set(prev); value ? n.delete(itemId) : n.add(itemId); return n; });
        setError('Could not save that tick. Check your connection and try again.');
      }
    });
  };

  return (
    <div className="wish-sections">
      {error && <p className="neg" role="alert" style={{ margin: 0 }}>{error}</p>}
      {sections.map((s) => {
        const done = s.items.filter((i) => checked.has(i.id)).length;
        const total = s.items.length;
        const isOpen = open[s.id];
        return (
          <section key={s.id} id={s.id} className="wish-section">
            <button type="button" className="wish-section-head" aria-expanded={isOpen} aria-controls={`${s.id}-list`} onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}>
              <span className="wish-chev" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="wish-section-title">{s.title}</span>
                {s.blurb ? <span className="muted wish-section-blurb">{s.blurb}</span> : null}
              </span>
              <span className={`wish-count${done === total ? ' complete' : ''}`}>{done === total ? '✓ ' : ''}{done}/{total}</span>
            </button>
            <div className="track" style={{ height: 4, margin: '0 0 2px' }} role="progressbar" aria-label={`${s.title} progress`} aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
              <div className="bar" style={{ height: 4, width: `${(done / total) * 100}%`, transition: 'width .25s' }} />
            </div>
            {isOpen && (
              <ul id={`${s.id}-list`} className="wish-list">
                {s.items.map((it) => <Item key={it.id} item={it} checked={checked.has(it.id)} onToggle={onToggle} pending={false} />)}
              </ul>
            )}
          </section>
        );
      })}
      {pending && <span className="muted" style={{ fontSize: 12 }} aria-live="polite">Saving…</span>}
    </div>
  );
}
