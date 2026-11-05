'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

const HOUR = 52; // px per hour
const GUTTER = 46; // px for hour labels

function dubaiMinutesNow() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour').value) % 24;
  const m = Number(parts.find((p) => p.type === 'minute').value);
  return h * 60 + m;
}

const fmt = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Side-by-side columns for overlapping items, like a calendar app
function layout(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = [];
    cluster.forEach((it) => {
      let c = cols.findIndex((end) => end <= it.start);
      if (c === -1) { c = cols.length; cols.push(it.end); } else cols[c] = it.end;
      it.col = c;
    });
    cluster.forEach((it) => out.push({ ...it, cols: cols.length }));
    cluster = [];
  };
  sorted.forEach((it) => {
    if (cluster.length && it.start >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  });
  if (cluster.length) flush();
  return out;
}

const STYLE = {
  meeting: { background: 'linear-gradient(160deg, rgba(178,141,81,0.42), rgba(110,82,41,0.32))', border: '1px solid var(--gold)', color: 'var(--ink)' },
  block: { background: 'var(--surface-sunken)', border: '1px solid var(--line)', color: 'var(--ink)' },
  task: { background: 'rgba(12,21,48,0.55)', border: '1px dashed var(--ink-muted)', color: 'var(--ink)' },
};

export default function TodayCalendar({ items }) {
  const scroller = useRef(null);
  const [now, setNow] = useState(null);

  useEffect(() => {
    setNow(dubaiMinutesNow());
    const t = setInterval(() => setNow(dubaiMinutesNow()), 60000);
    return () => clearInterval(t);
  }, []);

  const { placed, startH, endH } = useMemo(() => {
    const valid = items.filter((i) => Number.isFinite(i.start));
    const s = Math.min(6, ...valid.map((i) => Math.floor(i.start / 60)));
    const e = Math.max(22, ...valid.map((i) => Math.ceil(i.end / 60)));
    return { placed: layout(valid), startH: s, endH: Math.min(24, e) };
  }, [items]);

  useEffect(() => {
    if (now === null || !scroller.current) return;
    scroller.current.scrollTop = Math.max(0, ((now - 60) / 60 - startH) * HOUR);
    // only on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now === null]);

  const hours = [];
  for (let h = startH; h < endH; h++) hours.push(h);
  const height = (endH - startH) * HOUR;
  const nowTop = now !== null && now / 60 >= startH && now / 60 <= endH ? (now / 60 - startH) * HOUR : null;

  return (
    <div ref={scroller} style={{ maxHeight: 620, overflowY: 'auto', borderRadius: 14, border: '1px solid var(--line)', background: 'rgba(0,3,16,0.35)' }}>
      <div style={{ position: 'relative', height }}>
        {hours.map((h) => (
          <div key={h} style={{ position: 'absolute', top: (h - startH) * HOUR, left: 0, right: 0, height: HOUR, borderTop: '1px solid var(--line)' }}>
            <span style={{ position: 'absolute', left: 8, top: 4, fontSize: 11, color: 'var(--ink-muted)', fontVariantNumeric: 'tabular-nums' }}>{String(h).padStart(2, '0')}:00</span>
          </div>
        ))}

        {placed.map((it) => {
          const top = (it.start / 60 - startH) * HOUR;
          const h = Math.max(22, ((it.end - it.start) / 60) * HOUR - 2);
          const widthPct = 100 / it.cols;
          const short = h < 40;
          const Tag = it.link ? 'a' : 'div';
          return (
            <Tag key={it.key} href={it.link || undefined} target={it.link ? '_blank' : undefined} rel={it.link ? 'noopener noreferrer' : undefined}
              title={`${fmt(it.start)}–${fmt(it.end)} · ${it.title}`}
              style={{
                position: 'absolute', top: top + 1, height: h,
                left: `calc(${GUTTER}px + (100% - ${GUTTER + 6}px) * ${(it.col * widthPct) / 100})`,
                width: `calc((100% - ${GUTTER + 6}px) * ${widthPct / 100} - 3px)`,
                borderRadius: 8, padding: short ? '2px 6px' : '5px 7px', overflow: 'hidden', textDecoration: 'none',
                fontSize: 12, lineHeight: 1.25, opacity: it.done ? 0.5 : 1, ...STYLE[it.kind],
              }}>
              <div style={{ fontWeight: 600, whiteSpace: short ? 'nowrap' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: it.done ? 'line-through' : 'none' }}>
                {it.kind === 'task' ? (it.done ? '✓ ' : '○ ') : ''}{it.title}
              </div>
              {!short && <div style={{ color: 'var(--ink-muted)', fontSize: 11, marginTop: 2 }}>{fmt(it.start)} – {fmt(it.end)}</div>}
            </Tag>
          );
        })}

        {nowTop !== null && (
          <div aria-hidden="true" style={{ position: 'absolute', top: nowTop, left: GUTTER - 6, right: 0, height: 0, borderTop: '2px solid var(--negative)', zIndex: 2 }}>
            <span style={{ position: 'absolute', left: -4, top: -5, width: 8, height: 8, borderRadius: 999, background: 'var(--negative)' }} />
          </div>
        )}
      </div>
    </div>
  );
}
