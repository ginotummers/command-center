// Bank statements: parsing helpers (used in the browser) and labelling logic (used on the server).
// Nothing here calls an AI model: labels come from Gino's own rules, a built-in shop dictionary,
// the bank's own category column, and transaction type. Anything uncertain is flagged for review.

export const BANKS = [
  { id: 'revolut', name: 'Revolut', currency: 'EUR' },
  { id: 'wio', name: 'Wio', currency: 'AED' },
  { id: 'other', name: 'Other bank', currency: 'EUR' },
];

export const SPEND_CATEGORIES = [
  'Groceries', 'Eating out', 'Transport', 'Travel', 'Housing', 'Bills & utilities', 'Subscriptions',
  'Supplements', 'Gym & coaching', 'Health & fitness', 'Insurance', 'Personal care', 'Clothing', 'Home', 'Electronics', 'Mixed shopping',
  'Shipping', 'Entertainment', 'Education', 'Gifts & giving', 'Transfers to people', 'Cash', 'Bank fees',
  'Taxes & government', 'Business', 'Other',
];
// Non-spending choices in the same dropdown
export const BUSINESSES = ['T Ventures', 'Promenado FZCO', 'Promenado LLC'];
export const KIND_CHOICES = [
  ['transfer', 'Moved between my accounts'],
  ...BUSINESSES.map((b) => [`business:${b}`, `To / from ${b} (my business)`]),
  ['set_aside:Set aside', 'Set aside for bills (rent, yearly costs)'],
  ['set_aside:Savings', 'Saved (savings)'],
  ['set_aside:Investing', 'Invested (gold, S&P …)'],
  ['income', 'Income'],
];
export const KIND_LABEL = { spend: 'Spent', income: 'Income', transfer: 'Moved between my accounts', set_aside: 'Set aside, saved & invested', business: 'My businesses' };

// Costs you pay wherever you are: left out of "cost per day" by default (Travel is always left out)
export const FIXED_COSTS = ['Gym & coaching', 'Insurance', 'Housing', 'Bills & utilities', 'Subscriptions', 'Business', 'Transfers to people', 'Taxes & government', 'Loan Reimbursements', 'Bank fees'];

// Statement category → budget category on the Finance page (expenses use these names)
export const BUDGET_OF = {
  'Groceries': 'food', 'Eating out': 'food', 'Housing': 'housing', 'Bills & utilities': 'housing',
  'Subscriptions': 'subscriptions', 'Supplements': 'supplements', 'Transport': 'transport', 'Travel': 'travel',
  'Health & fitness': 'personal', 'Insurance': 'personal', 'Gym & coaching': 'personal', 'Personal care': 'personal', 'Clothing': 'personal', 'Gifts & giving': 'giving',
  'Business': 'business',
};

// ---------- Merchant key ----------
export function merchantKey(desc) {
  let s = String(desc || '').toLowerCase()
    .replace(/^(pos|purchase|card (payment|purchase)|apple pay|google pay|payment to|transfer to|transfer from|to|from)\s+/g, '')
    .replace(/[*#]+/g, ' ')
    .replace(/\b\d[\d\s/.-]{3,}\b/g, ' ')
    .replace(/\b(llc|l\.l\.c|fze|fzco|fzc|bv|b\.v\.|ltd|limited|inc|gmbh|dmcc|co)\b\.?/g, ' ')
    .replace(/[^a-z0-9&%' .-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  // keep the first three words: "carrefour mcc dubai" → "carrefour mcc dubai", "amazon.ae ..." → "amazon.ae"
  return s.split(' ').slice(0, 3).join(' ') || String(desc || '').toLowerCase().slice(0, 40);
}

// ---------- Built-in dictionary (order matters: first match wins) ----------
const DICT = [
  // Careem is several services
  [/amazon|amzn/, 'Mixed shopping'], // Amazon (also 'Amazon grocery') is random shopping
  [/careem\s*(quik|grocer|mart)/, 'Groceries'], [/careem\s*food/, 'Eating out'], [/careem\s*(pay|plus)/, 'Subscriptions'],
  [/careem|uber(?!\s*eats)|bolt\b|limous|hala\b|rta\b|salik|nol\b|dubai taxi|metro|\bns\b|ov-?chipkaart|9292|gvb|ret\b|swapfiets|lime\b|tier\b|adnoc|enoc|eppco|shell\b|esso\b|totalenergies|national taxi|trekpleister|ovpay|parkin|park\b|parking|q-?park/, 'Transport'],
  [/^vida\b|vida (creek|hotels)|address\b|qlub|qlu\b|dunkin|restau|palace dubai|alila|hill house|waldorf|cinnamood|catering|meals on me|low ?calories|lavo\b|joe & the juice|signature\b|maison|beach clu|limanaki|cravings|fomo|joe and the juice|lowcalorie|kcal|bateel|chillbox|barrio|mallab|vendingland|royal atlantis res/, 'Eating out'],
  [/pantopoleion|marks and spencer|masoutis|sklavenitis|ab vassilopoulos/, 'Groceries'],
  [/sp blueprint|choosemuse/, 'Supplements'],
  [/talabat\s*mart|noon\s*minutes|instashop|kibsons|carrefour|lulu|spinneys|waitrose|choithram|union coop|west zone|al maya|grandiose|viva\b|nesto|albert heijn|jumbo|lidl|aldi|plus supermarkt|\bdirk\b|ekoplaza|picnic|coop\b|spar\b|vomar|hoogvliet|crisp\b|flink|supermarket|hypermarket|grocer/, 'Groceries'],
  [/talabat|deliveroo|uber\s*eats|thuisbezorgd|zomato|noon\s*food|mcdonald|kfc|burger|pizza|nando|starbucks|costa|arabica|tim hortons|caffe|coffee|cafe|café|restaurant|bistro|grill|sushi|shake shack|five guys|subway|bakery|bakkerij|eatery|kitchen|lounge|bar\b|brasserie/, 'Eating out'],
  [/emirates|flydubai|etihad|klm|transavia|condor|blacklane|customs and border|\btravel\b|air arabia|ryanair|easyjet|lufthansa|qatar airways|turkish airlines|airline|airways|booking\.com|airbnb|expedia|agoda|hotels?\b|marriott|hilton|hyatt|accor|rotana|jumeirah|hostel|esta\b|visa fee/, 'Travel'],
  [/\bdu\b|etisalat|\be&\b|dewa|dubai electricity|lootah|simyo|empower|tabreed|ziggo|kpn|vodafone|odido|eneco|vattenfall|essent|waternet|virgin mobile|internet|electric/, 'Bills & utilities'],
  [/netflix|spotify|apple\.com|itunes|icloud|google (one|storage|play)|youtube|disney|osn|shahid|amazon prime|prime video|chatgpt|openai|anthropic|claude\.ai|notion|adobe|canva|microsoft|dropbox|1password|expressvpn|nordvpn|linkedin|patreon|substack|audible|kindle unlimited|rize|akiflow|loom|zoom\.us|vercel|supabase|github|^apple$|transip|atlassian|wetransfer|itranslator|fathom|fireflies|liftapp|mediahuis|wix|squarespace|godaddy|elevenlabs|midjourney|perplexity|calendly|claude|wispr|vendro|brand ?folio/, 'Subscriptions'],
  [/iherb|myprotein|bodybuilding|supplement|vitamin|holland & barrett|gnc\b|optimum nutrition|bulk\.com/, 'Supplements'],
  [/1fit|\bgym|fitness|privilee|basic-?fit|lucky.?s? sports|rozario|coaching|personal train|crossfit|padel|yoga|pilates/, 'Gym & coaching'],
  [/wellness|cryo|basic-?fit|lucky.?s? sports|crossfit|padel|yoga|pilates|sports? (club|center)|decathlon|physio|clinic|hospital|medical|dental|dentist|doctor|aster|mediclinic|pharmacy|apotheek|life pharmacy|boots\b|bupa|insurance/, 'Health & fitness'],
  [/fresha|rituals|barber|salon|spa\b|grooming|kruidvat|etos|sephora|faces\b|douglas|bath & body/, 'Personal care'],
  [/trendyol|zara|h&m|uniqlo|nike|adidas|mango|massimo dutti|cos\b|primark|zalando|asos|levi|calvin klein|tommy|lacoste|bershka|pull&bear|clothing/, 'Clothing'],
  [/justlife|painting|contracting|cleaning|handyman|ikea|home ?centre|home ?box|pottery barn|west elm|hema\b|\baction\b|ace hardware|danube|maisons du monde|furniture/, 'Home'],
  [/apple store|sharaf dg|virgin megastore|jumbo electronics|emax|coolblue|mediamarkt|bol\.com electronics|samsung/, 'Electronics'],
  [/\bdhl\b|aramex|fedex|\bups\b|emirates post|postnl|smsa|shipa\b|\bpost\.?nl/, 'Shipping'],
  [/amazon|amzn|noon\b|noon\.com|bol\.com|aliexpress|temu|shein|ebay|namshi|paypal|tabby|tamara|klarna/, 'Mixed shopping'],
  [/whop|fusion wealth/, 'Business'],
  [/vox\b|reel cinema|pathe|pathé|cinema|ticketmaster|platinumlist|playstation|steam|xbox|nintendo|museum|concert|theme park/, 'Entertainment'],
  [/udemy|coursera|skillshare|masterclass|book|bookshop|kinokuniya|magrudy|bruna|boekhandel|school|course/, 'Education'],
  [/dubai police|amer\b|icp\b|gdrfa|ministry|government|municipality|belastingdienst|gemeente|tax\b|traffic fine|dubai courts|tasheel|tadbeer|emirates id/, 'Taxes & government'],
  [/charity|donation|zakat|unicef|red cross|red crescent|gift|greetz/, 'Gifts & giving'],
  [/rent\b|landlord|ejari|real estate|property|dubizzle|bayut|property finder/, 'Housing'],
  [/\batm\b|cash withdrawal|geldautomaat|geldopname/, 'Cash'],
  [/\bfee\b|fees|charge|commission|interest/, 'Bank fees'],
];
// Categories where the shop alone does not tell what you bought
const ASK_ALWAYS = new Set(); // Amazon, Noon etc. simply stay Mixed shopping

// The bank's own category text (e.g. Wio) → our category
const BANK_CAT = [
  [/grocer|supermarket/, 'Groceries'], [/restaurant|food|dining|cafe|coffee/, 'Eating out'], [/transport|taxi|ride|fuel|parking/, 'Transport'],
  [/travel|flight|hotel/, 'Travel'], [/util|bill|telecom|phone/, 'Bills & utilities'], [/subscri|digital|streaming/, 'Subscriptions'],
  [/health|medical|pharm|fitness|sport/, 'Health & fitness'], [/beauty|personal care/, 'Personal care'], [/cloth|fashion/, 'Clothing'],
  [/home|furniture/, 'Home'], [/electronic/, 'Electronics'], [/entertain|leisure/, 'Entertainment'], [/educat/, 'Education'],
  [/government|tax/, 'Taxes & government'], [/shopping/, 'Mixed shopping'], [/cash|atm|geldautomaat/, 'Cash'], [/fee|charge/, 'Bank fees'],
];

const OWN_NAME = /\bgino\b|\bgjm tummers|g\.j\.m\.? tummers/;
// Wio savings spaces: "Gino Jac Maria Tummers to Rent Apartment Creek" / "Rent Apartment Creek to Gino Jac Maria Tummers"
const WIO_SPACE = /gino jac maria tummers to |\bto gino jac maria tummers$/;
// Gino's own companies: money to/from them stays in his world, so it is neither spending nor income
export function businessOf(desc) {
  const d = String(desc || '').toLowerCase();
  if (/\bt[\s.-]?ventures/.test(d)) return 'T Ventures';
  if (/promenado/.test(d)) return /llc/.test(d) ? 'Promenado LLC' : /fzco|fzo\b|fz[\s-]?co/.test(d) ? 'Promenado FZCO' : 'Promenado';
  return null;
}
const INVEST = /vantage|gold ?republic|goldre\b|escrow goldre|investment fund|digital assets|paybis|crypto|trading ?212|interactive brokers|ibkr|degiro|etoro|sarwa|stake\b|vanguard|saxo|bitvavo|revolut (invest|trading|gold)|commodities|robo|broker/;
const VAULT = /pocket|vault|savings|saving space|saving goal|goal\b|spaces?\b|piggy|^(to|from|van|naar) (eur|aed|usd|gbp)\b/;
// A vault or space is real saving only when its name says so; rent, insurance, licence pots are money set aside for bills
const SAVE_NAME = /general savings|emergency|buffer|spaar|rainy|reserve|\bsavings\b/;
const potOf = (d) => (SAVE_NAME.test(d) ? 'Savings' : 'Set aside');
// From December 2026 Careem is only used for groceries (Uber for rides)
export const CAREEM_GROCERIES_FROM = '2026-12-01';
const SALARY = /salary|payroll|wage|millionaire|247 coaching|247 enterprise|loon|salaris/;

// Decide kind + category for one transaction.
// Subscriptions paid through Apple, recognised by price (EUR, Revolut)
export const APPLE_SUBS = { '16.99': 'Instagram', '13.99': 'Muse', '9.99': 'iCloud', '89.99': 'ExpressVPN' };

// Shops whose bank name hides what they are
const RENAME = { atlassian: 'loom (atlassian)' };

// t: { description, amount (signed), type (bank's type text, optional), product, bankCategory }
// rules: Map merchantKey → { kind, category }
export function labelTxn(t, rules) {
  const d = String(t.description || '').toLowerCase();
  const type = String(t.type || '').toLowerCase();
  const key = RENAME[merchantKey(t.description)] || merchantKey(t.description);
  const out = t.amount < 0;

  // 0. Savings spaces and vault-side rows first (a space can carry a company name, e.g. "Promenado Trade License")
  if (t.product && !/current|main|checking/i.test(t.product)) return { merchant: key, kind: 'transfer', category: 'Savings', source: 'auto', review: false };
  if (WIO_SPACE.test(d)) return { merchant: key, kind: 'set_aside', category: potOf(d), source: 'auto', review: false };
  // Clearly named own companies always win (FZCO and LLC share a shop key, so rules can't tell them apart)
  const biz = businessOf(t.description);
  if (biz && biz !== 'Promenado') return { merchant: key, kind: 'business', category: biz, source: 'auto', review: false };
  // Apple bills other apps' subscriptions: name them by price so they don't all show as "Apple"
  if (key === 'apple' && out) {
    const app = APPLE_SUBS[Math.abs(t.amount).toFixed(2)];
    return { merchant: app ? `apple · ${app.toLowerCase()}` : 'apple · other apps', kind: 'spend', category: 'Subscriptions', source: 'auto', review: false };
  }
  // 1. Gino's own rules win
  const rule = rules?.get(key);
  if (rule) return { merchant: key, kind: rule.kind, category: rule.category, source: 'rule', review: false };

  // 2. Money moving, not spending
  if (biz) return { merchant: key, kind: 'business', category: biz, source: 'auto', review: true };
  if (/exchange|conversion|fx\b|wisselen/.test(type + ' ' + String(t.bankCategory || '').toLowerCase()) || /^exchanged? to|^[a-z]{3} to [a-z]{3}\b|valutawissel/.test(d)) return { merchant: key, kind: 'transfer', category: null, source: 'auto', review: false };
  // Rows from inside a vault/savings account mirror the main account's transfer: don't count them twice
  if (t.product && !/current|main|checking/i.test(t.product)) return { merchant: key, kind: 'transfer', category: 'Savings', source: 'auto', review: false };
  // Money into (negative) or back out of (positive) a vault or investment nets out in "set aside"
  if (WIO_SPACE.test(d)) return { merchant: key, kind: 'set_aside', category: potOf(d), source: 'auto', review: false };
  if (INVEST.test(d)) return { merchant: key, kind: 'set_aside', category: 'Investing', source: 'auto', review: false };
  if (VAULT.test(d)) return { merchant: key, kind: 'set_aside', category: potOf(d), source: 'auto', review: false };
  if (OWN_NAME.test(d) || /^revolut\b|top.?up|topup|geld toevoegen|waardeer op/.test(type + ' ' + d + ' ' + String(t.bankCategory || '').toLowerCase())) return { merchant: key, kind: 'transfer', category: null, source: 'auto', review: false };
  if (!out && SALARY.test(d)) return { merchant: key, kind: 'income', category: 'Salary', source: 'auto', review: false };

  // Money back from a known shop is a refund: it lowers that shop's category
  if (!out) for (const [re, cat] of DICT) if (re.test(d)) return { merchant: key, kind: 'spend', category: cat, source: 'auto', review: false };
  // Incoming money that is not a card refund is income (asked about unless it's clear)
  if (!out && !/refund|reversal|chargeback|card/.test(type + ' ' + d)) {
    if (/interest|dividend|cashback/.test(d)) return { merchant: key, kind: 'income', category: 'Interest & cashback', source: 'auto', review: false };
    return { merchant: key, kind: 'income', category: 'Other income', source: 'auto', review: true };
  }
  // 3. Shops
  if (out && /careem/.test(d) && !/careem\s*food/.test(d) && String(t.date || '') >= CAREEM_GROCERIES_FROM) return { merchant: key, kind: 'spend', category: 'Groceries', source: 'auto', review: false };
  const isCard = /card|pos|purchase|payment/.test(type) || /card|pos/.test(d);
  for (const [re, cat] of DICT) {
    if (re.test(d)) return { merchant: key, kind: 'spend', category: cat, source: 'auto', review: ASK_ALWAYS.has(cat) };
  }
  if (t.bankCategory) {
    const bc = String(t.bankCategory).toLowerCase();
    for (const [re, cat] of BANK_CAT) if (re.test(bc)) return { merchant: key, kind: 'spend', category: cat, source: 'bank', review: ASK_ALWAYS.has(cat) };
  }
  // 4. A refund we can't place
  if (!out) return { merchant: key, kind: 'spend', category: 'Other', source: 'auto', review: true };
  if (/^cheque/.test(d)) return { merchant: key, kind: 'spend', category: 'Housing', source: 'auto', review: false };
  if ((/transfer/.test(type) || /^to |^overschrijving naar|tikkie|betaalverzoek/.test(d)) && !isCard) return { merchant: key, kind: 'spend', category: 'Transfers to people', source: 'auto', review: false };
  return { merchant: key, kind: 'spend', category: 'Other', source: 'auto', review: true };
}

// ---------- CSV parsing (browser) ----------
export function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  const src = text.replace(/^﻿/, '');
  const delim = (src.split('\n')[0].match(/;/g) || []).length > (src.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function parseDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return iso3(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); if (m) return iso3(m[3].length === 2 ? `20${m[3]}` : m[3], m[2], m[1]); // day first
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-,]+(\d{4})/); if (m && MONTHS[m[2].toLowerCase()]) return iso3(m[3], MONTHS[m[2].toLowerCase()], m[1]);
  m = s.match(/^([A-Za-z]{3})[a-z]* (\d{1,2}),? (\d{4})/); if (m && MONTHS[m[1].toLowerCase()]) return iso3(m[3], MONTHS[m[1].toLowerCase()], m[2]);
  return null;
}
const iso3 = (y, mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export function parseAmount(v) {
  let s = String(v ?? '').trim().replace(/[^\d,.\-()]/g, '');
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-'); s = s.replace(/[()-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s); return Number.isFinite(n) ? (neg ? -n : n) : null;
}

// Turn CSV rows into transactions. Works for Revolut's export and for most bank CSVs
// (date + description + amount, or separate debit/credit columns).
export function rowsToTxns(rows, bank) {
  const defCur = BANKS.find((b) => b.id === bank)?.currency || 'EUR';
  const hi = rows.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /amount|debit|credit|withdraw|deposit/i.test(c)));
  if (hi < 0) throw new Error('Could not find the header row (needs a date and an amount column).');
  const h = rows[hi].map((c) => String(c).trim().toLowerCase());
  const col = (...res) => h.findIndex((c) => res.some((re) => re.test(c)));
  const cDate = [col(/^completed date/), col(/^date$/, /transaction date/, /value date/, /posting date/), col(/date/)].find((i) => i >= 0);
  const cDesc = col(/description/, /details/, /narrative/, /merchant/, /payee/, /reference/, /remarks/);
  const cAmt = col(/^amount$/, /amount \(/, /^amount/);
  const cDebit = col(/debit/, /withdraw/, /money out/, /paid out/);
  const cCredit = col(/credit/, /deposit/, /money in/, /paid in/);
  const cFee = col(/^fee/);
  const cCur = col(/^currency/, /ccy/);
  const cType = col(/^type$/, /transaction type/);
  const cProduct = col(/^product$/);
  const cState = col(/^state$/, /^status$/);
  const cCat = col(/categor/);
  const seen = new Map(); const out = [];
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(r[cDate]); if (!date) continue;
    if (cState >= 0 && r[cState] && !/complete|posted|settled|success/i.test(r[cState])) continue;
    let amount = cAmt >= 0 ? parseAmount(r[cAmt]) : null;
    if (amount === null) { const d = parseAmount(r[cDebit]); const c = parseAmount(r[cCredit]); amount = (c ? Math.abs(c) : 0) - (d ? Math.abs(d) : 0); }
    const fee = cFee >= 0 ? Math.abs(parseAmount(r[cFee]) || 0) : 0;
    amount = Math.round((amount - fee) * 100) / 100;
    if (!amount) continue;
    const description = String(r[cDesc] ?? '').trim() || '(no description)';
    const currency = (cCur >= 0 && /^[A-Z]{3}$/.test(String(r[cCur]).trim()) ? String(r[cCur]).trim() : defCur);
    const base = `${bank}|${date}|${amount}|${currency}|${description.toLowerCase()}`;
    const n = (seen.get(base) || 0) + 1; seen.set(base, n);
    out.push({ date, description, amount, currency, type: cType >= 0 ? r[cType] : '', product: cProduct >= 0 ? r[cProduct] : '', bankCategory: cCat >= 0 ? r[cCat] : '', hash: `${base}|${n}` });
  }
  return out;
}

// ---------- Countries for the stays log ----------
const CODES = 'AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW'.split(' ');
export function countries() {
  let dn; try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { dn = null; }
  return CODES.map((c) => ({ code: c, name: dn?.of(c) || c })).sort((a, b) => a.name.localeCompare(b.name));
}
export const flag = (code) => (code && code.length === 2 ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '');
export function countryName(code) { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code); } catch { return code; } }
