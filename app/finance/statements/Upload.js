'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BANKS, parseCsv, rowsToTxns } from '@/lib/statements';
import { importStatement } from './actions';

const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function Upload() {
  const router = useRouter();
  const [bank, setBank] = useState('revolut');
  const [state, setState] = useState({ s: 'idle' });
  const onFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) { setState({ s: 'error', msg: 'Please upload the CSV export (a PDF statement cannot be read here yet).' }); return; }
    setState({ s: 'busy', msg: `Reading ${file.name}…` });
    try {
      const txns = rowsToTxns(parseCsv(await file.text()), bank);
      if (!txns.length) throw new Error('No completed transactions found in this file.');
      setState({ s: 'busy', msg: `Labelling ${txns.length} transactions…` });
      const r = await importStatement({ bank, filename: file.name, txns });
      setState({ s: 'done', msg: `${r.added} new transaction${r.added === 1 ? '' : 's'} (${fmt(r.first)} – ${fmt(r.last)})${r.total - r.added ? `, ${r.total - r.added} already uploaded before` : ''}${r.matched ? `, ${r.matched} transfer${r.matched === 1 ? '' : 's'} between your accounts recognised` : ''}.` });
      router.refresh();
    } catch (err) { setState({ s: 'error', msg: err?.message || 'Upload failed' }); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ minWidth: 150 }}>Bank<select value={bank} onChange={(e) => setBank(e.target.value)}>{BANKS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="btn" style={{ cursor: state.s === 'busy' ? 'wait' : 'pointer' }}>
          {state.s === 'busy' ? 'Working…' : 'Choose CSV file'}
          <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={state.s === 'busy'} style={{ display: 'none' }} />
        </label>
      </div>
      {state.msg && <p className={state.s === 'error' ? 'neg' : state.s === 'done' ? 'pos' : 'muted'} style={{ margin: 0, fontSize: 13 }} role={state.s === 'error' ? 'alert' : 'status'}>{state.msg}</p>}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Upload a whole year at once if you like: transactions you uploaded before are skipped. Only the transactions are stored (date, amount, description), not the file.</p>
    </div>
  );
}
