import { createClient } from '@/lib/supabase';
import { progress, STATUSES, isNumeric } from '@/lib/goals';
import { fmtDate } from '@/lib/util';
import ProgressBar from './ProgressBar';

export const metadata = { title: 'Goals · Personal Operating Center' };
const VIEWS = [['direction', 'Direction'], ['active', 'Active goals'], ['achieved', 'Achieved'], ['archive', 'Archive']];
const DONE = ['Achieved', 'Not Achieved', 'Abandoned'];

function valueLine(g) {
  if (!isNumeric(g)) return g.status;
  return `${g.current} / ${g.target}${g.unit ? ` ${g.unit}` : ''}${g.lower_is_better ? ' · lower is better' : ''}`;
}

export default async function Goals({ searchParams }) {
  const sp = await searchParams;
  const view = VIEWS.some(([k]) => k === sp?.view) ? sp.view : 'direction';
  const supabase = await createClient();
  const { data: all = [] } = await supabase.from('goals').select('*').order('deadline', { ascending: true, nullsFirst: false });
  const goals = all || [];
  const steps = goals.filter((g) => g.type === 'step');
  let mains = goals.filter((g) => g.type === 'main');

  if (view === 'direction') mains = mains.filter((g) => !g.archived);
  if (view === 'active') mains = mains.filter((g) => !g.archived && !DONE.includes(g.status));
  if (view === 'achieved') mains = mains.filter((g) => !g.archived && g.status === 'Achieved');
  if (view === 'archive') mains = mains.filter((g) => g.archived);
  if (sp?.status) mains = mains.filter((g) => g.status === sp.status);
  if (sp?.owner) mains = mains.filter((g) => (g.owner || '').toLowerCase().includes(sp.owner.toLowerCase()));
  if (sp?.department) mains = mains.filter((g) => (g.department || '').toLowerCase().includes(sp.department.toLowerCase()));
  if (sp?.from) mains = mains.filter((g) => g.deadline && g.deadline >= sp.from);
  if (sp?.to) mains = mains.filter((g) => g.deadline && g.deadline <= sp.to);

  return (
    <>
      <div className="section-title">
        <div>
          <p className="overline">Direction</p>
          <h1>Goals</h1>
        </div>
        <a className="btn" href="/goals/new">Create goal</a>
      </div>

      <div className="tabs">
        {VIEWS.map(([k, label]) => (
          <a key={k} href={`/goals?view=${k}`} className={`pill${k === view ? ' active' : ''}`}>{label}</a>
        ))}
      </div>

      <details className="card">
        <summary><h3>Filter</h3></summary>
        <form method="get" className="grid2" style={{ marginTop: 14, alignItems: 'end' }}>
          <input type="hidden" name="view" value={view} />
          <label>Status
            <select name="status" defaultValue={sp?.status || ''}>
              <option value="">Any</option>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Owner<input name="owner" defaultValue={sp?.owner || ''} /></label>
          <label>Department<input name="department" defaultValue={sp?.department || ''} /></label>
          <label>Deadline from<input type="date" name="from" defaultValue={sp?.from || ''} /></label>
          <label>Deadline to<input type="date" name="to" defaultValue={sp?.to || ''} /></label>
          <button className="btn ghost" type="submit">Apply</button>
        </form>
      </details>

      <section className="card">
        {mains.length === 0 ? (
          <p className="empty">No goals here yet. <a href="/goals/new">Create your first goal</a>.</p>
        ) : (
          <div className="list">
            {mains.map((g) => {
              const p = progress(g);
              const kids = steps.filter((s) => s.parent_id === g.id && (view === 'archive' || !s.archived));
              return (
                <details key={g.id}>
                  <summary>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                      <h3><a href={`/goals/${g.id}`} style={{ color: 'var(--ink)', textDecoration: 'none' }}>{g.name}</a></h3>
                      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{p}%</strong>
                    </div>
                    <p className="muted" style={{ margin: '4px 0 10px' }}>
                      Main goal · {g.status} · {valueLine(g)} · Deadline {fmtDate(g.deadline)}
                      {g.owner ? ` · ${g.owner}` : ''}{g.department ? ` · ${g.department}` : ''}
                      {kids.length ? ` · ${kids.length} step${kids.length > 1 ? 's' : ''} ▾` : ''}
                    </p>
                    <ProgressBar value={p} label={`${g.name} progress`} />
                  </summary>
                  {kids.length > 0 && (
                    <div className="list" style={{ marginTop: 12, paddingLeft: 18, borderLeft: '1px solid var(--line)' }}>
                      {kids.map((s) => (
                        <div key={s.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <span>{s.name}</span>
                            <span className="muted">{progress(s)}%</span>
                          </div>
                          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>Step · {s.status} · Deadline {fmtDate(s.deadline)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
