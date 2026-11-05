import { createClient } from '@/lib/supabase';
import { progress } from '@/lib/goals';
import { eur, pct, fmtDate, greeting, longToday, monthStart, shiftMonth, monthLabel, todayIso, weekStart, addDays, isoWeek } from '@/lib/util';
import ProgressBar from './goals/ProgressBar';
import SyncButton from './components/SyncButton';
import { queueItem, setFocus } from './home-actions';

export const dynamic = 'force-dynamic';

const DONE = ['Achieved', 'Not Achieved', 'Abandoned'];
const netWorth = (rows) => rows.reduce((a, r) => a + (r.kind === 'liability' ? -1 : 1) * Number(r.value || 0), 0);

export default async function Home({ searchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const month = monthStart();
  const today = todayIso();
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  const [{ data: goalsData }, { data: nwData }, { data: inc }, { data: exp }, { data: refl }] = await Promise.all([
    supabase.from('goals').select('*').eq('type', 'main').eq('archived', false).order('deadline', { ascending: true, nullsFirst: false }),
    supabase.from('net_worth_items').select('month,kind,value').order('month'),
    supabase.from('income').select('amount').eq('month', month),
    supabase.from('expenses').select('amount').eq('month', month),
    supabase.from('reflections').select('id,type,status,period_start').gte('period_start', lastWeek).eq('type', 'weekly'),
  ]);
  const tomorrow = addDays(today, 1);
  const [{ data: bm }, { data: evData }, { data: taskData }, { data: focusData }, { data: runData }, { data: wdData }, { data: queuedData }] = await Promise.all([
    supabase.from('body_metrics').select('date').order('date', { ascending: false }).limit(1),
    supabase.from('calendar_events').select('*').gte('start_at', `${today}T00:00:00+04:00`).lt('start_at', `${tomorrow}T00:00:00+04:00`).order('start_at'),
    supabase.from('tasks').select('*').or(`planned_date.eq.${today},is_overdue.eq.true`).order('start_at', { ascending: true, nullsFirst: false }),
    supabase.from('focus_items').select('*').or(`status.eq.open,and(status.eq.snoozed,snooze_until.lte.${today})`).order('created_at', { ascending: false }).limit(12),
    supabase.from('sync_runs').select('id,status,requested_at,finished_at,summary').order('requested_at', { ascending: false }).limit(1),
    supabase.from('work_daily').select('*').gte('date', addDays(today, -1)).order('date'),
    supabase.from('pending_actions').select('id,kind,title,date,start_time,status').eq('status', 'queued').order('created_at'),
  ]);
  const lastHealth = bm?.[0]?.date || null;
  const lastRun = runData?.[0] || null;
  const PRIO = { high: 0, medium: 1, low: 2 };
  const focus = (focusData || []).sort((a, b) => (PRIO[a.priority] ?? 1) - (PRIO[b.priority] ?? 1));
  const events = (evData || []).filter((e) => !e.all_day);
  const allDay = (evData || []).filter((e) => e.all_day);
  const tasksToday = (taskData || []).filter((t) => t.planned_date === today && !t.is_overdue);
  const overdue = (taskData || []).filter((t) => t.is_overdue && t.status !== 'done');
  const timeline = [
    ...events.map((e) => ({ key: `e${e.id}`, at: e.start_at, end: e.end_at, title: e.title, kind: e.is_meeting ? 'meeting' : 'block', link: e.link })),
    ...tasksToday.filter((t) => t.start_at).map((t) => ({ key: `t${t.id}`, at: t.start_at, title: t.title, kind: 'task', done: t.status === 'done', link: t.link, dur: t.duration_min })),
  ].sort((a, b) => (a.at < b.at ? -1 : 1));
  const unscheduled = tasksToday.filter((t) => !t.start_at);
  const openToday = tasksToday.filter((t) => t.status !== 'done');
  const needle = openToday.filter((t) => t.needle_mover === true).length;
  const small = openToday.length - needle;
  const overloaded = needle > 4 || small > 2;
  const yesterday = (wdData || []).find((w) => w.date === addDays(today, -1));
  const queued = queuedData || [];
  const tm = (iso) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '');
  const nowIso = new Date().toISOString();
  const next = events.find((e) => e.is_meeting && e.start_at > nowIso);
  const minsTo = next ? Math.round((new Date(next.start_at) - Date.now()) / 60000) : null;
  const active = (goalsData || []).filter((g) => !DONE.includes(g.status));

  const byMonth = {};
  (nwData || []).forEach((r) => { (byMonth[r.month] = byMonth[r.month] || []).push(r); });
  const months = Object.keys(byMonth).sort();
  const latest = months[months.length - 1];
  const nw = latest ? netWorth(byMonth[latest]) : null;
  const prevNw = latest && byMonth[shiftMonth(latest, -1)] ? netWorth(byMonth[shiftMonth(latest, -1)]) : null;
  const nwChange = nw !== null && prevNw ? ((nw - prevNw) / Math.abs(prevNw)) * 100 : null;
  const income = (inc || []).reduce((a, r) => a + Number(r.amount), 0);
  const expenses = (exp || []).reduce((a, r) => a + Number(r.amount), 0);
  const wk = (refl || []).find((r) => r.period_start === lastWeek) || (refl || []).find((r) => r.period_start === thisWeek);

  return (
    <>
      <div className="section-title" style={{ alignItems: 'flex-end' }}>
        <div>
          <p className="overline">{longToday()} · Dubai</p>
          <h1 style={{ marginTop: 6 }}>{greeting()}, Gino</h1>
        </div>
        <SyncButton lastRun={lastRun} />
      </div>
      {sp?.queued && <p className="hint" style={{ margin: 0 }}>Added. It is being created in Akiflow or Google Calendar now and appears here after the sync.</p>}

      <div className="row">
        <section className="card wide">
          <div className="card-head"><h2>Needs your attention</h2></div>
          <div className="action-list">
            {focus.map((f) => (
              <div key={f.id} className="action-item">
                <span className="tag">{f.source}</span>
                <a className="body" href={f.link || '#'} target={f.link ? '_blank' : undefined} rel="noopener noreferrer" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                  <strong>{f.title}</strong>{f.priority === 'high' ? <span className="neg" style={{ fontSize: 12 }}> · high</span> : null}<br /><span className="muted">{f.reason}</span>
                </a>
                <form action={setFocus}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="action" value="done" /><button className="btn small" type="submit" aria-label={`Mark ${f.title} done`}>Done</button></form>
                <form action={setFocus}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="action" value="snooze" /><button className="btn ghost small" type="submit" aria-label={`Snooze ${f.title} until tomorrow`}>Tomorrow</button></form>
              </div>
            ))}
            {!wk || wk.status !== 'submitted' ? (
              <a href="/reflections" className="action-item">
                <span className="tag">Reflection</span>
                <span className="body"><strong>Weekly reflection {wk ? 'still a draft' : 'not started'}</strong><br /><span className="muted">Week {isoWeek(lastWeek)} is ready to review</span></span>
                <span className="go">Start →</span>
              </a>
            ) : null}
            {!latest || latest < month ? (
              <a href="/finance" className="action-item">
                <span className="tag">Finance</span>
                <span className="body"><strong>Monthly finance update for {monthLabel(month)}</strong><br /><span className="muted">Net worth not entered yet this month</span></span>
                <span className="go">Update →</span>
              </a>
            ) : null}
            {!lastHealth || lastHealth < addDays(today, -7) ? (
              <a href="/health" className="action-item">
                <span className="tag">Health</span>
                <span className="body"><strong>Weekly health check-in</strong><br /><span className="muted">{lastHealth ? `Last weigh-in ${fmtDate(lastHealth)}` : 'No weight or body fat logged yet'}</span></span>
                <span className="go">Log →</span>
              </a>
            ) : null}
            {active.filter((g) => g.deadline && g.deadline < today).map((g) => (
              <a key={g.id} href={`/goals/${g.id}`} className="action-item">
                <span className="tag">Goal</span>
                <span className="body"><strong>{g.name}</strong><br /><span className="neg">Deadline passed {fmtDate(g.deadline)}</span></span>
                <span className="go">Review →</span>
              </a>
            ))}
          </div>
          {!lastRun && <p className="muted" style={{ margin: '14px 0 0', fontSize: 13 }}>Press Sync now to pull focus points from Gmail, Zoom, Wispr Flow and Akiflow.</p>}
        </section>
        <section className="card narrow">
          <div className="card-head"><h2>Today</h2>{next ? <span className="muted" style={{ fontSize: 13 }}>Next: {minsTo < 60 ? `in ${minsTo} min` : tm(next.start_at)}</span> : null}</div>
          {next && (
            <div style={{ background: 'var(--surface-sunken)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <p className="overline">Next meeting</p>
              <p style={{ margin: '4px 0 0', fontWeight: 600, fontSize: 16 }}>{next.title}</p>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{tm(next.start_at)} – {tm(next.end_at)}{next.link ? <> · <a href={next.link} target="_blank" rel="noopener noreferrer">Open</a></> : null}</p>
            </div>
          )}
          {allDay.length > 0 && <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>All day: {allDay.map((e) => e.title).join(' · ')}</p>}
          {timeline.length === 0 && unscheduled.length === 0 ? (
            <p className="empty">{lastRun ? 'Nothing on your calendar or Akiflow for today.' : 'Press Sync now to load your calendar and Akiflow tasks.'}</p>
          ) : (
            <div className="list">
              {timeline.map((i) => (
                <a key={i.key} href={i.link || '#'} target={i.link ? '_blank' : undefined} rel="noopener noreferrer" style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--ink)', textDecoration: 'none', opacity: i.done ? 0.55 : 1 }}>
                  <span style={{ width: 44, color: 'var(--ink-muted)', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{tm(i.at)}</span>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, flex: '0 0 8px', background: i.kind === 'meeting' ? 'var(--gold)' : 'transparent', border: `1px solid ${i.kind === 'task' ? 'var(--ink-muted)' : 'var(--gold)'}` }} />
                  <span style={{ flex: 1, textDecoration: i.done ? 'line-through' : 'none' }}>{i.title}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{i.kind === 'meeting' ? 'Meeting' : i.kind === 'task' ? 'Task' : ''}</span>
                </a>
              ))}
              {unscheduled.map((t) => (
                <a key={t.id} href={t.link || '#'} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--ink)', textDecoration: 'none', opacity: t.status === 'done' ? 0.55 : 1 }}>
                  <span style={{ width: 44, color: 'var(--ink-muted)', fontSize: 13 }}>—</span>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, flex: '0 0 8px', border: '1px solid var(--ink-muted)' }} />
                  <span style={{ flex: 1, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
                  <span className="muted" style={{ fontSize: 12 }}>Task</span>
                </a>
              ))}
            </div>
          )}
          {openToday.length > 0 && (
            <p className={overloaded ? 'neg' : 'pos'} style={{ margin: '12px 0 0', fontSize: 13 }}>
              {needle} needle-mover{needle === 1 ? '' : 's'} + {small} small task{small === 1 ? '' : 's'} · {overloaded ? 'over your 3–4 + 1–2 limit, move something' : 'within your limit'}
            </p>
          )}
          {overdue.length > 0 && <p className="neg" style={{ margin: '6px 0 0', fontSize: 13 }}>{overdue.length} overdue in Akiflow: {overdue.slice(0, 3).map((t) => t.title).join(', ')}{overdue.length > 3 ? '…' : ''}</p>}
          {yesterday && <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Yesterday: {yesterday.focus_hours ?? '—'} h focus{yesterday.last_activity ? `, finished ${String(yesterday.last_activity).slice(0, 5)}` : ''}</p>}
          {queued.length > 0 && <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Waiting to be added: {queued.map((q) => q.title).join(', ')}</p>}

          <details style={{ marginTop: 14 }}>
            <summary className="btn ghost small">+ Add task or appointment</summary>
            <form action={queueItem} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              <label>Add to
                <select name="kind" defaultValue="akiflow_task">
                  <option value="akiflow_task">Akiflow task</option>
                  <option value="calendar_event">Google Calendar appointment</option>
                </select>
              </label>
              <label>Title<input name="title" required /></label>
              <div className="grid2">
                <label>Date<input type="date" name="date" defaultValue={today} /></label>
                <label>Start time<input type="time" name="start_time" /></label>
                <label>Minutes<input name="duration_min" inputMode="numeric" defaultValue="30" /></label>
              </div>
              <label>Notes (optional)<input name="notes" /></label>
              <div><button className="btn small" type="submit">Add</button></div>
            </form>
          </details>
        </section>
      </div>

      <div className="row">
        <a href="/finance" className="card tile" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
          <p className="muted" style={{ margin: 0 }}>Net worth</p>
          <p className="stat">{eur(nw)}</p>
          {nwChange === null ? <span className="muted">{latest ? monthLabel(latest) : 'Not entered yet'}</span> : <span className={nwChange >= 0 ? 'pos' : 'neg'}>{nwChange >= 0 ? '▲' : '▼'} {pct(Math.abs(nwChange))} vs last month</span>}
        </a>
        <a href="/finance" className="card tile" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
          <p className="muted" style={{ margin: 0 }}>Saved this month</p>
          <p className="stat">{income || expenses ? eur(income - expenses) : '—'}</p>
          <span className="muted">{income ? `Savings rate ${pct(((income - expenses) / income) * 100, 0)}` : 'Add income to see your rate'}</span>
        </a>
        <a href="/goals?view=active" className="card tile" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
          <p className="muted" style={{ margin: 0 }}>Active goals</p>
          <p className="stat">{active.length}</p>
          <span className="muted">{active.length ? `Average ${Math.round(active.reduce((a, g) => a + progress(g), 0) / active.length)}% progress` : 'Set your first goal'}</span>
        </a>
        <a href="/reflections" className="card tile" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
          <p className="muted" style={{ margin: 0 }}>Weekly reflection</p>
          <p className="stat">{wk?.status === 'submitted' ? 'Done' : wk ? 'Draft' : 'To do'}</p>
          <span className={wk?.status === 'submitted' ? 'pos' : 'muted'}>Week {isoWeek(wk?.period_start || lastWeek)}</span>
        </a>
      </div>

      <section className="card">
        <div className="card-head"><h2>Goals</h2><a href="/goals">All goals →</a></div>
        {active.length === 0 ? <p className="empty">No active goals yet. <a href="/goals/new">Create one</a>.</p> : (
          <div className="list">
            {active.slice(0, 5).map((g) => {
              const p = progress(g);
              return (
                <a key={g.id} href={`/goals/${g.id}`} style={{ color: 'var(--ink)', textDecoration: 'none', display: 'block' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{g.name}</strong><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{p}%</strong></div>
                  <p className="muted" style={{ margin: '3px 0 10px', fontSize: 13 }}>Deadline {fmtDate(g.deadline)} · {g.status}</p>
                  <ProgressBar value={p} label={`${g.name} progress`} />
                </a>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
