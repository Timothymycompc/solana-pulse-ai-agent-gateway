import React, { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { stopOutreach, type CallerStats, type OwnerOverview } from '../../lib/ownerApi';
import { ago, byNum, byText, byTime, Card, Empty, Footnote, KindChips, KindTag, num, OpenRow, SHOWN, shown, type ShownKind, type SortOption, TableShell, td, usd, useSorted } from './ui';

// Callers: everyone who called the API (bots, AI apps, scripts, people), and the people you sent a personal note.

const CALLER_SORTS: SortOption<CallerStats>[] = [
  { label: 'Most tool runs', compare: byNum((c) => c.runs) },
  { label: 'Seen most recently', compare: byTime((c) => c.lastSeen) },
  { label: 'First seen, newest', compare: byTime((c) => c.firstSeen) },
  { label: 'Paid the most', compare: byNum((c) => c.paidUsdc) },
  { label: 'Most other requests', compare: byNum((c) => c.pings + c.reads) },
  { label: 'Most errors', compare: byNum((c) => c.errors) },
  { label: 'Name A–Z', compare: byText((c) => c.name) },
];
const Callers: React.FC<{ data: OwnerOverview }> = ({ data }) => {
  const [filter, setFilter] = useState<ShownKind | 'all'>('all');
  const counts = SHOWN.map((k) => {
    const callers = k === 'other' ? data.kinds.other.callers + data.kinds.unknown.callers : data.kinds[k].callers;
    const runs = k === 'other' ? data.kinds.other.runs + data.kinds.unknown.runs : data.kinds[k].runs;
    return { kind: k, note: `${num.format(callers)} · ${num.format(runs)} runs` };
  });
  const filtered = useMemo(() => data.callers.filter((c) => filter === 'all' || shown(c.kind) === filter), [data.callers, filter]);
  const [rows, sortPicker] = useSorted(filtered, CALLER_SORTS);
  return (
    <Card id="callers" title={`${num.format(data.callerCount)} callers`} aside={sortPicker}>
      <KindChips kinds={counts} value={filter} onChange={setFilter} />
      <TableShell head={['Caller', 'Kind', 'Tool runs', 'Other requests', 'Paid', 'Most used', 'Last seen']} minWidth={860}>
        {rows.slice(0, 80).map((c) => <OpenRow key={c.id}
          first={<><span className="flex items-center gap-1.5 text-ink-100"><span className="max-w-[14rem] truncate">{c.name}</span>
            {c.homepage && <a href={c.homepage} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`${c.name} homepage`} className="text-ink-500 hover:text-accent-300"><ExternalLink className="h-3 w-3" /></a>}</span>
            <span className="block text-[11.5px] text-ink-500">{c.network ? `network ${c.network}` : 'many networks'}</span></>}
          cells={[
            <td key="kind" className={td}><KindTag kind={c.kind} /></td>,
            <td key="runs" className={`${td} tabular-nums text-ink-100`}>{num.format(c.runs)}{c.errors ? <span className="text-ink-500"> · {num.format(c.errors)} err</span> : null}</td>,
            <td key="other" className={`${td} tabular-nums`}>{num.format(c.pings + c.reads)}</td>,
            <td key="paid" className={`${td} tabular-nums`}>{c.paidCalls ? `${usd(c.paidUsdc)} · ${num.format(c.paidCalls)}` : '—'}</td>,
            <td key="used" className={`${td} font-mono text-[11px]`}>{c.tools.slice(0, 2).map((t) => `${t.tool} ${t.runs}`).join(', ') || '—'}</td>,
            <td key="seen" className={`${td} whitespace-nowrap`}>{ago(c.lastSeen)}</td>,
          ]}
          detail={<div className="space-y-1 text-[11px]">
            <div><span className="text-ink-500">User agent: </span><code className="break-all font-mono text-ink-200">{c.userAgent || 'none sent'}</code></div>
            {c.mcpClient && <div><span className="text-ink-500">MCP client name: </span><code className="font-mono text-ink-200">{c.mcpClient}</code></div>}
            <div><span className="text-ink-500">First seen </span>{new Date(c.firstSeen).toLocaleString()} · <span className="text-ink-500">MCP pings </span>{num.format(c.pings)} · <span className="text-ink-500">other reads </span>{num.format(c.reads)}</div>
            {c.tools.length > 0 && <div><span className="text-ink-500">Tools: </span><span className="font-mono">{c.tools.map((t) => `${t.tool} ${t.runs}`).join(' · ')}</span></div>}
          </div>} />)}
      </TableShell>
      <Footnote>A caller is a network plus the client it says it is; bots are grouped by name across all the networks they probe from. "You" is any network this dashboard was opened from, or a call made with the owner key. Networks are shown as the first characters of a keyed hash, never the IP address.</Footnote>
    </Card>
  );
};

// Callers who looked like a real developer or AI app, and got a note from you in their answers.
const Outreach: React.FC<{ data: OwnerOverview; ownerKey: string; onChange: () => void }> = ({ data, ownerKey, onChange }) => {
  const [busy, setBusy] = useState('');
  const stop = async (outreachKey: string) => {
    setBusy(outreachKey);
    try { await stopOutreach(ownerKey, outreachKey); onChange(); } catch { /* the list refreshes and still shows it as active */ } finally { setBusy(''); }
  };
  return (
    <Card id="outreach" title="People you've reached out to" aside={<span className="text-[12px] text-ink-500">A note from you rides along in their answers for 14 days</span>}>
      {data.outreach?.length ? <TableShell head={['Who', 'Used', 'Note sent', 'Note']} minWidth={600}>
        {data.outreach.map((o) => <tr key={o.key}>
          <td className={td}><div className="text-ink-100">{o.name}</div><div className="font-mono text-[11.5px] text-ink-500">{o.userAgent}</div></td>
          <td className={`${td} text-[12px]`}>{o.tools}<div className="text-ink-500">{o.runs} calls that week</div></td>
          <td className={`${td} whitespace-nowrap`} title={new Date(o.since).toLocaleString()}>{ago(o.since)}</td>
          <td className={`${td} whitespace-nowrap`}>
            {o.active
              ? <><div>Showing until {new Date(o.until).toLocaleDateString()}</div><button onClick={() => void stop(o.key)} disabled={busy === o.key} className="mt-1 text-[12px] text-accent-300 hover:text-accent-200 disabled:opacity-50">{busy === o.key ? 'Stopping…' : 'Stop note'}</button></>
              : <span className="text-ink-500">Stopped</span>}
          </td>
        </tr>)}
      </TableShell> : <Empty>Nobody yet. When a caller uses the tools like a real developer or AI app (not a directory bot), a personal note is added to their answers and you get an email.</Empty>}
    </Card>
  );
};

export const CallersTab: React.FC<{ data: OwnerOverview; ownerKey: string; onChange: () => void }> = ({ data, ownerKey, onChange }) => (
  <div className="space-y-4">
    <Callers data={data} />
    <Outreach data={data} ownerKey={ownerKey} onChange={onChange} />
  </div>
);
