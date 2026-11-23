'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { AED_PER_USD } from '@/lib/finance';
import { labelTxn, merchantKey, BANKS, SPEND_CATEGORIES } from '@/lib/statements';

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const back = (fd) => { const m = String(fd.get('m') || ''); return `/finance/statements${/^\d{4}-\d{2}$/.test(m) ? `?m=${m}` : ''}`; };
const done = (fd) => { revalidatePath('/finance/statements'); redirect(back(fd)); };

// ECB rate (via Frankfurter) for the first working day of each month; AED follows the USD peg.
const fxCache = new Map();
async function perEur(month, currency) {
  if (currency === 'EUR') return 1;
  const key = `${month}|${currency}`;
  if (fxCache.has(key)) return fxCache.get(key);
  const sym = currency === 'AED' ? 'USD' : currency;
  let rate = null;
  try {
    const r = await fetch(`https://api.frankfurter.dev/v1/${month}-01?base=EUR&symbols=${sym}`);
    if (r.ok) { const j = await r.json(); rate = Number(j?.rates?.[sym]) || null; }
  } catch { /* fall back below */ }
  if (!rate) rate = { USD: 1.16, AED: 1.16, GBP: 0.86 }[sym] || 1;
  if (currency === 'AED') rate *= AED_PER_USD;
  fxCache.set(key, rate);
  return rate;
}

// Called by the upload form with transactions parsed in the browser
export async function importStatement({ bank, filename, txns }) {
  if (!BANKS.some((b) => b.id === bank)) throw new Error('Unknown bank');
  const clean = (Array.isArray(txns) ? txns : []).filter((t) => isDate(t?.date) && Number.isFinite(Number(t?.amount)) && Number(t.amount) !== 0 && typeof t?.hash === 'string').slice(0, 20000);
  if (!clean.length) throw new Error('No transactions found in this file.');
  const supabase = await createClient();
  const { data: ruleRows } = await supabase.from('merchant_rules').select('merchant,kind,category');
  const rules = new Map((ruleRows || []).map((r) => [r.merchant, r]));
  const dates = clean.map((t) => t.date).sort();
  const { data: up, error: upErr } = await supabase.from('statement_uploads').insert({
    bank, filename: String(filename || '').slice(0, 200), first_date: dates[0], last_date: dates[dates.length - 1], rows_total: clean.length,
  }).select('id').single();
  if (upErr) throw new Error(upErr.message);
  const rows = [];
  for (const t of clean) {
    const amount = Math.round(Number(t.amount) * 100) / 100;
    const currency = /^[A-Z]{3}$/.test(String(t.currency)) ? String(t.currency) : (BANKS.find((b) => b.id === bank)?.currency || 'EUR');
    const rate = await perEur(t.date.slice(0, 7), currency);
    const l = labelTxn({ description: t.description, amount, type: t.type, product: t.product, bankCategory: t.bankCategory }, rules);
    rows.push({
      upload_id: up.id, bank, account: t.product ? String(t.product).slice(0, 60) : null, date: t.date,
      description: String(t.description).slice(0, 300), merchant: l.merchant, amount, currency,
      eur: Math.round((amount / rate) * 100) / 100, fx: rate, kind: l.kind, category: l.category,
      label_source: l.source, needs_review: l.review, bank_category: t.bankCategory ? String(t.bankCategory).slice(0, 80) : null,
      hash: `${t.hash}`.slice(0, 400),
    });
  }
  let added = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await supabase.from('bank_txns').upsert(rows.slice(i, i + 500), { onConflict: 'user_id,hash', ignoreDuplicates: true }).select('id');
    if (error) throw new Error(error.message);
    added += data?.length || 0;
  }
  await supabase.from('statement_uploads').update({ rows_new: added }).eq('id', up.id);
  const matched = await matchTransfers(supabase, dates[0], dates[dates.length - 1]);
  revalidatePath('/finance/statements');
  return { total: clean.length, added, matched, first: dates[0], last: dates[dates.length - 1] };
}

// Money leaving one bank and arriving at another within 3 days (±3% for currency conversion) is a transfer, not spending
async function matchTransfers(supabase, from, to) {
  const lo = new Date(`${from}T00:00:00Z`); lo.setUTCDate(lo.getUTCDate() - 4);
  const hi = new Date(`${to}T00:00:00Z`); hi.setUTCDate(hi.getUTCDate() + 4);
  const { data } = await supabase.from('bank_txns').select('id,bank,date,eur,kind,category,label_source')
    .gte('date', lo.toISOString().slice(0, 10)).lte('date', hi.toISOString().slice(0, 10))
    .neq('label_source', 'user').in('kind', ['spend', 'income']);
  const cand = (data || []).filter((t) => Math.abs(t.eur) >= 50 && (t.category === 'Transfers to people' || t.category === 'Other income' || t.category === 'Other'));
  const outs = cand.filter((t) => t.eur < 0); const ins = cand.filter((t) => t.eur > 0); const used = new Set(); const ids = [];
  for (const o of outs) {
    const m = ins.find((i) => !used.has(i.id) && i.bank !== o.bank
      && Math.abs((new Date(i.date) - new Date(o.date)) / 86400000) <= 3
      && Math.abs(i.eur + o.eur) / Math.abs(o.eur) <= 0.03);
    if (m) { used.add(m.id); ids.push(o.id, m.id); }
  }
  if (ids.length) await supabase.from('bank_txns').update({ kind: 'transfer', category: null, needs_review: false, label_source: 'auto' }).in('id', ids);
  return ids.length / 2;
}

// value: 'cat:<name>' | 'transfer' | 'income' | 'set_aside:Savings' | 'set_aside:Investing'
function parseChoice(value) {
  const v = String(value || '');
  if (v === 'transfer') return { kind: 'transfer', category: null };
  if (v === 'income') return { kind: 'income', category: 'Income' };
  if (v.startsWith('set_aside:')) return { kind: 'set_aside', category: v.slice(10) || 'Savings' };
  if (v.startsWith('cat:')) { const c = v.slice(4).trim().slice(0, 40); if (c) return { kind: 'spend', category: c }; }
  return null;
}

export async function setLabel(id, value, newName) {
  const supabase = await createClient();
  let choice = parseChoice(value);
  if (newName) {
    const name = String(newName).trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name) throw new Error('Empty label');
    const nice = name.charAt(0).toUpperCase() + name.slice(1);
    if (!SPEND_CATEGORIES.includes(nice)) await supabase.from('spend_labels').upsert({ name: nice }, { onConflict: 'user_id,name', ignoreDuplicates: true });
    choice = { kind: 'spend', category: nice };
  }
  if (!choice) throw new Error('Unknown label');
  const { data: t } = await supabase.from('bank_txns').select('id,merchant,category,label_source').eq('id', String(id)).single();
  if (!t) throw new Error('Not found');
  await supabase.from('bank_txns').update({ ...choice, label_source: 'user', needs_review: false }).eq('id', t.id);
  // Remember it for this shop, and relabel its other automatically-labelled transactions
  // (shops like Amazon, where every purchase can differ, keep being asked about one by one)
  if (t.merchant) {
    await supabase.from('merchant_rules').upsert({ merchant: t.merchant, kind: choice.kind, category: choice.category, updated_at: new Date().toISOString() }, { onConflict: 'user_id,merchant' });
    if (t.category !== 'Mixed shopping') {
      await supabase.from('bank_txns').update({ ...choice, label_source: 'rule', needs_review: false })
        .eq('merchant', t.merchant).in('label_source', ['auto', 'bank']).or('category.is.null,category.neq.Mixed shopping');
    }
  }
  revalidatePath('/finance/statements');
  return { ok: true };
}

// "Looks right": keep the suggested label and remember it
export async function confirmLabel(id) {
  const supabase = await createClient();
  const { data: t } = await supabase.from('bank_txns').select('id,merchant,kind,category').eq('id', String(id)).single();
  if (!t) throw new Error('Not found');
  await supabase.from('bank_txns').update({ needs_review: false, label_source: 'user' }).eq('id', t.id);
  if (t.merchant && t.category !== 'Mixed shopping') {
    await supabase.from('merchant_rules').upsert({ merchant: t.merchant, kind: t.kind, category: t.category, updated_at: new Date().toISOString() }, { onConflict: 'user_id,merchant' });
  }
  revalidatePath('/finance/statements');
  return { ok: true };
}

export async function addStay(fd) {
  const s = String(fd.get('start_date')); const e = String(fd.get('end_date')); const c = String(fd.get('country') || '').toUpperCase();
  if (isDate(s) && isDate(e) && e >= s && /^[A-Z]{2}$/.test(c)) {
    const supabase = await createClient();
    const { error } = await supabase.from('stays').insert({ start_date: s, end_date: e, country: c });
    if (error) throw new Error(error.message);
  }
  done(fd);
}

export async function removeStay(fd) {
  const supabase = await createClient();
  await supabase.from('stays').delete().eq('id', String(fd.get('id')));
  done(fd);
}

export async function removeUpload(fd) {
  const supabase = await createClient();
  await supabase.from('statement_uploads').delete().eq('id', String(fd.get('id'))); // transactions go with it
  done(fd);
}
