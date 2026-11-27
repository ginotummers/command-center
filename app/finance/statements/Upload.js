'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BANKS, parseCsv, rowsToTxns } from '@/lib/statements';
import { pdfLines, detectBank, parseWio, parseRevolut, withHashes } from '@/lib/statement-pdf';
import { importStatement } from './actions';

const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const bankName = (id) => BANKS.find((b) => b.id === id)?.name || id;

export default function Upload() {
  const router = useRouter();
  const [bank, setBank] = useState('revolut');
  const [state, setState] = useState({ s: 'idle' });
  const onFile = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = '';
    const done = [];
    for (const file of files) {
      try {
        let txns; let b = bank;
        if (/\.pdf$/i.test(file.name)) {
          setState({ s: 'busy', msg: `Reading ${file.name}…` });
          const lines = await pdfLines(new Uint8Array(await file.arrayBuffer()));
          b = detectBank(lines) || bank;
          if (b === 'wio') txns = withHashes(parseWio(lines), 'wio');
          else if (b === 'revolut') txns = withHashes(parseRevolut(lines), 'revolut');
          else throw new Error(`${file.name}: this PDF layout isn't supported yet. Upload a CSV export instead.`);
        } else if (/\.(csv|txt)$/i.test(file.name)) {
          txns = rowsToTxns(parseCsv(await file.text()), bank);
        } else throw new Error(`${file.name}: upload a PDF or CSV statement.`);
        if (!txns.length) throw new Error(`${file.name}: no transactions found.`);
        setState({ s: 'busy', msg: `Labelling ${txns.length} ${bankName(b)} transactions…` });
        const r = await importStatement({ bank: b, filename: file.name, txns });
        done.push(`${bankName(b)}: ${r.added} new (${fmt(r.first)} – ${fmt(r.last)})${r.total - r.added ? `, ${r.total - r.added} already there` : ''}${r.matched ? `, ${r.matched} transfers between your accounts matched` : ''}`);
      } catch (err) { setState({ s: 'error', msg: err?.message || 'Upload failed' }); if (done.length) router.refresh(); return; }
    }
    setState({ s: 'done', msg: `${done.join('. ')}.` });
    router.refresh();
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ minWidth: 150 }}>Bank (for CSV files)<select value={bank} onChange={(e) => setBank(e.target.value)}>{BANKS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="btn" style={{ cursor: state.s === 'busy' ? 'wait' : 'pointer' }}>
          {state.s === 'busy' ? 'Working…' : 'Choose statements'}
          <input type="file" accept=".pdf,.csv,application/pdf,text/csv" multiple onChange={onFile} disabled={state.s === 'busy'} style={{ display: 'none' }} />
        </label>
      </div>
      {state.msg && <p className={state.s === 'error' ? 'neg' : state.s === 'done' ? 'pos' : 'muted'} style={{ margin: 0, fontSize: 13 }} role={state.s === 'error' ? 'alert' : 'status'}>{state.msg}</p>}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Wio and Revolut PDF statements are recognised automatically; you can pick several files at once. A whole year is fine: transactions uploaded before are skipped. Only the transactions are stored, not the file.</p>
    </div>
  );
}
