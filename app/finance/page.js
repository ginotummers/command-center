import { createClient } from '@/lib/supabase';
import { eur, pct, monthStart, shiftMonth, monthLabel, todayIso, lastDayOfMonth } from '@/lib/util';
import { getFx, accountStates, totals, planTarget, planBaseline, periodEnds, basisEur, liveEur, fmtCur, KIND_LABEL, CURRENCIES } from '@/lib/finance';
import LineChart from '../components/LineChart';
import BarChart from '../components/BarChart';
import InfoButton from '../components/InfoButton';
import FinanceSuggestions from '../components/FinanceSuggestions';
import { financeInsights } from '@/lib/finance-insights';
import {
  addIncome, updateIncome, addExpense, updateExpense, removeRow, copyFromPrevious,
  addAccount, updateAccount, checkIn, updateBalance, addMoneyItem, settleMoneyItem, savePlan,
} from './actions';

export const metadata = { title: 'Finance · Personal Operating Center' };
export const dynamic = 'force-dynamic';

const INCOME_CATS = ['employment', 'own business', 'partnerships', 'investments', 'other'];
const EXPENSE_CATS = ['housing', 'food', 'supplements', 'subscriptions', 'transport', 'personal', 'business', 'giving', 'other'];
const sum = (rows, key) => (rows || []).reduce((a, r) => a + Number(r[key] || 0), 0);
const shortDate = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const dayMonth = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Hidden({ month, scope }) {
  return <><input type="hidden" name="month" value={month} />{scope === 'business' && <input type="hidden" name="scope" value="business" />}</>;
}
function Delete({ table, id, month, scope, open }) {
  return (
    <form action={removeRow} style={{ display: 'inline' }}>
      <input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} />{open && <input type="hidden" name="open" value={open} />}
      <Hidden month={month} scope={scope} />
      <button className="linkbtn" type="submit" aria-label="Remove">Remove</button>
    </form>
  );
}
function Chev() { return <span className="fold-chev" aria-hidden="true">▸</span>; }

function Groups({ rows, groupOf, openGroup, renderRow, head }) {
  const groups = [...new Set(rows.map(groupOf))]
    .map((g) => { const list = rows.filter((r) => groupOf(r) === g); return { g, list, total: sum(list, 'amount') }; })
    .sort((a, b) => b.total - a.total);
  return (
    <div className="fold-list">
      {groups.map(({ g, list, total }) => (
        <details key={g} className="fold" open={openGroup === g}>
          <summary>
            <Chev />
            <span style={{ flex: 1, textTransform: 'capitalize', fontWeight: 600 }}>{g}</span>
            <span className="muted" style={{ fontSize: 13 }}>{list.length} item{list.length === 1 ? '' : 's'}</span>
            <strong className="fold-amount">{eur(total)}</strong>
          </summary>
          <div className="scroll"><table><thead>{head}</thead><tbody>{list.map(renderRow)}</tbody></table></div>
        </details>
      ))}
    </div>
  );
}

export default async function Money({ searchParams }) {
  const sp = await searchParams;
  const scope = sp?.scope === 'business' ? 'business' : 'personal';
  const isPersonal = scope === 'personal';
  const view = sp?.chart === 'weekly' ? 'weekly' : 'monthly';
  const month = monthStart(sp?.m);
  const ym = month.slice(0, 7);
  const prev = shiftMonth(month, -1);
  const today = todayIso();
  const asOf = lastDayOfMonth(month) < today ? lastDayOfMonth(month) : today;
  const qs = (extra = {}) => {
    const p = { m: ym, ...(scope === 'business' ? { scope } : {}), ...(view === 'weekly' ? { chart: 'weekly' } : {}), ...extra };
    return `/finance?${Object.entries(p).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  };
  const from12 = shiftMonth(month, -11);

  const supabase = await createClient();
  const [{ data: income }, { data: expenses }, { data: settings }, { data: prevExp }, { data: inc12 }, { data: exp12 },
    { data: accAll }, { data: balAll }, { data: moneyAll }, { data: fin }, { data: aiSugg }] = await Promise.all([
    supabase.from('income').select('*').eq('month', month).eq('scope', scope).order('created_at'),
    supabase.from('expenses').select('*').eq('month', month).eq('scope', scope).order('created_at'),
    supabase.from('settings').select('expense_categories').maybeSingle(),
    supabase.from('expenses').select('amount,category').eq('month', prev).eq('scope', scope),
    supabase.from('income').select('month,amount').eq('scope', scope).gte('month', from12).lte('month', month),
    supabase.from('expenses').select('month,amount').eq('scope', scope).gte('month', from12).lte('month', month),
    supabase.from('accounts').select('*').order('sort').order('created_at'),
    supabase.from('balances').select('*').order('date').order('created_at'),
    supabase.from('money_items').select('*').order('due_date', { nullsFirst: false }).order('created_at'),
    supabase.from('finance_settings').select('*').maybeSingle(),
    supabase.from('suggestions').select('id,title,body,basis,priority,category,scope').eq('status', 'open').eq('category', 'finance').eq('scope', scope).order('created_on', { ascending: false }).limit(8),
  ]);
  const fx = await getFx(fin);
  const accounts = (accAll || []).filter((a) => a.scope === scope && !a.archived);
  const archived = (accAll || []).filter((a) => a.scope === scope && a.archived);
  const balances = balAll || [];
  const states = accountStates(accounts, balances, asOf);
  const t = totals(states);
  const tPrev = totals(accountStates(accounts, balances, lastDayOfMonth(prev)));
  const anyPrev = accountStates(accounts, balances, lastDayOfMonth(prev)).some((s) => s.latest);
  const money = (moneyAll || []).filter((m) => m.scope === scope);
  const owedToMe = money.filter((m) => m.direction === 'owed_to_me' && m.status === 'open');
  const iOwe = money.filter((m) => m.direction === 'i_owe' && m.status === 'open');
  const owedTotal = sum(owedToMe, 'eur'); const oweTotal = sum(iOwe, 'eur');

  // Savings plan & spending power (personal only)
  const allPersonal = (accAll || []).filter((a) => a.scope === 'personal');
  const baseline = planBaseline(fin, allPersonal, balances);
  const target = planTarget(fin, month, baseline.value);
  const spendable = t.basis - t.reserved - oweTotal;
  const spendingPower = target === null ? null : spendable - target;
  const planStarted = fin?.plan_start && month >= fin.plan_start.slice(0, 7) + '-01';
  // Put into investments this month: only accounts where "put in" is entered both now and at last month's end
  const prevStates = accountStates(accounts, balances, lastDayOfMonth(prev));
  const investPairs = states.filter((st) => st.account.kind === 'investment').map((st) => [st.latest, prevStates.find((p) => p.account.id === st.account.id)?.latest])
    .filter(([a, b]) => a?.invested_eur !== null && a?.invested_eur !== undefined && b?.invested_eur !== null && b?.invested_eur !== undefined);
  const investedThisMonth = investPairs.length ? investPairs.reduce((s2, [a, b]) => s2 + Number(a.invested_eur) - Number(b.invested_eur), 0) : null;

  // Chart: balance (what you put in) per month or week, today's value and the plan line
  const ends = periodEnds(view, month, today);
  const firstBal = balances.filter((b) => accounts.some((a) => a.id === b.account_id))[0]?.date || null;
  const pts = ends.map((d) => {
    const st = accountStates(accounts, balances, d);
    const has = firstBal && d >= firstBal && st.some((s) => s.latest);
    const tt = totals(st);
    const label = view === 'weekly' ? `Week ending ${shortDate(d)}` : monthLabel(`${d.slice(0, 7)}-01`);
    return { label, short: view === 'weekly' ? dayMonth(d) : monthLabel(`${d.slice(0, 7)}-01`).slice(0, 3), value: has ? Math.round(tt.basis) : null, live: has ? Math.round(tt.live) : null, plan: isPersonal ? planTarget(fin, `${d.slice(0, 7)}-01`, baseline.value) : null };
  });

  // Income & expenses
  const expCats = [...new Set([...(settings?.expense_categories || EXPENSE_CATS), ...(expenses || []).map((e) => e.category).filter(Boolean)])];
  const incCats = [...new Set([...INCOME_CATS, ...(income || []).map((e) => e.category).filter(Boolean)])];
  const editExp = sp?.edit ? (expenses || []).find((e) => e.id === sp.edit) : null;
  const editInc = sp?.iedit ? (income || []).find((e) => e.id === sp.iedit) : null;
  const editBal = sp?.bedit ? balances.find((b) => b.id === sp.bedit) : null;
  const editAcc = sp?.aedit ? (accAll || []).find((a) => a.id === sp.aedit) : null;
  const open = sp?.open || '';
  const totalIncome = sum(income, 'amount');
  const totalExpenses = sum(expenses, 'amount');
  const setAside = sum((expenses || []).filter((e) => e.set_aside), 'amount');
  const savings = totalIncome - totalExpenses;
  const rate = totalIncome > 0 ? (savings / totalIncome) * 100 : null;
  const prevExpenses = sum(prevExp, 'amount');
  const change = (a, b) => (a !== null && b !== null && b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null);
  const byCat = expCats.map((c) => ({ c, v: (expenses || []).filter((e) => e.category === c).reduce((a, e) => a + Number(e.amount), 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const monthly = (rows) => { const r = {}; (rows || []).forEach((x) => { r[x.month] = (r[x.month] || 0) + Number(x.amount || 0); }); return r; };
  const incM = monthly(inc12); const expM = monthly(exp12);
  const flowMonths = []; for (let m = month, i = 0; i < 6 || (i < 12 && (incM[m] || expM[m])); i++, m = shiftMonth(m, -1)) flowMonths.unshift(m);
  const fp = (m, v) => ({ label: monthLabel(m), short: monthLabel(m).slice(0, 3), value: v ?? null });
  const insights = financeInsights({
    scope, month, today, accounts, balances, incByMonth: incM, expByMonth: expM,
    expRows: expenses || [], prevExpRows: prevExp || [], moneyOpen: money.filter((m) => m.status === 'open'), plan: fin,
  });
  const cancel = (o) => <a className="btn ghost small" href={qs(o ? { open: o } : {})}>Cancel</a>;

  const expenseRow = (r) => (editExp?.id === r.id ? (
    <tr key={r.id} id={`exp-${r.id}`}><td colSpan={3} className="edit-cell">
      <form action={updateExpense} className="stack-sm">
        <input type="hidden" name="id" value={r.id} /><Hidden month={month} scope={scope} />
        <div className="grid2">
          <label>Expense<input name="name" defaultValue={r.name || ''} /></label>
          <label>Category<input name="category" list="expense-categories" defaultValue={r.category || ''} /></label>
          <label>Amount (€)<input name="amount" inputMode="decimal" defaultValue={r.amount} required /></label>
          <label>Link (optional)<input name="link" type="url" defaultValue={r.link || ''} placeholder="https://" /></label>
        </div>
        <label>Note (optional)<textarea name="note" defaultValue={r.note || ''} style={{ minHeight: 60 }} /></label>
        <label className="check"><input type="checkbox" name="recurring" defaultChecked={r.recurring} /> Recurring monthly</label>
        <label className="check"><input type="checkbox" name="set_aside" defaultChecked={r.set_aside} /> Set aside monthly for a yearly or quarterly bill</label>
        <div style={{ display: 'flex', gap: 10 }}><button className="btn small" type="submit">Save</button>{cancel('expenses')}</div>
      </form>
    </td></tr>
  ) : (
    <tr key={r.id}>
      <td>{r.name}{r.recurring ? <span className="muted"> · monthly</span> : null}{r.set_aside ? <span className="tag set-aside" style={{ marginLeft: 6 }}>Set aside</span> : null}
        {r.link ? <> · <a href={r.link} target="_blank" rel="noopener noreferrer">link ↗</a></> : null}
        {r.note ? <div className="muted" style={{ fontSize: 12 }}>{r.note}</div> : null}</td>
      <td className="num">{eur(r.amount, Number(r.amount) % 1 ? 2 : 0)}</td>
      <td className="row-actions"><a className="linkbtn" href={`${qs({ edit: r.id })}#exp-${r.id}`}>Edit</a><Delete table="expenses" id={r.id} month={month} scope={scope} /></td>
    </tr>
  ));

  const incomeRow = (r) => (editInc?.id === r.id ? (
    <tr key={r.id} id={`inc-${r.id}`}><td colSpan={3} className="edit-cell">
      <form action={updateIncome} className="stack-sm">
        <input type="hidden" name="id" value={r.id} /><Hidden month={month} scope={scope} />
        <div className="grid2">
          <label>Source<input name="source" defaultValue={r.source || ''} /></label>
          <label>Category<input name="category" list="income-categories" defaultValue={r.category || ''} /></label>
          <label>Amount (€)<input name="amount" inputMode="decimal" defaultValue={r.amount} required /></label>
        </div>
        <label className="check"><input type="checkbox" name="recurring" defaultChecked={r.recurring} /> Recurring monthly</label>
        <div style={{ display: 'flex', gap: 10 }}><button className="btn small" type="submit">Save</button>{cancel('income')}</div>
      </form>
    </td></tr>
  ) : (
    <tr key={r.id}>
      <td>{r.source}{r.recurring ? <span className="muted"> · monthly</span> : null}</td>
      <td className="num">{eur(r.amount)}</td>
      <td className="row-actions"><a className="linkbtn" href={`${qs({ iedit: r.id })}#inc-${r.id}`}>Edit</a><Delete table="income" id={r.id} month={month} scope={scope} /></td>
    </tr>
  ));

  const moneyBlock = (direction, items, title, empty, verb) => {
    const settled = money.filter((m) => m.direction === direction && m.status === 'settled').slice(-10).reverse();
    return (
      <section className="card block-card" style={{ flex: '1 1 380px' }}>
        <details className="block-fold" open={open === direction}>
          <summary>
            <Chev />
            <h2 style={{ flex: 1 }}>{title}</h2>
            <span className="muted" style={{ fontSize: 13 }}>{items.length} open</span>
            <strong className={`fold-amount ${direction === 'i_owe' && items.length ? 'neg' : ''}`}>{eur(sum(items, 'eur'))}</strong>
          </summary>
          <div className="block-body">
            {items.length === 0 ? <p className="empty" style={{ margin: 0 }}>{empty}</p> : (
              <div className="list">
                {items.map((m) => (
                  <div key={m.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 160 }}><strong>{m.title}</strong>
                      <span className="muted" style={{ display: 'block', fontSize: 12 }}>{m.due_date ? `${direction === 'i_owe' ? 'Due' : 'Expected'} ${shortDate(m.due_date)}` : 'No date'}{m.note ? ` · ${m.note}` : ''}</span></span>
                    <span style={{ textAlign: 'right' }}>{fmtCur(Number(m.amount), m.currency)}{m.currency !== 'EUR' ? <span className="muted" style={{ display: 'block', fontSize: 12 }}>{eur(m.eur)}</span> : null}</span>
                    <form action={settleMoneyItem}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="direction" value={direction} /><Hidden month={month} scope={scope} /><button className="btn small" type="submit">{verb}</button></form>
                    <Delete table="money_items" id={m.id} month={month} scope={scope} open={direction} />
                  </div>
                ))}
              </div>
            )}
            <form action={addMoneyItem} className="grid2 add-form" style={{ alignItems: 'end' }}>
              <input type="hidden" name="direction" value={direction} /><Hidden month={month} scope={scope} />
              <label style={{ gridColumn: '1 / -1' }}>{direction === 'i_owe' ? 'What do you owe?' : 'What are you expecting?'}<input name="title" placeholder={direction === 'i_owe' ? 'e.g. Rent Q1, tax NL 2025' : 'e.g. MC invoice October'} required /></label>
              <label>Amount<input name="amount" inputMode="decimal" required /></label>
              <label>Currency<select name="currency" defaultValue="EUR">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label>{direction === 'i_owe' ? 'Due date' : 'Expected date'}<input type="date" name="due_date" /></label>
              <label>Note (optional)<input name="note" /></label>
              <button className="btn small" type="submit">Add</button>
            </form>
            {settled.length > 0 && (
              <details className="fold">
                <summary><Chev /><span style={{ flex: 1, fontWeight: 600 }}>{direction === 'i_owe' ? 'Paid' : 'Received'} ({settled.length})</span></summary>
                <div className="fold-body list">
                  {settled.map((m) => (
                    <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ flex: 1 }}>{m.title}<span className="muted" style={{ fontSize: 12 }}> · {shortDate(m.settled_on)}</span></span>
                      <span>{fmtCur(Number(m.amount), m.currency)}</span>
                      <form action={settleMoneyItem}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="reopen" value="1" /><input type="hidden" name="direction" value={direction} /><Hidden month={month} scope={scope} /><button className="linkbtn" type="submit">Reopen</button></form>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </details>
      </section>
    );
  };

  return (
    <>
      <div className="section-title" style={{ alignItems: 'flex-end' }}>
        <div>
          <p className="overline">Finance · EUR · {isPersonal ? 'Personal' : 'Business'}</p>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 14 }}>{monthLabel(month)}
            <InfoButton title="How this page works">
              <p><strong>The idea.</strong> Know what you really have and what you can really spend. Once a week you write down the balance of every account (a snapshot, not every transaction); the page turns that into a monthly picture, measures you against your savings plan, and tells you your <em>spending power</em>.</p>
              <h3>Every Sunday (2 minutes)</h3>
              <ol>
                <li>Open <strong>Sunday check-in</strong> and type the balance of each account in its own currency (EUR, USD or AED). Only the ones that changed are saved; USD and AED are converted at the ECB rate of that day.</li>
                <li>For gold and the S&amp;P 500, also update <strong>put in so far</strong> when you've invested more.</li>
                <li>Add anything new under <strong>You owe</strong> (bills, tax) or <strong>Owed to you</strong> (invoices you're waiting for). Tick them off when paid or received.</li>
              </ol>
              <h3>Once a month</h3>
              <ol>
                <li>Use <strong>Copy from last month</strong> to bring over recurring income and expenses, then adjust what changed.</li>
                <li>Invest your {eur(Number(fin?.plan_invest ?? 2000))} and keep {eur(Number(fin?.plan_buffer ?? 500))} as cash buffer.</li>
                <li>Read the insights at the bottom of the page.</li>
              </ol>
              <h3>The numbers</h3>
              <ul>
                <li><strong>Total balance:</strong> all your accounts added up. Investments count at what you put in, because their value goes up and down; today's value and your gain or loss are shown next to it. This way you never count yourself rich on a good market day.</li>
                <li><strong>Savings plan:</strong> a target balance that rises by {eur(Number(fin?.plan_monthly ?? 2500))} every month ({eur(Number(fin?.plan_monthly ?? 2500) * 12)} a year), starting from your total at the end of the month before the plan starts.</li>
                <li><strong>Spending power</strong> = total balance − set-aside buckets − bills you owe − this month's savings target. This is the only money you can spend this month while staying on plan. Green means ahead, red means behind. When salary comes in it goes up; every euro you spend brings it down.</li>
                <li><strong>Set aside:</strong> yearly or quarterly bills (trade licence, VPN) are booked as a monthly expense. If you keep that money in a separate bucket, add it as a “Set-aside bucket” account: it counts in your total, not in your spending power.</li>
                <li><strong>Owed to you</strong> is shown as “expected in” but not counted until it arrives. <strong>You owe</strong> is subtracted right away.</li>
                <li><strong>Personal / Business</strong> switch at the top: business money is tracked separately and never counts towards your personal spending power.</li>
              </ul>
              <p className="muted" style={{ fontSize: 13 }}>Based on the weekly balance sheet your friend uses, adapted to a monthly overview with weekly check-ins.</p>
            </InfoButton>
          </h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <div className="seg" role="tablist" aria-label="Personal or business">
            <a role="tab" aria-selected={isPersonal} className={isPersonal ? 'on' : ''} href={`/finance?m=${ym}`}>Personal</a>
            <a role="tab" aria-selected={!isPersonal} className={!isPersonal ? 'on' : ''} href={`/finance?m=${ym}&scope=business`}>Business</a>
          </div>
          <div className="nav">
            <a className="pill" href={qs({ m: prev.slice(0, 7) })}>← {monthLabel(prev).split(' ')[0]}</a>
            <a className="pill" href={qs({ m: shiftMonth(month, 1).slice(0, 7) })}>{monthLabel(shiftMonth(month, 1)).split(' ')[0]} →</a>
          </div>
        </div>
      </div>

      {(income || []).length === 0 && (expenses || []).length === 0 && (
        <div className="hint" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <span>No {scope} income or expenses for {monthLabel(month)} yet. Start from last month's recurring items, or add them below.</span>
          <form action={copyFromPrevious}>
            <input type="hidden" name="prev" value={prev} /><Hidden month={month} scope={scope} />
            <button className="btn small" type="submit">Copy from {monthLabel(prev).split(' ')[0]}</button>
          </form>
        </div>
      )}
      {open.startsWith('checked-') && <p className="pos" role="status" style={{ margin: 0 }}>Check-in saved: {open.slice(8)} balance{open.slice(8) === '1' ? '' : 's'} updated.</p>}

      <div className="row">
        {isPersonal ? (
          <section className={`card tile sp-tile ${spendingPower === null ? '' : spendingPower >= 0 ? 'ok' : 'bad'}`}>
            <p className="muted" style={{ margin: 0 }}>Spending power</p>
            <p className="stat">{spendingPower === null ? '—' : eur(spendingPower)}</p>
            <span className="muted">{spendingPower === null ? (planStarted ? 'Set your plan starting point below' : `Plan starts ${fin?.plan_start ? monthLabel(fin.plan_start) : '—'}`) : 'Free to spend this month while staying on plan'}</span>
          </section>
        ) : (
          <section className="card tile"><p className="muted" style={{ margin: 0 }}>Business balance</p><p className="stat">{eur(t.basis)}</p><span className="muted">{anyPrev ? <>{t.basis - tPrev.basis >= 0 ? '▲' : '▼'} {eur(Math.abs(t.basis - tPrev.basis))} vs last month</> : `${states.filter((s) => s.latest).length} of ${states.length} accounts filled in`}</span></section>
        )}
        {isPersonal && (
          <section className="card tile"><p className="muted" style={{ margin: 0 }}>Total balance</p><p className="stat">{eur(t.basis)}</p><span className="muted">{t.investValue ? <>Today's value {eur(t.live)} <span className={t.live - t.basis >= 0 ? 'pos' : 'neg'}>({t.live - t.basis >= 0 ? '+' : '−'}{eur(Math.abs(t.live - t.basis))})</span></> : 'Investments at what you put in'}</span></section>
        )}
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>Income</p><p className="stat">{eur(totalIncome)}</p><span className="muted">{income?.length || 0} entries</span></section>
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>Expenses</p><p className="stat">{eur(totalExpenses)}</p>{prevExpenses > 0 ? (() => { const ce = change(totalExpenses, prevExpenses); return <span className={ce <= 0 ? 'pos' : 'neg'}>{ce <= 0 ? '▼' : '▲'} {pct(Math.abs(ce))} vs last month</span>; })() : <span className="muted">{setAside ? `${eur(setAside)} set aside for yearly bills` : `${expenses?.length || 0} entries`}</span>}</section>
        {!isPersonal && <section className="card tile"><p className="muted" style={{ margin: 0 }}>Expected in</p><p className="stat">{eur(owedTotal)}</p><span className="muted">{owedToMe.length} open invoice{owedToMe.length === 1 ? '' : 's'}</span></section>}
      </div>

      <div className="row">
        {/* Accounts with the Sunday check-in */}
        <section className="card wide" id="accounts">
          <div className="card-head"><h2>{isPersonal ? 'Accounts' : 'Business accounts'}</h2><strong style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{eur(t.basis)}</strong></div>
          <details className="fold add-fold checkin" open={open === 'checkin'}>
            <summary><span className="fold-plus" aria-hidden="true">↻</span><span style={{ flex: 1, fontWeight: 600 }}>Sunday check-in: update balances</span><span className="muted" style={{ fontSize: 12 }}>Only changed values are saved</span></summary>
            <form action={checkIn} className="fold-body stack-sm">
              <Hidden month={month} scope={scope} />
              <label style={{ maxWidth: 220 }}>Date<input type="date" name="date" defaultValue={today} /></label>
              <div className="scroll"><table className="checkin-table">
                <thead><tr><th>Account</th><th className="num">Last</th><th>New balance</th><th>Put in so far (investments)</th></tr></thead>
                <tbody>
                  {accountStates(accounts, balances).map(({ account: a, latest: b }) => (
                    <tr key={a.id}>
                      <td><strong>{a.name}</strong><span className="muted" style={{ display: 'block', fontSize: 12 }}>{a.currency} · {KIND_LABEL[a.kind]}{b ? ` · ${dayMonth(b.date)}` : ''}</span></td>
                      <td className="num muted">{b ? fmtCur(Number(b.amount), a.currency) : '—'}</td>
                      <td>
                        <input type="hidden" name={`prev_${a.id}`} value={b ? b.amount : ''} />
                        <input name={`amt_${a.id}`} inputMode="decimal" defaultValue={b ? b.amount : ''} placeholder={a.currency} aria-label={`${a.name} balance in ${a.currency}`} />
                      </td>
                      <td>{a.kind === 'investment' ? (<>
                        <input type="hidden" name={`previnv_${a.id}`} value={b?.invested ?? ''} />
                        <input name={`inv_${a.id}`} inputMode="decimal" defaultValue={b?.invested ?? ''} placeholder="Optional" aria-label={`${a.name} amount put in`} />
                      </>) : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>Enter each balance in the account's own currency; it's converted to euros at today's rate (1 USD = €{fx.USD.toFixed(4)}, 1 AED = €{fx.AED.toFixed(4)}{fx.date ? `, ECB ${shortDate(fx.date)}` : ''}).</p>
              <div><button className="btn" type="submit">Save check-in</button></div>
            </form>
          </details>

          <div className="fold-list" style={{ marginTop: 8 }}>
            {(() => {
              // Largest balance first; top 2 visible, the rest folded (opens if you're editing one of them)
              const sorted = [...states].sort((x, y) => basisEur(y.latest) - basisEur(x.latest) || (x.account.sort - y.account.sort));
              const row = ({ account: a, latest: b, history }) => {
                const gain = a.kind === 'investment' && b && b.invested_eur !== null && b.invested_eur !== undefined ? liveEur(b) - basisEur(b) : null;
              return (
                <details key={a.id} className="fold" open={(!!editBal && history.some((h) => h.id === editBal.id)) || editAcc?.id === a.id}>
                  <summary>
                    <Chev />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{a.name}</span> <span className="tag cur-tag">{a.currency}</span>
                      <span className="muted" style={{ display: 'block', fontSize: 12 }}>{KIND_LABEL[a.kind]}{b ? ` · as of ${shortDate(b.date)}` : ' · not entered yet'}</span>
                    </span>
                    {gain !== null && <span className={gain >= 0 ? 'pos' : 'neg'} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{gain >= 0 ? '▲' : '▼'} {eur(Math.abs(gain))} value</span>}
                    <span style={{ textAlign: 'right' }}>
                      <strong className="fold-amount" style={{ display: 'block' }}>{b ? eur(basisEur(b)) : '—'}</strong>
                      {b && a.currency !== 'EUR' && <span className="muted" style={{ fontSize: 12 }}>{fmtCur(Number(a.kind === 'investment' && b.invested !== null && b.invested !== undefined ? b.invested : b.amount), a.currency)}</span>}
                    </span>
                  </summary>
                  <div className="fold-body">
                    {a.kind === 'investment' && b && (
                      <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>Put in: {b.invested !== null && b.invested !== undefined ? fmtCur(Number(b.invested), a.currency) : 'not entered (counts at today\'s value)'} · Today's value: {fmtCur(Number(b.amount), a.currency)}</p>
                    )}
                    {history.length === 0 ? <p className="muted" style={{ margin: 0 }}>No balances yet. Use the Sunday check-in above.</p> : (
                      <div className="scroll"><table>
                        <thead><tr><th>Date</th><th className="num">Balance</th>{a.kind === 'investment' && <th className="num">Put in</th>}<th className="num">In EUR</th><th></th></tr></thead>
                        <tbody>{history.map((h) => (editBal?.id === h.id ? (
                          <tr key={h.id}><td colSpan={5} className="edit-cell">
                            <form action={updateBalance} className="grid2" style={{ alignItems: 'end' }}>
                              <input type="hidden" name="id" value={h.id} /><Hidden month={month} scope={scope} />
                              <label>Date<input type="date" name="date" defaultValue={h.date} /></label>
                              <label>Balance ({h.currency})<input name="amount" inputMode="decimal" defaultValue={h.amount} required /></label>
                              {a.kind === 'investment' && <label>Put in ({h.currency})<input name="invested" inputMode="decimal" defaultValue={h.invested ?? ''} /></label>}
                              <label>Note<input name="note" defaultValue={h.note || ''} /></label>
                              <div style={{ display: 'flex', gap: 10 }}><button className="btn small" type="submit">Save</button>{cancel()}</div>
                            </form>
                          </td></tr>
                        ) : (
                          <tr key={h.id}>
                            <td>{shortDate(h.date)}{h.note ? <div className="muted" style={{ fontSize: 12 }}>{h.note}</div> : null}</td>
                            <td className="num">{fmtCur(Number(h.amount), h.currency)}</td>
                            {a.kind === 'investment' && <td className="num">{h.invested !== null && h.invested !== undefined ? fmtCur(Number(h.invested), h.currency) : '—'}</td>}
                            <td className="num muted">{eur(h.eur)}</td>
                            <td className="row-actions"><a className="linkbtn" href={qs({ bedit: h.id })}>Edit</a><Delete table="balances" id={h.id} month={month} scope={scope} /></td>
                          </tr>
                        )))}</tbody>
                      </table></div>
                    )}
                    {editAcc?.id === a.id ? (
                      <form action={updateAccount} className="grid2 add-form" style={{ alignItems: 'end' }}>
                        <input type="hidden" name="id" value={a.id} /><Hidden month={month} scope={scope} />
                        <label>Name<input name="name" defaultValue={a.name} /></label>
                        <label>Type<select name="kind" defaultValue={a.kind}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                        <label>Currency<select name="currency" defaultValue={a.currency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                        <label className="check"><input type="checkbox" name="archived" defaultChecked={a.archived} /> Archive (hide this account)</label>
                        <div style={{ display: 'flex', gap: 10 }}><button className="btn small" type="submit">Save</button>{cancel()}</div>
                        <p className="muted" style={{ margin: 0, fontSize: 12, gridColumn: '1 / -1' }}>Changing the currency applies to new balances; earlier balances keep the currency they were entered in.</p>
                      </form>
                    ) : (
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                        <a className="linkbtn" href={qs({ aedit: a.id })}>Edit account</a>
                        <form action={addAccount} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <Hidden month={month} scope={scope} /><input type="hidden" name="name" value={a.name} /><input type="hidden" name="kind" value={a.kind} />
                          <select name="currency" aria-label={`Add a currency to ${a.name}`} defaultValue={CURRENCIES.find((c) => c !== a.currency)} style={{ minHeight: 32, padding: '4px 8px', width: 'auto' }}>{CURRENCIES.filter((c) => c !== a.currency).map((c) => <option key={c}>{c}</option>)}</select>
                          <button className="linkbtn" type="submit">+ Add this currency to {a.name}</button>
                        </form>
                      </div>
                    )}
                  </div>
                </details>
              );
              };
              const isOpen = (st) => (!!editBal && st.history.some((h) => h.id === editBal.id)) || editAcc?.id === st.account.id;
              const rest = sorted.slice(2);
              return (
                <>
                  {sorted.slice(0, 2).map(row)}
                  {rest.length > 0 && (
                    <details className="more-fold" open={rest.some(isOpen) || open === 'accounts'}>
                      <summary><span className="when-closed">Show {rest.length} more account{rest.length === 1 ? '' : 's'} ▾</span><span className="when-open">Show less ▴</span></summary>
                      <div className="fold-list" style={{ marginTop: 8 }}>{rest.map(row)}</div>
                    </details>
                  )}
                </>
              );
            })()}
            <details className="fold add-fold" open={open === 'accounts' && !editBal}>
              <summary><span className="fold-plus" aria-hidden="true">+</span><span style={{ flex: 1, fontWeight: 600 }}>Add account</span></summary>
              <form action={addAccount} className="grid2 fold-body" style={{ alignItems: 'end' }}>
                <Hidden month={month} scope={scope} />
                <label>Name<input name="name" placeholder="e.g. Wio savings" required /></label>
                <label>Type<select name="kind" defaultValue="bank">{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label>Currency<select name="currency" defaultValue="EUR">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                <button className="btn small" type="submit">Add account</button>
                <p className="muted" style={{ margin: 0, fontSize: 12, gridColumn: '1 / -1' }}>“Set-aside bucket” is for money already reserved for a bill (e.g. the trade licence). It counts in your total but not in your spending power.</p>
              </form>
            </details>
            {archived.length > 0 && <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Archived: {archived.map((a) => a.name).join(', ')}</p>}
          </div>
        </section>

        {isPersonal ? (
          <section className="card narrow" id="plan">
            <div className="card-head"><h2>Savings plan</h2><strong>{eur(Number(fin?.plan_monthly ?? 0))}<span className="muted" style={{ fontWeight: 400, fontSize: 13 }}> / month</span></strong></div>
            <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>{eur(Number(fin?.plan_invest ?? 0))} invested + {eur(Number(fin?.plan_buffer ?? 0))} cash buffer · {eur(Number(fin?.plan_monthly ?? 0) * 12)} a year</p>
            {target !== null ? (
              <div className="sp-calc">
                <div><span>Total balance</span><span>{eur(t.basis)}</span></div>
                {t.reserved > 0 && <div><span>− Set-aside buckets</span><span>{eur(t.reserved)}</span></div>}
                {oweTotal > 0 && <div><span>− Bills you owe</span><span>{eur(oweTotal)}</span></div>}
                <div><span>− Savings target for {monthLabel(month).split(' ')[0]}</span><span>{eur(target)}</span></div>
                <div className="sp-total"><span>Spending power</span><span className={spendingPower >= 0 ? 'pos' : 'neg'}>{eur(spendingPower)}</span></div>
              </div>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {!planStarted ? <>The plan starts in <strong style={{ color: 'var(--ink)' }}>{fin?.plan_start ? monthLabel(fin.plan_start) : '—'}</strong>. Its starting point is your total balance at the end of the month before, so do your check-ins until then.</> : 'Set a starting point below to see your spending power.'}
              </p>
            )}
            {investedThisMonth !== null ? <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>Put into investments this month: <strong style={{ color: 'var(--ink)' }}>{eur(Math.max(0, investedThisMonth))}</strong> of {eur(Number(fin?.plan_invest ?? 0))}</p> : <p className="muted" style={{ margin: '12px 0 0', fontSize: 12 }}>Enter "put in so far" for gold and S&amp;P 500 at check-ins to track the {eur(Number(fin?.plan_invest ?? 0))} you invest each month.</p>}
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Expected in (not counted): {eur(owedTotal)}</p>
            <details className="fold" style={{ marginTop: 14 }} open={open === 'plan'}>
              <summary><Chev /><span style={{ flex: 1, fontWeight: 600 }}>Edit plan</span></summary>
              <form action={savePlan} className="fold-body stack-sm">
                <Hidden month={month} scope={scope} />
                <div className="grid2">
                  <label>Invest per month (€)<input name="plan_invest" inputMode="decimal" defaultValue={fin?.plan_invest ?? 2000} /></label>
                  <label>Cash buffer per month (€)<input name="plan_buffer" inputMode="decimal" defaultValue={fin?.plan_buffer ?? 500} /></label>
                  <label>Plan starts<input type="month" name="plan_start" defaultValue={fin?.plan_start ? fin.plan_start.slice(0, 7) : ''} /></label>
                  <label>Starting point (€)<input name="plan_baseline" inputMode="decimal" defaultValue={fin?.plan_baseline ?? ''} placeholder={baseline.value !== null ? `Auto: ${Math.round(baseline.value)}` : 'Auto'} /></label>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>Leave the starting point empty to use your total balance at the end of the month before the plan starts. Each month the target rises by the monthly amount.</p>
                <div><button className="btn small" type="submit">Save plan</button></div>
              </form>
            </details>
          </section>
        ) : (
          <section className="card narrow">
            <h2 style={{ marginBottom: 6 }}>Business overview</h2>
            <div className="sp-calc">
              <div><span>Balance</span><span>{eur(t.basis)}</span></div>
              <div><span>+ Expected in</span><span>{eur(owedTotal)}</span></div>
              <div><span>− Bills owed</span><span>{eur(oweTotal)}</span></div>
              <div className="sp-total"><span>After open items</span><span>{eur(t.basis + owedTotal - oweTotal)}</span></div>
            </div>
            <p className="muted" style={{ margin: '12px 0 0', fontSize: 12 }}>Business money is kept out of your personal spending power.</p>
          </section>
        )}
      </div>

      <div className="row">
        {moneyBlock('owed_to_me', owedToMe, 'Owed to you', 'Nothing expected right now.', 'Received')}
        {moneyBlock('i_owe', iOwe, 'You owe', 'No open bills.', 'Paid')}
      </div>

      <section className="card">
        <div className="card-head">
          <h2>{isPersonal ? 'Balance over time' : 'Business balance over time'}</h2>
          <div className="seg small" role="tablist" aria-label="Chart period">
            <a role="tab" aria-selected={view === 'monthly'} className={view === 'monthly' ? 'on' : ''} href={qs({ chart: null })}>Monthly</a>
            <a role="tab" aria-selected={view === 'weekly'} className={view === 'weekly' ? 'on' : ''} href={qs({ chart: 'weekly' })}>Weekly</a>
          </div>
        </div>
        <BarChart
          points={pts.map((p) => ({ label: p.label, short: p.short, value: p.value }))}
          label="Balance (investments at what you put in)"
          lines={[
            ...(pts.some((p) => p.live !== null && p.live !== p.value) ? [{ label: "Today's value", color: '#8FB3E8', values: pts.map((p) => p.live) }] : []),
            ...(isPersonal && pts.some((p) => p.plan !== null) ? [{ label: 'Savings target', color: '#4FC98A', dashed: true, values: pts.map((p) => p.plan) }] : []),
          ]}
        />
      </section>

      <div className="row">
        <section className="card narrow block-card">
          <details className="block-fold" open={!!editInc || open === 'income'}>
            <summary>
              <Chev />
              <h2 style={{ flex: 1 }}>Income</h2>
              <span className="muted" style={{ fontSize: 13 }}>{income?.length || 0} entr{income?.length === 1 ? 'y' : 'ies'}</span>
              <strong className="fold-amount">{eur(totalIncome)}</strong>
            </summary>
            <div className="block-body">
              {(income || []).length === 0 ? <p className="empty">No income for this month yet.</p> : (
                <Groups rows={income} groupOf={(r) => r.category || 'other'} openGroup={editInc ? editInc.category || 'other' : null} renderRow={incomeRow}
                  head={<tr><th>Source</th><th className="num">Amount</th><th></th></tr>} />
              )}
              <datalist id="income-categories">{incCats.map((c) => <option key={c} value={c} />)}</datalist>
              <form action={addIncome} className="stack-sm add-form">
                <Hidden month={month} scope={scope} />
                <div className="grid2">
                  <label>Source<input name="source" placeholder="Salary" /></label>
                  <label>Category<input name="category" list="income-categories" placeholder="Employment, own business…" required /></label>
                  <label>Amount (€)<input name="amount" inputMode="decimal" required /></label>
                </div>
                <label className="check"><input type="checkbox" name="recurring" /> Recurring monthly</label>
                <div><button className="btn small" type="submit">Add income</button></div>
              </form>
            </div>
          </details>
        </section>

        <section className="card wide block-card">
          <details className="block-fold" open={!!editExp || open === 'expenses'}>
            <summary>
              <Chev />
              <h2 style={{ flex: 1 }}>Expenses</h2>
              <span className="muted" style={{ fontSize: 13 }}>{expenses?.length || 0} entr{expenses?.length === 1 ? 'y' : 'ies'}</span>
              <strong className="fold-amount">{eur(totalExpenses)}</strong>
            </summary>
            <div className="block-body">
              {byCat.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {byCat.map(({ c, v }) => (
                    <div key={c}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ textTransform: 'capitalize' }}>{c}</span><span className="muted">{eur(v)} · {pct((v / totalExpenses) * 100, 0)}</span></div>
                      <div className="track" style={{ marginTop: 4 }}><div className="bar" style={{ width: `${Math.round((v / byCat[0].v) * 100)}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
              {setAside > 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}><span className="tag set-aside">Set aside</span> {eur(setAside)} of this month's expenses is put aside for yearly or quarterly bills.</p>}
              {(expenses || []).length === 0 ? <p className="empty">No expenses for this month yet.</p> : (
                <Groups rows={expenses} groupOf={(r) => r.category || 'other'} openGroup={editExp ? editExp.category || 'other' : null} renderRow={expenseRow}
                  head={<tr><th>Expense</th><th className="num">Amount</th><th></th></tr>} />
              )}
              <datalist id="expense-categories">{expCats.map((c) => <option key={c} value={c} />)}</datalist>
              <form action={addExpense} className="stack-sm add-form">
                <Hidden month={month} scope={scope} />
                <div className="grid2">
                  <label>Expense<input name="name" placeholder="Supplements" /></label>
                  <label>Category<input name="category" list="expense-categories" placeholder="Pick or type a new one" required /></label>
                  <label>Amount (€)<input name="amount" inputMode="decimal" required /></label>
                  <label>Link (optional)<input name="link" type="url" placeholder="https://" /></label>
                </div>
                <label>Note (optional)<input name="note" /></label>
                <label className="check"><input type="checkbox" name="recurring" /> Recurring monthly</label>
                <label className="check"><input type="checkbox" name="set_aside" /> Set aside monthly for a yearly or quarterly bill</label>
                <div><button className="btn small" type="submit">Add expense</button></div>
              </form>
            </div>
          </details>
        </section>
      </div>

      <div className="row">
        <section className="card" style={{ flex: '1 1 420px' }}>
          <h2 style={{ marginBottom: 4 }}>Income over time</h2>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>Total {scope} income per month</p>
          <LineChart points={flowMonths.map((m) => fp(m, incM[m]))} color="#4FC98A" label="Income" />
        </section>
        <section className="card" style={{ flex: '1 1 420px' }}>
          <h2 style={{ marginBottom: 4 }}>Expenses over time</h2>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>Total {scope} expenses per month</p>
          <LineChart points={flowMonths.map((m) => fp(m, expM[m]))} color="#EF5B5B" label="Expenses" />
        </section>
      </div>
      <section className="card" id="insights">
        <div className="card-head"><h2>Insights &amp; suggestions</h2><span className="muted" style={{ fontSize: 13 }}>From your {scope} numbers</span></div>
        {insights.length === 0 && !(aiSugg || []).length ? (
          <p className="empty" style={{ margin: 0 }}>Insights appear once you have a couple of check-ins and a month of income and expenses.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {insights.length > 0 && (
              <div className="insight-grid">
                {insights.map((i, k) => (
                  <div key={k} className={`insight ${i.tone}`}>
                    <span className="insight-dot" aria-hidden="true" />
                    <div><strong>{i.title}</strong><p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{i.body}</p></div>
                  </div>
                ))}
              </div>
            )}
            <FinanceSuggestions items={aiSugg || []} />
          </div>
        )}
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 12 }}>Insights are calculated from your data every time you open the page. Suggestions marked “Claude” are written during the first sync of the day.</p>
      </section>
    </>
  );
}
