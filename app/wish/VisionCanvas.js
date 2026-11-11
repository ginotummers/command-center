'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browserClient } from '@/lib/supabase-browser';
import { shrink } from './ImageInput';
import { addVisionImages, updateVisionItem, removeVisionItem, saveBoardTitle } from './actions';

// The board is a fixed 1600 × 1000 canvas, scaled to fit the screen.
// Positions are stored in canvas units so the layout looks the same on every device.
const W = 1600;
const H = 1000;

export default function VisionCanvas({ userId, initialItems, initialTitle }) {
  const wrap = useRef(null);
  const [scale, setScale] = useState(0.5);
  const [items, setItems] = useState(initialItems);
  const [title, setTitle] = useState(initialTitle);
  const [editingTitle, setEditingTitle] = useState(false);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [full, setFull] = useState(false);
  const gesture = useRef(null);
  const fileRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Fit the canvas to the available width (or the whole screen in full-screen mode)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const fs = document.fullscreenElement === el;
      setFull(fs);
      const sw = el.clientWidth / W;
      setScale(fs ? Math.min(sw, el.clientHeight / H) : sw);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el); fit();
    document.addEventListener('fullscreenchange', fit);
    return () => { ro.disconnect(); document.removeEventListener('fullscreenchange', fit); };
  }, []);

  const patch = (id, p) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const save = (id, p) => updateVisionItem(id, p).catch(() => setError('Could not save that change. Refresh and try again.'));
  const topZ = () => Math.max(0, ...itemsRef.current.map((i) => i.z || 0)) + 1;

  // Drag / resize / rotate with pointer events (mouse, pen and touch)
  const start = (e, id, mode) => {
    e.stopPropagation();
    e.preventDefault();
    const it = itemsRef.current.find((i) => i.id === id);
    if (!it) return;
    setSelected(id);
    let z = it.z;
    if (mode === 'move' && it.z !== topZ() - 1) { z = topZ(); patch(id, { z }); }
    const rect = e.currentTarget.closest('[data-card]')?.getBoundingClientRect();
    gesture.current = { id, mode, sx: e.clientX, sy: e.clientY, x: it.x, y: it.y, w: it.w, rot: it.rot, z, cx: rect ? rect.left + rect.width / 2 : 0, cy: rect ? rect.top + rect.height / 2 : 0, moved: false };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const onMove = useCallback((e) => {
    const g = gesture.current;
    if (!g) return;
    const dx = (e.clientX - g.sx) / scaleRef.current;
    const dy = (e.clientY - g.sy) / scaleRef.current;
    if (Math.abs(dx) + Math.abs(dy) > 2) g.moved = true;
    if (g.mode === 'move') patch(g.id, { x: Math.min(W - 40, Math.max(-200, g.x + dx)), y: Math.min(H - 40, Math.max(-200, g.y + dy)) });
    if (g.mode === 'resize') patch(g.id, { w: Math.min(900, Math.max(90, g.w + dx)) });
    if (g.mode === 'rotate') {
      const a = (Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180) / Math.PI + 90;
      const snapped = Math.abs(a) < 3 ? 0 : a;
      patch(g.id, { rot: Math.round(snapped * 10) / 10 });
    }
  }, []);

  const onUp = useCallback(() => {
    window.removeEventListener('pointermove', onMove);
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const it = itemsRef.current.find((i) => i.id === g.id);
    if (it && (g.moved || g.mode === 'move')) save(it.id, { x: it.x, y: it.y, w: it.w, rot: it.rot, z: it.z });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMove]);

  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // Title can be dragged too
  const startTitle = (e) => {
    if (editingTitle) return;
    e.preventDefault();
    setSelected('title');
    const g = { sx: e.clientX, sy: e.clientY, x: title.x, y: title.y };
    const move = (ev) => setTitle((t) => ({ ...t, x: g.x + (ev.clientX - g.sx) / scaleRef.current, y: g.y + (ev.clientY - g.sy) / scaleRef.current }));
    const up = () => {
      window.removeEventListener('pointermove', move);
      setTitle((t) => { saveBoardTitle(t).catch(() => {}); return t; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const addPhotos = async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setError(null);
    const paths = [];
    for (let i = 0; i < files.length; i++) {
      setBusy(`Uploading ${i + 1} of ${files.length}…`);
      try {
        const blob = await shrink(files[i]);
        const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : blob.type === 'image/gif' ? 'gif' : 'jpg';
        const p = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: err } = await browserClient().storage.from('wish').upload(p, blob, { contentType: blob.type || 'image/jpeg' });
        if (err) throw err;
        paths.push(p);
      } catch { setError('One or more photos could not be uploaded. Use JPG or PNG under 10 MB.'); }
    }
    if (paths.length) {
      try {
        const added = await addVisionImages(paths, itemsRef.current.length);
        setItems((list) => [...list, ...added]);
        if (added.length) setSelected(added[added.length - 1].id);
      } catch { setError('Photos uploaded but could not be placed. Refresh the page.'); }
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const sel = items.find((i) => i.id === selected) || null;
  const toggleChief = () => {
    if (!sel) return;
    const on = !sel.is_chief;
    setItems((list) => list.map((i) => ({ ...i, is_chief: i.id === sel.id ? on : on ? false : i.is_chief })));
    save(sel.id, { is_chief: on });
  };
  const remove = async (target) => {
    const id = typeof target === 'string' ? target : sel?.id;
    if (!id) return;
    setItems((list) => list.filter((i) => i.id !== id));
    setSelected(null);
    removeVisionItem(id).catch(() => setError('Could not remove that photo. Refresh and try again.'));
  };
  const nudge = (deg) => { if (!sel) return; const rot = Math.round((sel.rot + deg) * 10) / 10; patch(sel.id, { rot }); save(sel.id, { rot }); };
  const toBack = () => { if (!sel) return; const z = Math.min(0, ...items.map((i) => i.z || 0)) - 1; patch(sel.id, { z }); save(sel.id, { z }); };

  const fullscreen = () => {
    const el = wrap.current;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el?.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="vb">
      <div className="vb-toolbar">
        <label className="btn small" style={{ cursor: 'pointer' }}>
          + Add photos
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={addPhotos} style={{ display: 'none' }} />
        </label>
        {sel ? (
          <>
            <button type="button" className={`btn ghost small${sel.is_chief ? ' on' : ''}`} onClick={toggleChief}>{sel.is_chief ? '★ Chief Aim' : '☆ Mark as Chief Aim'}</button>
            <button type="button" className="btn ghost small" onClick={() => nudge(-5)} aria-label="Tilt left">↺</button>
            <button type="button" className="btn ghost small" onClick={() => nudge(5)} aria-label="Tilt right">↻</button>
            <button type="button" className="btn ghost small" onClick={toBack}>Send to back</button>
            <button type="button" className="btn ghost small" onClick={() => remove()}>Remove</button>
          </>
        ) : selected === 'title' ? (
          <button type="button" className="btn ghost small" onClick={() => setEditingTitle(true)}>Edit title</button>
        ) : (
          <span className="muted" style={{ fontSize: 13 }}>Drag photos anywhere. Click one to resize, tilt or mark it as your Chief Aim.</span>
        )}
        <span style={{ flex: 1 }} />
        {busy && <span className="muted" style={{ fontSize: 13 }} aria-live="polite">{busy}</span>}
        <button type="button" className="btn ghost small" onClick={fullscreen}>{full ? 'Exit full screen' : 'Full screen'}</button>
      </div>
      {error && <p className="neg" role="alert" style={{ margin: '0 0 8px' }}>{error}</p>}

      <div ref={wrap} className={`vb-wrap${full ? ' full' : ''}`} style={{ height: full ? undefined : H * scale }} onPointerDown={() => { setSelected(null); setEditingTitle(false); }}>
        {full && (
          <button type="button" className="btn ghost small vb-exit" onClick={fullscreen} onPointerDown={(e) => e.stopPropagation()}>Exit full screen</button>
        )}
        <div className="vb-canvas" style={{ width: W, height: H, transform: `scale(${scale})`, left: full ? `calc(50% - ${(W * scale) / 2}px)` : 0, top: full ? `calc(50% - ${(H * scale) / 2}px)` : 0 }}>
          <div
            className={`vb-title${selected === 'title' ? ' sel' : ''}`}
            style={{ left: title.x, top: title.y }}
            onPointerDown={(e) => { e.stopPropagation(); startTitle(e); }}
            onDoubleClick={() => setEditingTitle(true)}
          >
            {editingTitle ? (
              <input
                autoFocus
                defaultValue={title.text}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={(e) => { const t = { ...title, text: e.target.value.trim() || 'Vision Board' }; setTitle(t); setEditingTitle(false); saveBoardTitle(t).catch(() => {}); }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                aria-label="Board title"
              />
            ) : title.text}
          </div>

          {items.map((it) => (
            <figure
              key={it.id}
              data-card
              className={`vb-card${selected === it.id ? ' sel' : ''}${it.is_chief ? ' chief' : ''}`}
              style={{ left: it.x, top: it.y, width: it.w, zIndex: 10 + (it.z || 0), transform: `rotate(${it.rot || 0}deg)` }}
              onPointerDown={(e) => start(e, it.id, 'move')}
            >
              <img src={it.url} alt={it.title || 'Vision Board photo'} draggable={false} />
              {it.is_chief && <span className="vb-chief">★ Chief Aim</span>}
              <button type="button" className="vb-x" aria-label="Remove photo" title="Remove photo" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(it.id); }}>×</button>
              {selected === it.id && (
                <>
                  <span className="vb-handle resize" onPointerDown={(e) => start(e, it.id, 'resize')} aria-hidden="true" />
                  <span className="vb-handle rotate" onPointerDown={(e) => start(e, it.id, 'rotate')} aria-hidden="true" />
                </>
              )}
            </figure>
          ))}

          {items.length === 0 && (
            <div className="vb-empty">Add the same photos as your physical board and arrange them around the title.</div>
          )}
        </div>
      </div>
    </div>
  );
}
