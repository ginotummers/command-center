'use client';
import { useState } from 'react';

// Copies just the given text (e.g. a to-do title) so it can be pasted into Akiflow
export default function CopyButton({ text, label = 'Copy title' }) {
  const [done, setDone] = useState(false);
  const copy = async (e) => {
    e.preventDefault(); e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch {} t.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 1500);
  };
  return (
    <button type="button" className={`copy-btn${done ? ' ok' : ''}`} onClick={copy} aria-label={`${label}: ${text}`} title={done ? 'Copied' : label}>
      {done ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
      )}
      <span className="sr-only" aria-live="polite">{done ? 'Copied' : ''}</span>
    </button>
  );
}
