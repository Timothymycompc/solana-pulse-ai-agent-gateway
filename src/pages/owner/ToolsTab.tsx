import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, Radio, Users } from 'lucide-react';
import type { CallerStats, OwnerOverview, ToolStats } from '../../lib/ownerApi';
import { ago, Asides, byNum, byShownKind, byText, byTime, Card, Empty, Footnote, KindBar, LABEL, Legend, num, OpenRow, periodLabel, plural, shown, type SortOption, Stat, StatRow, Swatch, TableShell, td, usd, useSorted } from './ui';

// Tools: how often each tool ran, over HTTP or MCP, and who ran it; then the numbers the public site shows.

const ToolDetail: React.FC<{ tool: ToolStats; callers: CallerStats[]; days: number }> = ({ tool, callers, days }) => {
  const toolCallers = useMemo(() => callers
    .map((c) => ({ c, runs: c.tools.find((t) => t.tool === tool.tool)?.runs ?? 0 }))
    .filter((x) => x.runs > 0).sort((a, b) => b.runs - a.runs), [callers, tool.tool]);
  return (
    <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
      <dl className="space-y-1 text-[11px]">
        {byShownKind(tool.byKind).map((p) => <div key={p.kind} className="flex items-center justify-between gap-3"><dt className="flex items-center gap-1.5"><Swatch kind={p.kind} />{LABEL[p.kind]}</dt><dd className="tabular-nums text-ink-100">{num.format(p.n)}</dd></div>)}
        <div className="flex justify-between gap-3 border-t border-white/10 pt-1"><dt>Your owner-key calls</dt><dd className="tabular-nums text-ink-100">{num.format(tool.ownerCalls)}</dd></div>
        <div className="flex justify-between gap-3"><dt>HTTP / MCP</dt><dd className="tabular-nums text-ink-100">{num.format(tool.http)} / {num.format(tool.mcp)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Earned, all time</dt><dd className="tabular-nums text-ink-100">{usd(tool.revenueUsdc)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Last run</dt><dd className="tabular-nums text-ink-100">{ago(tool.lastRunAt)}</dd></div>
        {tool.oldName && <div className="flex justify-between gap-3"><dt>Old name</dt><dd className="font-mono text-ink-100">{tool.oldName}</dd></div>}
      </dl>
      <div>
        <p className="mb-1.5 text-[12.5px] font-semibold text-ink-300">Who ran it in the last {periodLabel(days)}</p>
        {toolCallers.length ? <ul className="divide-y divide-white/[0.06] text-[12px]">
          {toolCallers.slice(0, 12).map(({ c, runs }) => <li key={c.id} className="flex items-center justify-between gap-3 py-1.5">
            <span className="flex min-w-0 items-center gap-2"><Swatch kind={shown(c.kind)} /><span className="truncate text-ink-100">{c.name}</span>{c.network && <span className="font-mono text-[11.5px] text-ink-500">net {c.network}</span>}</span>
            <span className="shrink-0 text-[12px] tabular-nums">{plural(runs, 'run')}</span>
          </li>)}
        </ul> : <p className="text-[12px] text-ink-500">Nobody ran this tool in this period.</p>}
      </div>
    </div>
  );
};

const TOOL_SORTS: SortOption<ToolStats>[] = [
  { label: 'Most runs', compare: byNum((t) => t.runs) },
  { label: 'Most callers', compare: byNum((t) => t.callers) },
  { label: 'Most errors', compare: byNum((t) => t.errors) },
  { label: 'Ran most recently', compare: byTime((t) => t.lastRunAt) },
  { label: 'Name A–Z', compare: byText((t) => t.tool) },
];
const RunsPerTool: React.FC<{ data: OwnerOverview }> = ({ data }) => {
  const [showIdle, setShowIdle] = useState(false);
  const max = Math.max(0, ...data.tools.map((t) => t.runs));
  // Unknown names nobody ran in this period (typos and probes from earlier periods) stay hidden with the idle tools.
  const visible = useMemo(() => data.tools.filter((t) => showIdle ? t.known || t.runs > 0 : t.runs > 0), [data.tools, showIdle]);
  const idle = data.tools.filter((t) => t.known && !t.runs).length;
  const [rows, sortPicker] = useSorted(visible, TOOL_SORTS);
  return (
    <Card id="tools" title={`Runs per tool, last ${periodLabel(data.days)}`} aside={<Asides>{sortPicker}{idle > 0 && <button onClick={() => setShowIdle((s) => !s)} className="text-[11px] text-ink-400 hover:text-white">{showIdle ? 'Hide' : 'Show'} {plural(idle, 'tool')} with no runs</button>}</Asides>}>
      <div className="px-4 pt-3"><Legend /></div>
      {rows.length ? <TableShell head={['Tool', 'Runs', 'Who ran it', 'How it went']} minWidth={760}>
        {rows.map((t) => <OpenRow key={t.tool} dim={!t.known}
          first={<><span className="font-mono text-[12px] text-ink-100">{t.tool}</span><span className="block text-[11.5px] text-ink-500">{t.known ? `${t.price ?? 'Free'} a call` : 'Not a tool (typo or probe)'}</span></>}
          cells={[
            <td key="runs" className={`${td} tabular-nums`}><div className="text-ink-100">{num.format(t.runs)}</div><div className="text-[11.5px] text-ink-500">{plural(t.callers, 'caller')}</div></td>,
            <td key="who" className={`${td} w-[40%]`}><KindBar tool={t} max={max} /></td>,
            <td key="how" className={`${td} tabular-nums text-[11px] leading-5`}>
              <div>{num.format(t.paymentsWindow)} paid · {num.format(t.freeCalls)} free</div>
              <div className="text-ink-500">{num.format(t.paymentAsked)} asked to pay{t.errors ? ` · ${plural(t.errors, 'error')}` : ''}</div>
            </td>,
          ]}
          detail={<ToolDetail tool={t} callers={data.callers} days={data.days} />} />)}
      </TableShell> : <Empty>No tool runs in this period.</Empty>}
      <Footnote>"Asked to pay" is a call that got the x402 price instead of running, which is how directory bots check prices. Runs under a tool's old name count toward its current name. Click a tool for who ran it.</Footnote>
    </Card>
  );
};

type PublicUsage = {
  toolRuns24h: number; otherCallers24h: number; otherToolRuns7d: number; otherCallers7d: number; pings24h: number; lastToolRunAt: string | null;
  tools: { endpoint: string; runs: number; otherCallers: number; lastRunAt: string }[]; note: string;
};
type UsageTool = PublicUsage['tools'][number];
const USAGE_SORTS: SortOption<UsageTool>[] = [
  { label: 'Most runs', compare: byNum((t) => t.runs) },
  { label: 'Most callers besides you', compare: byNum((t) => t.otherCallers) },
  { label: 'Ran most recently', compare: byTime((t) => t.lastRunAt) },
  { label: 'Name A–Z', compare: byText((t) => t.endpoint) },
];
const PublicNumbers: React.FC<{ tick: string }> = ({ tick }) => {
  const [usage, setUsage] = useState<PublicUsage | null>(null);
  const [failed, setFailed] = useState(false);
  // Reloads whenever the dashboard does (tick is its generatedAt).
  useEffect(() => {
    let live = true;
    fetch('/api/analytics/usage', { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((u) => { if (live) { setUsage(u); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [tick]);
  const [tools, sortPicker] = useSorted(usage?.tools ?? [], USAGE_SORTS);
  return (
    <Card id="live-usage" title="What the public site shows" aside={usage && usage.tools.length > 1 && sortPicker}>
      {!usage ? <Empty>{failed ? "The public numbers can't be loaded right now." : 'Loading…'}</Empty> : <>
        <StatRow>
          <Stat label="Tool runs, 24 hours" value={num.format(usage.toolRuns24h)} sub={`last run ${ago(usage.lastToolRunAt)}`} icon={Radio} />
          <Stat label="Callers besides you, 24 hours" value={num.format(usage.otherCallers24h)} icon={Users} />
          <Stat label="Runs by others, 7 days" value={num.format(usage.otherToolRuns7d)} sub={`from ${plural(usage.otherCallers7d, 'caller')}`} icon={Users} />
          <Stat label="Uptime pings, 24 hours" value={num.format(usage.pings24h)} sub="mostly directory bots" icon={Eye} />
        </StatRow>
        {tools.length ? <TableShell head={['Tool route', 'Runs, 7 days', 'Callers besides you', 'Last run']} minWidth={520}>
          {tools.map((t) => <tr key={t.endpoint}>
            <td className={`${td} font-mono text-ink-100`}>{t.endpoint}</td>
            <td className={`${td} tabular-nums`}>{num.format(t.runs)}</td>
            <td className={`${td} tabular-nums`}>{num.format(t.otherCallers)}</td>
            <td className={`${td} whitespace-nowrap`} title={new Date(t.lastRunAt).toLocaleString()}>{ago(t.lastRunAt)}</td>
          </tr>)}
        </TableShell> : <Empty>No tool runs in the last 7 days.</Empty>}
        <Footnote>{usage.note} The public page lists the top 12 tool routes; HTTP and MCP are counted separately.</Footnote>
      </>}
    </Card>
  );
};

export const ToolsTab: React.FC<{ data: OwnerOverview }> = ({ data }) => {
  const runs = data.tools.reduce((n, t) => n + t.runs, 0);
  const errors = data.tools.reduce((n, t) => n + t.errors, 0);
  const asked = data.tools.reduce((n, t) => n + t.paymentAsked, 0);
  const free = data.tools.reduce((n, t) => n + t.freeCalls, 0);
  const period = periodLabel(data.days);
  return (
    <div className="space-y-4">
      <Card id="tools-summary" title="Tools at a glance"><StatRow>
        <Stat label={`Tool runs, ${period}`} value={num.format(runs)} sub={`${num.format(runs - data.kinds.you.runs)} not by you`} icon={Radio} />
        <Stat label="Free calls" value={num.format(free)} sub="within the daily free calls" icon={Users} />
        <Stat label="Asked to pay" value={num.format(asked)} sub="got the price instead of a result" icon={Eye} />
        <Stat label="Errors" value={num.format(errors)} sub={runs ? `${Math.round((errors / runs) * 100)}% of runs` : 'no runs'} icon={AlertTriangle} />
      </StatRow></Card>
      <RunsPerTool data={data} />
      <PublicNumbers tick={data.generatedAt} />
    </div>
  );
};
