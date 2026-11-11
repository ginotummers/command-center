'use client';
import { useEffect, useRef, useState } from 'react';

// Single-series line chart with a hover crosshair + tooltip.
// points: [{ label: 'Nov 2026', short: 'Nov', value: number|null }]  (null = no data that month)
const H = 220, PAD = { l: 58, r: 16, t: 16, b: 30 };

const fmt = (n) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const compact = (n) => (Math.abs(n) >= 1000 ? `€${+(n / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 2)}k` : `€${Math.round(n)}`);

function niceTicks(min, max, count = 4) {
  if (min === max) { const pad = Math.abs(min) * 0.1 || 100; min -= pad; max += pad; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const lo = Math.floor(min / step) * step; const hi = Math.ceil(max / step) * step;
  const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { lo, hi, ticks };
}

export default function LineChart({ points, color = 'var(--gold)', label = 'Value', area = false }) {
  const [hover, setHover] = useState(null);
  const svg = useRef(null);
  const box = useRef(null);
  const [W, setW] = useState(560);
  // Draw at the real pixel width so labels stay 11px on any screen
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(260, el.clientWidth)));
    ro.observe(el); setW(Math.max(260, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const vals = points.map((p) => p.value).filter((v) => v !== null && v !== undefined);
  if (!vals.length) return <div ref={box}><p className="empty" style={{ margin: 0 }}>Appears once you add data.</p></div>;

  const { lo, hi, ticks } = niceTicks(Math.min(...vals, area ? 0 : Infinity), Math.max(...vals));
  const n = points.length;
  const x = (i) => PAD.l + (n === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);

  // Line segments break where a month has no data
  const segs = []; let cur = [];
  points.forEach((p, i) => { if (p.value === null || p.value === undefined) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(p.value)]); });
  if (cur.length) segs.push(cur);

  const onMove = (e) => {
    const r = svg.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = null; let bd = Infinity;
    points.forEach((p, i) => { if (p.value === null || p.value === undefined) return; const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };
  const hp = hover !== null ? points[hover] : null;
  const prevVal = hover !== null ? points.slice(0, hover).reverse().find((p) => p.value !== null && p.value !== undefined)?.value : undefined;

  return (
    <div ref={box} className="lc" style={{ position: 'relative' }}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${label} by month`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: 'block', touchAction: 'pan-y' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)">{compact(t)}</text>
          </g>
        ))}
        {points.map((p, i) => ((n <= 7 || W >= 520 || i % 2 === (n - 1) % 2 || hover === i) &&
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={hover === i ? 'var(--ink)' : 'var(--ink-muted)'}>{p.short}</text>
        ))}
        {area && segs.map((s, k) => s.length > 1 && (
          <path key={`a${k}`} d={`M${s[0][0]},${y(Math.max(lo, 0))} ${s.map(([a, b]) => `L${a},${b}`).join(' ')} L${s[s.length - 1][0]},${y(Math.max(lo, 0))} Z`} fill={color} opacity="0.16" />
        ))}
        {segs.map((s, k) => (s.length > 1
          ? <polyline key={k} points={s.map(([a, b]) => `${a},${b}`).join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          : <circle key={k} cx={s[0][0]} cy={s[0][1]} r="4" fill={color} />))}
        {hp && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-muted)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(hp.value)} r="5" fill={color} stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="transparent" />
      </svg>
      {hp && (
        <div className="lc-tip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(hp.value) / H) * 100}%` }}>
          <span className="muted" style={{ fontSize: 11 }}>{hp.label}</span>
          <strong>{fmt(hp.value)}</strong>
          {prevVal !== undefined && prevVal !== 0 && (
            <span style={{ fontSize: 11 }} className="muted">{hp.value >= prevVal ? '▲' : '▼'} {fmt(Math.abs(hp.value - prevVal))} vs previous</span>
          )}
        </div>
      )}
    </div>
  );
}
