import React from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { MoneyFlow as Flow, Movement } from '../../lib/flow';

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
const MAX_ROWS = 6;

export const Address: React.FC<{ value: string }> = ({ value }) => (
  <a href={`https://solscan.io/account/${value}`} target="_blank" rel="noreferrer" title={value}
    className="font-mono text-ink-300 underline decoration-ink-600 underline-offset-2 transition hover:text-white hover:decoration-ink-300">{short(value)}</a>
);

const time = (iso?: string) => (iso ? new Date(iso).toISOString().slice(11, 19) : null);

function Side({ title, rows, sign, empty, direction }: { title: string; rows: Movement[]; sign: '+' | '−'; empty: string; direction: 'from' | 'to' }) {
  const inbound = sign === '+';
  const Icon = inbound ? ArrowDownLeft : ArrowUpRight;
  return (
    <div className="min-w-0">
      <h4 className={`mb-2 flex items-center gap-1.5 text-[13px] font-semibold ${inbound ? 'text-success-300' : 'text-danger-300'}`}>
        <Icon className="h-3.5 w-3.5" />{title}<span className="readout font-normal text-ink-500">{rows.length}</span>
      </h4>
      {rows.length === 0 ? <p className="text-[12.5px] text-ink-500">{empty}</p> : (
        <ul className="space-y-1.5">
          {rows.slice(0, MAX_ROWS).map((m, i) => (
            <li key={i} className="text-[12.5px] leading-5">
              <span className={`readout font-semibold ${inbound ? 'text-success-200' : 'text-danger-200'}`}>{sign}{m.amount}</span>{' '}
              <span className="text-ink-200">{m.symbol}</span>
              {m.other.length > 0 && <span className="text-ink-500"> {direction} {m.other.slice(0, 2).map((o, j) => <React.Fragment key={o}>{j > 0 && ', '}<Address value={o} /></React.Fragment>)}{m.other.length > 2 && ` and ${m.other.length - 2} more`}</span>}
              {m.tx && <a href={`https://solscan.io/tx/${m.tx}`} target="_blank" rel="noreferrer" className="ml-1.5 text-ink-500 hover:text-ink-200">{time(m.time) ?? 'tx'}</a>}
            </li>
          ))}
          {rows.length > MAX_ROWS && <li className="text-[12px] text-ink-500">{rows.length - MAX_ROWS} more in the JSON below</li>}
        </ul>
      )}
    </div>
  );
}

// Money in and out of the wallet the answer is about, read from the tool's own balance changes.
export const MoneyFlow: React.FC<{ flow: Flow }> = ({ flow }) => (
  <div className="rounded-xl border border-line bg-panel p-4">
    <p className="text-[12.5px] text-ink-400">Wallet <Address value={flow.wallet} /></p>
    {flow.note && <p className="mb-3 mt-0.5 text-[12px] text-ink-500">{flow.note}</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <Side title="What came in" rows={flow.cameIn} sign="+" direction="from" empty="Nothing came in." />
      <Side title="What went out" rows={flow.wentOut} sign="−" direction="to" empty="Nothing went out." />
    </div>
  </div>
);
