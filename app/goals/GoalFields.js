import { STATUSES } from '@/lib/goals';

const v = (x) => (x === null || x === undefined ? '' : x);

// Shared fields for a Main Goal or a Step (Foundation OS Direction Management)
export default function GoalFields({ g = {}, step = false }) {
  return (
    <>
      <label>{step ? 'Step / sub-goal — what needs to happen?' : 'Goal name'}
        <input name="name" defaultValue={v(g.name)} required placeholder={step ? 'Launch the new product' : 'Reach 5% body fat'} />
      </label>
      {!step && (
        <label>The goal — what exactly are you trying to achieve?
          <input name="goal_text" defaultValue={v(g.goal_text)} placeholder="Reach a 50% closing rate by 31 December" />
        </label>
      )}
      <label>{step ? 'Why this matters — how does it move the main goal forward?' : 'Why it matters'}
        <textarea name="why" defaultValue={v(g.why)} />
      </label>
      {!step && (
        <label>Success looks like — what needs to be true to say it is achieved?
          <textarea name="success_looks_like" defaultValue={v(g.success_looks_like)} />
        </label>
      )}
      <div className="grid2">
        <label>Status
          <select name="status" defaultValue={g.status || 'Not Started'}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Deadline<input type="date" name="deadline" defaultValue={v(g.deadline)} /></label>
        <label>Current (optional)<input name="current" inputMode="decimal" defaultValue={v(g.current)} /></label>
        <label>Target (optional)<input name="target" inputMode="decimal" defaultValue={v(g.target)} /></label>
        <label>Unit (optional)<input name="unit" defaultValue={v(g.unit)} placeholder="%, kg, €" /></label>
        <label>Start value (for lower is better)<input name="start_value" inputMode="decimal" defaultValue={v(g.start_value)} /></label>
        <label>Owner (optional)<input name="owner" defaultValue={v(g.owner)} /></label>
        <label>Department (optional)<input name="department" defaultValue={v(g.department)} /></label>
      </div>
      <label className="check"><input type="checkbox" name="lower_is_better" defaultChecked={!!g.lower_is_better} /> Lower is better (body fat, weight, costs)</label>
    </>
  );
}
