'use client';
import { useEffect, useRef, useState } from 'react';
import { niceTicks, fmt, compact } from './LineChart';

// Single-series bar chart (baseline at 0) with a per-bar hover tooltip.
// points: [{ label, short, value|null }]; `current` index is drawn in the full accent.
const H = 220, PAD = { l: 58, r: 12, t: 16, b: 30 };

export default function BarChart({ points, color = '#C9A15F', label = 'Value', current = points.length - 1 }) {
  const box = useRef(null);
  const [W, setW] = useState(560);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(260, el.clientWidth)));
    ro.observe(el); setW(Math.max(260, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const vals = points.map((p) => p.value).filter((v) => v !== null && v !== undefined);
  if (!vals.length) return <div ref={box}><p className="empty" style={{ margin: 0 }}>Appears once you add data.</p></div>;

  const { lo, hi, ticks } = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
  const n = points.length;
  const slot = (W - PAD.l - PAD.r) / n;
  const bw = Math.min(56, slot * 0.6);
  const cx = (i) => PAD.l + slot * i + slot / 2;
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const y0 = y(0);
  const hp = hover !== null ? points[hover] : null;
  const prevVal = hover !== null ? points.slice(0, hover).reverse().find((p) => p.value !== null && p.value !== undefined)?.value : undefined;

  return (
    <div ref={box} className="lc" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${label} by month`} style={{ display: 'block' }} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)">{compact(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const has = p.value !== null && p.value !== undefined;
          const top = has ? Math.min(y(p.value), y0) : y0;
          const h = has ? Math.max(2, Math.abs(y(p.value) - y0)) : 0;
          const r = Math.min(4, bw / 2, h);
          // rounded data end, square at the baseline
          const d = has ? `M${cx(i) - bw / 2},${top + h} V${top + r} Q${cx(i) - bw / 2},${top} ${cx(i) - bw / 2 + r},${top} H${cx(i) + bw / 2 - r} Q${cx(i) + bw / 2},${top} ${cx(i) + bw / 2},${top + r} V${top + h} Z` : null;
          return (
            <g key={i}>
              {d && <path d={d} fill={color} opacity={i === current || hover === i ? 1 : 0.45} />}
              <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={hover === i || i === current ? 'var(--ink)' : 'var(--ink-muted)'}>{p.short}</text>
              {/* hit target: the whole column, bigger than the bar */}
              {has && <rect x={cx(i) - slot / 2} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />}
            </g>
          );
        })}
      </svg>
      {hp && (
        <div className="lc-tip" style={{ left: `${(cx(hover) / W) * 100}%`, top: `${(Math.min(y(hp.value), y0) / H) * 100}%` }}>
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
