'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase-browser';
import { shrink } from '../wish/ImageInput';
import { saveProgressPhotos, removeProgressSet } from './actions';

const POSES = [['front', 'Front'], ['side', 'Side'], ['back', 'Back']];
const PHASE = { bulking: 'Bulking', cutting: 'Cutting', maintenance: 'Maintenance' };
const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const short = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weeksBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / (7 * 86400000));
const kg = (v) => (v === null || v === undefined ? null : Number(v).toFixed(1).replace(/\.0$/, ''));

function summary(before, after) {
  const w = weeksBetween(before.date, after.date);
  const d = before.weight && after.weight ? Number(after.weight) - Number(before.weight) : null;
  return [
    `${w} week${w === 1 ? '' : 's'} apart`,
    d === null ? null : `${d >= 0 ? '+' : '−'}${kg(Math.abs(d))} kg`,
    before.phase && after.phase && before.phase !== after.phase ? `${PHASE[before.phase]} → ${PHASE[after.phase]}` : null,
  ].filter(Boolean).join(' · ');
}

// Rows of front / side / back, one row per set, with date, phase and weight above each row
function Rows({ rows, Shot }) {
  return (
    <div className="pp-rows">
      {rows.map(([l, s]) => (
        <div key={l + s.date}><h4>{l} · {fmt(s.date)}<span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>{[s.phase ? PHASE[s.phase] : null, s.weight ? `${kg(s.weight)} kg` : null].filter(Boolean).map((x) => ` · ${x}`).join('')}</span></h4>
          <div className="pp-three">{POSES.map(([k]) => <Shot key={k} set={s} p={k} label={false} />)}</div></div>
      ))}
    </div>
  );
}

// sets: [{ date, phase, weight, photos: { front: url, side: url, back: url } }] sorted oldest first
export default function ProgressPhotos({ userId, today, sets }) {
  const n = sets.length;
  // Default comparison: latest vs the photos closest to 8 weeks earlier (or the oldest if there is nothing that old yet)
  const defIx = useMemo(() => {
    if (n < 2) return 0;
    let ix = 0; sets.forEach((s, i) => { if (i < n - 1 && weeksBetween(s.date, sets[n - 1].date) >= 8) ix = i; });
    return ix;
  }, [sets, n]);
  const [beforeIx, setBeforeIx] = useState(defIx);
  const [afterIx, setAfterIx] = useState(Math.max(0, n - 1));
  const [pose, setPose] = useState('front');
  const [zoom, setZoom] = useState(null);

  useEffect(() => { setBeforeIx(defIx); setAfterIx(Math.max(0, n - 1)); }, [n, defIx]);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e) => { if (e.key === 'Escape') setZoom(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoom]);

  const before = sets[beforeIx]; const after = sets[afterIx];
  const presets = useMemo(() => {
    if (n < 2) return [];
    const last = sets[n - 1].date;
    const find = (weeks) => { let ix = 0; sets.forEach((s, i) => { if (weeksBetween(s.date, last) >= weeks) ix = i; }); return ix; };
    const out = [['Last week', n - 2]];
    if (weeksBetween(sets[0].date, last) >= 4) out.push(['4 weeks', find(4)]);
    if (weeksBetween(sets[0].date, last) >= 12) out.push(['3 months', find(12)]);
    out.push(['First photos', 0]);
    // start of the current phase
    const ph = sets[n - 1].phase; let start = n - 1;
    while (start > 0 && sets[start - 1].phase === ph) start--;
    if (ph && start > 0 && start < n - 1) out.push([`Start of ${PHASE[ph]?.toLowerCase() || 'phase'}`, start]);
    return out.filter(([, ix], i) => out.findIndex(([, j]) => j === ix) === i); // no two buttons for the same week
  }, [sets, n]);

  const Shot = ({ set, p, label }) => {
    const url = set?.photos?.[p];
    return (
      <figure className="pp-shot">
        {url ? (
          <button type="button" className="pp-img" onClick={() => setZoom({ url, set, p })} aria-label={`Open ${p} photo of ${fmt(set.date)} full size`}>
            <img src={url} alt={`${p} photo, ${fmt(set.date)}`} loading="lazy" />
          </button>
        ) : <div className="pp-img pp-missing">No {p} photo</div>}
        {label !== false && (
          <figcaption>
            <strong>{label || fmt(set.date)}</strong>
            <span className="muted">{[set.phase ? PHASE[set.phase] : null, set.weight ? `${kg(set.weight)} kg` : null].filter(Boolean).join(' · ')}</span>
          </figcaption>
        )}
      </figure>
    );
  };

  const diff = before && after && before !== after ? summary(before, after) : null;

  return (
    <div>
      {n === 0 ? (
        <p className="empty">No progress photos yet. Add front, side and back below.</p>
      ) : (
        <>
          <Rows rows={n > 1 ? [[`${weeksBetween(sets[defIx].date, sets[n - 1].date)} weeks earlier`, sets[defIx]], ['Latest', sets[n - 1]]] : [['Latest', sets[0]]]} Shot={Shot} />
          {n > 1 ? <p className="pp-diff" style={{ marginTop: 10 }}>{summary(sets[defIx], sets[n - 1])}</p>
            : <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>Once you have older photos, this shows your latest next to the photos from about 8 weeks earlier.</p>}

          {n > 1 && (
            <details className="fold" style={{ marginTop: 16 }}>
              <summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>Compare other weeks</span><span className="muted" style={{ fontSize: 13 }}>{n} weeks · timeline</span></summary>
              <div className="fold-body">
          <div className="pp-controls">
            <div className="seg" role="group" aria-label="Pose">
              {[...POSES, ['all', 'All three']].map(([k, l]) => (
                <button key={k} type="button" className={pose === k ? 'active' : ''} aria-pressed={pose === k} onClick={() => setPose(k)}>{l}</button>
              ))}
            </div>
            {n > 1 && (
              <div className="pp-selects">
                <label>Before<select value={beforeIx} onChange={(e) => setBeforeIx(Number(e.target.value))}>
                  {sets.map((s, i) => <option key={s.date} value={i}>{fmt(s.date)}{s.phase ? ` · ${PHASE[s.phase]}` : ''}</option>)}</select></label>
                <label>After<select value={afterIx} onChange={(e) => setAfterIx(Number(e.target.value))}>
                  {sets.map((s, i) => <option key={s.date} value={i}>{fmt(s.date)}{s.phase ? ` · ${PHASE[s.phase]}` : ''}</option>)}</select></label>
              </div>
            )}
          </div>
          {presets.length > 0 && (
            <div className="pp-presets"><span className="muted">Compare latest with:</span>
              {presets.map(([l, ix]) => (
                <button key={l} type="button" className={`chip${beforeIx === ix && afterIx === n - 1 ? ' active' : ''}`} onClick={() => { setBeforeIx(ix); setAfterIx(n - 1); }}>{l}</button>
              ))}
            </div>
          )}
          {diff && <p className="pp-diff">{diff}</p>}

          {n === 1 || beforeIx === afterIx ? (
            <div className={pose === 'all' ? 'pp-three' : 'pp-one'}>
              {(pose === 'all' ? POSES.map(([k]) => k) : [pose]).map((p) => <Shot key={p} set={after} p={p} label={pose === 'all' ? POSES.find(([k]) => k === p)[1] : undefined} />)}
            </div>
          ) : pose === 'all' ? (
            <Rows rows={[['Before', before], ['After', after]]} Shot={Shot} />
          ) : (
            <div className="pp-pair"><Shot set={before} p={pose} /><Shot set={after} p={pose} /></div>
          )}

          {n > 1 && (
            <>
              <h3 style={{ margin: '20px 0 8px', fontSize: 15 }}>Timeline <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· tap a week to compare it with the latest</span></h3>
              <div className="pp-strip">
                {sets.map((s, i) => {
                  const url = s.photos[pose === 'all' ? 'front' : pose];
                  const newPhase = i > 0 && s.phase && s.phase !== sets[i - 1].phase;
                  return (
                    <button key={s.date} type="button" className={`pp-thumb${i === beforeIx || i === afterIx ? ' sel' : ''}`}
                      onClick={() => { if (i === n - 1) { setAfterIx(i); } else { setBeforeIx(i); setAfterIx(n - 1); } }}>
                      {newPhase && <span className="pp-phase">{PHASE[s.phase]}</span>}
                      {url ? <img src={url} alt="" loading="lazy" /> : <span className="pp-missing" />}
                      <span>{short(s.date)}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
              </div>
            </details>
          )}
        </>
      )}

      <Upload userId={userId} today={today} sets={sets} />

      {zoom && (
        <div className="modal-backdrop" onClick={() => setZoom(null)}>
          <div className="pp-zoom" role="dialog" aria-modal="true" aria-label={`${zoom.p} photo, ${fmt(zoom.set.date)}`} onClick={(e) => e.stopPropagation()}>
            <img src={zoom.url} alt={`${zoom.p} photo, ${fmt(zoom.set.date)}`} />
            <div className="pp-zoom-bar"><span>{fmt(zoom.set.date)} · {zoom.p}{zoom.set.weight ? ` · ${kg(zoom.set.weight)} kg` : ''}</span>
              <button type="button" className="btn ghost small" onClick={() => setZoom(null)} autoFocus>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Upload({ userId, today, sets }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [files, setFiles] = useState({});
  const [state, setState] = useState('idle');
  const [err, setErr] = useState('');
  const pick = (p, f) => setFiles((x) => ({ ...x, [p]: f ? { file: f, preview: URL.createObjectURL(f) } : undefined }));
  const pickAll = (list) => { const arr = [...(list || [])].slice(0, 3); POSES.forEach(([p], i) => { if (arr[i]) pick(p, arr[i]); }); };
  const chosen = POSES.filter(([p]) => files[p]);
  const exists = sets.find((s) => s.date === date);

  const save = async () => {
    setState('saving'); setErr('');
    try {
      const sb = browserClient(); const items = [];
      for (const [p] of chosen) {
        const blob = await shrink(files[p].file, 1400, 0.82);
        const path = `${userId}/${date}-${p}-${crypto.randomUUID().slice(0, 8)}.jpg`;
        const { error } = await sb.storage.from('progress').upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
        items.push({ pose: p, path });
      }
      await saveProgressPhotos(date, items);
      setFiles({}); setState('done'); router.refresh();
    } catch (e) { setErr(e?.message || 'Upload failed'); setState('error'); }
  };

  return (
    <details className="fold add-fold" style={{ marginTop: 20 }}>
      <summary><span className="fold-plus" aria-hidden="true">+</span><span style={{ flex: 1, fontWeight: 600 }}>Add photos</span></summary>
      <div className="fold-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="grid2" style={{ maxWidth: 520, alignItems: 'end' }}>
          <label>Date<input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Pick all three at once (front, side, back in that order)<input type="file" accept="image/*" multiple onChange={(e) => pickAll(e.target.files)} /></label>
        </div>
        <div className="pp-upload">
          {POSES.map(([p, l]) => (
            <label key={p} className="pp-slot">
              <span>{l}</span>
              {files[p] ? <img src={files[p].preview} alt={`${l} preview`} /> : <span className="pp-missing">{exists?.photos?.[p] ? 'Replace' : 'Choose'}</span>}
              <input type="file" accept="image/*" onChange={(e) => pick(p, e.target.files?.[0])} />
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={!chosen.length || state === 'saving'} onClick={save}>{state === 'saving' ? 'Uploading…' : `Save ${chosen.length || ''} photo${chosen.length === 1 ? '' : 's'}`}</button>
          {exists && <span className="muted" style={{ fontSize: 12 }}>Photos for {fmt(date)} already exist; the ones you pick replace them.</span>}
          {state === 'done' && <span className="pos" style={{ fontSize: 13 }} aria-live="polite">Saved.</span>}
          {state === 'error' && <span className="neg" style={{ fontSize: 13 }} role="alert">{err}</span>}
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>Photos are shrunk to about 250 KB and their location data is removed before upload. They go to your private storage; only you can see them.</p>
        {sets.length > 0 && (
          <div className="list" style={{ maxWidth: 520 }}>
            {[...sets].reverse().map((s) => (
              <form key={s.date} action={removeProgressSet} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input type="hidden" name="date" value={s.date} />
                <span style={{ flex: 1 }}>{fmt(s.date)} <span className="muted">· {POSES.filter(([p]) => s.photos[p]).length} photo{POSES.filter(([p]) => s.photos[p]).length === 1 ? '' : 's'}</span></span>
                <button className="linkbtn" type="submit">Remove</button>
              </form>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
