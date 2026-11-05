export const TZ = 'Asia/Dubai';

export function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function str(v) {
  const s = (v ?? '').toString().trim();
  return s === '' ? null : s;
}

export function eur(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(n));
}

export function pct(n, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

// Today's date parts in Dubai
export function todayParts() {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = f.format(new Date()).split('-').map(Number);
  return { y, m, d };
}

export function iso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function todayIso() {
  const { y, m, d } = todayParts();
  return iso(y, m, d);
}

export function monthStart(ym) {
  // ym: 'YYYY-MM' or undefined → current month in Dubai
  if (ym && /^\d{4}-\d{2}$/.test(ym)) return `${ym}-01`;
  const { y, m } = todayParts();
  return iso(y, m, 1);
}

export function shiftMonth(monthIso, delta) {
  const [y, m] = monthIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1);
}

export function monthLabel(monthIso) {
  const [y, m] = monthIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function fmtDate(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()));
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function longToday() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
}

// ISO week (Monday start) for a YYYY-MM-DD
export function isoWeek(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
}

export function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

// Monday of the week containing isoDate
export function weekStart(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  return addDays(isoDate, 1 - day);
}

export function periodTitle(r) {
  return r.type === 'weekly' ? `Week ${r.week_number}, ${r.year}` : monthLabel(r.period_start);
}

export function lastDayOfMonth(monthIso) {
  return addDays(shiftMonth(monthIso, 1), -1);
}
