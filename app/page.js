import { createClient } from '@/lib/supabase';
import { progress } from '@/lib/goals';
import { eur, pct, fmtDate, greeting, longToday, monthStart, shiftMonth, monthLabel, todayIso, weekStart, addDays, isoWeek } from '@/lib/util';
import ProgressBar from './goals/ProgressBar';

const DONE = ['Achieved', 'Not Achieved', 'Abandoned'];
const netWorth = (rows) => rows.reduce((a, r) => a + (r.kind === 'liability' ? -1 : 1) * Number(r.value || 0), 0);

export default async function Home() {
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
      <div>
        <p className="overline">{longToday()} · Dubai</p>
        <h1 style={{ marginTop: 6 }}>{greeting()}, Gino</h1>
      </div>

      <div className="row">
        <section className="card wide">
          <div className="card-head"><h2>Needs your attention</h2><span className="tag">Phase 2</span></div>
          <p className="muted" style={{ margin: 0 }}>Focus points from Gmail, Zoom, Wispr Flow and Akiflow appear here once the background agent is connected.</p>
          <div className="list" style={{ marginTop: 12 }}>
            {!wk || wk.status !== 'submitted' ? (
              <a href="/reflections" style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--ink)', textDecoration: 'none' }}>
                <span className="tag">Reflection</span>
                <span><strong>Weekly reflection {wk ? 'still a draft' : 'not started'}</strong><br /><span className="muted">Week {isoWeek(lastWeek)} is ready to review</span></span>
              </a>
            ) : null}
            {!latest || latest < month ? (
              <a href="/money" style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--ink)', textDecoration: 'none' }}>
                <span className="tag">Money</span>
                <span><strong>Monthly money update for {monthLabel(month)}</strong><br /><span className="muted">Net worth not entered yet this month</span></span>
              </a>
            ) : null}
            {active.filter((g) => g.deadline && g.deadline < today).map((g) => (
              <a key={g.id} href={`/goals/${g.id}`} style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--ink)', textDecoration: 'none' }}>
                <span className="tag">Goal</span>
                <span><strong>{g.name}</strong><br /><span className="neg">Deadline passed {fmtDate(g.deadline)}</span></span>
              </a>
            ))}
          </div>
        </section>
        <section className="card narrow">
          <div className="card-head"><h2>Today</h2><span className="tag">Next</span></div>
          <p className="muted" style={{ margin: 0 }}>Your meetings and time blocks from Google Calendar show here once Google sign-in is connected.</p>
        </section>
      </div>

      <div className="row">
        <a href="/money" className="card tile" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
          <p className="muted" style={{ margin: 0 }}>Net worth</p>
          <p className="stat">{eur(nw)}</p>
          {nwChange === null ? <span className="muted">{latest ? monthLabel(latest) : 'Not entered yet'}</span> : <span className={nwChange >= 0 ? 'pos' : 'neg'}>{nwChange >= 0 ? '▲' : '▼'} {pct(Math.abs(nwChange))} vs last month</span>}
        </a>
        <a href="/money" className="card tile" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
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
