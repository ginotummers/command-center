// "Your Wish Is Your Command" — content for the manifesting module.
// Everything here comes from the Master Reference PDF (a paraphrased study companion of
// Kevin Trudeau's ebook). Nothing is a direct quotation from the book.
//
// source values:
//   'tracker'  – one of the 15 daily / 5 weekly items in Section 5 of the Master Reference
//   'formula'  – a step of the Manifesting Formula (Section 7, Lesson 16)
//   'personal' – a routine Gino chose to add; not in the Master Reference

import { addDays, weekStart, iso, TZ } from './util';

export const SECTIONS = [
  { id: 'morning', title: 'Morning Alignment', blurb: 'When you wake up or start your day.' },
  { id: 'day', title: 'Throughout the Day', blurb: 'Principles to stay aware of. Tick once you have practised them today.' },
  { id: 'evening', title: 'Evening Alignment', blurb: 'At the end of your day.' },
];

// covers = which numbered item(s) of the Master Reference daily tracker (p. 9) this represents
export const DAILY = [
  // Morning
  { id: 'm-gratitude', section: 'morning', text: 'Morning gratitude', source: 'personal' },
  { id: 'm-aim', section: 'morning', text: 'Focus deliberately on my one Chief Aim, the result I want and WHY', source: 'tracker', covers: [4], ref: 'Lesson 10' },
  { id: 'm-visualize', section: 'morning', text: 'Visualize myself already in possession of my Chief Aim, with sensory detail', source: 'tracker', covers: [5], ref: 'Formula step 8', link: 'board' },
  { id: 'm-feel', section: 'morning', text: 'Feel the positive emotion of possession NOW and hold it for at least 68 seconds', source: 'tracker', covers: [6, 7], ref: 'Formula step 9 · Lesson 16' },
  { id: 'm-release', section: 'morning', text: 'Release emotional attachment to the outcome and concern about HOW', source: 'tracker', covers: [8], ref: 'Formula step 10' },
  { id: 'm-dreambook', section: 'morning', text: 'Write in my dream book', source: 'tracker', covers: [15], ref: 'Lesson 9', link: 'dreambook', note: 'The book teaches writing desires by hand on white paper in blue ink. The digital Dream Book is a convenience, not the same exercise.' },
  { id: 'm-power', section: 'morning', text: 'Read my positive power phrases aloud', source: 'personal' },
  // Throughout the day
  { id: 'd-feelgood', section: 'day', text: 'Make feeling good NOW my primary emotional priority', source: 'tracker', covers: [1], ref: 'Lesson 7' },
  { id: 'd-watch', section: 'day', text: 'Watch my thoughts, speech, self-description and emotional responses', source: 'tracker', covers: [10], ref: 'Lessons 11–12' },
  { id: 'd-act', section: 'day', text: 'Act on useful opportunities and take practical steps toward my goals', source: 'tracker', covers: [11], ref: 'Formula step 12' },
  { id: 'd-priorities', section: 'day', text: 'Use a written priority / to-do list and focus on accomplishments', source: 'tracker', covers: [12], ref: 'Lesson 16' },
  { id: 'd-giving', section: 'day', text: 'Practise giving, recognition or supportive conduct toward others', source: 'tracker', covers: [14], ref: 'Lesson 14' },
  // id kept as m-read so earlier ticks stay in history
  { id: 'm-read', section: 'day', text: 'Read some positive or success-oriented material, even if only a paragraph', source: 'tracker', covers: [2], ref: 'Lesson 16 · daily positive reading' },
  { id: 'd-reinforce', section: 'day', text: 'Reinforce the teachings through study and deliberate application', source: 'tracker', covers: [3], ref: 'Lesson 6' },
  // Evening
  { id: 'e-gratitude', section: 'evening', text: 'Evening gratitude', source: 'personal' },
  { id: 'e-dreams', section: 'evening', text: 'Dream building: review my Dream Book and Vision Board', source: 'tracker', covers: [9], ref: 'Lesson 16 · dream building', link: 'board' },
  { id: 'e-repeat', section: 'evening', text: 'Return to my Chief Aim, feel it as already mine, then release attachment', source: 'formula', ref: 'Formula step 11 · repeat and reinforce' },
  { id: 'e-prayer', section: 'evening', text: 'Evening prayer, blessing people by name', source: 'personal' },
  { id: 'e-positive', section: 'evening', text: 'End the day with positive thoughts and feelings', source: 'personal' },
];

export const WEEKLY = [
  { id: 'w-desires', text: 'Review my desires and check that my Chief Aim remains personally meaningful and in the sweet spot', source: 'tracker', covers: [1] },
  // also carries daily tracker item 13 (observe progress / keep score), moved here from the evening
  { id: 'w-progress', text: 'Review progress, keep score with meaningful measures, and plan practical actions toward my Chief Aim', source: 'tracker', covers: [2], alsoDaily: [13] },
  { id: 'w-learning', text: 'Reinforce learning and positive associations through study and connection', source: 'tracker', covers: [3] },
  { id: 'w-wealthy', text: 'Visit places where wealthy people spend time and be in their environment and energy', source: 'tracker', covers: [4] },
  { id: 'w-dreambook', text: 'Write in my dream book', source: 'tracker', covers: [5], link: 'dreambook' },
];

export const sectionItems = (id) => DAILY.filter((i) => i.section === id);

// Teaching of the Day — short reminders paraphrased from the Master Reference, with their lesson.
export const TEACHINGS = [
  ['My number one goal is to feel good NOW.', 'Section 6 · Cheat sheet'],
  ['Happiness is not postponed until a goal is achieved.', 'Lesson 7'],
  ['Feel NOW as though you already possess your desire.', 'Formula step 9'],
  ['Focus on what you want, not on what you lack.', 'Section 6 · Cheat sheet'],
  ['Focus on the WHAT and the WHY. Do not get consumed by the HOW.', 'Lesson 4'],
  ['Release attachment to the outcome, and stop worrying about HOW.', 'Formula step 10'],
  ['Stay emotionally okay even if the result never appears, while keeping the good feeling of possession.', 'Formula step 10'],
  ['Thinking, feeling and belief carry about ninety percent of the weight. The mechanical HOW is the rest.', 'Lesson 4'],
  ['Master the basics through repetition and application.', 'Lesson 6'],
  ['Knowing a method is not the same as applying it.', 'Lesson 6'],
  ['Practise until the principles become automatic: unconscious competence.', 'Lesson 5'],
  ['Take direction from people who already have what you want.', 'Lesson 2'],
  ['Learn from everyone, but take decisive guidance only from people with real results.', 'Lesson 2'],
  ['Stay teachable: willing to learn, and willing to change.', 'Lesson 3'],
  ['Be humble and coachable. Accept correction instead of defending old habits.', 'Lesson 3'],
  ['You were born capable; old conditioning can be replaced with success habits.', 'Lesson 1'],
  ['Use the negative to see what you do not want, then turn to the desired opposite.', 'Lesson 11'],
  ['A setback is a chance to learn, not a permanent verdict.', 'Section 6 · Cheat sheet'],
  ['Find the pain, then use the contrast to state clearly what you do want.', 'Formula step 2'],
  ['Make a firm decision. Do not merely wish.', 'Formula step 3'],
  ['Turn a weak wish into a burning desire.', 'Formula step 7'],
  ['Hold one Chief Aim. Do not split your focus across competing aims.', 'Lesson 10'],
  ['Choose the sweet spot: exciting, yet believable enough to feel confident.', 'Formula step 6'],
  ['Dreams can be enormous; immediate goals should be credible.', 'Lesson 10'],
  ['Your desire should be your own, not an obligation borrowed from someone else.', 'Formula step 3'],
  ['See yourself already having it, with sight, sound, touch and every sense.', 'Formula step 8'],
  ['Sustain the feeling for at least 68 seconds, then return to it again.', 'Lesson 16'],
  ['Repetition builds the broadcast. Return to the practice.', 'Formula step 11'],
  ['Watch your words. Avoid negative self-labels.', 'Lesson 12'],
  ['Speak with conviction and positive emotion.', 'Lesson 12'],
  ['Improve your vocabulary: look up words you do not fully understand.', 'Lesson 12'],
  ['Read something positive every day, even a single paragraph.', 'Section 3 · Daily reinforcement'],
  ['Dream build. Keep images of your desired outcome in front of you.', 'Lesson 9'],
  ['Act on opportunities. Do not let overanalysis replace action.', 'Section 4'],
  ['Do not confuse busyness with accomplishment.', 'Section 4'],
  ['Keep a written priority list and measure meaningful progress.', 'Formula step 12'],
  ['Associate with successful, supportive people.', 'Section 3'],
  ['Give recognition, support and value to others.', 'Lesson 14'],
  ['Take responsibility for your actions and your responses.', 'Lesson 14'],
  ['Decide to be great: choose, commit, and become a more capable person.', 'Lesson 14'],
  ["Do not let others' discouragement set your direction.", 'Section 4'],
  ['The genie is the trained mind. Use the whole process, not wishing alone.', 'Lesson 15'],
];

// Days since 1970-01-01 for a YYYY-MM-DD
const dayNumber = (isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};

// Same teaching all day; a step coprime with the list length visits every teaching
// once per cycle and never repeats on consecutive days.
export function teachingFor(isoDate) {
  const n = TEACHINGS.length;
  const step = 17;
  const i = ((dayNumber(isoDate) * step) % n + n) % n;
  const [text, ref] = TEACHINGS[i];
  return { text, ref, index: i };
}

export const DEFAULT_SETTINGS = {
  morning_start: '05:00', morning_end: '12:00',
  evening_start: '18:00', evening_end: '23:59',
  weekly_day: 0, // 0 = Sunday … 6 = Saturday
  reminders_enabled: true,
};

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Dubai clock: { date: 'YYYY-MM-DD', minutes, weekday (0=Sun) }
export function dubaiNow(at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(at);
  const g = (t) => parts.find((p) => p.type === t)?.value;
  const date = iso(Number(g('year')), Number(g('month')), Number(g('day')));
  const minutes = (Number(g('hour')) % 24) * 60 + Number(g('minute'));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday'));
  return { date, minutes, weekday };
}

const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').slice(0, 5).split(':').map(Number); return h * 60 + (m || 0); };
const inWindow = (min, start, end) => {
  const s = toMin(start); const e = toMin(end);
  return s <= e ? min >= s && min <= e : min >= s || min <= e; // windows may cross midnight
};

export function periods(date) {
  const ws = weekStart(date);
  return { day: date, week: ws, weekEnd: addDays(ws, 6) };
}

// Which single reminder (if any) should show right now.
// checks: { morning: done/total, evening: ..., weekly: ... } ; log: rows from wish_reminders for this day/week
export function dueReminder({ settings, now, progress, log }) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  if (!s.reminders_enabled) return null;
  const { day, week } = periods(now.date);
  const handled = (kind, period) => {
    const r = (log || []).find((x) => x.kind === kind && x.period_start === period);
    if (!r) return false;
    if (r.action === 'snoozed') return r.snooze_until && new Date(r.snooze_until) > new Date();
    return true; // dismissed or opened
  };
  const open = (p) => p && p.done < p.total;
  const candidates = [];
  if (inWindow(now.minutes, s.morning_start, s.morning_end) && open(progress.morning) && !handled('morning', day)) candidates.push('morning');
  if (inWindow(now.minutes, s.evening_start, s.evening_end) && open(progress.evening) && !handled('evening', day)) candidates.push('evening');
  // weekly: from the chosen weekday until the week ends (Sunday), so a missed day still gets one reminder
  const dayIdx = (wd) => (wd + 6) % 7; // Monday=0 … Sunday=6
  if (dayIdx(now.weekday) >= dayIdx(Number(s.weekly_day)) && open(progress.weekly) && !handled('weekly', week)) candidates.push('weekly');
  return candidates[0] || null; // time-of-day reminder first, weekly waits for the next visit
}

export const REMINDER_COPY = {
  morning: { title: 'Morning Alignment', body: 'Time to complete your morning practices and align your thoughts, feelings, and Chief Aim.', cta: 'Open Morning Checklist', href: '/wish?tab=daily#morning' },
  evening: { title: 'Evening Alignment', body: 'Take a few minutes to complete your evening gratitude, review your dreams, and finish the day positively.', cta: 'Open Evening Checklist', href: '/wish?tab=daily#evening' },
  weekly: { title: 'Weekly Alignment', body: 'Time to review your Chief Aim, reinforce your practices, and complete your weekly checklist.', cta: 'Open Weekly Checklist', href: '/wish?tab=weekly' },
};
