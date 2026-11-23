'use client';
import { useState, useTransition } from 'react';
import { KIND_CHOICES } from '@/lib/statements';
import { setLabel, confirmLabel } from './actions';

// One dropdown for both spending categories and "not spending" (transfer, savings, income)
export default function LabelSelect({ id, kind, category, categories, review }) {
  const cur = kind === 'spend' ? `cat:${category || 'Other'}` : kind === 'set_aside' ? `set_aside:${category || 'Savings'}` : kind;
  const [val, setVal] = useState(cur);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();
  const cats = categories.includes(category) || kind !== 'spend' || !category ? categories : [...categories, category];
  const onChange = (e) => {
    let v = e.target.value; let name = null;
    if (v === '__new') { name = window.prompt('New label name'); if (!name) { e.target.value = val; return; } v = `cat:${name}`; }
    setVal(v); setErr(false);
    start(async () => { try { await setLabel(id, v, name); } catch { setErr(true); setVal(cur); } });
  };
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <select className="label-sel" value={val} onChange={onChange} disabled={pending} aria-label="Label">
        <optgroup label="Spending">{cats.map((c) => <option key={c} value={`cat:${c}`}>{c}</option>)}<option value="__new">+ New label…</option></optgroup>
        <optgroup label="Not spending">{KIND_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>
      </select>
      {review && !pending && <button type="button" className="linkbtn" onClick={() => start(async () => { try { await confirmLabel(id); } catch { setErr(true); } })}>Looks right</button>}
      {err && <span className="neg" style={{ fontSize: 12 }}>Not saved</span>}
    </span>
  );
}
