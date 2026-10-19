import React, { useMemo, useState } from 'react';
import type { OwnerOverview } from '../../lib/ownerApi';
import { ago, byNum, byText, byTime, Card, Empty, Footnote, KindChips, OpenRow, SHOWN, shown, type ShownKind, type SortOption, Swatch, TableShell, td, useSorted } from './ui';

// Runs: the latest tool runs, each with what was asked and what the tool answered.

export const OUTCOME: Record<string, string> = { paid: 'Paid', payment_asked: 'Asked to pay', error: 'Error', free_call: 'Free call', owner_key: 'Owner key', ok: 'Ran' };
export type Run = OwnerOverview['recentRuns'][number];
const pretty = (v: unknown) => (v === null || v === undefined ? 'Not saved' : JSON.stringify(v, null, 2));

export const RunDetail: React.FC<{ r: Run }> = ({ r }) => (
  <>
    {r.noteSent && <p className="mb-3 text-[12px] text-ink-300">This answer also carried your note from the developer. The output below is the tool's result, saved before the note was added.</p>}
    <div className="grid gap-4 md:grid-cols-2">
      {([['Input', r.input], ['Output', r.output]] as const).map(([label, value]) => <div key={label} className="min-w-0">
        <p className="mb-1.5 text-[12.5px] font-semibold text-ink-300">{label}</p>
        <pre className="max-h-80 overflow-auto rounded-lg bg-black/30 p-3 font-mono text-[11.5px] leading-5 text-ink-100">{pretty(value)}</pre>
      </div>)}
    </div>
  </>
);

// One run as a table row that opens to its input and output.
export const RunRow: React.FC<{ r: Run }> = ({ r }) => (
  <OpenRow first={<span title={new Date(r.at).toLocaleString()} className="whitespace-nowrap">{ago(r.at)}</span>}
    cells={[
      <td key="tool" className={`${td} font-mono text-ink-100`}>{r.tool}</td>,
      <td key="via" className={`${td} text-[12px]`}>{r.transport.toUpperCase()}</td>,
      <td key="result" className={td}>{OUTCOME[r.outcome] ?? r.outcome}{r.outcome === 'error' ? <span className="font-mono text-ink-500"> {r.status}</span> : null}{r.noteSent ? <span className="text-ink-500"> · note sent</span> : null}</td>,
      <td key="caller" className={td}><span className="flex items-center gap-1.5"><Swatch kind={shown(r.caller.kind)} /><span className="truncate text-ink-100">{r.caller.name}</span></span></td>,
    ]}
    detail={<RunDetail r={r} />} />
);
export const RUN_HEAD = ['When', 'Tool', 'Via', 'Result', 'Caller'];

const RUN_SORTS: SortOption<Run>[] = [
  { label: 'Newest', compare: byTime((r) => r.at) },
  { label: 'Oldest', compare: (a, b) => byTime((r: Run) => r.at)(b, a) },
  { label: 'Tool A–Z', compare: byText((r) => r.tool) },
  { label: 'Caller A–Z', compare: byText((r) => r.caller.name) },
  { label: 'Paid first', compare: byNum((r) => (r.outcome === 'paid' ? 1 : 0)) },
  { label: 'Errors first', compare: byNum((r) => (r.outcome === 'error' ? 1 : 0)) },
  { label: 'Note sent first', compare: byNum((r) => (r.noteSent ? 1 : 0)) },
];
export const RunsTab: React.FC<{ data: OwnerOverview }> = ({ data }) => {
  const [filter, setFilter] = useState<ShownKind | 'all'>('all');
  const present = SHOWN.filter((k) => data.recentRuns.some((r) => shown(r.caller.kind) === k));
  const filtered = useMemo(() => data.recentRuns.filter((r) => filter === 'all' || shown(r.caller.kind) === filter), [data.recentRuns, filter]);
  const [rows, sortPicker] = useSorted(filtered, RUN_SORTS);
  return (
    <Card id="runs" title="Latest tool runs" aside={sortPicker}>
      {present.length > 1 && <KindChips kinds={present.map((k) => ({ kind: k }))} value={filter} onChange={setFilter} />}
      {rows.length ? <TableShell head={RUN_HEAD} minWidth={560}>
        {rows.slice(0, 40).map((r, i) => <RunRow key={`${r.at}-${i}`} r={r} />)}
      </TableShell> : <Empty>No tool runs in this period.</Empty>}
      <Footnote>The latest 40 runs in the selected period. Click a run for its input and output; they are kept for 30 days.</Footnote>
    </Card>
  );
};
