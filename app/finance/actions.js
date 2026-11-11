'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase';
import { num, str, todayIso } from '@/lib/util';
import { CURRENCIES, getFx, toEur } from '@/lib/finance';

const TABLES = ['income', 'expenses', 'balances', 'money_items'];
const scopeOf = (fd) => (fd.get('scope') === 'business' ? 'business' : 'personal');
const curOf = (v) => (CURRENCIES.includes(String(v)) ? String(v) : 'EUR');
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

function back(fd, open) {
  const m = String(fd.get('month') || '');
  const scope = scopeOf(fd);
  return `/finance?m=${m.slice(0, 7)}${scope === 'business' ? '&scope=business' : ''}${open ? `&open=${open}` : ''}`;
}
function done(fd, open) {
  revalidatePath('/finance'); revalidatePath('/');
  redirect(back(fd, open));
}
const incomeCategory = (v) => (str(v) || 'other').toLowerCase().replace(/\s+/g, ' ').slice(0, 40);

function safeLink(v) {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}

// Current rates; the live rate is also saved so the page has a fallback
async function rates(supabase) {
  const { data: saved } = await supabase.from('finance_settings').select('fx_usd_eur,fx_updated_on').maybeSingle();
  const fx = await getFx(saved);
  if (fx.live && fx.date && fx.date !== saved?.fx_updated_on) {
    await supabase.from('finance_settings').upsert({ fx_usd_eur: fx.USD, fx_updated_on: fx.date, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  }
  return fx;
}

// ---------- Income & expenses (now with personal / business scope) ----------
export async function addIncome(fd) {
  const supabase = await createClient();
  const amount = num(fd.get('amount'));
  if (amount !== null) {
    const { error } = await supabase.from('income').insert({
      month: String(fd.get('month')), source: str(fd.get('source')) || 'Income', amount, scope: scopeOf(fd),
      category: incomeCategory(fd.get('category')), recurring: fd.get('recurring') === 'on',
    });
    if (error) throw new Error(error.message);
  }
  done(fd, 'income');
}

export async function updateIncome(fd) {
  const supabase = await createClient();
  const amount = num(fd.get('amount'));
  const values = { source: str(fd.get('source')) || 'Income', category: incomeCategory(fd.get('category')), recurring: fd.get('recurring') === 'on' };
  if (amount !== null) values.amount = amount;
  const { error } = await supabase.from('income').update(values).eq('id', String(fd.get('id')));
  if (error) throw new Error(error.message);
  done(fd, 'income');
}

const DEFAULT_CATS = ['housing', 'food', 'supplements', 'subscriptions', 'transport', 'personal', 'business', 'giving', 'other'];

// Normalise a typed category and remember new ones so they show up in the list next time
async function category(supabase, raw) {
  const c = (str(raw) || 'other').toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
  const { data: row } = await supabase.from('settings').select('expense_categories').maybeSingle();
  const list = row?.expense_categories || DEFAULT_CATS;
  if (!list.includes(c)) {
    const next = [...list, c];
    if (row) await supabase.from('settings').update({ expense_categories: next }).not('user_id', 'is', null);
    else await supabase.from('settings').insert({ expense_categories: next });
  }
  return c;
}

export async function updateExpense(fd) {
  const supabase = await createClient();
  const amount = num(fd.get('amount'));
  const values = {
    name: str(fd.get('name')) || 'Expense', category: await category(supabase, fd.get('category')),
    recurring: fd.get('recurring') === 'on', set_aside: fd.get('set_aside') === 'on', link: safeLink(fd.get('link')), note: str(fd.get('note')),
  };
  if (amount !== null) values.amount = amount;
  const { error } = await supabase.from('expenses').update(values).eq('id', String(fd.get('id')));
  if (error) throw new Error(error.message);
  done(fd, 'expenses');
}

export async function addExpense(fd) {
  const supabase = await createClient();
  const amount = num(fd.get('amount'));
  if (amount !== null) {
    const { error } = await supabase.from('expenses').insert({
      month: String(fd.get('month')), name: str(fd.get('name')) || 'Expense', category: await category(supabase, fd.get('category')),
      amount, scope: scopeOf(fd), recurring: fd.get('recurring') === 'on', set_aside: fd.get('set_aside') === 'on',
      link: safeLink(fd.get('link')), note: str(fd.get('note')),
    });
    if (error) throw new Error(error.message);
  }
  done(fd, 'expenses');
}

// ---------- Accounts & balances ----------
export async function addAccount(fd) {
  const supabase = await createClient();
  const name = str(fd.get('name'));
  if (name) {
    const kind = ['bank', 'cash', 'investment', 'reserved', 'other'].includes(String(fd.get('kind'))) ? String(fd.get('kind')) : 'bank';
    const { data: last } = await supabase.from('accounts').select('sort').eq('scope', scopeOf(fd)).order('sort', { ascending: false }).limit(1);
    const { error } = await supabase.from('accounts').insert({ name, scope: scopeOf(fd), kind, currency: curOf(fd.get('currency')), sort: (last?.[0]?.sort ?? 0) + 1 });
    if (error) throw new Error(error.message);
  }
  done(fd, 'accounts');
}

export async function updateAccount(fd) {
  const supabase = await createClient();
  const values = { name: str(fd.get('name')) || 'Account', archived: fd.get('archived') === 'on' };
  const kind = String(fd.get('kind'));
  if (['bank', 'cash', 'investment', 'reserved', 'other'].includes(kind)) values.kind = kind;
  const { error } = await supabase.from('accounts').update(values).eq('id', String(fd.get('id')));
  if (error) throw new Error(error.message);
  done(fd, 'accounts');
}

// Sunday check-in: one form with every account; only changed values are saved, each converted to EUR
export async function checkIn(fd) {
  const supabase = await createClient();
  const date = isDate(fd.get('date')) ? String(fd.get('date')) : todayIso();
  const { data: accounts } = await supabase.from('accounts').select('id,currency,kind').eq('scope', scopeOf(fd)).eq('archived', false);
  const fx = await rates(supabase);
  const rows = [];
  (accounts || []).forEach((a) => {
    const amount = num(fd.get(`amt_${a.id}`));
    const invested = a.kind === 'investment' ? num(fd.get(`inv_${a.id}`)) : null;
    if (amount === null) return;
    const prevAmt = num(fd.get(`prev_${a.id}`)); const prevInv = num(fd.get(`previnv_${a.id}`));
    if (amount === prevAmt && invested === prevInv) return; // unchanged
    rows.push({
      account_id: a.id, date, amount, currency: a.currency, fx_to_eur: fx[a.currency], eur: toEur(amount, a.currency, fx),
      invested, invested_eur: invested === null ? null : toEur(invested, a.currency, fx),
    });
  });
  if (rows.length) {
    const { error } = await supabase.from('balances').insert(rows);
    if (error) throw new Error(error.message);
  }
  done(fd, `checked-${rows.length}`);
}

export async function updateBalance(fd) {
  const supabase = await createClient();
  const { data: b } = await supabase.from('balances').select('currency,fx_to_eur').eq('id', String(fd.get('id'))).single();
  if (!b) throw new Error('Not found');
  const amount = num(fd.get('amount')); const invested = num(fd.get('invested'));
  const values = { note: str(fd.get('note')) };
  if (isDate(fd.get('date'))) values.date = String(fd.get('date'));
  if (amount !== null) { values.amount = amount; values.eur = Math.round(amount * Number(b.fx_to_eur) * 100) / 100; }
  values.invested = invested; values.invested_eur = invested === null ? null : Math.round(invested * Number(b.fx_to_eur) * 100) / 100;
  const { error } = await supabase.from('balances').update(values).eq('id', String(fd.get('id')));
  if (error) throw new Error(error.message);
  done(fd, 'accounts');
}

// ---------- Owed to you / you owe ----------
export async function addMoneyItem(fd) {
  const supabase = await createClient();
  const amount = num(fd.get('amount'));
  const direction = fd.get('direction') === 'i_owe' ? 'i_owe' : 'owed_to_me';
  if (amount !== null && str(fd.get('title'))) {
    const currency = curOf(fd.get('currency'));
    const fx = await rates(supabase);
    const { error } = await supabase.from('money_items').insert({
      scope: scopeOf(fd), direction, title: str(fd.get('title')), amount: Math.abs(amount), currency,
      fx_to_eur: fx[currency], eur: toEur(Math.abs(amount), currency, fx), due_date: isDate(fd.get('due_date')) ? String(fd.get('due_date')) : null, note: str(fd.get('note')),
    });
    if (error) throw new Error(error.message);
  }
  done(fd, direction);
}

export async function settleMoneyItem(fd) {
  const supabase = await createClient();
  const reopen = fd.get('reopen') === '1';
  const { error } = await supabase.from('money_items').update(reopen ? { status: 'open', settled_on: null } : { status: 'settled', settled_on: todayIso() }).eq('id', String(fd.get('id')));
  if (error) throw new Error(error.message);
  done(fd, String(fd.get('direction') || ''));
}

// ---------- Savings plan ----------
export async function savePlan(fd) {
  const supabase = await createClient();
  const invest = num(fd.get('plan_invest')) ?? 0; const buffer = num(fd.get('plan_buffer')) ?? 0;
  const startM = String(fd.get('plan_start') || '');
  const { error } = await supabase.from('finance_settings').upsert({
    plan_invest: invest, plan_buffer: buffer, plan_monthly: invest + buffer,
    plan_start: /^\d{4}-\d{2}$/.test(startM) ? `${startM}-01` : null,
    plan_baseline: num(fd.get('plan_baseline')), updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  done(fd, 'plan');
}

export async function removeRow(fd) {
  const table = String(fd.get('table'));
  if (!TABLES.includes(table)) throw new Error('Unknown table');
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq('id', String(fd.get('id')));
  if (error) throw new Error(error.message);
  done(fd, { income: 'income', expenses: 'expenses', balances: 'accounts' }[table] || String(fd.get('open') || ''));
}

// Copy last month's recurring income and expenses into this month (balances carry forward on their own)
export async function copyFromPrevious(fd) {
  const month = String(fd.get('month'));
  const prev = String(fd.get('prev'));
  const scope = scopeOf(fd);
  const supabase = await createClient();
  const [{ data: inc }, { data: exp }] = await Promise.all([
    supabase.from('income').select('source,category,amount,currency,recurring,scope').eq('month', prev).eq('recurring', true).eq('scope', scope),
    supabase.from('expenses').select('name,category,amount,currency,recurring,set_aside,link,note,scope').eq('month', prev).eq('recurring', true).eq('scope', scope),
  ]);
  if (inc?.length) await supabase.from('income').insert(inc.map((r) => ({ ...r, month })));
  if (exp?.length) await supabase.from('expenses').insert(exp.map((r) => ({ ...r, month })));
  done(fd);
}
