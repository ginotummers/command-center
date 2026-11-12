import { createClient } from '@/lib/supabase';
import { fmtDate, todayIso, addDays } from '@/lib/util';
import { dubaiNow } from '@/lib/wish';
import LineChart from '../components/LineChart';
import ProgressPhotos from './ProgressPhotos';
import { addBodyMetric, addWorkouts, addDaily, removeHealthRow, savePlan, logNutrition } from './actions';

export const metadata = { title: 'Health · Personal Operating Center' };
export const dynamic = 'force-dynamic';

const n1 = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d).replace(/\.0$/, ''));
const PHASE_LABEL = { bulking: 'Bulking', cutting: 'Cutting', maintenance: 'Maintenance' };
const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const DAY_TYPE = { training: 'Training day', rest: 'Rest day', off: 'Off day' };
const shortD = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Remove({ table, id, anchor }) {
  return (
    <form action={removeHealthRow} style={{ display: 'inline' }}>
      <input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} /><input type="hidden" name="anchor" value={anchor} />
      <button className="linkbtn" type="submit">Remove</button>
    </form>
  );
}

// Change since the previous entry that has this value
function Delta({ rows, k, unit, good = 'up' }) {
  const v = rows.filter((r) => r[k] !== null && r[k] !== undefined);
  if (v.length < 2) return <span className="muted">{v.length ? `As of ${fmtDate(v[v.length - 1].date)}` : 'Not logged yet'}</span>;
  const a = v[v.length - 1]; const b = v[v.length - 2];
  const d = Number(a[k]) - Number(b[k]);
  if (Math.abs(d) < 0.05) return <span className="muted">No change since {shortD(b.date)}</span>;
  const isGood = good === 'up' ? d > 0 : good === 'down' ? d < 0 : null;
  return <span className={isGood === null ? 'muted' : isGood ? 'pos' : 'neg'}>{d > 0 ? '▲' : '▼'} {n1(Math.abs(d))}{unit} since {shortD(b.date)}</span>;
}

// One "performance" per exercise per session: all its sets, the best set (heaviest, then most reps) and volume
const setsText = (sets) => sets.map((x) => `${n1(x.weight_kg)}×${x.reps ?? '—'}`).join(', ');
function verdict(cur, prev) {
  if (!prev) return { label: 'First time logged', cls: 'muted' };
  const w = Number(cur.best.weight_kg ?? 0); const pw = Number(prev.best.weight_kg ?? 0);
  const r = Number(cur.best.reps ?? 0); const pr = Number(prev.best.reps ?? 0);
  if (w > pw) return { label: `Heavier (+${n1(w - pw)} kg)`, cls: 'pos' };
  if (w === pw && r > pr) return { label: `More reps (+${r - pr})`, cls: 'pos' };
  if (cur.volume > prev.volume) return { label: `More volume (+${Math.round(cur.volume - prev.volume)} kg)`, cls: 'pos' };
  if (cur.volume === prev.volume && w === pw && r === pr) return { label: 'Same as last time', cls: 'muted' };
  return { label: w < pw ? `Lighter (−${n1(pw - w)} kg)` : 'Fewer reps', cls: 'neg' };
}
const SESSION_ORDER = ['Push v1', 'Pull v1', 'Push v2', 'Legs', 'Pull v2', 'Abs', 'Other'];
// The goal is to progress each exercise every 2–3 weeks, not every week
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
function rhythm(list) {
  let since = list[0].date; // date the current level was first reached
  for (let i = 1; i < list.length; i++) if (verdict(list[i], list[i - 1]).cls === 'pos') since = list[i].date;
  const cur = list[list.length - 1];
  if (list.length > 1 && since === cur.date) return { label: 'Progressed', cls: 'pos', rank: 0 };
  const wk = Math.floor(daysBetween(since, cur.date) / 7);
  const held = wk < 1 ? 'Just logged' : `Same level ${wk} wk`;
  if (wk >= 3) return { label: `${held} · overdue`, cls: 'neg', rank: 3 };
  if (wk >= 2) return { label: `${held} · due now`, cls: 'due', rank: 2 };
  return { label: `${held} · on track`, cls: 'muted', rank: 1 };
}

export default async function Health() {
  const supabase = await createClient();
  const today = todayIso();
  const weekday = dubaiNow().weekday;
  const [{ data: bmData }, { data: woData }, { data: dailyData }, { data: planRow }, { data: nutData }, { data: mpData }, { data: ppData }, { data: { user } }] = await Promise.all([
    supabase.from('body_metrics').select('*').order('date'),
    supabase.from('workout_entries').select('*').order('date'),
    supabase.from('health_daily').select('*').gte('date', addDays(today, -13)).order('date'),
    supabase.from('health_plan').select('*').maybeSingle(),
    supabase.from('nutrition_log').select('*').gte('date', addDays(today, -59)).order('date'),
    supabase.from('meal_plans').select('*').order('valid_from', { ascending: false }),
    supabase.from('progress_photos').select('date,pose,path').order('date'),
    supabase.auth.getUser(),
  ]);
  // Meal plan versions: one set (training / rest / off) per date the coach changed it
  const mp = mpData || [];
  const mpDates = [...new Set(mp.map((r) => r.valid_from))];
  const mpOf = (d, t) => mp.find((r) => r.valid_from === d && r.day_type === t) || null;
  const curPlanDate = mpDates[0] || null;
  const bm = bmData || []; const wo = woData || []; const daily = dailyData || []; const nut = nutData || [];
  const plan = planRow || {};

  // Progress photos grouped per date, with the phase at that time and the nearest weigh-in (within 4 days)
  const pp = ppData || [];
  let ppUrls = {};
  if (pp.length) {
    const { data: signed } = await supabase.storage.from('progress').createSignedUrls(pp.map((r) => r.path), 3600);
    (signed || []).forEach((s) => { if (s.signedUrl) ppUrls[s.path] = s.signedUrl; });
  }
  const dayDiff = (a, b) => Math.abs(new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000;
  const photoSets = [...new Set(pp.map((r) => r.date))].sort().map((date) => {
    const photos = {};
    pp.filter((r) => r.date === date).forEach((r) => { photos[r.pose] = ppUrls[r.path] || null; });
    const phaseRow = [...bm].reverse().find((r) => r.date <= date && r.phase);
    const near = bm.filter((r) => r.weight_kg !== null && dayDiff(r.date, date) <= 4).sort((a, b) => dayDiff(a.date, date) - dayDiff(b.date, date))[0];
    return { date, photos, phase: phaseRow?.phase || plan.phase || null, weight: near ? Number(near.weight_kg) : null };
  });
  const split = plan.split || {};
  const todaySession = split[String(weekday)] || null;
  const todayType = todaySession && !/rest/i.test(todaySession) ? 'training' : 'rest';
  // Calorie targets follow the current meal plan when there is one
  const target = {
    training: mpOf(curPlanDate, 'training')?.kcal ?? plan.kcal_training,
    rest: mpOf(curPlanDate, 'rest')?.kcal ?? plan.kcal_rest,
    off: mpOf(curPlanDate, 'off')?.kcal ?? plan.kcal_off,
  };
  const latestOf = (k) => [...bm].reverse().find((r) => r[k] !== null && r[k] !== undefined) || null;
  const lw = latestOf('weight_kg'); const lf = latestOf('body_fat_pct'); const lm = latestOf('muscle_mass_kg'); const lb = latestOf('bmi');
  const lastScan = [...bm].reverse().find((r) => r.source === 'inbody' && r.details) || null;
  const series = (k) => bm.filter((r) => r[k] !== null && r[k] !== undefined).slice(-16)
    .map((r) => ({ label: fmtDate(r.date), short: shortD(r.date), value: Number(r[k]), note: [r.phase ? PHASE_LABEL[r.phase] : null, r.source === 'inbody' ? 'InBody scan' : null].filter(Boolean).join(' · ') || null }));

  // Group sets into performances (exercise × date) and compare each exercise with its previous session
  const perfMap = {};
  wo.forEach((r) => {
    const k = `${r.exercise}|${r.date}`;
    const grp = r.block === 'abs' ? 'Abs' : (r.session || 'Other');
    if (!perfMap[k]) perfMap[k] = { exercise: r.exercise, date: r.date, group: grp, sets: [] };
    for (let i = 0; i < (r.set_no ? 1 : Math.max(1, r.sets || 1)); i++) perfMap[k].sets.push(r);
  });
  const perfs = Object.values(perfMap).map((p) => {
    const best = [...p.sets].sort((x, y) => Number(y.weight_kg ?? 0) - Number(x.weight_kg ?? 0) || Number(y.reps ?? 0) - Number(x.reps ?? 0))[0];
    const volume = p.sets.reduce((a, x) => a + Number(x.weight_kg ?? 0) * Number(x.reps ?? 0), 0);
    return { ...p, sets: [...p.sets].sort((x, y) => (x.set_no ?? 0) - (y.set_no ?? 0)), best, volume };
  });
  // Compare like with like: the same exercise within the same session (Push v1 with last week's Push v1)
  // Abs stay in the session history but are not tracked for progression (fixed weight and reps)
  const exercises = [...new Set(perfs.filter((p) => p.group !== 'Abs').map((p) => `${p.group}|${p.exercise}`))].map((key) => {
    const [, name] = key.split('|');
    const list = perfs.filter((p) => `${p.group}|${p.exercise}` === key).sort((x, y) => x.date.localeCompare(y.date));
    const cur = list[list.length - 1]; const prev = list.length > 1 ? list[list.length - 2] : null;
    return { key, name, cur, prev, count: list.length, v: verdict(cur, prev), r: rhythm(list) };
  });
  const groups = SESSION_ORDER.map((g) => ({ g, list: exercises.filter((e) => e.cur.group === g) })).filter((x) => x.list.length);
  const compared = exercises.filter((e) => e.prev);
  const improved = compared.filter((e) => e.v.cls === 'pos').length;
  const dueCount = exercises.filter((e) => e.r.rank >= 2).length;
  const sessions = [...new Set(wo.map((r) => `${r.date}|${r.session || ''}`))].sort().reverse().map((k) => {
    const [date, session] = k.split('|');
    return { date, session, rows: wo.filter((r) => r.date === date && (r.session || '') === session) };
  });

  const last7 = daily.filter((r) => r.date > addDays(today, -7));
  const avg = (k) => { const v = last7.filter((r) => r[k] !== null); return v.length ? v.reduce((a, r) => a + Number(r[k]), 0) / v.length : null; };
  const sleep = avg('sleep_minutes');
  const nutToday = nut.find((r) => r.date === today);
  const nutPoints = nut.filter((r) => r.calories).slice(-30).map((r) => ({ label: `${fmtDate(r.date)} · ${DAY_TYPE[r.day_type]}`, short: shortD(r.date), value: r.calories, note: target[r.day_type] ? `Target ${target[r.day_type]} kcal` : null }));
  const nut7 = nut.filter((r) => r.date > addDays(today, -7) && r.calories);
  const onTarget = nut7.filter((r) => target[r.day_type] && Math.abs(r.calories - target[r.day_type]) <= target[r.day_type] * 0.1).length;

  return (
    <>
      <div className="section-title" style={{ alignItems: 'flex-end' }}>
        <div>
          <p className="overline">Health</p>
          <h1>Body &amp; training</h1>
        </div>
        {plan.phase && <span className={`phase-badge ${plan.phase}`}>{PHASE_LABEL[plan.phase]} phase</span>}
      </div>

      <div className="row">
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>Weight</p><p className="stat">{lw ? `${n1(lw.weight_kg, 2)} kg` : '—'}</p><Delta rows={bm} k="weight_kg" unit=" kg" good={plan.phase === 'cutting' ? 'down' : plan.phase === 'bulking' ? 'up' : null} /></section>
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>Body fat</p><p className="stat">{lf ? `${n1(lf.body_fat_pct)}%` : '—'}</p><Delta rows={bm} k="body_fat_pct" unit="%" good="down" /></section>
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>Muscle mass</p><p className="stat">{lm ? `${n1(lm.muscle_mass_kg)} kg` : '—'}</p><Delta rows={bm} k="muscle_mass_kg" unit=" kg" good="up" /></section>
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>BMI</p><p className="stat">{lb ? n1(lb.bmi) : '—'}</p><Delta rows={bm} k="bmi" unit="" good={null} /></section>
      </div>

      <section className="card" id="body">
        <div className="card-head"><h2>Body composition</h2><span className="muted" style={{ fontSize: 13 }}>Hover a point for the value and phase</span></div>
        <div className="chart-grid">
          <div><h3 className="chart-title">Weight</h3><LineChart points={series('weight_kg')} unit=" kg" decimals={1} color="#C9A15F" label="Weight" /></div>
          <div><h3 className="chart-title">Body fat</h3><LineChart points={series('body_fat_pct')} unit="%" decimals={1} color="#E8A07A" label="Body fat" /></div>
          <div><h3 className="chart-title">Skeletal muscle mass</h3><LineChart points={series('muscle_mass_kg')} unit=" kg" decimals={1} color="#4FC98A" label="Muscle mass" /></div>
          <div><h3 className="chart-title">BMI</h3><LineChart points={series('bmi')} unit="" decimals={1} color="#8FB3E8" label="BMI" /></div>
        </div>
        {lastScan && (
          <p className="muted" style={{ margin: '14px 0 0', fontSize: 13 }}>
            Last InBody scan {fmtDate(lastScan.date)}: score {lastScan.details.inbody_score ?? '—'}/100 · body fat mass {n1(lastScan.fat_mass_kg)} kg · visceral fat level {lastScan.details.visceral_fat_level ?? '—'} · BMR {lastScan.details.bmr_kcal ?? '—'} kcal
          </p>
        )}
        <details className="fold add-fold" style={{ marginTop: 16 }}>
          <summary><span className="fold-plus" aria-hidden="true">+</span><span style={{ flex: 1, fontWeight: 600 }}>Log a weigh-in or scan</span></summary>
          <form action={addBodyMetric} className="grid2 fold-body" style={{ alignItems: 'end' }}>
            <label>Date<input type="date" name="date" defaultValue={today} /></label>
            <label>Weight (kg)<input name="weight_kg" inputMode="decimal" /></label>
            <label>Body fat (%)<input name="body_fat_pct" inputMode="decimal" placeholder="Optional" /></label>
            <label>Skeletal muscle mass (kg)<input name="muscle_mass_kg" inputMode="decimal" placeholder="Optional" /></label>
            <label>Phase<select name="phase" defaultValue={plan.phase || ''}><option value="">—</option><option value="bulking">Bulking</option><option value="cutting">Cutting</option><option value="maintenance">Maintenance</option></select></label>
            <label>Type<select name="source" defaultValue="scale"><option value="scale">Scale</option><option value="inbody">InBody scan</option></select></label>
            <label style={{ gridColumn: '1 / -1' }}>Note (optional)<input name="note" /></label>
            <button className="btn" type="submit">Save</button>
            <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>BMI is calculated from your height ({plan.height_cm || '—'} cm).</span>
          </form>
        </details>
        {bm.length > 0 && (
          <details className="fold" style={{ marginTop: 8 }}>
            <summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>All weigh-ins and scans ({bm.length})</span></summary>
            <div className="scroll fold-body"><table>
              <thead><tr><th>Date</th><th className="num">Weight</th><th className="num">Body fat</th><th className="num">Muscle</th><th className="num">BMI</th><th>Phase</th><th></th></tr></thead>
              <tbody>{[...bm].reverse().map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.date)}{r.source === 'inbody' ? <span className="tag" style={{ marginLeft: 6 }}>InBody</span> : null}{r.note ? <div className="muted" style={{ fontSize: 12 }}>{r.note}</div> : null}</td>
                  <td className="num">{r.weight_kg ? `${n1(r.weight_kg, 2)} kg` : '—'}</td>
                  <td className="num">{r.body_fat_pct ? `${n1(r.body_fat_pct)}%` : '—'}</td>
                  <td className="num">{r.muscle_mass_kg ? `${n1(r.muscle_mass_kg)} kg` : '—'}</td>
                  <td className="num">{n1(r.bmi)}</td>
                  <td className="muted">{r.phase ? PHASE_LABEL[r.phase] : '—'}</td>
                  <td className="row-actions"><Remove table="body_metrics" id={r.id} anchor="body" /></td>
                </tr>
              ))}</tbody>
            </table></div>
          </details>
        )}
      </section>

      <section className="card" id="training">
        <div className="card-head"><h2>Training</h2><span className="muted" style={{ fontSize: 13 }}>Today: <strong style={{ color: 'var(--ink)' }}>{todaySession || '—'}</strong></span></div>
        {Object.keys(split).length > 0 && (
          <div className="split-row">
            {DAYS.map(([d, l]) => (
              <div key={d} className={`split-day${d === weekday ? ' today' : ''}${/rest/i.test(split[String(d)] || '') ? ' rest' : ''}`}>
                <span className="muted" style={{ fontSize: 11 }}>{l}</span>
                <strong>{split[String(d)] || '—'}</strong>
              </div>
            ))}
          </div>
        )}
        <p className="muted" style={{ margin: '10px 0 16px', fontSize: 13 }}>Abs on push and pull days. Cardio: {plan.cardio || '—'}</p>
        <div className="card-head" style={{ marginBottom: 8 }}><h3 style={{ margin: 0 }}>Progress per exercise</h3>
          {compared.length > 0 && <span className="muted" style={{ fontSize: 13 }}>{improved} of {compared.length} up vs last time{dueCount ? <> · <span className="due">{dueCount} due to progress</span></> : ' · none due yet'}</span>}</div>
        {exercises.length === 0 ? <p className="empty">No workouts logged yet. Each exercise will show its latest session against the one before.</p> : (
          <div className="fold-list">
            {groups.map(({ g, list }) => {
              const up = list.filter((e) => e.v.cls === 'pos').length; const withPrev = list.filter((e) => e.prev).length;
              const due = list.filter((e) => e.r.rank >= 2).length;
              return (
                <details key={g} className="fold">
                  <summary>
                    <span className="fold-chev" aria-hidden="true">▸</span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{g}{todaySession === g ? <span className="tag" style={{ marginLeft: 8 }}>Today</span> : null}</span>
                    <span className="muted" style={{ fontSize: 13 }}>{list.length} exercise{list.length === 1 ? '' : 's'}{withPrev ? ` · ${up}/${withPrev} up` : ` · last ${shortD(list[0].cur.date)}`}{due ? <span className="due">{` · ${due} due`}</span> : null}</span>
                  </summary>
                  <div className="scroll fold-body"><table>
                    <thead><tr><th>Exercise</th><th>Latest</th><th>Previous</th><th>vs last time</th><th>2–3 week goal</th></tr></thead>
                    <tbody>{list.map((e) => (
                      <tr key={e.key}>
                        <td><strong>{e.name}</strong></td>
                        <td>{setsText(e.cur.sets)}<div className="muted" style={{ fontSize: 12 }}>{shortD(e.cur.date)}</div></td>
                        <td>{e.prev ? <>{setsText(e.prev.sets)}<div className="muted" style={{ fontSize: 12 }}>{shortD(e.prev.date)}</div></> : <span className="muted">—</span>}</td>
                        <td className={e.v.cls}><strong>{e.v.label}</strong></td>
                        <td className={e.r.cls}>{e.r.label}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                </details>
              );
            })}
          </div>
        )}
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>Sets shown as kg × reps. Progress compares your best set (heaviest, then most reps), then total volume, with the previous time you did the exercise in the same session (e.g. Push v1 with last week's Push v1). The goal is a step up every 2–3 weeks, so a week at the same level is on track; after 2 weeks it shows as due, after 3 as overdue. Warm-ups and abs are logged but not tracked for progression.</p>
        <details className="fold add-fold" style={{ marginTop: 16 }}>
          <summary><span className="fold-plus" aria-hidden="true">+</span><span style={{ flex: 1, fontWeight: 600 }}>Log a workout</span></summary>
          <form action={addWorkouts} className="fold-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="grid2" style={{ maxWidth: 480 }}>
              <label>Date<input type="date" name="date" defaultValue={today} /></label>
              <label>Session<select name="session" defaultValue={todaySession && !/rest/i.test(todaySession) ? todaySession : ''}><option value="">—</option>{SESSION_ORDER.filter((x) => x !== 'Other').map((x) => <option key={x}>{x}</option>)}</select></label>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>One line per set, or one line per exercise with the number of sets if they were all the same. Easier: send Claude your 1FIT screenshots.</p>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="grid2" style={{ gridTemplateColumns: 'minmax(180px, 3fr) repeat(3, minmax(70px, 1fr)) minmax(120px, 2fr)' }}>
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
        {sessions.length > 0 && (
          <details className="fold" style={{ marginTop: 8 }}>
            <summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>Logged sessions ({sessions.length})</span></summary>
            <div className="fold-body list">
              {sessions.slice(0, 30).map((ss) => {
                const ex = [...new Set(ss.rows.map((r) => r.exercise))];
                return (
                  <div key={`${ss.date}${ss.session}`}>
                    <strong>{fmtDate(ss.date)}{ss.session ? ` · ${ss.session}` : ''}</strong>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {ex.map((name) => { const rs = ss.rows.filter((r) => r.exercise === name).sort((x, y) => (x.set_no ?? 0) - (y.set_no ?? 0)); return <div key={name}>{name}: {setsText(rs)}</div>; })}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </section>

      <div className="row">
        <section className="card wide" id="nutrition">
          <div className="card-head"><h2>Nutrition</h2><span className="muted" style={{ fontSize: 13 }}>Today is a {DAY_TYPE[todayType].toLowerCase()}{target[todayType] ? ` · target ${target[todayType]} kcal` : ''}</span></div>
          <div className="kcal-row">
            {['training', 'rest', 'off'].map((t) => (
              <div key={t} className={`kcal-box${t === todayType ? ' today' : ''}`}><span className="muted" style={{ fontSize: 12 }}>{DAY_TYPE[t]}</span><strong>{target[t] ? `${target[t]} kcal` : '—'}</strong></div>
            ))}
          </div>
          {nutPoints.length > 0 ? (
            <>
              <h3 className="chart-title" style={{ marginTop: 16 }}>Calories logged</h3>
              <LineChart points={nutPoints} unit=" kcal" decimals={0} color="#C9A15F" label="Calories" />
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>Last 7 days: {nut7.length} day{nut7.length === 1 ? '' : 's'} logged, {onTarget} within 10% of target.</p>
            </>
          ) : <p className="muted" style={{ margin: '14px 0 0', fontSize: 13 }}>Log a day's total calories below to start comparing with your targets. Optional; one number a day is enough.</p>}
          <details className="fold add-fold" style={{ marginTop: 16 }} open={false}>
            <summary><span className="fold-plus" aria-hidden="true">+</span><span style={{ flex: 1, fontWeight: 600 }}>{nutToday ? `Today logged: ${nutToday.calories ?? '—'} kcal · edit` : 'Log calories'}</span></summary>
            <form action={logNutrition} className="grid2 fold-body" style={{ alignItems: 'end' }}>
              <label>Date<input type="date" name="date" defaultValue={today} /></label>
              <label>Day type<select name="day_type" defaultValue={nutToday?.day_type || todayType}><option value="training">Training day</option><option value="rest">Rest day</option><option value="off">Off day</option></select></label>
              <label>Total calories<input name="calories" inputMode="numeric" defaultValue={nutToday?.calories ?? ''} placeholder={target[todayType] ? String(target[todayType]) : ''} /></label>
              <label>Note (optional)<input name="note" defaultValue={nutToday?.note ?? ''} placeholder="e.g. dinner out, extra rice" /></label>
              <button className="btn" type="submit">Save</button>
            </form>
          </details>
          {curPlanDate ? (
            <>
              <h3 style={{ margin: '20px 0 8px' }}>Meal plan <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· from your coach, as of {fmtDate(curPlanDate)}</span></h3>
              <div className="fold-list">
                {['training', 'rest', 'off'].map((t) => {
                  const p = mpOf(curPlanDate, t); if (!p) return null;
                  return (
                    <details key={t} className="fold" open={t === todayType}>
                      <summary><span className="fold-chev" aria-hidden="true">▸</span>
                        <span style={{ flex: 1, fontWeight: 600 }}>{DAY_TYPE[t]}{t === todayType ? <span className="tag" style={{ marginLeft: 8 }}>Today</span> : null}</span>
                        <span className="muted" style={{ fontSize: 13 }}>{p.kcal} kcal · P {n1(p.protein)} · C {n1(p.carbs)} · F {n1(p.fat)}</span></summary>
                      <div className="scroll fold-body"><table>
                        <thead><tr><th>Food</th><th>Amount</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead>
                        {(p.meals || []).map((m) => (
                          <tbody key={m.name}>
                            <tr><td colSpan={6} style={{ fontWeight: 600, color: 'var(--gold-light)' }}>{m.name} <span className="muted" style={{ fontWeight: 400 }}>· {Math.round((m.items || []).reduce((a, i) => a + Number(i.kcal || 0), 0))} kcal</span></td></tr>
                            {(m.items || []).map((i, ix) => <tr key={ix}><td>{i.food}</td><td className="muted">{i.amount}</td><td>{i.kcal}</td><td>{n1(i.p)} g</td><td>{n1(i.c)} g</td><td>{n1(i.f)} g</td></tr>)}
                          </tbody>
                        ))}
                      </table></div>
                    </details>
                  );
                })}
                <details className="fold">
                  <summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>Plan history</span><span className="muted" style={{ fontSize: 13 }}>{mpDates.length} version{mpDates.length === 1 ? '' : 's'}</span></summary>
                  <div className="scroll fold-body"><table>
                    <thead><tr><th>From</th><th>Training day</th><th>Rest day</th><th>Off day</th></tr></thead>
                    <tbody>{mpDates.map((d, ix) => {
                      const older = mpDates[ix + 1];
                      return (
                        <tr key={d}><td><strong>{fmtDate(d)}</strong>{ix === 0 ? <div className="muted" style={{ fontSize: 12 }}>Current</div> : null}</td>
                          {['training', 'rest', 'off'].map((t) => {
                            const p = mpOf(d, t); const o = older ? mpOf(older, t) : null;
                            if (!p) return <td key={t} className="muted">—</td>;
                            const dk = o ? p.kcal - o.kcal : 0;
                            return <td key={t}>{p.kcal} kcal{dk ? <span className={dk > 0 ? 'pos' : 'neg'}> ({dk > 0 ? '+' : '−'}{Math.abs(dk)})</span> : null}<div className="muted" style={{ fontSize: 12 }}>P {n1(p.protein)} · C {n1(p.carbs)} · F {n1(p.fat)}</div></td>;
                          })}
                        </tr>
                      );
                    })}</tbody>
                  </table>
                  {mp[0]?.notes ? <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>Coach's notes: {mp[0].notes}</p> : null}
                  <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>When your coach changes the plan, send Claude the screenshots and a new version is added here; older versions stay.</p></div>
                </details>
              </div>
            </>
          ) : Array.isArray(plan.meals) && plan.meals.length > 0 && (
            <details className="fold" style={{ marginTop: 8 }}>
              <summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>Meal plan</span></summary>
              <div className="fold-body list">
                {plan.meals.map((m) => <div key={m.name}><strong>{m.name}</strong><div className="muted">{m.items}</div></div>)}
              </div>
            </details>
          )}
        </section>

        <section className="card narrow" id="daily">
          <div className="card-head"><h2>Daily health</h2><span className="muted">7-day average</span></div>
          <div className="list">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Steps</span><strong>{avg('steps') ? Math.round(avg('steps')).toLocaleString('en-GB') : '—'}{plan.steps_goal ? <span className="muted" style={{ fontWeight: 400 }}> / {Number(plan.steps_goal).toLocaleString('en-GB')} goal</span> : null}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Active calories</span><strong>{avg('active_kcal') ? `${Math.round(avg('active_kcal'))} kcal` : '—'}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sleep</span><strong>{sleep ? `${Math.floor(sleep / 60)} h ${String(Math.round(sleep % 60)).padStart(2, '0')}` : '—'}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Resting heart rate</span><strong>{avg('resting_hr') ? `${Math.round(avg('resting_hr'))} bpm` : '—'}</strong></div>
          </div>
          <details className="fold add-fold" style={{ marginTop: 14 }}>
            <summary><span className="fold-plus" aria-hidden="true">+</span><span style={{ flex: 1, fontWeight: 600 }}>Log a day</span></summary>
            <form action={addDaily} className="fold-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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

      <section className="card" id="progress">
        <div className="card-head"><h2>Progress photos</h2><span className="muted" style={{ fontSize: 13 }}>{photoSets.length ? `${photoSets.length} week${photoSets.length === 1 ? '' : 's'} · latest ${fmtDate(photoSets[photoSets.length - 1].date)}` : 'Front, side and back, once a week'}</span></div>
        <ProgressPhotos userId={user?.id} today={today} sets={photoSets} />
      </section>

      <section className="card" id="plan">
        <details className="block-fold">
          <summary><span className="fold-chev" aria-hidden="true">▸</span><h2 style={{ flex: 1 }}>My plan</h2><span className="muted" style={{ fontSize: 13 }}>{plan.phase ? PHASE_LABEL[plan.phase] : 'No phase set'} · {plan.height_cm ? `${plan.height_cm} cm` : 'height not set'}</span></summary>
          <form action={savePlan} className="grid2 block-body" style={{ alignItems: 'end' }}>
            <label>Current phase<select name="phase" defaultValue={plan.phase || ''}><option value="">—</option><option value="bulking">Bulking</option><option value="cutting">Cutting</option><option value="maintenance">Maintenance</option></select></label>
            <label>Height (cm)<input name="height_cm" inputMode="decimal" defaultValue={plan.height_cm ?? ''} /></label>
            <label>Training day kcal<input name="kcal_training" inputMode="numeric" defaultValue={plan.kcal_training ?? ''} /></label>
            <label>Rest day kcal<input name="kcal_rest" inputMode="numeric" defaultValue={plan.kcal_rest ?? ''} /></label>
            <label>Off day kcal<input name="kcal_off" inputMode="numeric" defaultValue={plan.kcal_off ?? ''} /></label>
            <label>Steps goal<input name="steps_goal" inputMode="numeric" defaultValue={plan.steps_goal ?? ''} /></label>
            <button className="btn" type="submit">Save plan</button>
            <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>Training split and meal plan: send Claude the 1FIT screenshots to update them. Calorie targets follow the current meal plan.</span>
          </form>
        </details>
      </section>
    </>
  );
}
