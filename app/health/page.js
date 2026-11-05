import { createClient } from '@/lib/supabase';
import { fmtDate, todayIso, addDays } from '@/lib/util';
import { addBodyMetric, addWorkouts, addDaily, removeHealthRow } from './actions';

export const metadata = { title: 'Health · Personal Operating Center' };

const n1 = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d).replace(/\.0$/, ''));

function Remove({ table, id, anchor }) {
  return (
    <form action={removeHealthRow}>
      <input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} /><input type="hidden" name="anchor" value={anchor} />
      <button className="linkbtn" type="submit">Remove</button>
    </form>
  );
}

function Delta({ now, before, unit, lowerIsBetter }) {
  if (now === null || now === undefined || before === null || before === undefined) return <span className="muted">No earlier entry to compare</span>;
  const d = Number(now) - Number(before);
  if (Math.abs(d) < 0.05) return <span className="muted">No change</span>;
  const good = lowerIsBetter ? d < 0 : d > 0;
  return <span className={good ? 'pos' : 'neg'}>{d > 0 ? '▲' : '▼'} {n1(Math.abs(d))}{unit} vs ~2 weeks ago</span>;
}

// Latest value of a field, and the latest value at least 14 days before it
function trend(rows, key) {
  const withVal = rows.filter((r) => r[key] !== null && r[key] !== undefined);
  if (!withVal.length) return { now: null, before: null, date: null };
  const last = withVal[withVal.length - 1];
  const cutoff = addDays(last.date, -14);
  const prev = [...withVal].reverse().find((r) => r.date <= cutoff);
  return { now: last[key], before: prev ? prev[key] : null, date: last.date };
}

function verdict(latest, prev) {
  if (!prev) return { label: 'First entry', cls: 'muted' };
  const w = Number(latest.weight_kg ?? 0); const pw = Number(prev.weight_kg ?? 0);
  const r = Number(latest.reps ?? 0); const pr = Number(prev.reps ?? 0);
  const vol = (latest.sets || 1) * r * (w || 1); const pvol = (prev.sets || 1) * pr * (pw || 1);
  if (w > pw) return { label: `Heavier (+${n1(w - pw)} kg)`, cls: 'pos' };
  if (w === pw && r > pr) return { label: `More reps (+${r - pr})`, cls: 'pos' };
  if (vol > pvol) return { label: 'More volume', cls: 'pos' };
  if (vol === pvol) return { label: 'Stalled', cls: 'muted' };
  return { label: 'Down', cls: 'neg' };
}

export default async function Health() {
  const supabase = await createClient();
  const today = todayIso();
  const [{ data: bmData }, { data: woData }, { data: dailyData }] = await Promise.all([
    supabase.from('body_metrics').select('*').order('date'),
    supabase.from('workout_entries').select('*').order('date'),
    supabase.from('health_daily').select('*').gte('date', addDays(today, -13)).order('date'),
  ]);
  const bm = bmData || []; const wo = woData || []; const daily = dailyData || [];
  const weight = trend(bm, 'weight_kg'); const fat = trend(bm, 'body_fat_pct'); const muscle = trend(bm, 'muscle_mass_kg');
  const recentBm = bm.slice(-12);
  const maxW = Math.max(1, ...recentBm.map((r) => Number(r.weight_kg || 0)));
  const minW = Math.min(...recentBm.filter((r) => r.weight_kg).map((r) => Number(r.weight_kg)), maxW);

  // Per exercise: latest session vs the latest session at least 14 days earlier
  const exercises = [...new Set(wo.map((r) => r.exercise))].map((name) => {
    const rows = wo.filter((r) => r.exercise === name);
    const latest = rows[rows.length - 1];
    const prev = [...rows].reverse().find((r) => r.date <= addDays(latest.date, -14)) || null;
    return { name, latest, prev, v: verdict(latest, prev) };
  }).sort((a, b) => (a.latest.date < b.latest.date ? 1 : -1));

  const last7 = daily.filter((r) => r.date > addDays(today, -7));
  const avg = (k) => { const v = last7.filter((r) => r[k] !== null); return v.length ? v.reduce((a, r) => a + Number(r[k]), 0) / v.length : null; };
  const sleep = avg('sleep_minutes');
  const sessions = new Set(wo.filter((r) => r.date > addDays(today, -7)).map((r) => r.date)).size;

  return (
    <>
      <div>
        <p className="overline">Health</p>
        <h1>Body &amp; training</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>Log once a week from your Kahunas and Apple Health screenshots. Training compares each exercise with two weeks earlier.</p>
      </div>

      <div className="hint">
        <strong>Quickest way to fill this in:</strong> send your weekly Kahunas and Apple Health screenshots to Claude in chat and say “update my health”. Claude reads the numbers and saves them here for you. You can also type them in below.
      </div>

      <div className="row">
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>Weight</p><p className="stat">{weight.now === null ? '—' : `${n1(weight.now)} kg`}</p><Delta now={weight.now} before={weight.before} unit=" kg" lowerIsBetter /></section>
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>Body fat</p><p className="stat">{fat.now === null ? '—' : `${n1(fat.now)}%`}</p><Delta now={fat.now} before={fat.before} unit="%" lowerIsBetter /></section>
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>Muscle mass</p><p className="stat">{muscle.now === null ? '—' : `${n1(muscle.now)} kg`}</p><Delta now={muscle.now} before={muscle.before} unit=" kg" /></section>
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>Last 7 days</p><p className="stat">{sessions} {sessions === 1 ? 'workout' : 'workouts'}</p><span className="muted">{sleep ? `Sleep ${Math.floor(sleep / 60)} h ${String(Math.round(sleep % 60)).padStart(2, '0')} avg` : 'No sleep logged'}</span></section>
      </div>

      <section className="card" id="training">
        <div className="card-head"><h2>Training progress</h2><span className="muted">Latest session vs two weeks earlier</span></div>
        {exercises.length === 0 ? <p className="empty">No workouts logged yet.</p> : (
          <div className="scroll"><table>
            <thead><tr><th>Exercise</th><th>Latest</th><th>Two weeks earlier</th><th>Progress</th></tr></thead>
            <tbody>
              {exercises.map((e) => (
                <tr key={e.name}>
                  <td><strong>{e.name}</strong></td>
                  <td>{e.latest.sets ? `${e.latest.sets} × ` : ''}{e.latest.reps ?? '—'} reps @ {n1(e.latest.weight_kg)} kg<div className="muted" style={{ fontSize: 12 }}>{fmtDate(e.latest.date)}</div></td>
                  <td>{e.prev ? <>{e.prev.sets ? `${e.prev.sets} × ` : ''}{e.prev.reps ?? '—'} reps @ {n1(e.prev.weight_kg)} kg<div className="muted" style={{ fontSize: 12 }}>{fmtDate(e.prev.date)}</div></> : <span className="muted">—</span>}</td>
                  <td className={e.v.cls}><strong>{e.v.label}</strong></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <details style={{ marginTop: 16 }}>
          <summary className="btn ghost small">Log a workout</summary>
          <form action={addWorkouts} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <label style={{ maxWidth: 220 }}>Date<input type="date" name="date" defaultValue={today} /></label>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid2" style={{ gridTemplateColumns: 'minmax(180px, 3fr) repeat(3, minmax(80px, 1fr)) minmax(140px, 2fr)' }}>
                <input name={`exercise_${i}`} placeholder={i === 0 ? 'Bench press' : 'Exercise'} aria-label={`Exercise ${i + 1}`} />
                <input name={`sets_${i}`} inputMode="numeric" placeholder="Sets" aria-label={`Sets ${i + 1}`} />
                <input name={`reps_${i}`} inputMode="numeric" placeholder="Reps" aria-label={`Reps ${i + 1}`} />
                <input name={`weight_${i}`} inputMode="decimal" placeholder="kg" aria-label={`Weight ${i + 1}`} />
                <input name={`note_${i}`} placeholder="Note" aria-label={`Note ${i + 1}`} />
              </div>
            ))}
            <div><button className="btn small" type="submit">Save workout</button></div>
          </form>
        </details>
        {wo.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary className="linkbtn">All logged sets ({wo.length})</summary>
            <div className="scroll" style={{ marginTop: 8 }}><table>
              <tbody>{[...wo].reverse().slice(0, 60).map((r) => (
                <tr key={r.id}><td className="muted">{fmtDate(r.date)}</td><td>{r.exercise}</td><td>{r.sets ? `${r.sets} × ` : ''}{r.reps ?? '—'} @ {n1(r.weight_kg)} kg</td><td><Remove table="workout_entries" id={r.id} anchor="training" /></td></tr>
              ))}</tbody>
            </table></div>
          </details>
        )}
      </section>

      <div className="row">
        <section className="card wide" id="body">
          <div className="card-head"><h2>Weight &amp; body fat</h2></div>
          {recentBm.length === 0 ? <p className="empty">No weigh-ins yet.</p> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, marginBottom: 12 }}>
              {recentBm.map((r) => (
                <div key={r.id} style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }} title={`${fmtDate(r.date)}: ${n1(r.weight_kg)} kg${r.body_fat_pct ? `, ${n1(r.body_fat_pct)}%` : ''}`}>
                  <span style={{ fontSize: 11 }} className="muted">{r.weight_kg ? n1(r.weight_kg) : ''}</span>
                  <div style={{ width: '100%', height: r.weight_kg ? Math.max(8, Math.round(((Number(r.weight_kg) - minW * 0.97) / (maxW - minW * 0.97)) * 100)) : 4, borderRadius: 6, background: r.id === recentBm[recentBm.length - 1].id ? 'var(--gold-grad)' : 'var(--surface-sunken)' }} />
                  <span className="muted" style={{ fontSize: 11 }}>{fmtDate(r.date).split(' ').slice(0, 2).join(' ')}</span>
                </div>
              ))}
            </div>
          )}
          <form action={addBodyMetric} className="grid2" style={{ alignItems: 'end' }}>
            <label>Date<input type="date" name="date" defaultValue={today} /></label>
            <label>Weight (kg)<input name="weight_kg" inputMode="decimal" /></label>
            <label>Body fat (%)<input name="body_fat_pct" inputMode="decimal" /></label>
            <label>Muscle mass (kg)<input name="muscle_mass_kg" inputMode="decimal" /></label>
            <button className="btn" type="submit">Save weigh-in</button>
          </form>
          {bm.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary className="linkbtn">All weigh-ins ({bm.length})</summary>
              <div className="scroll" style={{ marginTop: 8 }}><table><tbody>{[...bm].reverse().map((r) => (
                <tr key={r.id}><td className="muted">{fmtDate(r.date)}</td><td>{n1(r.weight_kg)} kg</td><td>{n1(r.body_fat_pct)}%</td><td>{n1(r.muscle_mass_kg)} kg</td><td><Remove table="body_metrics" id={r.id} anchor="body" /></td></tr>
              ))}</tbody></table></div>
            </details>
          )}
        </section>

        <section className="card narrow" id="daily">
          <div className="card-head"><h2>Daily health</h2><span className="muted">7-day average</span></div>
          <div className="list">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Steps</span><strong>{avg('steps') ? Math.round(avg('steps')).toLocaleString('en-GB') : '—'}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Active calories</span><strong>{avg('active_kcal') ? `${Math.round(avg('active_kcal'))} kcal` : '—'}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sleep</span><strong>{sleep ? `${Math.floor(sleep / 60)} h ${String(Math.round(sleep % 60)).padStart(2, '0')}` : '—'}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Resting heart rate</span><strong>{avg('resting_hr') ? `${Math.round(avg('resting_hr'))} bpm` : '—'}</strong></div>
          </div>
          <details style={{ marginTop: 14 }}>
            <summary className="btn ghost small">Log a day</summary>
            <form action={addDaily} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              <label>Date<input type="date" name="date" defaultValue={today} /></label>
              <div className="grid2">
                <label>Steps<input name="steps" inputMode="numeric" /></label>
                <label>Active kcal<input name="active_kcal" inputMode="numeric" /></label>
                <label>Sleep (hours)<input name="sleep_hours" inputMode="decimal" /></label>
                <label>Resting HR<input name="resting_hr" inputMode="numeric" /></label>
              </div>
              <div><button className="btn small" type="submit">Save day</button></div>
            </form>
          </details>
        </section>
      </div>
    </>
  );
}
