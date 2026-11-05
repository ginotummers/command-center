import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { sectionsFor } from '@/lib/questions';
import { fmtDate, periodTitle } from '@/lib/util';
import { saveReflection } from '../actions';

const ACTION_STATUSES = ['Not Started', 'In Progress', 'Completed'];

export default async function ReflectionPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: r } = await supabase.from('reflections').select('*').eq('id', id).maybeSingle();
  if (!r) notFound();
  const [{ data: metricsData }, { data: actionsData }, { data: prevData }] = await Promise.all([
    supabase.from('reflection_metrics').select('*').eq('reflection_id', id).order('position'),
    supabase.from('improvement_actions').select('*').eq('reflection_id', id).order('created_at'),
    supabase.from('reflections').select('id,type,period_start,week_number,year').eq('type', r.type).lt('period_start', r.period_start).order('period_start', { ascending: false }).limit(1),
  ]);
  const prev = prevData?.[0] || null;
  let prevActions = [];
  if (prev) {
    const { data } = await supabase.from('improvement_actions').select('*').eq('reflection_id', prev.id).order('created_at');
    prevActions = data || [];
  }
  const metrics = metricsData || [];
  const actions = actionsData || [];
  const metricRows = [...metrics, ...Array.from({ length: Math.max(3, 6 - metrics.length) }, () => ({}))].slice(0, 12);
  const actionRows = [...actions, ...Array.from({ length: Math.max(2, 4 - actions.length) }, () => ({}))].slice(0, 12);
  const answers = r.answers || {};
  const sections = sectionsFor(r.type);
  const totalQ = sections.reduce((a, s) => a + s.groups.reduce((b, g) => b + g.questions.length, 0), 0);
  const answered = Object.keys(answers).length;

  return (
    <form action={saveReflection} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <input type="hidden" name="id" value={r.id} />
      <div className="section-title">
        <div>
          <p className="overline"><a href="/reflections">Reflections</a> · {r.type === 'weekly' ? 'Weekly' : 'Monthly'} · {r.status === 'submitted' ? 'Submitted' : 'Draft'}</p>
          <h1>{periodTitle(r)}</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>{fmtDate(r.period_start)} – {fmtDate(r.period_end)} · {answered} of {totalQ} questions answered</p>
        </div>
        <div className="nav">
          <button className="btn ghost" type="submit" name="intent" value="draft">Save draft</button>
          <button className="btn" type="submit" name="intent" value="submit">{r.status === 'submitted' ? 'Save' : 'Submit'}</button>
        </div>
      </div>
      {sp?.saved && <p className="hint" style={{ margin: 0 }}>Saved.</p>}

      <div className="track"><div className="bar" style={{ width: `${Math.round((answered / totalQ) * 100)}%` }} /></div>

      <section className="card">
        <div className="grid2">
          <label>Period start<input type="date" name="period_start" defaultValue={r.period_start} /></label>
          <label>Period end<input type="date" name="period_end" defaultValue={r.period_end} /></label>
        </div>
      </section>

      {prev && (
        <section className="card">
          <h2>Follow-through from {periodTitle(prev)}</h2>
          <p className="muted" style={{ margin: '4px 0 12px' }}>Did you do what you committed to last time?</p>
          {prevActions.length === 0 ? <p className="muted">No improvement actions were set.</p> : (
            <div className="list">
              {prevActions.map((a) => (
                <div key={a.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <span>{a.description}{a.target_date ? <span className="muted"> · by {fmtDate(a.target_date)}</span> : null}</span>
                  <select name={`prev_${a.id}`} defaultValue={a.status} style={{ width: 'auto' }} aria-label={`Status of ${a.description}`}>
                    {ACTION_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {sections.map((s) => (
        <section key={s.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p className="overline">{s.id === 'performance' ? 'Section A' : s.id === 'operator' ? 'Section B' : 'Monthly'}</p>
            <h2>{s.title}</h2>
            {s.purpose && <p className="muted" style={{ margin: '4px 0 0' }}>{s.purpose}</p>}
          </div>
          {s.groups.map((g) => {
            const done = g.questions.filter(([qid]) => answers[qid]).length;
            return (
              <details key={g.id} open={done < g.questions.length} style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <summary style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <h3>{g.title}</h3><span className="muted">{done}/{g.questions.length} ▾</span>
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
                  {g.kpis && (
                    <div className="scroll">
                      <table>
                        <thead><tr><th>KPI</th><th className="num">Target</th><th className="num">Actual</th><th>Notes</th></tr></thead>
                        <tbody>
                          {metricRows.map((m, i) => (
                            <tr key={i}>
                              <td><input name={`metric_${i}`} defaultValue={m.metric || ''} aria-label={`KPI ${i + 1}`} placeholder={i === 0 ? 'Focus hours' : ''} /></td>
                              <td style={{ width: 110 }}><input name={`target_${i}`} inputMode="decimal" defaultValue={m.target ?? ''} aria-label={`Target ${i + 1}`} /></td>
                              <td style={{ width: 110 }}><input name={`actual_${i}`} inputMode="decimal" defaultValue={m.actual ?? ''} aria-label={`Actual ${i + 1}`} /></td>
                              <td><input name={`mnote_${i}`} defaultValue={m.note || ''} aria-label={`Notes ${i + 1}`} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {g.questions.map(([qid, text]) => (
                    <label key={qid} className="qa" style={{ color: 'var(--ink)' }}>{text}
                      <textarea name={`q_${qid}`} defaultValue={answers[qid] || ''} />
                    </label>
                  ))}
                  {g.actions && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <h3>Actions for next period</h3>
                      {actionRows.map((a, i) => (
                        <div key={i} className="grid2" style={{ gridTemplateColumns: 'minmax(220px, 3fr) minmax(140px, 1fr) minmax(140px, 1fr)' }}>
                          <input type="hidden" name={`acreated_${i}`} value={a.created_at || ''} />
                          <input name={`action_${i}`} defaultValue={a.description || ''} placeholder="Concrete action" aria-label={`Action ${i + 1}`} />
                          <input type="date" name={`adate_${i}`} defaultValue={a.target_date || ''} aria-label={`Target date ${i + 1}`} />
                          <select name={`astatus_${i}`} defaultValue={a.status || 'Not Started'} aria-label={`Status ${i + 1}`}>
                            {ACTION_STATUSES.map((st) => <option key={st}>{st}</option>)}
                          </select>
                        </div>
                      ))}
                      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Save to get more empty rows. Sending actions to Akiflow comes with the next phase.</p>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </section>
      ))}

      <div className="nav">
        <button className="btn ghost" type="submit" name="intent" value="draft">Save draft</button>
        <button className="btn" type="submit" name="intent" value="submit">{r.status === 'submitted' ? 'Save' : 'Submit reflection'}</button>
      </div>
    </form>
  );
}
