'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase';
import { num, str } from '@/lib/util';

const TABLES = ['income', 'expenses', 'net_worth_items'];

function back(fd) {
  const m = String(fd.get('month') || '');
  return `/finance?m=${m.slice(0, 7)}`;
}

function safeLink(v) {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}

export async function addIncome(fd) {
  const supabase = await createClient();
  const amount = num(fd.get('amount'));
  if (amount !== null) {
    const { error } = await supabase.from('income').insert({
      month: String(fd.get('month')), source: str(fd.get('source')) || 'Income', amount, recurring: fd.get('recurring') === 'on',
    });
    if (error) throw new Error(error.message);
  }
  revalidatePath('/finance'); revalidatePath('/');
  redirect(back(fd));
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
    recurring: fd.get('recurring') === 'on', link: safeLink(fd.get('link')), note: str(fd.get('note')),
  };
  if (amount !== null) values.amount = amount;
  const { error } = await supabase.from('expenses').update(values).eq('id', String(fd.get('id')));
  if (error) throw new Error(error.message);
  revalidatePath('/finance'); revalidatePath('/');
  redirect(back(fd));
}

export async function addExpense(fd) {
  const supabase = await createClient();
  const amount = num(fd.get('amount'));
  if (amount !== null) {
    const { error } = await supabase.from('expenses').insert({
      month: String(fd.get('month')), name: str(fd.get('name')) || 'Expense', category: await category(supabase, fd.get('category')),
      amount, recurring: fd.get('recurring') === 'on', link: safeLink(fd.get('link')), note: str(fd.get('note')),
    });
    if (error) throw new Error(error.message);
  }
  revalidatePath('/finance'); revalidatePath('/');
  redirect(back(fd));
}

export async function addNetWorth(fd) {
  const supabase = await createClient();
  const value = num(fd.get('value'));
  if (value !== null) {
    const type = str(fd.get('type')) || 'other';
    const { error } = await supabase.from('net_worth_items').insert({
      month: String(fd.get('month')), kind: type === 'liability' ? 'liability' : 'asset', type,
      label: str(fd.get('label')) || type, value,
    });
    if (error) throw new Error(error.message);
  }
  revalidatePath('/finance'); revalidatePath('/');
  redirect(back(fd));
}

export async function removeRow(fd) {
  const table = String(fd.get('table'));
  if (!TABLES.includes(table)) throw new Error('Unknown table');
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq('id', String(fd.get('id')));
  if (error) throw new Error(error.message);
  revalidatePath('/finance'); revalidatePath('/');
  redirect(back(fd));
}

// Copy last month's recurring income/expenses and net worth items into this month
export async function copyFromPrevious(fd) {
  const month = String(fd.get('month'));
  const prev = String(fd.get('prev'));
  const supabase = await createClient();
  const [{ data: inc }, { data: exp }, { data: nw }] = await Promise.all([
    supabase.from('income').select('source,amount,currency,recurring').eq('month', prev).eq('recurring', true),
    supabase.from('expenses').select('name,category,amount,currency,recurring,link,note').eq('month', prev).eq('recurring', true),
    supabase.from('net_worth_items').select('kind,type,label,value,currency').eq('month', prev),
  ]);
  if (inc?.length) await supabase.from('income').insert(inc.map((r) => ({ ...r, month })));
  if (exp?.length) await supabase.from('expenses').insert(exp.map((r) => ({ ...r, month })));
  if (nw?.length) await supabase.from('net_worth_items').insert(nw.map((r) => ({ ...r, month })));
  revalidatePath('/finance'); revalidatePath('/');
  redirect(back(fd));
}
