import { createClient } from '@/lib/supabase';
import { addDays, fmtDate } from '@/lib/util';
import { SECTIONS, DAILY, WEEKLY, TEACHINGS, teachingFor, DEFAULT_SETTINGS, WEEKDAYS, dubaiNow, periods, sectionItems } from '@/lib/wish';
import Checklist from './Checklist';
import ImageInput from './ImageInput';
import PdfReader from './PdfReader';
import VisionCanvas from './VisionCanvas';
import { saveChiefAim, saveSettings } from './actions';

export const dynamic = 'force-dynamic';

const TABS = [
  ['overview', 'Overview'],
  ['daily', 'Daily Practices'],
  ['weekly', 'Weekly Practices'],
  ['dreams', 'Vision Board'],
  ['reference', 'Master Reference'],
];

const shortDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const range = (a, b) => `${new Date(`${a}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(`${b}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;

function Bar({ label, done, total, href }) {
  const p = total ? Math.round((done / total) * 100) : 0;
  return (
    <a href={href} className="wish-bar" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{label}</span><strong style={{ fontVariantNumeric: 'tabular-nums' }} className={done === total ? 'pos' : ''}>{done}/{total}</strong></span>
      <span className="track" style={{ display: 'block', height: 6 }}><span className="bar" style={{ display: 'block', height: 6, width: `${p}%` }} /></span>
    </a>
  );
}

export default async function WishPage({ searchParams }) {
  const sp = await searchParams;
  const tab = TABS.some(([t]) => t === sp.tab) ? sp.tab : 'overview';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const now = dubaiNow();
  const { day, week, weekEnd } = periods(now.date);
  const histFrom = addDays(day, -13);

  const [{ data: settingsRow, error: settingsErr }, { data: checks }, { data: vision }, { data: files }] = await Promise.all([
    supabase.from('wish_settings').select('*').maybeSingle(),
    supabase.from('wish_checks').select('period_type,period_start,item_id').or(`and(period_type.eq.day,period_start.gte.${histFrom}),and(period_type.eq.week,period_start.gte.${addDays(week, -35)})`),
    supabase.from('vision_items').select('*').order('z').order('created_at'),
    supabase.storage.from('wish').list(user.id, { search: 'master-reference.pdf' }),
  ]);
  const s = { ...DEFAULT_SETTINGS, ...(settingsRow || {}) };
  const loadError = settingsErr ? 'Could not load your module data. Refresh to try again.' : null;

  const dayChecks = (checks || []).filter((c) => c.period_type === 'day');
  const weekChecks = (checks || []).filter((c) => c.period_type === 'week');
  const todayIds = dayChecks.filter((c) => c.period_start === day).map((c) => c.item_id);
  const weekIds = weekChecks.filter((c) => c.period_start === week).map((c) => c.item_id);
  const count = (ids, items) => items.filter((i) => ids.includes(i.id)).length;
  const prog = {
    morning: { done: count(todayIds, sectionItems('morning')), total: sectionItems('morning').length },
    day: { done: count(todayIds, sectionItems('day')), total: sectionItems('day').length },
    evening: { done: count(todayIds, sectionItems('evening')), total: sectionItems('evening').length },
    weekly: { done: count(weekIds, WEEKLY), total: WEEKLY.length },
  };

  // Signed links for private images and the PDF (valid one hour)
  const imgPaths = [s.chief_image_path, ...(vision || []).map((v) => v.image_path)].filter(Boolean);
  const signed = {};
  if (imgPaths.length) {
    const { data } = await supabase.storage.from('wish').createSignedUrls(imgPaths, 3600);
    (data || []).forEach((r) => { if (r.signedUrl) signed[r.path] = r.signedUrl; });
  }
  const hasPdf = (files || []).some((f) => f.name === 'master-reference.pdf');
  let pdfUrl = null; let pdfDownload = null;
  if (hasPdf && tab === 'reference') {
    const p = `${user.id}/master-reference.pdf`;
    const [a, b] = await Promise.all([
      supabase.storage.from('wish').createSignedUrl(p, 3600),
      supabase.storage.from('wish').createSignedUrl(p, 3600, { download: 'Your-Wish-Is-Your-Command-Master-Reference.pdf' }),
    ]);
    pdfUrl = a.data?.signedUrl || null; pdfDownload = b.data?.signedUrl || null;
  }

  const teaching = teachingFor(day);
  const editAim = sp.edit === 'aim' || !s.chief_aim;
  const inMorning = now.minutes < 12 * 60;
  const [eh, em] = s.evening_start.split(':').map(Number);
  const inEvening = now.minutes >= eh * 60 + em - 60;

  return (
    <>
      <div className="section-title" style={{ alignItems: 'flex-end' }}>
        <div>
          <p className="overline">Manifesting · Kevin T.</p>
          <h1 style={{ marginTop: 6 }}>Your Wish Is Your Command</h1>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>{shortDay(day)} · week {range(week, weekEnd)}</span>
      </div>

      <nav className="tabs" aria-label="Module sections">
        {TABS.map(([t, label]) => (
          <a key={t} href={`/wish?tab=${t}`} className={`pill${tab === t ? ' active' : ''}`} aria-current={tab === t ? 'page' : undefined}>{label}</a>
        ))}
      </nav>

      {tab !== 'overview' && s.chief_aim && (
        <a href="/wish" className="wish-aim-strip">
          <span className="overline" style={{ color: 'var(--gold)' }}>Chief Aim</span>
          <span className="wish-aim-strip-text">{s.chief_aim}</span>
        </a>
      )}

      {loadError && <p className="neg" role="alert">{loadError}</p>}
      {sp.saved && <p className="pos" role="status" style={{ margin: 0 }}>Saved.</p>}

      {tab === 'overview' && (
        <>
          <div className="row">
            <section className="card wish-teaching" style={{ flex: '1 1 380px' }}>
              <p className="overline" style={{ color: 'var(--gold)' }}>Teaching of the Day</p>
              <p className="wish-teaching-text">{teaching.text}</p>
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>{teaching.ref} · paraphrased from the Master Reference</p>
            </section>
            <section className="card" style={{ flex: '1 1 320px' }}>
              <div className="card-head"><h2>Today</h2><span className="muted" style={{ fontSize: 13 }}>{shortDay(day)}</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Bar label="Morning Alignment" {...prog.morning} href="/wish?tab=daily#morning" />
                <Bar label="Throughout the Day" {...prog.day} href="/wish?tab=daily#day" />
                <Bar label="Evening Alignment" {...prog.evening} href="/wish?tab=daily#evening" />
                <Bar label={`Weekly · ${range(week, weekEnd)}`} {...prog.weekly} href="/wish?tab=weekly" />
              </div>
            </section>
          </div>

          <section className="card wish-aim">
            <div className="card-head"><h2>My Chief Aim</h2>{!editAim && <a href="/wish?edit=aim">Edit</a>}</div>
            {editAim ? (
              <form action={saveChiefAim} className="stack">
                <label>My current Chief Aim<textarea name="chief_aim" defaultValue={s.chief_aim || ''} placeholder="One Chief Aim, exciting and believable (the sweet spot)" required style={{ minHeight: 64 }} /></label>
                <label>WHY I desire it<textarea name="chief_why" defaultValue={s.chief_why || ''} /></label>
                <label>The feeling of already possessing it<textarea name="chief_feeling" defaultValue={s.chief_feeling || ''} /></label>
                <ImageInput userId={user.id} label="Image for my Chief Aim (optional)" currentUrl={signed[s.chief_image_path] || null} />
                {s.chief_image_path && <label className="check"><input type="checkbox" name="remove_image" /> Remove current image</label>}
                <div style={{ display: 'flex', gap: 10 }}><button className="btn" type="submit">Save Chief Aim</button>{s.chief_aim && <a className="btn ghost" href="/wish">Cancel</a>}</div>
              </form>
            ) : (
              <div className="wish-aim-body">
                {s.chief_image_path && signed[s.chief_image_path] && <img src={signed[s.chief_image_path]} alt="My Chief Aim" className="wish-aim-img" />}
                <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p className="wish-aim-text">{s.chief_aim}</p>
                  {s.chief_why && <div><p className="overline">Why</p><p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{s.chief_why}</p></div>}
                  {s.chief_feeling && <div><p className="overline">The feeling of having it now</p><p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{s.chief_feeling}</p></div>}
                </div>
              </div>
            )}
          </section>

          <section className="card" id="reminders">
            <details open={sp.saved === 'settings'}>
              <summary className="section-title"><h3>Reminders</h3><span className="muted" style={{ fontSize: 13 }}>{s.reminders_enabled ? `On · morning ${s.morning_start}–${s.morning_end}, evening ${s.evening_start}–${s.evening_end}, weekly on ${WEEKDAYS[s.weekly_day]}` : 'Off'} ▾</span></summary>
              <form action={saveSettings} className="stack" style={{ marginTop: 16 }}>
                <label className="check"><input type="checkbox" name="reminders_enabled" defaultChecked={s.reminders_enabled} /> Show reminder pop-ups when I open the dashboard</label>
                <div className="grid2">
                  <label>Morning window starts<input type="time" name="morning_start" defaultValue={s.morning_start} /></label>
                  <label>Morning window ends<input type="time" name="morning_end" defaultValue={s.morning_end} /></label>
                  <label>Evening window starts<input type="time" name="evening_start" defaultValue={s.evening_start} /></label>
                  <label>Evening window ends<input type="time" name="evening_end" defaultValue={s.evening_end} /></label>
                  <label>Weekly reminder from<select name="weekly_day" defaultValue={s.weekly_day}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>One pop-up at a time, on your first visit in each window. It stays away once you open, dismiss or finish that checklist; “Later” hides it for an hour. Times are Dubai time. No browser or phone notifications are sent.</p>
                <div><button className="btn" type="submit">Save reminders</button></div>
              </form>
            </details>
          </section>
        </>
      )}

      {tab === 'daily' && (
        <>
          <section className="card">
            <div className="card-head">
              <h2>Daily Practices</h2>
              <span className="muted" style={{ fontSize: 13 }}>{shortDay(day)} · resets at midnight Dubai time</span>
            </div>
            <Checklist
              key={day}
              periodType="day"
              periodStart={day}
              initialChecked={todayIds}
              sections={SECTIONS.map((sec) => ({ ...sec, items: sectionItems(sec.id), defaultOpen: sec.id === 'morning' ? inMorning : sec.id === 'evening' ? inEvening : !inMorning && !inEvening }))}
            />
            <p className="muted" style={{ margin: '16px 0 0', fontSize: 12 }}>“Master Reference” items come from the Master Reference daily tracker (feeling the emotion and holding it 68 seconds are one tick), plus the repeat step of the Lesson 16 formula in the evening. Keeping score of progress is part of your weekly review. “My routine” items are practices you chose to add; they are not from the Master Reference. Tick a practice only when you have actually done it.</p>
          </section>
          <section className="card">
            <div className="card-head"><h3>Last 14 days</h3></div>
            <div className="scroll">
              <table>
                <thead><tr><th>Day</th><th className="num">Morning</th><th className="num">During day</th><th className="num">Evening</th></tr></thead>
                <tbody>
                  {Array.from({ length: 14 }, (_, i) => addDays(day, -i)).map((d) => {
                    const ids = dayChecks.filter((c) => c.period_start === d).map((c) => c.item_id);
                    const cell = (sec) => { const n = count(ids, sectionItems(sec)); const t = sectionItems(sec).length; return <td className={`num${n === t ? ' pos' : ''}`}>{n ? `${n}/${t}` : <span className="muted">—</span>}</td>; };
                    return <tr key={d}><td>{d === day ? 'Today' : shortDay(d)}</td>{cell('morning')}{cell('day')}{cell('evening')}</tr>;
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === 'weekly' && (
        <>
          <section className="card">
            <div className="card-head"><h2>Weekly Practices</h2><span className="muted" style={{ fontSize: 13 }}>{range(week, weekEnd)} · tick any day this week</span></div>
            <Checklist
              key={week}
              periodType="week"
              periodStart={week}
              initialChecked={weekIds}
              sections={[{ id: 'weekly', title: 'This week', blurb: 'Resets on Monday.', items: WEEKLY, defaultOpen: true }]}
            />
            <p className="muted" style={{ margin: '16px 0 0', fontSize: 12 }}>These five items are your personal weekly tracker from the Master Reference. The book recommends dream building and associating with successful people; doing them weekly is your chosen habit, not a schedule Kevin Trudeau prescribes.</p>
          </section>
          <section className="card">
            <div className="card-head"><h3>Previous weeks</h3></div>
            <div className="list">
              {Array.from({ length: 6 }, (_, i) => addDays(week, -7 * i)).map((w) => {
                const n = count(weekChecks.filter((c) => c.period_start === w).map((c) => c.item_id), WEEKLY);
                return <div key={w} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{w === week ? 'This week' : range(w, addDays(w, 6))}</span><strong className={n === WEEKLY.length ? 'pos' : ''} style={{ fontVariantNumeric: 'tabular-nums' }}>{n}/{WEEKLY.length}</strong></div>;
              })}
            </div>
          </section>
        </>
      )}

      {tab === 'dreams' && (
        <section className="card" id="board">
          <div className="card-head"><h2>Vision Board</h2><span className="muted" style={{ fontSize: 13 }}>A digital copy of your physical board</span></div>
          <VisionCanvas
            userId={user.id}
            initialTitle={{ text: s.board_title || 'Vision Board', x: s.board_title_x ?? 800, y: s.board_title_y ?? 500 }}
            initialItems={(vision || []).filter((v) => signed[v.image_path]).map((v, i) => ({
              id: v.id, url: signed[v.image_path], title: v.title, is_chief: v.is_chief,
              x: v.x ?? 80 + (i % 5) * 300, y: v.y ?? 60 + Math.floor(i / 5) * 280, w: v.w || 250, rot: v.rot || 0, z: v.z || 0,
            }))}
          />
        </section>
      )}

      {tab === 'reference' && (
        <section className="card">
          <div className="card-head"><h2>Master Reference</h2><span className="muted" style={{ fontSize: 13 }}>Kevin Trudeau · Lessons 1–16</span></div>
          <PdfReader userId={user.id} url={pdfUrl} downloadUrl={pdfDownload} initialPage={s.last_pdf_page || 1} />
          <p className="muted" style={{ margin: '12px 0 0', fontSize: 12 }}>The checkboxes inside the PDF are separate from this dashboard. Your ticks here are saved in your dashboard.</p>
        </section>
      )}

      <p className="muted" style={{ fontSize: 12, margin: 0 }}>{TEACHINGS.length} teachings rotate daily. All reminders are paraphrased from the Master Reference, not quoted from the book. The book's claims about frequency, brainwaves and manifestation are the author's, not established science.</p>
    </>
  );
}
