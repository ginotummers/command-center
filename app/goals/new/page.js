import GoalFields from '../GoalFields';
import { createGoal } from '../actions';

export const metadata = { title: 'Create goal · Personal Operating Center' };

export default function NewGoal() {
  return (
    <>
      <div>
        <p className="overline"><a href="/goals">Goals</a></p>
        <h1>Create goal</h1>
        <p className="muted">Turn an ambition into a clear, measurable outcome with practical steps.</p>
      </div>
      <form action={createGoal} className="stack">
        <section className="card stack" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2>Define your goal</h2>
          <p className="hint" style={{ margin: 0 }}>Make it measurable: instead of “Get more lean”, write “Reach 5% body fat and 80 kg by 31 March”, then fill in current, target and unit below.</p>
          <GoalFields />
        </section>
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2>Steps / sub-goals</h2>
          <p className="muted" style={{ margin: 0 }}>What are the major things that need to happen for this goal to become reality? Add more later on the goal page.</p>
          {[1, 2, 3].map((i) => (
            <div key={i} className="grid2">
              <label>Step {i} — what needs to happen?<input name={`step_name_${i}`} /></label>
              <label>Why this matters<input name={`step_why_${i}`} /></label>
              <label>Deadline<input type="date" name={`step_deadline_${i}`} /></label>
            </div>
          ))}
        </section>
        <div><button className="btn" type="submit">Save goal</button></div>
      </form>
    </>
  );
}
