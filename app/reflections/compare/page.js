import { createClient } from '@/lib/supabase';
import { sectionsFor } from '@/lib/questions';
import { periodTitle, pct } from '@/lib/util';

export const metadata = { title: 'Compare reflections · Command Center' };

async function load(supabase, id) {
  const [{ data: r }, { data: m }, { data: a }] = await Promise.all([
    supabase.from('reflections').select('*').eq('id', id).maybeSingle(),
    supabase.from('reflection_metrics').select('*').eq('reflection_id', id).order('position'),
    supabase.from('improvement_actions').select('*').eq('reflection_id', id).order('created_at'),
  ]);
  return r ? { ...r, metrics: m || [], actions: a || [] } : null;
}

export default async function Compare({ searchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const A = sp?.a ? await load(supabase, sp.a) : null;
  const B = sp?.b ? await load(supabase, sp.b) : null;
  if (!A || !B) return <p className="empty">Pick two reflections to compare on the <a href="/reflections">Reflections</a> page.</p>;

  const metricNames = [...new Set([...A.metrics.map((m) => m.metric), ...B.metrics.map((m) => m.metric)])];
  const find = (R, name) => R.metrics.find((m) => m.metric === name);
  const sections = sectionsFor(A.type === 'monthly' || B.type === 'monthly' ? 'monthly' : 'weekly');
  const done = (R) => R.actions.filter((x) => x.status === 'Completed').length;

  return (
    <>
      <div>
        <p className="overline"><a href="/reflections">Reflections</a> · Compare</p>
        <h1>{periodTitle(A)} vs {periodTitle(B)}</h1>
      </div>

      <section className="card">
        <h2 style={{ marginBottom: 10 }}>Metrics</h2>
        {metricNames.length === 0 ? <p className="muted">No KPIs entered in either period.</p> : (
          <div className="scroll"><table>
            <thead><tr><th>KPI</th><th className="num">{periodTitle(A)}</th><th className="num">{periodTitle(B)}</th><th className="num">Difference</th><th className="num">Change</th></tr></thead>
            <tbody>
              {metricNames.map((n) => {
                const a = find(A, n)?.actual; const b = find(B, n)?.actual;
                const has = a !== null && a !== undefined && b !== null && b !== undefined;
                const diff = has ? Number(a) - Number(b) : null;
                const ch = has && Number(b) !== 0 ? (diff / Math.abs(Number(b))) * 100 : null;
                return (
                  <tr key={n}><td>{n}</td><td className="num">{a ?? '—'}</td><td className="num">{b ?? '—'}</td>
                    <td className={`num ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}`}>{diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff}`}</td>
                    <td className="num">{ch === null ? '—' : `${ch > 0 ? '+' : ''}${pct(ch)}`}</td></tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 10 }}>Improvement actions</h2>
        <div className="compare">
          {[A, B].map((R) => (
            <div key={R.id}>
              <p className="overline">{periodTitle(R)} · {done(R)} of {R.actions.length} completed</p>
              <div className="list">
                {R.actions.length === 0 ? <p className="muted">None set.</p> : R.actions.map((x) => (
                  <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{x.description}</span><span className={x.status === 'Completed' ? 'pos' : 'muted'}>{x.status}</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {sections.map((s) => (
        <section key={s.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2>{s.title}</h2>
          {s.groups.map((g) => (
            <details key={g.id} open style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <summary><h3>{g.title}</h3></summary>
              {g.questions.map(([qid, text]) => (
                <div key={qid} style={{ marginTop: 12 }}>
                  <p style={{ margin: '0 0 6px', fontWeight: 600 }}>{text}</p>
                  <div className="compare">
                    {[A, B].map((R) => (
                      <div key={R.id} style={{ background: 'var(--surface-sunken)', borderRadius: 12, padding: 12, whiteSpace: 'pre-wrap' }}>
                        <p className="overline" style={{ marginBottom: 4 }}>{periodTitle(R)}</p>
                        {R.answers?.[qid] || <span className="muted">No answer</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </details>
          ))}
        </section>
      ))}
    </>
  );
}
