// Rule-based insights from the finance data — instant and free (no AI call).
// Each insight: { tone: 'good' | 'watch' | 'info', title, body }
import { accountStates, totals } from './finance';
import { shiftMonth, lastDayOfMonth, monthLabel, addDays, eur, pct } from './util';

const mName = (m) => monthLabel(m).split(' ')[0];

export function financeInsights({ scope, month, today, accounts, balances, incByMonth, expByMonth, expRows, prevExpRows, moneyOpen, plan }) {
  const out = [];
  const totalAt = (d) => { const st = accountStates(accounts, balances, d); return st.some((s) => s.latest) ? totals(st) : null; };
  const nowT = totalAt(lastDayOfMonth(month) < today ? lastDayOfMonth(month) : today);

  // 1. Balance growth over 1, 3 and 12 months
  let usedN = 0;
  if (nowT) {
    for (const [n, label] of [[1, 'last month'], [3, '3 months ago'], [12, 'a year ago']]) {
      const then = totalAt(lastDayOfMonth(shiftMonth(month, -n)));
      if (!then || !then.basis) continue;
      const d = nowT.basis - then.basis; const p = (d / Math.abs(then.basis)) * 100;
      out.push({ tone: d >= 0 ? 'good' : 'watch', title: `${scope === 'business' ? 'Business balance' : 'Total balance'} ${d >= 0 ? 'up' : 'down'} ${pct(Math.abs(p))} since ${label}`, body: `${eur(then.basis)} → ${eur(nowT.basis)} (${d >= 0 ? '+' : '−'}${eur(Math.abs(d))}).` });
      usedN = n; break; // nearest available comparison; the longer run is added below
    }
    const yr = totalAt(lastDayOfMonth(shiftMonth(month, -12))) || totalAt(lastDayOfMonth(shiftMonth(month, -6)));
    if (yr && yr.basis && usedN < 6) {
      const d = nowT.basis - yr.basis;
      out.push({ tone: d >= 0 ? 'good' : 'watch', title: `${d >= 0 ? 'Growth' : 'Decline'} over the longer run: ${pct(Math.abs((d / Math.abs(yr.basis)) * 100))}`, body: `Compared with ${totalAt(lastDayOfMonth(shiftMonth(month, -12))) ? 'a year' : 'six months'} ago.` });
    }
    // Flat for 3+ months
    const t3 = totalAt(lastDayOfMonth(shiftMonth(month, -3)));
    if (t3 && t3.basis && Math.abs(nowT.basis - t3.basis) / Math.abs(t3.basis) < 0.01) {
      out.push({ tone: 'watch', title: 'Your balance has been flat for 3 months', body: 'Little or no growth since three months ago. Look at raising income, cutting expenses, or moving more into investments.' });
    }
  }

  // 2. Investing (personal): "put in" growth per month
  if (scope === 'personal' && nowT) {
    const inv = (d) => { const st = accountStates(accounts.filter((a) => a.kind === 'investment'), balances, d); const withInv = st.filter((s) => s.latest && s.latest.invested_eur !== null && s.latest.invested_eur !== undefined); return withInv.length ? withInv.reduce((a, s) => a + Number(s.latest.invested_eur), 0) : null; };
    let months = 0; let noInvest = 0;
    for (let i = 0; i < 3; i++) {
      const a = inv(lastDayOfMonth(shiftMonth(month, -i))); const b = inv(lastDayOfMonth(shiftMonth(month, -i - 1)));
      if (a === null || b === null) continue;
      months++; if (a - b < 1) noInvest++;
    }
    if (months >= 2 && noInvest === months) out.push({ tone: 'watch', title: `No new investments in the last ${months} months`, body: `Your plan is ${eur(Number(plan?.plan_invest || 0))} a month into gold and the S&P 500. Catch up, or adjust the plan so the target stays realistic.` });
    const cashT = accountStates(accounts.filter((a) => a.kind === 'cash' && /broker/i.test(a.name)), balances).reduce((a, s) => a + (s.latest ? Number(s.latest.eur) : 0), 0);
    if (cashT > 1000) out.push({ tone: 'info', title: `${eur(cashT)} waiting in your brokerage account`, body: 'This cash is ready to invest but not working yet.' });
  }

  // 3. Savings rate and expenses
  const inc = incByMonth[month] || 0; const exp = expByMonth[month] || 0;
  if (inc > 0) {
    const rate = ((inc - exp) / inc) * 100;
    const prevRates = [1, 2, 3].map((n) => shiftMonth(month, -n)).filter((m) => incByMonth[m] > 0).map((m) => ((incByMonth[m] - (expByMonth[m] || 0)) / incByMonth[m]) * 100);
    const avg = prevRates.length ? prevRates.reduce((a, b) => a + b, 0) / prevRates.length : null;
    out.push({ tone: rate >= 25 ? 'good' : rate >= 0 ? 'info' : 'watch', title: `Savings rate ${mName(month)}: ${pct(rate, 0)}`, body: avg === null ? `${eur(inc - exp)} left after expenses.` : `Previous months averaged ${pct(avg, 0)}. ${rate >= avg ? 'Better than usual.' : 'Lower than usual.'}` });
  }
  const prevM = shiftMonth(month, -1);
  if (exp > 0 && expByMonth[prevM] > 0) {
    const d = exp - expByMonth[prevM];
    if (Math.abs(d) / expByMonth[prevM] > 0.05) out.push({ tone: d > 0 ? 'watch' : 'good', title: `Expenses ${d > 0 ? 'up' : 'down'} ${eur(Math.abs(d))} vs ${mName(prevM)}`, body: `${eur(expByMonth[prevM])} → ${eur(exp)}.` });
    // biggest category change
    const byCat = (rows) => rows.reduce((m, r) => { m[r.category || 'other'] = (m[r.category || 'other'] || 0) + Number(r.amount); return m; }, {});
    const now = byCat(expRows); const before = byCat(prevExpRows);
    const changes = [...new Set([...Object.keys(now), ...Object.keys(before)])].map((c) => ({ c, d: (now[c] || 0) - (before[c] || 0) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    if (changes[0] && Math.abs(changes[0].d) >= 50) out.push({ tone: changes[0].d > 0 ? 'watch' : 'good', title: `Biggest change: ${changes[0].c} ${changes[0].d > 0 ? '+' : '−'}${eur(Math.abs(changes[0].d))}`, body: `Compared with ${mName(prevM)}.` });
  }
  const subs = expRows.filter((r) => /subscription/i.test(r.category || ''));
  if (subs.length >= 5) { const s = subs.reduce((a, r) => a + Number(r.amount), 0); out.push({ tone: 'info', title: `${subs.length} subscriptions cost ${eur(s)} a month`, body: `That is ${eur(s * 12)} a year. Worth a quick review for ones you don't use.` }); }

  // 4. Open items
  const late = moneyOpen.filter((m) => m.direction === 'owed_to_me' && m.due_date && m.due_date < today);
  if (late.length) out.push({ tone: 'watch', title: `${late.length} payment${late.length === 1 ? '' : 's'} owed to you ${late.length === 1 ? 'is' : 'are'} overdue`, body: late.slice(0, 3).map((m) => `${m.title} (${eur(m.eur)})`).join(', ') + '. Time to follow up.' });
  const soon = moneyOpen.filter((m) => m.direction === 'i_owe' && m.due_date && m.due_date <= addDays(today, 14));
  if (soon.length) out.push({ tone: 'info', title: `${soon.length} bill${soon.length === 1 ? '' : 's'} due in the next 2 weeks`, body: soon.slice(0, 3).map((m) => `${m.title} (${eur(m.eur)})`).join(', ') + '.' });

  // 5. Stale accounts
  const stale = accountStates(accounts, balances).filter((s) => !s.latest || s.latest.date < addDays(today, -35));
  if (stale.length && stale.length < accounts.length) out.push({ tone: 'info', title: `${stale.length} account${stale.length === 1 ? '' : 's'} not updated for over a month`, body: `${stale.map((s) => `${s.account.name} (${s.account.currency})`).join(', ')}. Update them at the Sunday check-in so your totals stay right.` });

  return out;
}
