// Net worth is tracked per asset: each entry is a dated value, and an asset's balance
// at any moment is its latest entry on or before that date.

export const NW_TYPES = [['gold', 'Gold'], ['sp500', 'S&P 500'], ['bank', 'Bank'], ['other', 'Other asset'], ['liability', 'Liability']];

export const assetKey = (r) => `${r.type}|${String(r.label || '').trim().toLowerCase()}`;
const dateOf = (r) => r.entered_on || r.month;

// rows sorted any way; returns [{ key, latest, entries (newest first) }]
export function assets(rows, asOf = '9999-12-31') {
  const map = {};
  (rows || []).filter((r) => dateOf(r) <= asOf).forEach((r) => { (map[assetKey(r)] = map[assetKey(r)] || []).push(r); });
  return Object.entries(map).map(([key, list]) => {
    const entries = [...list].sort((a, b) => (dateOf(b) + (b.created_at || '')).localeCompare(dateOf(a) + (a.created_at || '')));
    return { key, latest: entries[0], entries };
  });
}

const signed = (r) => (r.kind === 'liability' ? -1 : 1) * Number(r.value || 0);
export const netWorthAsOf = (rows, asOf) => { const a = assets(rows, asOf); return a.length ? a.reduce((s, x) => s + signed(x.latest), 0) : null; };
