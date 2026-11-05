import { createClient } from '@/lib/supabase';
import { eur, pct, monthStart, shiftMonth, monthLabel } from '@/lib/util';
import { addIncome, addExpense, addNetWorth, removeRow, copyFromPrevious } from './actions';

export const metadata = { title: 'Money · Command Center' };
const NW_TYPES = [['gold', 'Gold'], ['sp500', 'S&P 500'], ['bank', 'Bank'], ['other', 'Other asset'], ['liability', 'Liability']];

const sum = (rows, key) => (rows || []).reduce((a, r) => a + Number(r[key] || 0), 0);
const netWorth = (rows) => (rows || []).reduce((a, r) => a + (r.kind === 'liability' ? -1 : 1) * Number(r.value || 0), 0);

function Delete({ table, id, month }) {
  return (
    <form action={removeRow}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="month" value={month} />
      <button className="linkbtn" type="submit" aria-label="Remove">Remove</button>
    </form>
  );
}

export default async function Money({ searchParams }) {
  const sp = await searchParams;
  const month = monthStart(sp?.m);
  const prev = shiftMonth(month, -1);
  const yearStart = `${month.slice(0, 4)}-01-01`;
  const supabase = await createClient();
  const [{ data: income }, { data: expenses }, { data: nwAll }, { data: settings }, { data: prevExp }] = await Promise.all([
    supabase.from('income').select('*').eq('month', month).order('created_at'),
    supabase.from('expenses').select('*').eq('month', month).order('created_at'),
    supabase.from('net_worth_items').select('*').order('month'),
    supabase.from('settings').select('expense_categories').maybeSingle(),
    supabase.from('expenses').select('amount').eq('month', prev),
  ]);
  const categories = settings?.expense_categories || ['housing', 'food', 'supplements', 'subscriptions', 'transport', 'personal', 'business', 'giving', 'other'];
  const nwThis = (nwAll || []).filter((r) => r.month === month);
  const byMonth = {};
  (nwAll || []).forEach((r) => { byMonth[r.month] = byMonth[r.month] || []; byMonth[r.month].push(r); });
  const history = Object.keys(byMonth).sort().slice(-12).map((m) => ({ m, v: netWorth(byMonth[m]) }));
  const maxV = Math.max(1, ...history.map((h) => Math.abs(h.v)));

  const totalIncome = sum(income, 'amount');
  const totalExpenses = sum(expenses, 'amount');
  const savings = totalIncome - totalExpenses;
  const rate = totalIncome > 0 ? (savings / totalIncome) * 100 : null;
  const prevExpenses = sum(prevExp, 'amount');
  const nw = nwThis.length ? netWorth(nwThis) : null;
  const nwPrev = byMonth[prev] ? netWorth(byMonth[prev]) : null;
  const ytdKey = Object.keys(byMonth).sort().find((m) => m >= yearStart);
  const nwYtd = ytdKey && ytdKey !== month ? netWorth(byMonth[ytdKey]) : null;
  const change = (a, b) => (a !== null && b !== null && b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null);
  const byCat = categories.map((c) => ({ c, v: (expenses || []).filter((e) => e.category === c).reduce((a, e) => a + Number(e.amount), 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const ym = month.slice(0, 7);
  const isEmpty = !(income?.length || expenses?.length || nwThis.length);

  const delta = (n, label) => n === null ? <span className="muted">No earlier month to compare</span>
    : <span className={n >= 0 ? 'pos' : 'neg'}>{n >= 0 ? '▲' : '▼'} {pct(Math.abs(n))} {label}</span>;

  return (
    <>
      <div className="section-title">
        <div>
          <p className="overline">Money · EUR</p>
          <h1>{monthLabel(month)}</h1>
        </div>
        <div className="nav">
          <a className="pill" href={`/money?m=${prev.slice(0, 7)}`}>← {monthLabel(prev).split(' ')[0]}</a>
          <a className="pill" href={`/money?m=${shiftMonth(month, 1).slice(0, 7)}`}>{monthLabel(shiftMonth(month, 1)).split(' ')[0]} →</a>
        </div>
      </div>

      {isEmpty && (
        <div className="hint" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Monthly money update: add this month's income, expenses and net worth, or start from last month's recurring items.</span>
          <form action={copyFromPrevious}>
            <input type="hidden" name="month" value={month} /><input type="hidden" name="prev" value={prev} />
            <button className="btn small" type="submit">Copy from {monthLabel(prev).split(' ')[0]}</button>
          </form>
        </div>
      )}

      <div className="row">
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>Net worth</p><p className="stat">{eur(nw)}</p>{delta(change(nw, nwPrev), 'vs last month')}</section>
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>Income</p><p className="stat">{eur(totalIncome)}</p><span className="muted">{income?.length || 0} entries</span></section>
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>Expenses</p><p className="stat">{eur(totalExpenses)}</p>{prevExpenses > 0 ? (() => { const ce = change(totalExpenses, prevExpenses); return <span className={ce <= 0 ? 'pos' : 'neg'}>{ce <= 0 ? '▼' : '▲'} {pct(Math.abs(ce))} vs last month</span>; })() : <span className="muted">{expenses?.length || 0} entries</span>}</section>
        <section className="card tile"><p className="muted" style={{ margin: 0 }}>Saved</p><p className="stat">{eur(savings)}</p><span className={savings >= 0 ? 'pos' : 'neg'}>Savings rate {pct(rate, 0)}</span></section>
      </div>

      <div className="row">
        <section className="card wide">
          <div className="card-head"><h2>Net worth</h2><span className="muted">{nwYtd !== null && nw !== null ? <>Since start of year: {delta(change(nw, nwYtd), '')}</> : null}</span></div>
          <div className="scroll"><table>
            <thead><tr><th>Item</th><th>Type</th><th className="num">Value</th><th></th></tr></thead>
            <tbody>
              {nwThis.map((r) => (
                <tr key={r.id}><td>{r.label}</td><td className="muted">{NW_TYPES.find(([k]) => k === r.type)?.[1] || r.type}</td>
                  <td className={`num ${r.kind === 'liability' ? 'neg' : ''}`}>{r.kind === 'liability' ? '−' : ''}{eur(r.value)}</td>
                  <td><Delete table="net_worth_items" id={r.id} month={month} /></td></tr>
              ))}
              {nwThis.length > 0 && <tr><td><strong>Total</strong></td><td></td><td className="num"><strong>{eur(nw)}</strong></td><td></td></tr>}
            </tbody>
          </table></div>
          <form action={addNetWorth} className="grid2" style={{ marginTop: 14, alignItems: 'end' }}>
            <input type="hidden" name="month" value={month} />
            <label>Type<select name="type">{NW_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label>Label<input name="label" placeholder="Gold (physical)" /></label>
            <label>Value (€)<input name="value" inputMode="decimal" required /></label>
            <button className="btn" type="submit">Add</button>
          </form>
        </section>
        <section className="card narrow">
          <h2 style={{ marginBottom: 4 }}>Net worth over time</h2>
          <p className="muted" style={{ margin: '0 0 16px' }}>Last {history.length || 0} months entered</p>
          {history.length === 0 ? <p className="empty">Appears once you add a month.</p> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150 }}>
              {history.map((h) => (
                <div key={h.m} style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }} title={`${monthLabel(h.m)}: ${eur(h.v)}`}>
                  <div style={{ width: '100%', height: Math.max(4, Math.round((Math.abs(h.v) / maxV) * 120)), borderRadius: 6, background: h.m === month ? 'var(--gold-grad)' : 'var(--surface-sunken)' }} />
                  <span className="muted" style={{ fontSize: 11 }}>{monthLabel(h.m).slice(0, 3)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="row">
        <section className="card narrow">
          <h2 style={{ marginBottom: 10 }}>Income</h2>
          <div className="list">
            {(income || []).map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <span>{r.source}{r.recurring ? <span className="muted"> · monthly</span> : null}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ fontVariantNumeric: 'tabular-nums' }}>{eur(r.amount)}</span><Delete table="income" id={r.id} month={month} /></span>
              </div>
            ))}
          </div>
          <form action={addIncome} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <input type="hidden" name="month" value={month} />
            <div className="grid2"><label>Source<input name="source" placeholder="Salary" /></label><label>Amount (€)<input name="amount" inputMode="decimal" required /></label></div>
            <label className="check"><input type="checkbox" name="recurring" /> Recurring monthly</label>
            <div><button className="btn small" type="submit">Add income</button></div>
          </form>
        </section>

        <section className="card wide">
          <div className="card-head"><h2>Expenses</h2></div>
          {byCat.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {byCat.map(({ c, v }) => (
                <div key={c}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ textTransform: 'capitalize' }}>{c}</span><span className="muted">{eur(v)} · {pct((v / totalExpenses) * 100, 0)}</span></div>
                  <div className="track" style={{ marginTop: 4 }}><div className="bar" style={{ width: `${Math.round((v / byCat[0].v) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
          <div className="scroll"><table>
            <thead><tr><th>Expense</th><th>Category</th><th className="num">Amount</th><th></th></tr></thead>
            <tbody>
              {(expenses || []).map((r) => (
                <tr key={r.id}>
                  <td>{r.name}{r.recurring ? <span className="muted"> · monthly</span> : null}
                    {r.link ? <> · <a href={r.link} target="_blank" rel="noopener noreferrer">link ↗</a></> : null}
                    {r.note ? <div className="muted" style={{ fontSize: 12 }}>{r.note}</div> : null}</td>
                  <td className="muted" style={{ textTransform: 'capitalize' }}>{r.category}</td>
                  <td className="num">{eur(r.amount)}</td>
                  <td><Delete table="expenses" id={r.id} month={month} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <form action={addExpense} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <input type="hidden" name="month" value={month} />
            <div className="grid2">
              <label>Expense<input name="name" placeholder="Supplements" /></label>
              <label>Category<select name="category">{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
              <label>Amount (€)<input name="amount" inputMode="decimal" required /></label>
              <label>Link (optional)<input name="link" type="url" placeholder="https://" /></label>
            </div>
            <label>Note (optional)<input name="note" /></label>
            <label className="check"><input type="checkbox" name="recurring" /> Recurring monthly</label>
            <div><button className="btn small" type="submit">Add expense</button></div>
          </form>
        </section>
      </div>
    </>
  );
}
