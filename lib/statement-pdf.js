// Read Wio and Revolut PDF statements (text-based PDFs) into transactions, in the browser.
// pdf.js gives positioned text; we rebuild lines, then read each bank's table layout.
import { parseAmount } from './statements';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38';

// Rebuild text lines: items on the same baseline, left to right; a wide gap becomes a column break ("  ").
export async function pdfLines(data, lib) {
  if (!lib) { lib = await import(/* webpackIgnore: true */ `${PDFJS}/pdf.min.mjs`); lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`; }
  const doc = await lib.getDocument({ data }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4]; const y = it.transform[5]; const h = Math.abs(it.transform[3]) || 8;
      let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, h * 0.35));
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x, w: it.width || it.str.length * h * 0.5, s: it.str, h });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      let text = ''; let end = null;
      for (const it of r.items) {
        if (end !== null) { const gap = it.x - end; text += gap > it.h * 0.9 ? '  ' : gap > it.h * 0.12 ? ' ' : ''; }
        text += it.s; end = it.x + it.w;
      }
      lines.push({ text: text.replace(/\s+$/, ''), x: r.items[0].x, page: p, items: r.items });
    }
  }
  return lines;
}

export function detectBank(lines) {
  const head = lines.slice(0, 80).map((l) => l.text).join('\n');
  if (/Wio Bank|ACCOUNT STATEMENT/i.test(head) && /CBUAE|Wio/i.test(lines.slice(0, 200).map((l) => l.text).join(' '))) return 'wio';
  if (/Revolut|Gepersonaliseerd afschrift|REVO/i.test(head)) return 'revolut';
  return null;
}

// ---------- Wio ----------
const WIO_ROW = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\S+)\s{2,}(.+?)\s{2,}(-?[\d,]+(?:\.\d+)?)\s{2,}(-?[\d,]+(?:\.\d+)?)$/;
export function parseWio(lines) {
  const out = []; let cur = 'AED'; let type = 'CURRENT'; let name = null; let last = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]; const t = l.text;
    if (/\bCURRENT ACCOUNT\b/.test(t)) type = 'CURRENT';
    if (/\b(REGULAR )?SAVINGS\b/.test(t) && !/Summary of Savings/i.test(t)) type = 'SAVINGS';
    if (/ACCOUNT NAME/.test(t)) {
      const lab = l.items.find((it) => /ACCOUNT NAME/.test(it.s));
      for (let k = 1; k <= 3 && lines[i + k]; k++) {
        const v = lines[i + k].items.filter((it) => lab && Math.abs(it.x - lab.x) < 30 && /[A-Za-z]/.test(it.s) && !/[؀-ۿ]/.test(it.s));
        if (v.length) { name = v.map((it) => it.s).join(' ').trim(); break; }
      }
    }
    const mc = t.match(/\((AED|EUR|USD|GBP)\)\s*$/); if (mc) cur = mc[1];
    const m = t.match(WIO_ROW);
    if (m) {
      const [, d, mo, y, ref, desc, amt] = m;
      const product = type === 'SAVINGS' ? `Savings: ${name || 'space'}` : 'Current';
      last = { date: `${y}-${mo}-${d}`, description: desc.trim(), amount: Number(amt.replace(/,/g, '')), currency: cur, product, ref, x: l.items[2]?.x };
      out.push(last); continue;
    }
    // a wrapped description continues on the next line, in the description column, without numbers
    if (last && !/\d{2}\/\d{2}\/\d{4}/.test(t) && !/\d[\d,]*\.\d/.test(t) && t.trim().length < 60 && !/[؀-ۿ]/.test(t) && last.x && Math.abs(l.x - last.x) < 12) {
      last.description += ` ${t.trim()}`;
    } else if (t.trim()) last = null;
  }
  return out.map(({ x, ...r }) => r);
}

// ---------- Revolut (Dutch or English PDF) ----------
const MONTHS = { jan: 1, feb: 2, mrt: 3, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dec: 12 };
const REV_DATE = /^(\d{1,2}) (jan|feb|mrt|mar|apr|mei|may|jun|jul|aug|sep|okt|oct|nov|dec)\.? (\d{4})\s+/i;
const MONEY = /-?(?:[€$£]\s?[\d.,]+\d|[\d.,]+\d\s?(?:AED|EUR|USD|GBP))/g;
const REV_CATS = ['Waardeer op', 'Overige', 'Handelaar', 'Terugbetaling', 'Geldautomaat', 'Wisselen', 'Overschrijving', 'Kosten', 'Rente',
  'Card Payment', 'Card payment', 'Transfer', 'Top-up', 'Top-Up', 'Exchange', 'ATM', 'Refund', 'Fee', 'Interest', 'Merchant', 'Other'];
export function parseRevolut(lines) {
  const out = []; let sec = null; let last = null;
  for (const l of lines) {
    const t = l.text.trim();
    const ms = t.match(/^(Persoonlijke rekening|Personal account|Current account) \(([A-Z]{3})\)/i);
    if (ms) { sec = ms[2].toUpperCase(); last = null; continue; }
    if (/Savings Accounts Transaction|Crypto Transact|Spaarrekeningen|Savings accounts/i.test(t)) { sec = null; last = null; continue; }
    if (!sec) continue;
    const m = t.match(REV_DATE);
    if (m) {
      const toks = [...t.matchAll(MONEY)];
      if (toks.length < 2) { last = null; continue; }
      let prefix = t.slice(m[0].length, toks[0].index).trim(); let cat = '';
      for (const c of REV_CATS) if (prefix.endsWith(c)) { cat = c; prefix = prefix.slice(0, -c.length).trim(); break; }
      if (!cat) { const parts = prefix.split(/\s{2,}/); if (parts.length > 1) { cat = parts.pop(); prefix = parts.join(' '); } }
      const amount = parseAmount(toks[0][0].replace(/[€$£]|AED|EUR|USD|GBP/g, ''));
      last = { date: `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`, description: prefix, amount: toks[0][0].trim().startsWith('-') ? -Math.abs(amount) : Math.abs(amount), currency: sec, product: 'Current', bankCategory: cat };
      out.push(last); continue;
    }
    if (last && !MONEY.test(t) && t.length < 50 && !/Gepersonaliseerd|Generated|Totaal|Total|Inkomend|Datum|Date/i.test(t)) last.description += ` ${t}`;
    else last = null;
    MONEY.lastIndex = 0;
  }
  return out;
}

// Turn parsed rows into upload rows with stable hashes (Wio has its own reference numbers)
export function withHashes(rows, bank) {
  const seen = new Map();
  return rows.filter((r) => r.amount && r.date).map((r) => {
    const base = `${bank}|${r.date}|${r.amount}|${r.currency}|${String(r.description).toLowerCase()}`;
    const n = (seen.get(base) || 0) + 1; seen.set(base, n);
    return { ...r, hash: r.ref ? `${bank}|ref|${r.ref}` : `${base}|${n}` };
  });
}
