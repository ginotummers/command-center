import { createClient } from '@/lib/supabase';
import { progress } from '@/lib/goals';
import { eur, pct, fmtDate, greeting, longToday, monthStart, shiftMonth, monthLabel, todayIso, weekStart, addDays, isoWeek } from '@/lib/util';
import ProgressBar from './goals/ProgressBar';
import SyncButton from './components/SyncButton';
import SourceIcon from './components/SourceIcon';
import { setFocus } from './home-actions';
import TodayCalendar from './components/TodayCalendar';
import WishReminder from './components/WishReminder';
import { WEEKLY, teachingFor, dubaiNow, periods, sectionItems, dueReminder } from '@/lib/wish';

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
  const [{ data: bm }, { data: evData }, { data: taskData }, { data: focusData }, { data: runData }, { data: wdData }] = await Promise.all([
    supabase.from('body_metrics').select('date').order('date', { ascending: false }).limit(1),
    supabase.from('calendar_events').select('*').gte('start_at', `${today}T00:00:00+04:00`).lt('start_at', `${tomorrow}T00:00:00+04:00`).order('start_at'),
    supabase.from('tasks').select('*').or(`planned_date.eq.${today},is_overdue.eq.true`).order('start_at', { ascending: true, nullsFirst: false }),
    supabase.from('focus_items').select('*').or(`status.eq.open,and(status.eq.snoozed,snooze_until.lte.${today})`).order('created_at', { ascending: false }).limit(12),
    supabase.from('sync_runs').select('id,status,requested_at,finished_at,summary').order('requested_at', { ascending: false }).limit(1),
    supabase.from('work_daily').select('*').gte('date', addDays(today, -1)).order('date'),
  ]);
  // Your Wish Is Your Command: compact widget + at most one reminder pop-up
  const wNow = dubaiNow();
  const wp = periods(wNow.date);
  const [{ data: wSet }, { data: wChecks }, { data: wLog }] = await Promise.all([
    supabase.from('wish_settings').select('*').maybeSingle(),
    supabase.from('wish_checks').select('period_type,period_start,item_id').or(`and(period_type.eq.day,period_start.eq.${wp.day}),and(period_type.eq.week,period_start.eq.${wp.week})`),
    supabase.from('wish_reminders').select('kind,period_start,action,snooze_until').in('period_start', [wp.day, wp.week]),
  ]);
  const wDay = (wChecks || []).filter((c) => c.period_type === 'day').map((c) => c.item_id);
  const wWeek = (wChecks || []).filter((c) => c.period_type === 'week').map((c) => c.item_id);
  const wCount = (ids, items) => ({ done: items.filter((i) => ids.includes(i.id)).length, total: items.length });
  const wish = {
    teaching: teachingFor(wNow.date),
    morning: wCount(wDay, sectionItems('morning')),
    evening: wCount(wDay, sectionItems('evening')),
    weekly: wCount(wWeek, WEEKLY),
  };
  const wishDue = dueReminder({ settings: wSet, now: wNow, progress: wish, log: wLog });
  const lastHealth = bm?.[0]?.date || null;
  const lastRun = runData?.[0] || null;
  const PRIO = { high: 0, medium: 1, low: 2 };
  const focus = (focusData || []).sort((a, b) => (PRIO[a.priority] ?? 1) - (PRIO[b.priority] ?? 1));
  const events = (evData || []).filter((e) => !e.all_day);
  const allDay = (evData || []).filter((e) => e.all_day);
  // Today's tasks stay on today's calendar even after Akiflow marks them overdue;
  // the overdue line below only lists tasks from earlier days.
  const tasksToday = (taskData || []).filter((t) => t.planned_date === today);
  const overdue = (taskData || []).filter((t) => t.is_overdue && t.status !== 'done' && t.planned_date !== today);
  const dmin = (iso) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso)); return (Number(p.find((x) => x.type === 'hour').value) % 24) * 60 + Number(p.find((x) => x.type === 'minute').value); };
  const calItems = [
    ...events.map((e) => { const s = dmin(e.start_at); const en = e.end_at ? dmin(e.end_at) : s + 30; return { key: `e${e.id}`, start: s, end: en > s ? en : 24 * 60, title: e.title, kind: e.is_meeting ? 'meeting' : 'block', link: e.link || null }; }),
    ...tasksToday.filter((t) => t.start_at).map((t) => { const s = dmin(t.start_at); return { key: `t${t.id}`, start: s, end: Math.min(24 * 60, s + (t.duration_min || 30)), title: t.title, kind: 'task', done: t.status === 'done', late: t.is_overdue && t.status !== 'done', link: t.link || null }; }),
  ];
  const unscheduled = tasksToday.filter((t) => !t.start_at);
  const openToday = tasksToday.filter((t) => t.status !== 'done');
  const needle = openToday.filter((t) => t.needle_mover === true).length;
  const small = openToday.length - needle;
  const overloaded = needle > 4 || small > 2;
  const yesterday = (wdData || []).find((w) => w.date === addDays(today, -1));
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
      {wishDue && <WishReminder kind={wishDue} />}

      <div className="row">
        <section className="card wide">
          <div className="card-head"><h2>Needs your attention</h2></div>
          <div className="action-list">
            {focus.map((f) => (
              <div key={f.id} className="action-item">
                <SourceIcon source={f.source} />
                <a className="body" href={f.link || '#'} target={f.link ? '_blank' : undefined} rel="noopener noreferrer" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                  <strong>{f.title}</strong>{f.priority === 'high' ? <span className="neg" style={{ fontSize: 12 }}> · high</span> : null}<br /><span className="muted">{f.reason}</span>
                </a>
                <form action={setFocus}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="action" value="done" /><button className="btn small" type="submit" aria-label={`Mark ${f.title} done`}>Done</button></form>
                <form action={setFocus}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="action" value="snooze" /><button className="btn ghost small" type="submit" aria-label={`Snooze ${f.title} until tomorrow`}>Tomorrow</button></form>
              </div>
            ))}
            {!wk || wk.status !== 'submitted' ? (
              <a href="/reflections" className="action-item">
                <SourceIcon source="Reflection" />
                <span className="body"><strong>Weekly reflection {wk ? 'still a draft' : 'not started'}</strong><br /><span className="muted">Week {isoWeek(lastWeek)} is ready to review</span></span>
                <span className="go">Start →</span>
              </a>
            ) : null}
            {!latest || latest < month ? (
              <a href="/finance" className="action-item">
                <SourceIcon source="Finance" />
                <span className="body"><strong>Monthly finance update for {monthLabel(month)}</strong><br /><span className="muted">Net worth not entered yet this month</span></span>
                <span className="go">Update →</span>
              </a>
            ) : null}
            {!lastHealth || lastHealth < addDays(today, -7) ? (
              <a href="/health" className="action-item">
                <SourceIcon source="Health" />
                <span className="body"><strong>Weekly health check-in</strong><br /><span className="muted">{lastHealth ? `Last weigh-in ${fmtDate(lastHealth)}` : 'No weight or body fat logged yet'}</span></span>
                <span className="go">Log →</span>
              </a>
            ) : null}
            {active.filter((g) => g.deadline && g.deadline < today).map((g) => (
              <a key={g.id} href={`/goals/${g.id}`} className="action-item">
                <SourceIcon source="Goal" />
                <span className="body"><strong>{g.name}</strong><br /><span className="neg">Deadline passed {fmtDate(g.deadline)}</span></span>
                <span className="go">Review →</span>
              </a>
            ))}
          </div>
          {!lastRun && <p className="muted" style={{ margin: '14px 0 0', fontSize: 13 }}>Press Sync now to pull focus points from Gmail, Zoom, Wispr Flow and Akiflow.</p>}
        </section>
        <section className="card narrow" style={{ flex: '1 1 380px' }}>
          <div className="card-head"><h2>Today</h2>{next ? <span className="muted" style={{ fontSize: 13 }}>Next: {minsTo < 60 ? `in ${minsTo} min` : tm(next.start_at)} · {next.title}</span> : null}</div>
          {allDay.length > 0 && <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>All day: {allDay.map((e) => e.title).join(' · ')}</p>}
          {unscheduled.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {unscheduled.map((t) => (
                <a key={t.id} href={t.link || '#'} target="_blank" rel="noopener noreferrer" className="tag" style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none', color: 'var(--ink)', opacity: t.status === 'done' ? 0.55 : 1 }}>○ {t.title}</a>
              ))}
            </div>
          )}
          {calItems.length === 0 && unscheduled.length === 0 ? (
            <p className="empty">{lastRun ? 'Nothing on your calendar or Akiflow for today.' : 'Press Sync now to load your calendar and Akiflow tasks.'}</p>
          ) : (
            <TodayCalendar items={calItems} />
          )}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }} className="muted">
            <span><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(178,141,81,0.5)', border: '1px solid var(--gold)', marginRight: 5, verticalAlign: -1 }} />Meeting</span>
            <span><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--surface-sunken)', border: '1px solid var(--line)', marginRight: 5, verticalAlign: -1 }} />Time block</span>
            <span><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, border: '1px dashed var(--ink-muted)', marginRight: 5, verticalAlign: -1 }} />Akiflow task</span>
          </div>
          {openToday.length > 0 && (
            <p className={overloaded ? 'neg' : 'pos'} style={{ margin: '12px 0 0', fontSize: 13 }}>
              {needle} needle-mover{needle === 1 ? '' : 's'} + {small} small task{small === 1 ? '' : 's'} · {overloaded ? 'over your 3–4 + 1–2 limit, move something' : 'within your limit'}
            </p>
          )}
          {overdue.length > 0 && <p className="neg" style={{ margin: '6px 0 0', fontSize: 13 }}>{overdue.length} overdue in Akiflow: {overdue.slice(0, 3).map((t) => t.title).join(', ')}{overdue.length > 3 ? '…' : ''}</p>}
          {yesterday && <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Yesterday: {yesterday.focus_hours ?? '—'} h focus{yesterday.last_activity ? `, finished ${String(yesterday.last_activity).slice(0, 5)}` : ''}</p>}
        </section>
      </div>


      <section className="card" aria-labelledby="wish-widget-title" style={{ padding: 20 }}>
        <div className="card-head" style={{ marginBottom: 10 }}>
          <div><p className="overline" style={{ color: 'var(--gold)' }}>Manifesting · Kevin T.</p><h3 id="wish-widget-title" style={{ marginTop: 2 }}>Your Wish Is Your Command</h3></div>
          <a href="/wish">Open →</a>
        </div>
        <div className="row" style={{ gap: 20, alignItems: 'center' }}>
          <div style={{ flex: '2 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="wish-widget-teaching">{wish.teaching.text}</p>
          </div>
          <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[['Morning', wish.morning, '/wish?tab=daily#morning'], ['Evening', wish.evening, '/wish?tab=daily#evening'], ['This week', wish.weekly, '/wish?tab=weekly']].map(([label, p, href]) => (
              <a key={label} href={href} style={{ color: 'var(--ink)', textDecoration: 'none', display: 'grid', gridTemplateColumns: '78px 1fr 40px', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span className="muted">{label}</span>
                <span className="track" style={{ display: 'block', height: 6 }}><span className="bar" style={{ display: 'block', height: 6, width: `${(p.done / p.total) * 100}%` }} /></span>
                <strong className={p.done === p.total ? 'pos' : ''} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.done}/{p.total}</strong>
              </a>
            ))}
          </div>
        </div>
      </section>

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
