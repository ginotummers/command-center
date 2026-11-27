import { createClient } from '@/lib/supabase';
import { eur, monthStart, shiftMonth, monthLabel, todayIso, lastDayOfMonth, addDays } from '@/lib/util';
import { SPEND_CATEGORIES, FIXED_COSTS, BUDGET_OF, KIND_LABEL, countries, flag, countryName } from '@/lib/statements';
import InfoButton from '../../components/InfoButton';
import Upload from './Upload';
import LabelSelect from './LabelSelect';
import { addStay, removeStay, removeUpload } from './actions';

export const metadata = { title: 'Statements · Finance' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // a full year of statements takes a while to label and save

const C = ['#B08429', '#4A8FE0', '#D0663A', '#8C6FD0']; // validated categorical palette (dark surface)
const NEUTRAL = '#5E6A85';
const sum = (rows, f) => rows.reduce((a, r) => a + f(r), 0);
const spendOf = (rows) => -sum(rows.filter((r) => r.kind === 'spend'), (r) => Number(r.eur));
const dShort = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dLong = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const days = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000) + 1;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const pretty = (rows) => { // most common original description for a shop, tidied
  const c = new Map(); rows.forEach((r) => c.set(r.description, (c.get(r.description) || 0) + 1));
  const d = [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  return d.replace(/\s{2,}/g, ' ').replace(/\b\d{4,}\b/g, '').trim().slice(0, 40);
};

async function fetchAll(q) { // page through Supabase's 1000-row limit
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error || !data?.length) break;
    out.push(...data); if (data.length < 1000) break;
  }
  return out;
}

export default async function Statements({ searchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayIso();
  const { data: latest } = await supabase.from('bank_txns').select('date').order('date', { ascending: false }).limit(1);
  const isD = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  // A custom period (from–to dates) or a single month
  const custom = isD(sp?.from) && isD(sp?.to) && sp.from <= sp.to;
  const pStart = custom ? sp.from : null; const pEndC = custom ? sp.to : null;
  const month = custom ? monthStart(pEndC.slice(0, 7)) : sp?.m ? monthStart(sp.m) : monthStart(latest?.[0]?.date?.slice(0, 7));
  const ym = month.slice(0, 7);
  const pFrom = custom ? pStart : month; const pTo = custom ? pEndC : lastDayOfMonth(month);
  const mEnd = pTo;
  const pDays = days(pFrom, pTo);
  const pMonths = custom ? pDays / 30.4375 : 1; // budgets are monthly: scale them to the period
  const pLabel = custom ? `${dLong(pFrom)} – ${dLong(pTo)}` : monthLabel(month);
  const pShort = custom ? `${dShort(pFrom)} – ${dShort(pTo)}` : monthLabel(month).split(' ')[0];
  const prevFrom = addDays(pFrom, -pDays); const prevTo = addDays(pFrom, -1);
  const from = [shiftMonth(month, -23), prevFrom].sort()[0];
  const quarters = sp?.q === '1'; const cpdAll = sp?.cpd === 'all'; const cpdFull = sp?.fixed === '1';
  const href = (extra) => { const p = { ...(custom ? { from: pFrom, to: pTo } : { m: ym }), ...(quarters ? { q: '1' } : {}), ...(cpdAll ? { cpd: 'all' } : {}), ...(cpdFull ? { fixed: '1' } : {}), ...extra }; return `/finance/statements?${Object.entries(p).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&')}`; };
  const monthHref = (m) => href({ m, from: null, to: null });
  const lastDate = latest?.[0]?.date || today;
  const presets = [
    ['Year to date', `${lastDate.slice(0, 4)}-01-01`, lastDate],
    ['Last 12 months', addDays(shiftMonth(monthStart(lastDate.slice(0, 7)), -11), 0), lastDate],
    ['Last 3 months', shiftMonth(monthStart(lastDate.slice(0, 7)), -2), lastDate],
  ];

  const [rows, { data: expenses }, { data: stays }, { data: uploads }, { data: labels }, reviewAll] = await Promise.all([
    fetchAll(() => supabase.from('bank_txns').select('id,date,description,merchant,amount,currency,eur,kind,category,needs_review,bank').gte('date', from).lte('date', mEnd).order('date')),
    supabase.from('expenses').select('category,amount').eq('month', month).eq('scope', 'personal'),
    supabase.from('stays').select('*').order('start_date'),
    supabase.from('statement_uploads').select('*').order('created_at', { ascending: false }).limit(12),
    supabase.from('spend_labels').select('name').order('name'),
    fetchAll(() => supabase.from('bank_txns').select('id,date,description,amount,currency,eur,kind,category').eq('needs_review', true).order('date', { ascending: false })),
  ]);
  const categories = [...SPEND_CATEGORIES, ...(labels || []).map((l) => l.name).filter((n) => !SPEND_CATEGORIES.includes(n))];
  const mRows = rows.filter((r) => r.date >= pFrom && r.date <= pTo);
  const has = mRows.length > 0;
  const prevMonths = [1, 2, 3].map((n) => shiftMonth(month, -n)).filter((m) => rows.some((r) => r.date.startsWith(m.slice(0, 7))));
  const inMonth = (m) => rows.filter((r) => r.date.startsWith(m.slice(0, 7)));

  // Totals
  const spent = spendOf(mRows);
  const income = sum(mRows.filter((r) => r.kind === 'income'), (r) => Number(r.eur));
  // Set aside = pots for bills (rent, yearly costs); saved & invested = real savings and investments
  const isPot = (r) => r.kind === 'set_aside' && r.category === 'Set aside';
  const setAside = -sum(mRows.filter(isPot), (r) => Number(r.eur));
  const saved = -sum(mRows.filter((r) => r.kind === 'set_aside' && !isPot(r)), (r) => Number(r.eur));
  const savedSplit = ['Savings', 'Investing'].map((c) => [c, -sum(mRows.filter((r) => r.kind === 'set_aside' && (r.category || 'Savings') === c), (r) => Number(r.eur))]).filter(([, v]) => Math.abs(v) >= 1);
  // What each tile is made of
  const clean = (d) => String(d || '').replace(/\s*\(rate:[^)]*\)/i, '').replace(/^gino jac maria tummers to /i, 'Into ').replace(/ to gino jac maria tummers$/i, ' (taken out)').replace(/\s{2,}/g, ' ').trim();
  const groupBy = (rs, key) => { const m = new Map(); rs.forEach((r) => { const k = key(r); const g = m.get(k) || { k, v: 0, n: 0 }; g.v += Number(r.eur); g.n += 1; m.set(k, g); }); return [...m.values()].sort((a, b) => Math.abs(b.v) - Math.abs(a.v)); };
  const tileParts = {
    spent: groupBy(mRows.filter((r) => r.kind === 'spend'), (r) => r.category || 'Other').map((g) => ({ ...g, v: -g.v })),
    setAside: groupBy(mRows.filter(isPot), (r) => clean(r.description)).map((g) => ({ ...g, v: -g.v })),
    saved: groupBy(mRows.filter((r) => r.kind === 'set_aside' && !isPot(r)), (r) => clean(r.description)).map((g) => ({ ...g, v: -g.v })),
    moved: groupBy(mRows.filter((r) => r.kind === 'transfer' && r.eur < 0), (r) => r.category === 'Pass-through' ? 'Pass-through (paid for someone else)' : clean(r.description)).map((g) => ({ ...g, v: -g.v })),
    income: mRows.filter((r) => r.kind === 'income').sort((a, b) => b.eur - a.eur).map((r) => ({ k: `${dShort(r.date)} · ${clean(r.description)}`, v: Number(r.eur), n: 1, tag: r.category })),
  };
  const moved = sum(mRows.filter((r) => r.kind === 'transfer' && r.eur < 0), (r) => -Number(r.eur));
  // Money between Gino and his own companies: not income, not spending
  const bizIn = sum(mRows.filter((r) => r.kind === 'business' && r.eur > 0), (r) => Number(r.eur));
  const bizOut = -sum(mRows.filter((r) => r.kind === 'business' && r.eur < 0), (r) => Number(r.eur));
  const yStart = `${month.slice(0, 4)}-01-01`;
  const bizRows = rows.filter((r) => r.kind === 'business');
  const bizTable = [...new Set(bizRows.map((r) => r.category || 'My business'))].sort().map((b) => {
    const of = (rs) => rs.filter((r) => (r.category || 'My business') === b);
    const m = of(mRows.filter((r) => r.kind === 'business')); const y = of(bizRows.filter((r) => r.date >= yStart && r.date <= mEnd));
    const io = (rs) => [sum(rs.filter((r) => r.eur < 0), (r) => -Number(r.eur)), sum(rs.filter((r) => r.eur > 0), (r) => Number(r.eur))];
    return { b, m: io(m), y: io(y) };
  });

  // Budget vs actual (budgets are the personal expenses entered on the Finance page)
  const budget = new Map(); (expenses || []).forEach((e) => { const k = String(e.category || 'other').toLowerCase(); budget.set(k, (budget.get(k) || 0) + Number(e.amount) * pMonths); });
  const actual = new Map(); const parts = new Map();
  mRows.filter((r) => r.kind === 'spend').forEach((r) => {
    const c = r.category || 'Other'; const k = budget.has(BUDGET_OF[c]) ? BUDGET_OF[c] : budget.has(c.toLowerCase()) ? c.toLowerCase() : c;
    actual.set(k, (actual.get(k) || 0) - Number(r.eur));
    if (!parts.has(k)) parts.set(k, new Map()); parts.get(k).set(c, (parts.get(k).get(c) || 0) - Number(r.eur));
  });
  const bva = [...new Set([...actual.keys(), ...budget.keys()])]
    .map((k) => ({ k, name: cap(k), a: Math.round(actual.get(k) || 0), b: budget.has(k) ? Math.round(budget.get(k)) : null, parts: [...(parts.get(k) || new Map()).entries()].filter(([c]) => c.toLowerCase() !== k) }))
    .filter((x) => x.a > 0.5 || (x.b && x.b > 0)).sort((x, y) => y.a - x.a);
  const budgetTotal = sum(bva.filter((x) => x.b), (x) => x.b);
  const bMax = Math.max(1, ...bva.map((x) => Math.max(x.a, x.b || 0)));

  // What changed vs the average of up to 3 previous months
  const catOf = (rs) => { const m = new Map(); rs.filter((r) => r.kind === 'spend').forEach((r) => m.set(r.category || 'Other', (m.get(r.category || 'Other') || 0) - Number(r.eur))); return m; };
  const prevRows = rows.filter((r) => r.date >= prevFrom && r.date <= prevTo);
  const curCat = catOf(mRows); const prevCats = custom ? (prevRows.length ? [catOf(prevRows)] : []) : prevMonths.map((m) => catOf(inMonth(m)));
  const avgCat = (c) => (prevCats.length ? prevCats.reduce((a, m) => a + (m.get(c) || 0), 0) / prevCats.length : null);
  const changes = prevCats.length ? [...new Set([...curCat.keys(), ...prevCats.flatMap((m) => [...m.keys()])])]
    .map((c) => ({ c, now: curCat.get(c) || 0, avg: avgCat(c) })).map((x) => ({ ...x, d: x.now - x.avg }))
    .filter((x) => Math.abs(x.d) >= 50 && Math.abs(x.d) >= 0.2 * Math.max(x.avg, 1)).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 4) : [];
  const oneOffs = mRows.filter((r) => r.kind === 'spend' && -r.eur >= 150).sort((a, b) => a.eur - b.eur).slice(0, 3);
  const seenBefore = new Set(rows.filter((r) => r.date < pFrom).map((r) => r.merchant));
  const newShops = [...new Map(mRows.filter((r) => r.kind === 'spend' && !seenBefore.has(r.merchant)).map((r) => [r.merchant, r])).keys()]
    .map((m) => ({ m, rs: mRows.filter((r) => r.merchant === m && r.kind === 'spend') })).map((x) => ({ ...x, total: spendOf(x.rs) }))
    .filter((x) => x.total >= 30 && !oneOffs.some((r) => r.merchant === x.m)).sort((a, b) => b.total - a.total).slice(0, 3);

  // Cost per day by country (travel bookings left out; they are paid before the trip)
  const stayList = stays || [];
  const cpdRange = cpdAll ? [shiftMonth(month, -23), pTo] : [pFrom, pTo];
  const perCountry = new Map(); let covered = 0;
  stayList.forEach((s) => {
    const a = s.start_date > cpdRange[0] ? s.start_date : cpdRange[0]; const b = s.end_date < cpdRange[1] ? s.end_date : cpdRange[1];
    if (a > b) return;
    const sp2 = spendOf(rows.filter((r) => r.date >= a && r.date <= b && r.category !== 'Travel' && (cpdFull || !FIXED_COSTS.includes(r.category))));
    const n = days(a, b); covered += n;
    const cur = perCountry.get(s.country) || { days: 0, spend: 0 }; perCountry.set(s.country, { days: cur.days + n, spend: cur.spend + sp2 });
  });
  const cpd = [...perCountry.entries()].map(([code, v]) => ({ code, ...v, perDay: v.days ? v.spend / v.days : 0 })).sort((a, b) => b.days - a.days);
  const cpdMax = Math.max(1, ...cpd.map((x) => x.perDay));
  const monthDays = pDays;
  const travelThisMonth = spendOf(mRows.filter((r) => r.category === 'Travel'));

  // Month by month / quarters
  const series = quarters
    ? Array.from({ length: 8 }, (_, i) => { const qEnd = shiftMonth(month, -3 * (7 - i)); const ms = [0, 1, 2].map((k) => shiftMonth(qEnd, -k)); const qn = Math.floor((Number(qEnd.slice(5, 7)) - 1) / 3) + 1; return { label: `Q${qn} ’${qEnd.slice(2, 4)}`, v: ms.some((m) => inMonth(m).length) ? ms.reduce((a, m) => a + spendOf(inMonth(m)), 0) : null, last: null }; })
    : Array.from({ length: 12 }, (_, i) => { const m = shiftMonth(month, i - 11); const ly = shiftMonth(m, -12); return { label: monthLabel(m).slice(0, 3), m, v: inMonth(m).length ? spendOf(inMonth(m)) : null, last: inMonth(ly).length ? spendOf(inMonth(ly)) : null }; });
  const withData = series.filter((s) => s.v !== null);
  const avg = withData.length ? withData.reduce((a, s) => a + s.v, 0) / withData.length : 0;
  const sMax = Math.max(1, ...series.map((s) => Math.max(s.v || 0, s.last || 0)), avg);

  // Top shops
  const shopMap = new Map(); mRows.filter((r) => r.kind === 'spend').forEach((r) => { if (!shopMap.has(r.merchant)) shopMap.set(r.merchant, []); shopMap.get(r.merchant).push(r); });
  const shops = [...shopMap.entries()].map(([m, rs]) => ({ m, name: pretty(rs), total: spendOf(rs), n: rs.length, cat: rs[0].category })).filter((s) => s.total > 0).sort((a, b) => b.total - a.total).slice(0, 8);

  // Money flow (Sankey): sources on the left, uses on the right
  const left = [];
  (() => { const m = new Map(); mRows.filter((r) => r.kind === 'income').forEach((r) => m.set(r.category || 'Income', (m.get(r.category || 'Income') || 0) + Number(r.eur))); [...m.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => v > 0 && left.push({ name: k === 'Other income' ? 'Other income' : k, v })); })();
  if (bizIn > 0) left.push({ name: 'From my businesses', v: bizIn });
  const inflow = income + bizIn;
  const outflow = Math.max(0, spent) + Math.max(0, setAside) + Math.max(0, saved) + bizOut;
  if (outflow > inflow + 1) left.push({ name: 'From your balance', v: outflow - inflow, muted: true });
  const right = [{ name: 'Spent', v: Math.max(0, spent), color: C[0] }, { name: 'Set aside', v: Math.max(0, setAside), color: C[2] }, { name: 'Saved & invested', v: Math.max(0, saved), color: C[1] }].filter((n) => n.v > 0.5);
  if (bizOut > 0) right.push({ name: 'To my businesses', v: bizOut, color: C[3] });
  if (inflow > outflow + 1) right.push({ name: 'Left over', v: inflow - outflow, color: NEUTRAL });

  const review = reviewAll || [];
  const reviewMonth = review.filter((r) => r.date >= pFrom && r.date <= pTo);
  const reviewOther = review.length - reviewMonth.length;
  const monthStays = stayList.filter((s) => s.end_date >= pFrom && s.start_date <= pTo);
  const countryList = countries();
  const steps = [uploads?.length > 0 && has, monthStays.length > 0, has && reviewMonth.length === 0];

  return (
    <>
      <div className="section-title" style={{ alignItems: 'flex-end' }}>
        <div>
          <p className="overline">Finance · Personal · from your bank statements</p>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>Statements · {pLabel}
            <InfoButton title="How Statements works">
              <p>Your Finance overview shows what you <em>plan</em>. Statements shows what <em>actually happened</em>, from the bank exports you upload once a month.</p>
              <h3>Once a month (about 10 minutes)</h3>
              <ol>
                <li>Download last month's statement from Revolut and Wio (PDF or CSV) and upload both. Uploading a period twice is fine: duplicates are skipped.</li>
                <li>Log where you were: from–to dates and a country.</li>
                <li>Check the few transactions the dashboard wasn't sure about. Change any label at any time; the dashboard remembers your choice for that shop.</li>
              </ol>
              <h3>How money is counted</h3>
              <ul>
                <li><strong>Spent</strong>: card payments, bills, transfers to other people. Refunds reduce it.</li>
                <li><strong>Set aside for bills</strong>: money into pots for rent and yearly costs (Wio spaces, the EUR Rent vault). Not saving: it's already spoken for.</li>
                <li><strong>Saved &amp; invested</strong>: money into real savings (General Savings) and investments, minus anything you took back out.</li>
                <li>Tap any tile to see what it's made of.</li>
                <li><strong>Moved between my accounts</strong>: Wio ↔ Revolut transfers, top-ups and currency exchanges. Never counted as spending.</li>
                <li><strong>My businesses</strong>: money to or from T Ventures, Promenado FZCO and Promenado LLC. Neither spending nor income; shown in its own section.</li>
                <li>All amounts are converted to EUR at the ECB rate of that month.</li>
                <li><strong>Cost per day</strong> uses your stays log. By default it shows day-to-day spending only (no rent, bills, subscriptions, business costs or transfers to people); switch to Everything to include them. Travel bookings are always left out, since you pay them before the trip.</li>
              </ul>
              <p className="muted" style={{ fontSize: 13 }}>Labels come from your own choices first, then a built-in list of shops and the bank's own category. No AI is used, so uploading costs nothing.</p>
            </InfoButton>
          </h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <div className="seg" role="tablist" aria-label="Finance view">
            <a role="tab" aria-selected="false" href={`/finance?m=${ym}`}>Overview</a>
            <a role="tab" aria-selected="true" className="on" href={`/finance/statements?m=${ym}`}>Statements</a>
          </div>
          <div className="nav">
            {custom ? <a className="pill" href={monthHref(ym)}>Back to {monthLabel(month)}</a> : <>
              <a className="pill" href={monthHref(shiftMonth(month, -1).slice(0, 7))}>← {monthLabel(shiftMonth(month, -1)).split(' ')[0]}</a>
              <a className="pill" href={monthHref(shiftMonth(month, 1).slice(0, 7))}>{monthLabel(shiftMonth(month, 1)).split(' ')[0]} →</a></>}
          </div>
          <details className="st-range">
            <summary className="pill">{custom ? 'Change dates' : 'Pick dates'}</summary>
            <div className="st-range-pop">
              <form action="/finance/statements" method="get" className="st-range-form">
                {quarters && <input type="hidden" name="q" value="1" />}{cpdFull && <input type="hidden" name="fixed" value="1" />}
                <label>From<input type="date" name="from" required defaultValue={pFrom} /></label>
                <label>To<input type="date" name="to" required defaultValue={pTo} /></label>
                <button className="btn small" type="submit">Show</button>
              </form>
              <div className="st-range-presets">{presets.map(([l, a, b]) => <a key={l} className="chip" href={href({ from: a, to: b, m: null })}>{l}</a>)}</div>
            </div>
          </details>
        </div>
      </div>

      {/* Monthly check */}
      <section className="card">
        <div className="card-head"><h2>{custom ? 'Check for this period' : "This month's check"}</h2><span className="muted" style={{ fontSize: 13 }}>{steps.filter(Boolean).length} of 3 done</span></div>
        <div className="st-check">
          <div className="st-step">
            <h3>{steps[0] ? '✓ ' : ''}1 · Upload statements</h3>
            {(uploads || []).slice(0, 3).map((u) => <p key={u.id} className="muted" style={{ margin: '0 0 4px', fontSize: 13 }}><strong style={{ color: 'var(--ink)', textTransform: 'capitalize' }}>{u.bank}</strong> · {u.first_date ? `${dShort(u.first_date)} – ${dLong(u.last_date)}` : ''} · {u.rows_new} new</p>)}
            <details className="fold" open={!(uploads || []).length} style={{ marginTop: 8 }}>
              <summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>Upload statements</span></summary>
              <div className="fold-body">
                <Upload />
                {(uploads || []).length > 0 && (
                  <details style={{ marginTop: 12 }}><summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>Upload history</summary>
                    <div className="list" style={{ marginTop: 8 }}>{uploads.map((u) => (
                      <form key={u.id} action={removeUpload} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                        <input type="hidden" name="id" value={u.id} /><input type="hidden" name="m" value={ym} />
                        <span style={{ flex: 1 }}><span style={{ textTransform: 'capitalize' }}>{u.bank}</span> · {u.filename} · {u.rows_new} new of {u.rows_total} · {dLong(u.created_at.slice(0, 10))}</span>
                        <button className="linkbtn" type="submit">Remove</button>
                      </form>))}</div>
                    <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Removing an upload also removes the transactions it added.</p>
                  </details>
                )}
              </div>
            </details>
          </div>
          <div className="st-step">
            <h3>{steps[1] ? '✓ ' : ''}2 · Where were you?</h3>
            {monthStays.length > 3 ? (
              <details className="fold"><summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>{monthStays.length} stays · {[...new Set(monthStays.map((s) => flag(s.country)))].join(' ')}</span></summary>
                <div className="fold-body">{monthStays.map((s) => (
                  <form key={s.id} action={removeStay} className="st-chip">
                    <input type="hidden" name="id" value={s.id} /><input type="hidden" name="m" value={ym} />
                    <span>{flag(s.country)} {dLong(s.start_date)} – {dLong(s.end_date)} · {countryName(s.country)}</span>
                    <button className="linkbtn" type="submit" aria-label="Remove stay">×</button>
                  </form>))}</div></details>
            ) : monthStays.length ? monthStays.map((s) => (
              <form key={s.id} action={removeStay} className="st-chip">
                <input type="hidden" name="id" value={s.id} /><input type="hidden" name="m" value={ym} />
                <span>{flag(s.country)} {dShort(s.start_date)} – {dShort(s.end_date)} · {countryName(s.country)}</span>
                <button className="linkbtn" type="submit" aria-label="Remove stay">×</button>
              </form>
            )) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Not logged yet for {pLabel}.</p>}
            <details className="fold" open={!monthStays.length} style={{ marginTop: 8 }}>
              <summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>Add a stay</span></summary>
              <form action={addStay} className="fold-body st-stay-form">
                <input type="hidden" name="m" value={ym} />
                <label>From<input type="date" name="start_date" required defaultValue={pFrom} /></label>
                <label>To<input type="date" name="end_date" required defaultValue={mEnd} /></label>
                <label style={{ gridColumn: '1 / -1' }}>Country<select name="country" defaultValue="AE">{countryList.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
                <button className="btn small" type="submit">Add stay</button>
              </form>
            </details>
          </div>
          <div className="st-step">
            <h3>{steps[2] ? '✓ ' : ''}3 · Check labels</h3>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>{reviewMonth.length ? <strong className="neg">{reviewMonth.length} to review</strong> : has ? 'All labelled.' : 'Nothing uploaded yet.'}</p>
            {reviewOther > 0 && <p style={{ fontSize: 13, margin: '4px 0 0' }}><strong className="neg">{reviewOther} to review in other months.</strong>{' '}{(() => { const m = review.find((r) => !(r.date >= pFrom && r.date <= pTo)); return m ? <a href={monthHref(m.date.slice(0, 7))}>Go to {monthLabel(`${m.date.slice(0, 7)}-01`)}</a> : null; })()}</p>}
            {reviewMonth.length > 0 && (
            <details className="fold" style={{ marginTop: 8 }}>
              <summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>Review labels</span></summary>
              <div className="fold-body">
              <div className="list">{reviewMonth.slice(0, 12).map((r) => (
                <div key={r.id} className="st-rev">
                  <span><strong>{r.description}</strong><br /><span className="muted" style={{ fontSize: 12 }}>{dShort(r.date)} · {r.currency} {Math.abs(r.amount).toLocaleString('en-GB')}{r.currency !== 'EUR' ? ` · ${eur(Math.abs(r.eur))}` : ''}{r.amount > 0 ? ' in' : ''}</span></span>
                  <LabelSelect id={r.id} kind={r.kind} category={r.category} categories={categories} review />
                </div>))}
                {reviewMonth.length > 12 && <p className="muted" style={{ fontSize: 12, margin: 0 }}>{reviewMonth.length - 12} more in “All transactions” below.</p>}
              </div>
              </div>
            </details>)}
          </div>
        </div>
      </section>

      {!has ? (
        <section className="card"><p className="empty">No transactions for {pLabel} yet. Upload your Revolut and Wio CSV exports above; a whole year at once is fine.</p></section>
      ) : (<>
        <div className="st-tiles">
          <Tile label="Really spent" value={spent} parts={tileParts.spent} note={<span className={budgetTotal ? (spent > budgetTotal ? 'neg' : 'pos') : 'muted'}>{budgetTotal ? `${spent > budgetTotal ? '+' : '−'}${eur(Math.abs(spent - budgetTotal))} vs budget ${eur(budgetTotal)}` : 'No budget entered'}</span>} />
          <Tile label="Set aside for bills" value={setAside} parts={tileParts.setAside} note={<span className="muted">Rent, yearly costs and other pots; not saving</span>} />
          <Tile label="Saved & invested" value={saved} parts={tileParts.saved} note={<span className="muted">{savedSplit.length ? savedSplit.map(([c, v]) => `${c === 'Investing' ? 'invested' : 'saved'} ${eur(v)}`).join(' · ') : 'Nothing saved or invested'}</span>} />
          <Tile label="Moved between my accounts" value={moved} parts={tileParts.moved} note={<span className="muted">Transfers, top-ups and exchanges; not spending</span>} />
          <Tile label="Income" value={income} parts={tileParts.income} note={<span className="muted">{income ? `${Math.round(((income - spent) / income) * 100)}% not spent` : 'No income in these statements'}</span>} />
        </div>

        {bizTable.length > 0 && (
          <section className="card">
            <details className="fold" open={bizIn + bizOut > 0}>
              <summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>Between me and my businesses</span>
                <span className="muted" style={{ fontSize: 13 }}>{bizIn + bizOut > 0 ? `${pShort}: ${bizOut ? `${eur(bizOut)} to` : ''}${bizOut && bizIn ? ' · ' : ''}${bizIn ? `${eur(bizIn)} from` : ''}` : `nothing in ${pShort}`}</span></summary>
              <div className="fold-body">
                <div className="scroll"><table>
                  <thead><tr><th>Business</th><th className="num">To it · {pShort}</th><th className="num">From it · {pShort}</th><th className="num">To it · {month.slice(0, 4)}</th><th className="num">From it · {month.slice(0, 4)}</th><th className="num">Net {month.slice(0, 4)}</th></tr></thead>
                  <tbody>{bizTable.map((x) => { const net = x.y[1] - x.y[0]; return (
                    <tr key={x.b}><td><strong>{x.b}</strong></td><td className="num">{x.m[0] ? eur(x.m[0]) : '—'}</td><td className="num">{x.m[1] ? eur(x.m[1]) : '—'}</td><td className="num">{x.y[0] ? eur(x.y[0]) : '—'}</td><td className="num">{x.y[1] ? eur(x.y[1]) : '—'}</td>
                      <td className={`num ${net >= 0 ? 'pos' : 'neg'}`}>{net >= 0 ? '+' : '−'}{eur(Math.abs(net))}</td></tr>); })}</tbody>
                </table></div>
                <div className="list" style={{ marginTop: 10 }}>{bizTable.map((x) => {
                  const rs = bizRows.filter((r) => (r.category || 'My business') === x.b && r.date >= yStart && r.date <= mEnd).sort((a, b) => b.date.localeCompare(a.date));
                  return (
                    <details key={x.b} className="fold">
                      <summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>{x.b} · how it adds up</span><span className="muted" style={{ fontSize: 13 }}>{rs.length} in {month.slice(0, 4)}</span></summary>
                      <div className="scroll"><table><tbody>{rs.map((r) => (
                        <tr key={r.id} style={r.date >= pFrom && r.date <= pTo ? null : { opacity: 0.6 }}>
                          <td className="muted" style={{ whiteSpace: 'nowrap' }}>{dShort(r.date)}</td>
                          <td>{clean(r.description)}<div className="muted" style={{ fontSize: 12, textTransform: 'capitalize' }}>{r.bank}</div></td>
                          <td className="num" style={{ whiteSpace: 'nowrap' }}>{r.eur < 0 ? 'to it ' : 'from it '}<strong>{eur(Math.abs(r.eur))}</strong></td>
                        </tr>))}</tbody></table></div>
                    </details>);
                })}</div>
                {custom ? null : <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Faded rows are outside {pShort}.</p>}
                <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Money to your companies (T Ventures, Promenado FZCO, Promenado LLC) is not counted as spending, and money from them is not counted as income or salary: it stays within your own world. Net = what came back to you minus what you put in.</p>
              </div>
            </details>
          </section>
        )}

        <div className="chart-grid">
          <section className="card">
            <div className="card-head"><h2>Where the money went</h2><span className="muted" style={{ fontSize: 13 }}>{pShort}</span></div>
            <Sankey left={left} right={right} />
            <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Hover a band for the amount. Transfers between your own accounts are left out, so nothing is counted twice.</p>
          </section>
          <section className="card">
            <div className="card-head"><h2>Budget vs actual</h2><span className="muted" style={{ fontSize: 13 }}>white line = budget</span></div>
            <div className="st-bva">
              {bva.map((x) => {
                const over = x.b !== null && x.a > x.b * 1.05;
                return (
                  <details key={x.k} className="st-bva-row">
                    <summary>
                      <span className="st-bva-name">{x.name}</span>
                      <span className="st-track" role="img" aria-label={`${x.name}: ${eur(x.a)}${x.b !== null ? ` of ${eur(x.b)} budget` : ''}`}>
                        <span className="st-fill" style={{ width: `${(x.a / bMax) * 100}%`, background: over ? C[2] : C[0] }} />
                        {x.b !== null && <span className="st-budget" style={{ left: `${(x.b / bMax) * 100}%` }} />}
                      </span>
                      <span className="st-bva-val"><strong>{eur(x.a)}</strong>{' '}<span className={x.b === null ? 'muted' : x.a > x.b ? 'neg' : 'pos'}>{x.b === null ? 'no budget' : `${x.a > x.b ? '+' : '−'}${eur(Math.abs(x.a - x.b))}`}</span></span>
                    </summary>
                    {x.parts.length > 0 && <p className="muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>{x.parts.sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c} ${eur(v)}`).join(' · ')}</p>}
                  </details>
                );
              })}
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>{custom ? `Budgets are your monthly personal expenses (${monthLabel(month)}) × ${pMonths.toFixed(1)} months.` : `Budgets are your personal expenses for ${monthLabel(month)} on the Finance overview.`} Tap a row to see which labels it includes.</p>
          </section>
        </div>

        <div className="chart-grid">
          <section className="card">
            <div className="card-head"><h2>What changed</h2><span className="muted" style={{ fontSize: 13 }}>{custom ? (prevCats.length ? `vs the ${pDays} days before` : 'needs an earlier period to compare') : prevMonths.length ? `vs your ${prevMonths.length}-month average` : 'needs an earlier month to compare'}</span></div>
            <div className="list">
              {changes.map((x) => <div key={x.c} className="st-line"><span className={x.d > 0 ? 'neg' : 'pos'} aria-hidden="true">{x.d > 0 ? '▲' : '▼'}</span><span>{x.c} <strong>{eur(x.now)}</strong>, {x.d > 0 ? 'up' : 'down'} {eur(Math.abs(x.d))} (usually about {eur(x.avg)})</span></div>)}
              {oneOffs.map((r) => <div key={r.id} className="st-line"><span className="muted" aria-hidden="true">•</span><span>Big purchase: <strong>{r.description}</strong> {eur(-r.eur)} <span className="muted">({r.category}, {dShort(r.date)})</span></span></div>)}
              {newShops.map((x) => <div key={x.m} className="st-line"><span className="muted" aria-hidden="true">•</span><span>New: <strong>{pretty(x.rs)}</strong> {eur(x.total)}{x.rs.length > 1 ? ` (${x.rs.length}×)` : ''}</span></div>)}
              {!changes.length && !oneOffs.length && !newShops.length && <p className="muted" style={{ margin: 0 }}>Nothing unusual in this period.</p>}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Cost per day by country</h2>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div className="seg small"><a className={!cpdFull ? 'on' : ''} href={href({ fixed: null })}>Day-to-day</a><a className={cpdFull ? 'on' : ''} href={href({ fixed: '1' })}>Everything</a></div>
                <div className="seg small"><a className={!cpdAll ? 'on' : ''} href={href({ cpd: null })}>{custom ? 'This period' : 'This month'}</a><a className={cpdAll ? 'on' : ''} href={href({ cpd: 'all' })}>All time</a></div></div></div>
            {cpd.length ? cpd.map((x, i) => (
              <div key={x.code} className="st-cpd">
                <span>{flag(x.code)} {countryName(x.code)}</span>
                <span className="st-track"><span className="st-fill" style={{ width: `${(x.perDay / cpdMax) * 100}%`, background: C[i % 4] }} /></span>
                <span><strong>{eur(x.perDay)}</strong>/day <span className="muted">· {x.days} d</span></span>
              </div>
            )) : <p className="muted" style={{ margin: 0 }}>Log where you were (step 2) to see this.</p>}
            <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
              {!cpdAll && covered < monthDays && cpd.length ? `${monthDays - covered} day${monthDays - covered === 1 ? '' : 's'} of ${pShort} not logged. ` : ''}
              {cpdFull ? 'Everything you spent' : 'Day-to-day spending only: rent, bills, subscriptions, business costs and transfers to people are left out, since you pay those wherever you are'}. Travel bookings are always left out{!cpdAll && travelThisMonth > 0 ? ` (${eur(travelThisMonth)} in this period)` : ''}.{cpdAll ? ' All time covers the last 24 months.' : ''}
            </p>
          </section>
        </div>

        <div className="chart-grid">
          <section className="card">
            <div className="card-head"><h2>Spending {quarters ? 'by quarter' : 'month by month'}</h2>
              <div className="seg small"><a className={!quarters ? 'on' : ''} href={href({ q: null })}>Months</a><a className={quarters ? 'on' : ''} href={href({ q: '1' })}>Quarters</a></div></div>
            <Bars series={series} avg={avg} max={sMax} />
            <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Dashed line = your average ({eur(avg)}).{!quarters ? ' Faint bars show the same month last year once you have it.' : ''} Hover a bar for the amount.</p>
          </section>
          <section className="card">
            <div className="card-head"><h2>Top shops</h2><span className="muted" style={{ fontSize: 13 }}>{pShort}</span></div>
            <div className="list">{shops.map((s) => (
              <div key={s.m} className="st-line" style={{ justifyContent: 'space-between' }}>
                <span>{s.name} <span className="tag">{s.cat}</span>{s.n > 1 ? <span className="muted" style={{ fontSize: 12 }}> · {s.n}×</span> : null}</span><strong>{eur(s.total)}</strong>
              </div>))}</div>
          </section>
        </div>

        <section className="card">
          <details className="fold">
            <summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>All transactions · {pShort}</span><span className="muted" style={{ fontSize: 13 }}>{mRows.length} · change any label here</span></summary>
            <div className="fold-body fold-list">
              {Object.entries(KIND_LABEL).map(([kind, kl]) => {
                const list = mRows.filter((r) => r.kind === kind);
                if (!list.length) return null;
                const groups = kind === 'spend' ? [...new Set(list.map((r) => r.category || 'Other'))].map((c) => ({ c, rs: list.filter((r) => (r.category || 'Other') === c) })).sort((a, b) => spendOf(b.rs) - spendOf(a.rs)) : [{ c: kl, rs: list }];
                return groups.map(({ c, rs }) => (
                  <details key={kind + c} className="fold">
                    <summary><span className="fold-chev" aria-hidden="true">▸</span><span style={{ flex: 1, fontWeight: 600 }}>{kind === 'spend' ? c : kl}</span><span className="muted" style={{ fontSize: 13 }}>{rs.length}</span><strong className="fold-amount">{eur(Math.abs(sum(rs, (r) => Number(r.eur))))}</strong></summary>
                    <div className="scroll"><table><tbody>{[...rs].sort((a, b) => b.date.localeCompare(a.date)).map((r) => (
                      <tr key={r.id}>
                        <td className="muted" style={{ whiteSpace: 'nowrap' }}>{dShort(r.date)}</td>
                        <td>{r.description}{r.needs_review ? <span className="tag" style={{ marginLeft: 6 }}>check</span> : null}<div className="muted" style={{ fontSize: 12, textTransform: 'capitalize' }}>{r.bank}</div></td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>{r.amount > 0 ? '+' : ''}{r.currency} {r.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}{r.currency !== 'EUR' ? <div className="muted" style={{ fontSize: 12 }}>{eur(Number(r.eur))}</div> : null}</td>
                        <td><LabelSelect id={r.id} kind={r.kind} category={r.category} categories={categories} review={r.needs_review} /></td>
                      </tr>))}</tbody></table></div>
                  </details>
                ));
              })}
            </div>
          </details>
        </section>
      </>)}
    </>
  );
}

// A summary tile you can open to see what it is made of
function Tile({ label, value, note, parts }) {
  return (
    <details className="st-tile st-tile-d">
      <summary><span className="muted">{label}</span><strong className="stat">{eur(value)}</strong>{note}<span className="st-tile-more" aria-hidden="true">{parts.length ? 'Show what’s in it ▾' : ''}</span></summary>
      {parts.length > 0 && <div className="st-tile-parts">{parts.slice(0, 25).map((p) => (
        <div key={p.k} className="st-tile-part"><span>{p.k}{p.n > 1 ? <span className="muted"> · {p.n}×</span> : null}{p.tag ? <span className="muted"> · {p.tag}</span> : null}</span><strong className={p.v < 0 ? 'pos' : ''}>{p.v < 0 ? '−' : ''}{eur(Math.abs(p.v))}</strong></div>))}
        {parts.length > 25 && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>+{parts.length - 25} smaller items</p>}
      </div>}
    </details>
  );
}

// Two-column flow diagram. Left nodes stack on the left, right nodes on the right; bands are allocated in order.
function Sankey({ left, right }) {
  const total = Math.max(1, ...[left, right].map((n) => n.reduce((a, x) => a + x.v, 0)));
  if (!left.length || !right.length) return <p className="muted">Not enough data for this month.</p>;
  const W = 590; const H = 260; const gap = 10; const x0 = 150; const x1 = 420; const nw = 12;
  const scale = (H - gap * (Math.max(left.length, right.length) - 1)) / total;
  const place = (nodes) => { let y = 0; return nodes.map((n) => { const h = Math.max(3, n.v * scale); const o = { ...n, y, h, used: 0 }; y += h + gap; return o; }); };
  const L = place(left); const R = place(right);
  const bands = []; let li = 0;
  for (const r of R) {
    let need = r.v;
    while (need > 0.5 && li < L.length) {
      const l = L[li]; const take = Math.min(need, l.v - l.used);
      if (take > 0.5) bands.push({ l, r, v: take, ly: l.y + l.used * scale, ry: r.y + r.used * scale, h: take * scale });
      l.used += take; r.used += take; need -= take;
      if (l.v - l.used <= 0.5) li++;
    }
  }
  // Label positions: centred on each node, pushed apart so small nodes never overlap or fall off the bottom
  const spread = (nodes) => { const out = []; nodes.forEach((n, i) => { out.push(Math.max(n.y + n.h / 2, i ? out[i - 1] + 34 : 14)); }); return out; };
  const ly = spread(L); const ry = spread(R);
  const VH = Math.max(H + 4, ...ly.map((y) => y + 22), ...ry.map((y) => y + 22));
  return (
    <svg viewBox={`0 0 ${W} ${VH}`} width="100%" role="img" aria-label={`Money in: ${left.map((n) => `${n.name} ${eur(n.v)}`).join(', ')}. Money out: ${right.map((n) => `${n.name} ${eur(n.v)}`).join(', ')}.`}>
      {bands.map((b, i) => (
        <path key={i} d={`M${x0 + nw} ${b.ly} C${(x0 + x1) / 2} ${b.ly} ${(x0 + x1) / 2} ${b.ry} ${x1} ${b.ry} L${x1} ${b.ry + b.h} C${(x0 + x1) / 2} ${b.ry + b.h} ${(x0 + x1) / 2} ${b.ly + b.h} ${x0 + nw} ${b.ly + b.h}Z`} fill={b.r.color} opacity={b.l.muted ? 0.25 : 0.42}>
          <title>{`${b.l.name} → ${b.r.name}: ${eur(b.v)}`}</title>
        </path>
      ))}
      {L.map((n, i) => <g key={n.name}><rect x={x0} y={n.y} width={nw} height={n.h} rx="3" fill={n.muted ? NEUTRAL : '#8FC1A4'}><title>{`${n.name}: ${eur(n.v)}`}</title></rect>
        <text x={x0 - 8} y={ly[i] - 2} textAnchor="end" fontSize="13" fill="var(--ink)">{n.name}</text><text x={x0 - 8} y={ly[i] + 14} textAnchor="end" fontSize="12" fill="var(--ink-muted)">{eur(n.v)}</text></g>)}
      {R.map((n, i) => <g key={n.name}><rect x={x1} y={n.y} width={nw} height={n.h} rx="3" fill={n.color}><title>{`${n.name}: ${eur(n.v)}`}</title></rect>
        <text x={x1 + nw + 8} y={ry[i] - 2} fontSize="13" fill="var(--ink)">{n.name}</text><text x={x1 + nw + 8} y={ry[i] + 14} fontSize="12" fill="var(--ink-muted)">{eur(n.v)}</text></g>)}
    </svg>
  );
}

function Bars({ series, avg, max }) {
  const W = 560; const H = 180; const n = series.length; const slot = (W - 20) / n; const bw = Math.min(34, slot * 0.62);
  const y = (v) => 10 + H - (v / max) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H + 34}`} width="100%" role="img" aria-label={series.map((s) => `${s.label} ${s.v === null ? 'no data' : eur(s.v)}`).join(', ')}>
      {series.map((s, i) => {
        const x = 10 + i * slot + (slot - bw) / 2; const last = i === n - 1;
        return (
          <g key={s.label + i}>
            {s.last !== null && s.last !== undefined && <rect x={x - 5} y={y(s.last)} width={bw} height={Math.max(2, (s.last / max) * H)} rx="4" fill="var(--ink-muted)" opacity="0.18"><title>{`${s.label} last year: ${eur(s.last)}`}</title></rect>}
            {s.v === null ? <rect x={x} y={y(0) - 4} width={bw} height="4" rx="2" fill="var(--line)" />
              : <rect x={x} y={y(s.v)} width={bw} height={Math.max(2, (s.v / max) * H)} rx="4" fill={last ? C[0] : '#3A4A75'}><title>{`${s.label}: ${eur(s.v)}`}</title></rect>}
            <text x={x + bw / 2} y={H + 28} fontSize="11" textAnchor="middle" fill="var(--ink-muted)">{s.label}</text>
          </g>
        );
      })}
      {avg > 0 && <line x1="6" x2={W - 6} y1={y(avg)} y2={y(avg)} stroke="var(--ink)" strokeDasharray="4 4" opacity="0.5" />}
    </svg>
  );
}
