'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase-browser';
import { savePdfPage } from './actions';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38';

function Uploader({ userId, replacing = false, onDone }) {
  const [state, setState] = useState('idle');
  const router = useRouter();
  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { setState('type'); return; }
    setState('uploading');
    const { error } = await browserClient().storage.from('wish').upload(`${userId}/master-reference.pdf`, file, { contentType: 'application/pdf', upsert: true });
    if (error) { setState('error'); return; }
    setState('idle'); onDone?.(); router.refresh();
  };
  return (
    <label style={{ maxWidth: 420 }}>
      {replacing ? 'Replace the PDF' : 'Choose the Master Reference PDF'}
      <input type="file" accept="application/pdf" onChange={onPick} disabled={state === 'uploading'} />
      {state === 'uploading' && <span className="muted" aria-live="polite">Uploading…</span>}
      {state === 'type' && <span className="neg" role="alert">That file is not a PDF.</span>}
      {state === 'error' && <span className="neg" role="alert">Upload failed. Try again.</span>}
    </label>
  );
}

export default function PdfReader({ userId, url, downloadUrl, initialPage = 1 }) {
  const frame = useRef(null);
  const pagesRef = useRef(null);
  const docRef = useRef(null);
  const saveTimer = useRef(null);
  const [status, setStatus] = useState(url ? 'loading' : 'missing');
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [showReplace, setShowReplace] = useState(false);
  const restored = useRef(false);

  // Load pdf.js and the document
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    (async () => {
      try {
        const lib = await import(/* webpackIgnore: true */ `${PDFJS}/pdf.min.mjs`);
        lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
        const doc = await lib.getDocument({ url }).promise;
        if (cancelled) return;
        docRef.current = doc; setNumPages(doc.numPages); setStatus('ready');
      } catch { if (!cancelled) setStatus('fallback'); }
    })();
    return () => { cancelled = true; };
  }, [url]);

  // Track the available width so pages fit the screen
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [status]);

  // Render every page at the current width × zoom
  useEffect(() => {
    const doc = docRef.current;
    const box = pagesRef.current;
    if (status !== 'ready' || !doc || !box || !width) return;
    let cancelled = false;
    (async () => {
      const dpr = window.devicePixelRatio || 1;
      const canvases = box.querySelectorAll('canvas');
      for (let i = 1; i <= doc.numPages && !cancelled; i++) {
        const p = await doc.getPage(i);
        const base = p.getViewport({ scale: 1 });
        const scale = ((width - 24) / base.width) * zoom;
        const vp = p.getViewport({ scale: scale * dpr });
        const c = canvases[i - 1];
        if (!c) continue;
        c.width = vp.width; c.height = vp.height;
        c.style.width = `${vp.width / dpr}px`; c.style.height = `${vp.height / dpr}px`;
        await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.catch(() => {});
      }
      if (!restored.current && !cancelled) {
        restored.current = true;
        box.querySelector(`[data-page="${Math.min(initialPage, doc.numPages)}"]`)?.scrollIntoView({ block: 'start' });
      }
    })();
    return () => { cancelled = true; };
  }, [status, width, zoom, numPages, initialPage]);

  // Current page = the one most visible in the scroller; remember it
  useEffect(() => {
    const box = pagesRef.current;
    if (status !== 'ready' || !box) return;
    const io = new IntersectionObserver((entries) => {
      const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!best) return;
      const n = Number(best.target.dataset.page);
      setPage(n);
      if (restored.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => { savePdfPage(n).catch(() => {}); }, 1500);
      }
    }, { root: box, threshold: [0.25, 0.5, 0.75] });
    box.querySelectorAll('[data-page]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [status, numPages]);

  const goTo = useCallback((n) => {
    const t = Math.min(Math.max(1, n), numPages || 1);
    pagesRef.current?.querySelector(`[data-page="${t}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [numPages]);

  const fullscreen = () => {
    const el = frame.current;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else if (el?.requestFullscreen) el.requestFullscreen().catch(() => window.open(url, '_blank'));
    else window.open(url, '_blank');
  };

  if (status === 'missing') {
    return (
      <div className="empty" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <strong style={{ color: 'var(--ink)' }}>Add your Master Reference once</strong>
        <span>The PDF is stored in your private storage, not in the code, so only your account can open it. Upload it one time and it stays here.</span>
        <Uploader userId={userId} />
      </div>
    );
  }

  return (
    <div ref={frame} className="pdf-frame">
      <div className="pdf-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="btn ghost small" onClick={() => goTo(page - 1)} disabled={page <= 1} aria-label="Previous page">‹</button>
          <label className="pdf-page" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <span className="sr-only">Page</span>
            <input type="number" min={1} max={numPages || 1} value={page} onChange={(e) => goTo(Number(e.target.value))} style={{ width: 58, minHeight: 34, padding: '4px 8px' }} />
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>/ {numPages || '…'}</span>
          </label>
          <button type="button" className="btn ghost small" onClick={() => goTo(page + 1)} disabled={page >= numPages} aria-label="Next page">›</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="btn ghost small" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">−</button>
          <span className="muted" style={{ minWidth: 44, textAlign: 'center', fontSize: 13 }}>{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn ghost small" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">+</button>
          <button type="button" className="btn ghost small" onClick={fullscreen}>Full screen</button>
          <a className="btn ghost small" href={downloadUrl}>Download</a>
        </div>
      </div>
      {status === 'loading' && <p className="muted" style={{ padding: 24, textAlign: 'center' }}>Opening the Master Reference…</p>}
      {status === 'fallback' && (
        <iframe title="Master Reference" src={`${url}#page=${initialPage}`} style={{ width: '100%', height: '78vh', border: 0, borderRadius: 12, background: '#fff' }} />
      )}
      {status === 'ready' && (
        <div ref={pagesRef} className="pdf-pages">
          {Array.from({ length: numPages }, (_, i) => (
            <div key={i} data-page={i + 1} className="pdf-page-wrap"><canvas aria-label={`Page ${i + 1}`} /></div>
          ))}
        </div>
      )}
      <div style={{ padding: '10px 4px 0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12 }}>Your last page is remembered.</span>
        <button type="button" className="linkbtn" style={{ textDecoration: 'none' }} onClick={() => setShowReplace((v) => !v)}>{showReplace ? 'Cancel' : 'Replace PDF'}</button>
        {showReplace && <Uploader userId={userId} replacing onDone={() => setShowReplace(false)} />}
      </div>
    </div>
  );
}
