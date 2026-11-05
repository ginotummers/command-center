'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

function ago(iso) {
  if (!iso) return 'never';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function SyncButton({ lastRun }) {
  const router = useRouter();
  const [run, setRun] = useState(lastRun);
  const [busy, setBusy] = useState(lastRun && ['requested', 'running'].includes(lastRun.status));
  const [error, setError] = useState(null);
  const timer = useRef(null);

  const poll = (id) => {
    clearInterval(timer.current);
    const started = Date.now();
    timer.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/sync?id=${id}`, { cache: 'no-store' }).then((x) => x.json());
        if (r.run) setRun(r.run);
        if (r.run && ['done', 'failed'].includes(r.run.status)) {
          clearInterval(timer.current); setBusy(false);
          if (r.run.status === 'failed') setError(r.run.summary || 'Sync failed');
          router.refresh();
        } else if (Date.now() - started > 8 * 60 * 1000) {
          clearInterval(timer.current); setBusy(false); setError('Sync is taking longer than usual. Refresh in a few minutes.');
        }
      } catch { /* keep polling */ }
    }, 6000);
  };

  useEffect(() => {
    if (busy && run?.id) poll(run.id);
    return () => clearInterval(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setError(null); setBusy(true);
    try {
      const r = await fetch('/api/sync', { method: 'POST' }).then((x) => x.json());
      if (!r.ok) { setBusy(false); setError(r.error || 'Could not start sync'); return; }
      setRun({ id: r.id, status: 'requested', requested_at: new Date().toISOString() });
      poll(r.id);
    } catch { setBusy(false); setError('Could not start sync'); }
  };

  const doneAt = run?.status === 'done' ? run.finished_at : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button className="btn" type="button" onClick={start} disabled={busy} aria-live="polite" style={busy ? { opacity: 0.8, cursor: 'progress' } : undefined}>
        {busy ? 'Syncing… (1–3 min)' : '↻ Sync now'}
      </button>
      <span className={error ? 'neg' : 'muted'} style={{ fontSize: 12, textAlign: 'right', maxWidth: 320 }}>
        {error || (busy ? 'Pulling calendar, Akiflow, email, meetings and Rize' : `Last synced ${ago(doneAt || (run?.status === 'done' ? run.requested_at : null))}${run?.summary && run?.status === 'done' ? ` · ${run.summary}` : ''}`)}
      </span>
    </div>
  );
}
