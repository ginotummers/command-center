'use client';
import { useState, useTransition } from 'react';
import { setSuggestion } from '../home-actions';

// Claude's finance suggestions (written during the daily sync), with Done / Dismiss
export default function FinanceSuggestions({ items }) {
  const [hidden, setHidden] = useState(() => new Set());
  const [, start] = useTransition();
  const act = (id, status) => {
    setHidden((h) => new Set(h).add(id));
    start(async () => { try { await setSuggestion(id, status); } catch { setHidden((h) => { const n = new Set(h); n.delete(id); return n; }); } });
  };
  const list = items.filter((i) => !hidden.has(i.id));
  if (!list.length) return null;
  return (
    <div className="sugg-grid">
      {list.map((s) => (
        <article key={s.id} className="sugg">
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><span className="sugg-ai">Claude</span><strong style={{ flex: 1 }}>{s.title}</strong></div>
          {s.body && <p style={{ margin: 0 }}>{s.body}</p>}
          {s.basis && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Based on: {s.basis}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn small" onClick={() => act(s.id, 'done')}>Done</button>
            <button type="button" className="btn ghost small" onClick={() => act(s.id, 'dismissed')}>Dismiss</button>
          </div>
        </article>
      ))}
    </div>
  );
}
