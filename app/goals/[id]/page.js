import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { progress, measurabilityHints } from '@/lib/goals';
import { fmtDate } from '@/lib/util';
import GoalFields from '../GoalFields';
import ProgressBar from '../ProgressBar';
import { updateGoal, addStep, setArchived } from '../actions';

export default async function GoalPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: g } = await supabase.from('goals').select('*').eq('id', id).maybeSingle();
  if (!g) notFound();
  if (g.type === 'step' && g.parent_id) {
    // Steps are edited inline on their main goal's page
  }
  const { data: stepsData } = await supabase.from('goals').select('*').eq('parent_id', id).order('created_at');
  const steps = stepsData || [];
  const hints = measurabilityHints(g);
  const p = progress(g);

  return (
    <>
      <div className="section-title">
        <div>
          <p className="overline"><a href="/goals">Goals</a> · {g.type === 'main' ? 'Main goal' : 'Step'}</p>
          <h1>{g.name}</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>{g.status} · Deadline {fmtDate(g.deadline)} · Created {fmtDate(g.created_at)}{g.archived ? ' · Archived' : ''}</p>
        </div>
        <form action={setArchived}>
          <input type="hidden" name="id" value={g.id} />
          <input type="hidden" name="archived" value={g.archived ? 'false' : 'true'} />
          <input type="hidden" name="back" value={`/goals/${g.id}`} />
          <button className="btn ghost" type="submit">{g.archived ? 'Restore' : 'Archive'}</button>
        </form>
      </div>

      <section className="card">
        <div className="card-head"><h2>Progress</h2><span className="stat" style={{ margin: 0 }}>{p}%</span></div>
        <ProgressBar value={p} label="Goal progress" />
        <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
          {g.target !== null && g.current !== null
            ? (g.lower_is_better ? `From ${g.start_value ?? '—'} toward ${g.target}${g.unit ? ' ' + g.unit : ''}, now ${g.current}.` : `${g.current} of ${g.target}${g.unit ? ' ' + g.unit : ''}.`)
            : 'Progress follows the status: Not Started 0%, In Progress 50%, Achieved 100%.'}
          {' '}Independent of the steps below.
        </p>
      </section>

      {hints.length > 0 && (
        <div className="hint">
          <strong>Make it measurable</strong>
          <ul>{hints.map((h) => <li key={h}>{h}</li>)}</ul>
        </div>
      )}

      <div className="row">
        <section className="card wide">
          <h2 style={{ marginBottom: 14 }}>Details</h2>
          <form action={updateGoal} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input type="hidden" name="id" value={g.id} />
            <GoalFields g={g} step={g.type === 'step'} />
            <div><button className="btn" type="submit">Save changes</button></div>
          </form>
        </section>

        {g.type === 'main' && (
          <section className="card narrow">
            <h2 style={{ marginBottom: 6 }}>Steps / sub-goals</h2>
            {steps.length === 0 && <p className="muted">No steps yet.</p>}
            <div className="list">
              {steps.map((s) => (
                <details key={s.id}>
                  <summary>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <strong>{s.name}</strong><span className="muted">{progress(s)}%</span>
                    </div>
                    <p className="muted" style={{ margin: '2px 0 8px', fontSize: 13 }}>{s.status} · Deadline {fmtDate(s.deadline)}{s.archived ? ' · Archived' : ''}</p>
                    <ProgressBar value={progress(s)} label={`${s.name} progress`} />
                  </summary>
                  <form action={updateGoal} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="back" value={`/goals/${g.id}`} />
                    <GoalFields g={s} step />
                    <div style={{ display: 'flex', gap: 8 }}><button className="btn small" type="submit">Save step</button></div>
                  </form>
                  <form action={setArchived} style={{ marginTop: 8 }}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="archived" value={s.archived ? 'false' : 'true'} />
                    <input type="hidden" name="back" value={`/goals/${g.id}`} />
                    <button className="linkbtn" type="submit">{s.archived ? 'Restore step' : 'Archive step'}</button>
                  </form>
                </details>
              ))}
            </div>
            <details style={{ marginTop: 16 }}>
              <summary className="btn ghost small">Add a step</summary>
              <form action={addStep} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                <input type="hidden" name="parent_id" value={g.id} />
                <GoalFields step />
                <div><button className="btn small" type="submit">Add step</button></div>
              </form>
            </details>
          </section>
        )}
      </div>
    </>
  );
}
