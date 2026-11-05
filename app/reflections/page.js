import { createClient } from '@/lib/supabase';
import { fmtDate, periodTitle, todayIso, todayParts, isoWeek, addDays, weekStart, monthLabel, monthStart, shiftMonth } from '@/lib/util';
import { newReflection } from './actions';

export const metadata = { title: 'Reflections · Personal Operating Center' };

export default async function Reflections({ searchParams }) {
  const sp = await searchParams;
  const type = sp?.type === 'monthly' ? 'monthly' : 'weekly';
  const supabase = await createClient();
  const { data } = await supabase.from('reflections').select('id,type,period_start,period_end,week_number,month,year,status,completed_at,answers').eq('type', type).order('period_start', { ascending: false });
  const rows = data || [];
  const submitted = rows.filter((r) => r.status === 'submitted');
  const today = todayIso();
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
  const weekNo = isoWeek(dow <= 3 ? addDays(weekStart(today), -7) : weekStart(today));
  const { d } = todayParts();
  const monthName = monthLabel(d <= 10 ? shiftMonth(monthStart(), -1) : monthStart());

  return (
    <>
      <div className="section-title">
        <div>
          <p className="overline">Review & Improve</p>
          <h1>Reflections</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>Review → Identify → Decide → Act → Compare</p>
        </div>
      </div>
      {sp?.saved && <p className="hint" style={{ margin: 0 }}>Reflection submitted and saved.</p>}

      <div className="entry-cards">
        <form action={newReflection} style={{ flex: '1 1 320px', display: 'flex' }}>
          <input type="hidden" name="type" value="weekly" />
          <button className="entry-card" type="submit">
            <span className="overline">Weekly · about 20 minutes</span>
            <h2>Fill in your weekly reflection</h2>
            <span className="muted">Performance review and operator review for Week {weekNo}: time, work, showing up and next week's actions.</span>
            <span className="go">Open the questionnaire →</span>
          </button>
        </form>
        <form action={newReflection} style={{ flex: '1 1 320px', display: 'flex' }}>
          <input type="hidden" name="type" value="monthly" />
          <button className="entry-card" type="submit">
            <span className="overline">Monthly · about 40 minutes</span>
            <h2>Fill in your monthly reflection</h2>
            <span className="muted">The bigger picture for {monthName}: achievements, patterns, direction and next month's priorities.</span>
            <span className="go">Open the questionnaire →</span>
          </button>
        </form>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Your answers save as a draft whenever you like, so you can finish later. Opening one that already exists continues where you left off.</p>

      <div className="tabs">
        <a href="/reflections?type=weekly" className={`pill${type === 'weekly' ? ' active' : ''}`}>Weekly history</a>
        <a href="/reflections?type=monthly" className={`pill${type === 'monthly' ? ' active' : ''}`}>Monthly history</a>
      </div>

      <div className="row">
        <section className="card wide">
          {rows.length === 0 ? <p className="empty">No {type} reflections yet. Start one above.</p> : (
            <div className="list">
              {rows.map((r) => (
                <a key={r.id} href={`/reflections/${r.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--ink)', textDecoration: 'none' }}>
                  <span><strong>{periodTitle(r)}</strong><span className="muted"> · {fmtDate(r.period_start)} – {fmtDate(r.period_end)}</span></span>
                  <span className={r.status === 'submitted' ? 'pos' : 'muted'}>{r.status === 'submitted' ? `Completed ${fmtDate(r.completed_at)}` : 'Draft'}</span>
                </a>
              ))}
            </div>
          )}
        </section>
        <section className="card narrow">
          <h2 style={{ marginBottom: 6 }}>Compare</h2>
          <p className="muted" style={{ margin: '0 0 14px' }}>Put two {type === 'weekly' ? 'weeks' : 'months'} side by side.</p>
          {submitted.length + rows.filter((r) => r.status !== 'submitted').length < 2 ? <p className="empty">Needs at least two reflections.</p> : (
            <form action="/reflections/compare" method="get" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label>This period<select name="a" defaultValue={rows[0]?.id}>{rows.map((r) => <option key={r.id} value={r.id}>{periodTitle(r)}</option>)}</select></label>
              <label>Compared with<select name="b" defaultValue={rows[1]?.id}>{rows.map((r) => <option key={r.id} value={r.id}>{periodTitle(r)}</option>)}</select></label>
              <div><button className="btn" type="submit">Compare</button></div>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
