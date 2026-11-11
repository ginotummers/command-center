import { createClient } from '@/lib/supabase';
import { eur, pct, monthStart, shiftMonth, monthLabel, todayIso, lastDayOfMonth } from '@/lib/util';
import { NW_TYPES, assets, netWorthAsOf } from '@/lib/networth';
import { addIncome, updateIncome, addExpense, updateExpense, addNetWorth, updateNetWorth, removeRow, copyFromPrevious } from './actions';

export const metadata = { title: 'Finance · Personal Operating Center' };
export const dynamic = 'force-dynamic';

const INCOME_CATS = ['employment', 'own business', 'partnerships', 'investments', 'other'];
const EXPENSE_CATS = ['housing', 'food', 'supplements', 'subscriptions', 'transport', 'personal', 'business', 'giving', 'other'];

const sum = (rows, key) => (rows || []).reduce((a, r) => a + Number(r[key] || 0), 0);
const shortDate = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const typeLabel = (t) => NW_TYPES.find(([k]) => k === t)?.[1] || t;

function Delete({ table, id, month }) {
  return (
    <form action={removeRow} style={{ display: 'inline' }}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="month" value={month} />
      <button className="linkbtn" type="submit" aria-label="Remove">Remove</button>
    </form>
  );
}

function Chev() { return <span className="fold-chev" aria-hidden="true">▸</span>; }

// Grouped, foldable list: one row per group showing count + total; rows appear when opened
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
          <div className="scroll"><table>
            <thead>{head}</thead>
            <tbody>{list.map(renderRow)}</tbody>
          </table></div>
        </details>
      ))}
    </div>
  );
}

export default async function Money({ searchParams }) {
  const sp = await searchParams;
  const month = monthStart(sp?.m);
  const ym = month.slice(0, 7);
  const prev = shiftMonth(month, -1);
  const monthEnd = lastDayOfMonth(month);
  const supabase = await createClient();
  const [{ data: income }, { data: expenses }, { data: nwAll }, { data: settings }, { data: prevExp }] = await Promise.all([
    supabase.from('income').select('*').eq('month', month).order('created_at'),
    supabase.from('expenses').select('*').eq('month', month).order('created_at'),
    supabase.from('net_worth_items').select('*').order('entered_on').order('created_at'),
    supabase.from('settings').select('expense_categories').maybeSingle(),
    supabase.from('expenses').select('amount').eq('month', prev),
  ]);

  const expCats = [...new Set([...(settings?.expense_categories || EXPENSE_CATS), ...(expenses || []).map((e) => e.category).filter(Boolean)])];
  const incCats = [...new Set([...INCOME_CATS, ...(income || []).map((e) => e.category).filter(Boolean)])];
  const editExp = sp?.edit ? (expenses || []).find((e) => e.id === sp.edit) : null;
  const editInc = sp?.iedit ? (income || []).find((e) => e.id === sp.iedit) : null;
  const editNw = sp?.nwedit ? (nwAll || []).find((e) => e.id === sp.nwedit) : null;
  const open = sp?.open || '';

  // Net worth = latest value of every asset on or before the end of this month
  const assetList = assets(nwAll, monthEnd).sort((a, b) => Number(b.latest.value) - Number(a.latest.value));
  const nw = netWorthAsOf(nwAll, monthEnd);
  const nwPrev = netWorthAsOf(nwAll, lastDayOfMonth(prev));
  const firstMonth = (nwAll || []).length ? `${(nwAll[0].entered_on || nwAll[0].month).slice(0, 7)}-01` : null;
  const history = [];
  if (firstMonth) for (let m = month, i = 0; m >= firstMonth && i < 12; m = shiftMonth(m, -1), i++) history.unshift({ m, v: netWorthAsOf(nwAll, lastDayOfMonth(m)) });
  const maxV = Math.max(1, ...history.map((h) => Math.abs(h.v || 0)));

  const totalIncome = sum(income, 'amount');
  const totalExpenses = sum(expenses, 'amount');
  const savings = totalIncome - totalExpenses;
  const rate = totalIncome > 0 ? (savings / totalIncome) * 100 : null;
  const prevExpenses = sum(prevExp, 'amount');
  const change = (a, b) => (a !== null && b !== null && b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null);
  const byCat = expCats.map((c) => ({ c, v: (expenses || []).filter((e) => e.category === c).reduce((a, e) => a + Number(e.amount), 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const isEmpty = !(income?.length || expenses?.length);
  const delta = (n, label) => (n === null ? <span className="muted">No earlier month to compare</span>
    : <span className={n >= 0 ? 'pos' : 'neg'}>{n >= 0 ? '▲' : '▼'} {pct(Math.abs(n))} {label}</span>);
  const cancel = (o) => <a className="btn ghost small" href={`/finance?m=${ym}${o ? `&open=${o}` : ''}`}>Cancel</a>;

  const expenseRow = (r) => (editExp?.id === r.id ? (
    <tr key={r.id} id={`exp-${r.id}`}><td colSpan={3} className="edit-cell">
      <form action={updateExpense} className="stack-sm">
        <input type="hidden" name="id" value={r.id} /><input type="hidden" name="month" value={month} />
        <div className="grid2">
          <label>Expense<input name="name" defaultValue={r.name || ''} /></label>
          <label>Category<input name="category" list="expense-categories" defaultValue={r.category || ''} placeholder="Pick or type a new one" /></label>
          <label>Amount (€)<input name="amount" inputMode="decimal" defaultValue={r.amount} required /></label>
          <label>Link (optional)<input name="link" type="url" defaultValue={r.link || ''} placeholder="https://" /></label>
        </div>
        <label>Note (optional)<textarea name="note" defaultValue={r.note || ''} style={{ minHeight: 60 }} /></label>
        <label className="check"><input type="checkbox" name="recurring" defaultChecked={r.recurring} /> Recurring monthly</label>
        <div style={{ display: 'flex', gap: 10 }}><button className="btn small" type="submit">Save</button>{cancel('expenses')}</div>
      </form>
    </td></tr>
  ) : (
    <tr key={r.id}>
      <td>{r.name}{r.recurring ? <span className="muted"> · monthly</span> : null}
        {r.link ? <> · <a href={r.link} target="_blank" rel="noopener noreferrer">link ↗</a></> : null}
        {r.note ? <div className="muted" style={{ fontSize: 12 }}>{r.note}</div> : null}</td>
      <td className="num">{eur(r.amount, Number(r.amount) % 1 ? 2 : 0)}</td>
      <td className="row-actions"><a className="linkbtn" href={`/finance?m=${ym}&edit=${r.id}#exp-${r.id}`}>Edit</a><Delete table="expenses" id={r.id} month={month} /></td>
    </tr>
  ));

  const incomeRow = (r) => (editInc?.id === r.id ? (
    <tr key={r.id} id={`inc-${r.id}`}><td colSpan={3} className="edit-cell">
      <form action={updateIncome} className="stack-sm">
        <input type="hidden" name="id" value={r.id} /><input type="hidden" name="month" value={month} />
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
      <td className="row-actions"><a className="linkbtn" href={`/finance?m=${ym}&iedit=${r.id}#inc-${r.id}`}>Edit</a><Delete table="income" id={r.id} month={month} /></td>
    </tr>
  ));

  return (
    <>
      <div className="section-title">
        <div>
          <p className="overline">Finance · EUR</p>
          <h1>{monthLabel(month)}</h1>
        </div>
        <div className="nav">
          <a className="pill" href={`/finance?m=${prev.slice(0, 7)}`}>← {monthLabel(prev).split(' ')[0]}</a>
          <a className="pill" href={`/finance?m=${shiftMonth(month, 1).slice(0, 7)}`}>{monthLabel(shiftMonth(month, 1)).split(' ')[0]} →</a>
        </div>
      </div>

      {isEmpty && (
        <div className="hint" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Monthly money update: add this month's income and expenses, or start from last month's recurring items.</span>
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
        {/* Net worth: current balance per asset; open an asset to see its history and edit */}
        <section className="card wide">
          <div className="card-head"><h2>Net worth</h2><strong style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{eur(nw)}</strong></div>
          {assetList.length === 0 && <p className="empty">No assets yet. Add your first value below.</p>}
          <div className="fold-list">
            {assetList.map(({ key, latest, entries }) => {
              const prevEntry = entries[1];
              const d = prevEntry ? Number(latest.value) - Number(prevEntry.value) : null;
              const good = latest.kind === 'liability' ? d < 0 : d > 0;
              const pc = prevEntry && Number(prevEntry.value) ? (d / Math.abs(Number(prevEntry.value))) * 100 : null;
              return (
                <details key={key} className="fold" open={!!editNw && entries.some((e) => e.id === editNw.id)}>
                  <summary>
                    <Chev />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{latest.label}</span>
                      <span className="muted" style={{ display: 'block', fontSize: 12 }}>{typeLabel(latest.type)} · as of {shortDate(latest.entered_on)}</span>
                    </span>
                    {d !== null && <span className={d === 0 ? 'muted' : good ? 'pos' : 'neg'} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{d > 0 ? '▲' : d < 0 ? '▼' : '='} {eur(Math.abs(d))}{pc !== null ? ` (${pct(Math.abs(pc))})` : ''}</span>}
                    <strong className={`fold-amount ${latest.kind === 'liability' ? 'neg' : ''}`}>{latest.kind === 'liability' ? '−' : ''}{eur(latest.value)}</strong>
                  </summary>
                  <div className="scroll"><table>
                    <thead><tr><th>Date</th><th className="num">Value</th><th className="num">Change</th><th></th></tr></thead>
                    <tbody>
                      {entries.map((r, i) => {
                        if (editNw?.id === r.id) {
                          return (
                            <tr key={r.id}><td colSpan={4} className="edit-cell">
                              <form action={updateNetWorth} className="grid2" style={{ alignItems: 'end' }}>
                                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="month" value={month} />
                                <label>Label<input name="label" defaultValue={r.label || ''} /></label>
                                <label>Date<input type="date" name="entered_on" defaultValue={r.entered_on} /></label>
                                <label>Value (€)<input name="value" inputMode="decimal" defaultValue={r.value} required /></label>
                                <div style={{ display: 'flex', gap: 10 }}><button className="btn small" type="submit">Save</button>{cancel()}</div>
                              </form>
                            </td></tr>
                          );
                        }
                        const p = entries[i + 1];
                        const dd = p ? Number(r.value) - Number(p.value) : null;
                        const ok = r.kind === 'liability' ? dd < 0 : dd > 0;
                        return (
                          <tr key={r.id}>
                            <td>{shortDate(r.entered_on)}</td>
                            <td className="num">{eur(r.value)}</td>
                            <td className={`num ${dd === null || dd === 0 ? 'muted' : ok ? 'pos' : 'neg'}`}>{dd === null ? 'first entry' : `${dd > 0 ? '+' : dd < 0 ? '−' : ''}${eur(Math.abs(dd))}`}</td>
                            <td className="row-actions"><a className="linkbtn" href={`/finance?m=${ym}&nwedit=${r.id}`}>Edit</a><Delete table="net_worth_items" id={r.id} month={month} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                </details>
              );
            })}
            <details className="fold add-fold" open={assetList.length === 0 || open === 'nw'}>
              <summary><span className="fold-plus" aria-hidden="true">+</span><span style={{ flex: 1, fontWeight: 600 }}>Add or update a value</span></summary>
              <form action={addNetWorth} className="grid2 fold-body" style={{ alignItems: 'end' }}>
                <input type="hidden" name="month" value={month} />
                <label>Type<select name="type">{NW_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label>Label<input name="label" placeholder="Gold physical (Gold Republic)" list="nw-labels" /></label>
                <label>Value (€)<input name="value" inputMode="decimal" required /></label>
                <label>Date<input type="date" name="entered_on" defaultValue={todayIso()} /></label>
                <button className="btn" type="submit">Save value</button>
                <p className="muted" style={{ margin: 0, fontSize: 12, alignSelf: 'center' }}>Use the same type and label as before (e.g. Gold) to add a new value to that asset's history.</p>
              </form>
              <datalist id="nw-labels">{[...new Set((nwAll || []).map((r) => r.label).filter(Boolean))].map((l) => <option key={l} value={l} />)}</datalist>
            </details>
          </div>
        </section>
        <section className="card narrow">
          <h2 style={{ marginBottom: 4 }}>Net worth over time</h2>
          <p className="muted" style={{ margin: '0 0 16px' }}>Balance at the end of each month</p>
          {history.length === 0 ? <p className="empty">Appears once you add a value.</p> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150 }}>
              {history.map((h) => (
                <div key={h.m} style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }} title={`${monthLabel(h.m)}: ${eur(h.v)}`}>
                  <div style={{ width: '100%', height: Math.max(4, Math.round((Math.abs(h.v || 0) / maxV) * 120)), borderRadius: 6, background: h.m === month ? 'var(--gold-grad)' : 'var(--surface-sunken)' }} />
                  <span className="muted" style={{ fontSize: 11 }}>{monthLabel(h.m).slice(0, 3)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="row">
        {/* Income: whole block folds; inside, grouped by where the money comes from */}
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
                <input type="hidden" name="month" value={month} />
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

        {/* Expenses: whole block folds; inside, folded per category */}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {byCat.map(({ c, v }) => (
                    <div key={c}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ textTransform: 'capitalize' }}>{c}</span><span className="muted">{eur(v)} · {pct((v / totalExpenses) * 100, 0)}</span></div>
                      <div className="track" style={{ marginTop: 4 }}><div className="bar" style={{ width: `${Math.round((v / byCat[0].v) * 100)}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
              {(expenses || []).length === 0 ? <p className="empty">No expenses for this month yet.</p> : (
                <Groups rows={expenses} groupOf={(r) => r.category || 'other'} openGroup={editExp ? editExp.category || 'other' : null} renderRow={expenseRow}
                  head={<tr><th>Expense</th><th className="num">Amount</th><th></th></tr>} />
              )}
              <datalist id="expense-categories">{expCats.map((c) => <option key={c} value={c} />)}</datalist>
              <form action={addExpense} className="stack-sm add-form">
                <input type="hidden" name="month" value={month} />
                <div className="grid2">
                  <label>Expense<input name="name" placeholder="Supplements" /></label>
                  <label>Category<input name="category" list="expense-categories" placeholder="Pick or type a new one" required /></label>
                  <label>Amount (€)<input name="amount" inputMode="decimal" required /></label>
                  <label>Link (optional)<input name="link" type="url" placeholder="https://" /></label>
                </div>
                <label>Note (optional)<input name="note" /></label>
                <label className="check"><input type="checkbox" name="recurring" /> Recurring monthly</label>
                <div><button className="btn small" type="submit">Add expense</button></div>
              </form>
            </div>
          </details>
        </section>
      </div>
    </>
  );
}
