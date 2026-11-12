import InfoButton from './InfoButton';
import { addDays, weekStart } from '@/lib/util';

// Validated categorical palette (dark surface), fixed slot order
const C = ['#B08429', '#4A8FE0', '#D0663A', '#8C6FD0'];
const CATS = [['deep_min', 'Deep work'], ['meeting_min', 'Meetings'], ['admin_min', 'Admin'], ['other_min', 'Other']];
const BIZ = [['own_min', 'Own business'], ['mc_min', 'MC'], ['brandmap_min', 'BrandMap'], ['unassigned_min', 'Other']];

const hm = (m) => { m = Math.round(m || 0); const h = Math.floor(m / 60); const r = m % 60; return h ? `${h}h${r ? ` ${String(r).padStart(2, '0')}m` : ''}` : `${r}m`; };
const sum = (rows, k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
const dayName = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

// Productivity score 0–100 for one day. Parts without data are left out and the rest re-weighted.
export function dayScore(r) {
  if (!r) return null;
  const parts = [];
  if (r.planned_tasks) {
    const np = r.needle_planned || 0; const nd = r.needle_done || 0;
    const den = 2 * np + (r.planned_tasks - np); const num = 2 * nd + ((r.done_tasks || 0) - nd);
    parts.push([40, den ? Math.min(1, num / den) : 0]);
  }
  if (r.tracked_min >= 30) {
    parts.push([30, Math.min(1, (r.deep_min / r.tracked_min) / 0.5)]);
    if (r.on_plan_min !== null && r.on_plan_min !== undefined) parts.push([20, Math.min(1, r.on_plan_min / r.tracked_min)]);
    parts.push([10, Math.max(0, 1 - (r.after_hours_min || 0) / 120)]);
  }
  if (!parts.length) return null;
  const w = parts.reduce((a, [x]) => a + x, 0);
  return Math.round((parts.reduce((a, [x, v]) => a + x * v, 0) / w) * 100);
}
const scoreCls = (s) => (s === null ? 'muted' : s >= 70 ? 'pos' : s >= 45 ? '' : 'neg');

function Stack({ rows, keys, title }) {
  const total = keys.reduce((a, [k]) => a + sum(rows, k), 0);
  return (
    <div style={{ minWidth: 0 }}>
      <h3 className="chart-title" style={{ margin: '0 0 8px', fontSize: 14 }}>{title}</h3>
      {total ? (
        <>
          <div className="wl-stack" role="img" aria-label={`${title}: ${keys.map(([k, l]) => `${l} ${hm(sum(rows, k))}`).join(', ')}`}>
            {keys.map(([k, l], i) => { const v = sum(rows, k); return v ? <span key={k} style={{ width: `${(v / total) * 100}%`, background: C[i] }} title={`${l}: ${hm(v)}`} /> : null; })}
          </div>
          <div className="wl-legend">
            {keys.map(([k, l], i) => { const v = sum(rows, k); return (
              <span key={k}><i style={{ background: C[i] }} aria-hidden="true" />{l} <strong>{hm(v)}</strong> <span className="muted">{Math.round((v / total) * 100)}%</span></span>
            ); })}
          </div>
        </>
      ) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>No tracked time yet.</p>}
    </div>
  );
}

export default function Workload({ rows, today }) {
  const byDate = Object.fromEntries((rows || []).map((r) => [r.date, r]));
  const ws = weekStart(today); const lws = addDays(ws, -7);
  const span = Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${ws}T00:00:00Z`)) / 86400000);
  const week = (rows || []).filter((r) => r.date >= ws && r.date <= today);
  const lastSame = (rows || []).filter((r) => r.date >= lws && r.date <= addDays(lws, span)); // same weekdays last week
  const lastFull = (rows || []).filter((r) => r.date >= lws && r.date < ws);
  const t = byDate[today];
  const y = byDate[addDays(today, -1)];
  const sToday = dayScore(t); const sYest = dayScore(y);
  const weekScores = week.map(dayScore).filter((s) => s !== null);
  const sWeek = weekScores.length ? Math.round(weekScores.reduce((a, b) => a + b, 0) / weekScores.length) : null;
  const lateDays = week.filter((r) => r.after_hours_min >= 15);
  const wkMin = sum(week, 'tracked_min'); const lwMin = sum(lastSame, 'tracked_min');
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const planDay = t && t.planned_tasks ? t : y && y.planned_tasks ? y : null;
  const planLabel = planDay === t ? 'Today' : 'Yesterday';

  if (!rows?.length) {
    return <p className="empty">No Rize data yet. Press Sync now: the sync reads Rize and Akiflow and fills this section.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="wl-tiles">
        <div className="wl-tile">
          <span className="muted">Productivity score</span>
          <strong className={`stat ${scoreCls(sToday ?? sYest)}`}>{sToday ?? sYest ?? '—'}<small className="muted">/100</small></strong>
          <span className="muted">{sToday !== null ? 'Today' : sYest !== null ? 'Yesterday' : 'Not enough data'}{sWeek !== null ? ` · week avg ${sWeek}` : ''}</span>
        </div>
        <div className="wl-tile">
          <span className="muted">Hours worked</span>
          <strong className="stat">{hm(t?.tracked_min)}</strong>
          <span className="muted">Today · week {hm(wkMin)}{lastSame.length ? <> · <span className={wkMin > lwMin * 1.15 ? 'neg' : ''}>last week {hm(lwMin)} by now</span></> : null}</span>
        </div>
        <div className="wl-tile">
          <span className="muted">After 20:00 &amp; weekends</span>
          <strong className={`stat ${lateDays.length >= 3 ? 'neg' : ''}`}>{lateDays.length} {lateDays.length === 1 ? 'day' : 'days'}</strong>
          <span className="muted">This week · {hm(sum(week, 'after_hours_min'))}{y?.last_activity ? ` · yesterday finished ${String(y.last_activity).slice(0, 5)}` : ''}</span>
        </div>
        <div className="wl-tile">
          <span className="muted">Plan vs actual</span>
          <strong className="stat">{planDay ? `${planDay.done_tasks ?? 0}/${planDay.planned_tasks}` : '—'}</strong>
          <span className="muted">{planDay ? `${planLabel}: tasks done${planDay.tracked_min ? ` · ${Math.round(((planDay.on_plan_min || 0) / planDay.tracked_min) * 100)}% of time on plan` : ''}` : 'No Akiflow plan synced yet'}</span>
        </div>
      </div>

      <div className="chart-grid">
        <Stack rows={week} keys={CATS} title="Where your time went this week" />
        <Stack rows={week} keys={BIZ} title="By business this week" />
      </div>

      <div className="scroll"><table className="wl-week">
        <thead><tr><th>This week</th>{days.map((d) => <th key={d} className={d === today ? 'today' : ''}>{dayName(d)}</th>)}</tr></thead>
        <tbody>
          <tr><td className="muted">Hours</td>{days.map((d) => <td key={d}>{byDate[d] ? hm(byDate[d].tracked_min) : d > today ? '' : '—'}</td>)}</tr>
          <tr><td className="muted">Score</td>{days.map((d) => { const s = dayScore(byDate[d]); return <td key={d} className={scoreCls(s)}>{s ?? (d > today ? '' : '—')}</td>; })}</tr>
          <tr><td className="muted">Tasks done</td>{days.map((d) => <td key={d}>{byDate[d]?.planned_tasks ? `${byDate[d].done_tasks ?? 0}/${byDate[d].planned_tasks}` : d > today ? '' : '—'}</td>)}</tr>
          <tr><td className="muted">Finished</td>{days.map((d) => { const r = byDate[d]; const late = r?.after_hours_min >= 15; return <td key={d} className={late ? 'neg' : ''}>{r?.last_activity ? String(r.last_activity).slice(0, 5) : ''}</td>; })}</tr>
        </tbody>
      </table></div>

      {planDay && (
        <details className="fold">
          <summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>{planLabel}: plan vs what you actually did</span>
            <span className="muted" style={{ fontSize: 13 }}>{planDay.done_tasks ?? 0} of {planDay.planned_tasks} done{(planDay.unplanned_items || []).length ? ` · ${planDay.unplanned_items.length} unplanned` : ''}</span></summary>
          <div className="fold-body chart-grid">
            <div>
              <h4 className="wl-h4">Planned in Akiflow</h4>
              <div className="list">{(planDay.plan_items || []).map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span className={p.done ? 'pos' : 'neg'} aria-label={p.done ? 'done' : 'not done'}>{p.done ? '✓' : '✗'}</span>
                  <span style={{ flex: 1 }}>{p.title}{p.needle ? <span className="tag" style={{ marginLeft: 6, fontSize: 11 }}>needle-mover</span> : null}</span>
                  <span className="muted" style={{ fontSize: 13 }}>{p.tracked_min ? hm(p.tracked_min) : '—'}</span>
                </div>))}</div>
            </div>
            <div>
              <h4 className="wl-h4">Unplanned work (Rize)</h4>
              {(planDay.unplanned_items || []).length ? <div className="list">{planDay.unplanned_items.map((u, i) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}><span style={{ flex: 1 }}>{u.title}</span><span className="muted" style={{ fontSize: 13 }}>{hm(u.min)}</span></div>))}</div>
                : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Everything Rize tracked matched your plan.</p>}
            </div>
          </div>
        </details>
      )}
      {lastFull.length > 0 && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Last week in total: {hm(sum(lastFull, 'tracked_min'))} tracked, {lastFull.filter((r) => r.after_hours_min >= 15).length} late days.</p>}
    </div>
  );
}

export function WorkloadInfo() {
  return (
    <InfoButton title="How workload tracking works">
      <p>Rize tracks what you actually work on; Akiflow holds what you planned. Each sync compares the two for yesterday and today.</p>
      <p><strong>Hours worked</strong> is Rize's tracked time, including suggestions you haven't approved. The week is compared with the same days of last week.</p>
      <p><strong>After 20:00 &amp; weekends</strong> counts days with at least 15 minutes of work after 20:00 or before 06:00 (Dubai time), or on a Saturday or Sunday.</p>
      <p><strong>By business</strong> splits your time into your own business (the operator product), MC and BrandMap, judged from what each Rize entry was about.</p>
      <p><strong>Productivity score (0–100)</strong>:</p>
      <ul>
        <li>40: planned Akiflow tasks done (needle-movers count double)</li>
        <li>30: share of your time on deep work (half your day or more gives full points)</li>
        <li>20: share of your time spent on what you planned</li>
        <li>10: no work after 20:00 (minus 1 point per 12 minutes)</li>
      </ul>
      <p>Parts without data for a day are left out and the rest re-weighted. 70+ is a good day.</p>
    </InfoButton>
  );
}
