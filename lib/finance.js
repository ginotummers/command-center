// Finance v2: accounts with dated balances (any currency, converted to EUR),
// a monthly savings plan and spending power — based on Gino's weekly-balance method, viewed monthly.
import { addDays, shiftMonth, lastDayOfMonth } from './util';

export const CURRENCIES = ['EUR', 'USD', 'AED'];
export const AED_PER_USD = 3.6725; // dirham is pegged to the dollar
export const KIND_LABEL = { bank: 'Bank', cash: 'Cash', investment: 'Investment', reserved: 'Set-aside bucket', other: 'Other' };

// Live USD→EUR from the ECB via Frankfurter (cached 12 h); falls back to the last saved rate
export async function getFx(saved) {
  let usd = Number(saved?.fx_usd_eur) || 0.86; let date = saved?.fx_updated_on || null; let live = false;
  try {
    const r = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR', { next: { revalidate: 43200 } });
    if (r.ok) { const j = await r.json(); if (j?.rates?.EUR) { usd = Number(j.rates.EUR); date = j.date || date; live = true; } }
  } catch { /* keep saved rate */ }
  return { EUR: 1, USD: usd, AED: usd / AED_PER_USD, date, live };
}

export const toEur = (amount, currency, fx) => Math.round(Number(amount) * (fx[currency] ?? 1) * 100) / 100;
export const fmtCur = (n, cur) => (n === null || n === undefined ? '—'
  : new Intl.NumberFormat('en-IE', { style: 'currency', currency: cur, maximumFractionDigits: Math.abs(n) < 1000 && n % 1 ? 2 : 0 }).format(n));

// Latest balance per account on or before `asOf`, plus its full history (newest first)
export function accountStates(accounts, balances, asOf = '9999-12-31') {
  return accounts.map((a) => {
    const hist = balances.filter((b) => b.account_id === a.id).sort((x, y) => (y.date + y.created_at).localeCompare(x.date + x.created_at));
    const upto = hist.filter((b) => b.date <= asOf);
    return { account: a, latest: upto[0] || null, history: hist };
  });
}

// For totals an investment counts at what you put in (stable), like the weekly-balance sheet;
// today's value is shown alongside. Without an "invested" figure it counts at its value.
export const basisEur = (b) => (b ? Number(b.invested_eur ?? b.eur) : 0);
export const liveEur = (b) => (b ? Number(b.eur) : 0);

export function totals(states) {
  const t = { basis: 0, live: 0, reserved: 0, invested: 0, investValue: 0 };
  states.forEach(({ account: a, latest: b }) => {
    if (!b) return;
    t.basis += basisEur(b); t.live += liveEur(b);
    if (a.kind === 'reserved') t.reserved += liveEur(b);
    if (a.kind === 'investment') { t.invested += basisEur(b); t.investValue += liveEur(b); }
  });
  return t;
}

// Months between two month-start dates (inclusive count from start to m)
const monthIndex = (iso) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

// Target balance for a month: starting point + the monthly amount for every month since the plan started (including this one)
export function planTarget(plan, month, baseline) {
  if (!plan?.plan_start || baseline === null || baseline === undefined) return null;
  const n = monthIndex(month) - monthIndex(plan.plan_start.slice(0, 7) + '-01') + 1;
  if (n < 1) return null;
  return Number(baseline) + Number(plan.plan_monthly || 0) * n;
}

// Starting point: saved value, else the personal total (minus set-aside buckets) at the end of the month before the plan starts
export function planBaseline(plan, accounts, balances) {
  if (plan?.plan_baseline !== null && plan?.plan_baseline !== undefined) return { value: Number(plan.plan_baseline), auto: false };
  if (!plan?.plan_start) return { value: null, auto: true };
  const before = addDays(plan.plan_start, -1);
  const st = accountStates(accounts, balances, before);
  if (!st.some((s) => s.latest)) return { value: null, auto: true };
  const tt = totals(st);
  return { value: tt.basis - tt.reserved, auto: true, asOf: before }; // set-aside buckets are never spendable
}

// Period ends for charts: last 12 month-ends or last 12 Sundays, up to `endDate`
export function periodEnds(view, month, today) {
  const out = [];
  if (view === 'weekly') {
    const ref = month < today.slice(0, 7) + '-01' ? lastDayOfMonth(month) : today;
    const d = new Date(`${ref}T00:00:00Z`); const back = d.getUTCDay(); // 0 = Sunday
    let sun = addDays(ref, back === 0 ? 0 : 7 - back); // this week's Sunday
    for (let i = 0; i < 12; i++) { out.unshift(sun); sun = addDays(sun, -7); }
  } else {
    let m = month;
    for (let i = 0; i < 12; i++) { out.unshift(lastDayOfMonth(m)); m = shiftMonth(m, -1); }
  }
  return out;
}
