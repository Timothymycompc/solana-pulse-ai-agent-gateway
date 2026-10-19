import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { OwnerOverview } from '../../lib/ownerApi';
import { ago, Card, Empty, Footnote, num, periodLabel, plural, TableShell, td, usd } from './ui';
import { RUN_HEAD, RunRow } from './RunsTab';
import type { TabId } from './tabs';

// Overview: the few numbers that answer "is anyone using it, and is anyone paying", each linking to its tab.

const Figure: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode }> = ({ label, value, sub }) => (
  <div>
    <div className="text-[12px] text-ink-400">{label}</div>
    <div className="display mt-1 text-[1.5rem] font-bold tabular-nums text-ink-50">{value}</div>
    {sub && <div className="text-[11px] text-ink-500">{sub}</div>}
  </div>
);

const Panel: React.FC<{ title: string; tab: TabId; go: (t: TabId) => void; children: React.ReactNode }> = ({ title, tab, go, children }) => (
  <section className="flex flex-col rounded-xl border border-white/10 p-4 surface">
    <h3 className="mb-3 text-[14px] font-semibold text-ink-100">{title}</h3>
    <div className="grid flex-1 grid-cols-2 gap-4">{children}</div>
    <button onClick={() => go(tab)} className="mt-4 inline-flex items-center gap-1 self-start text-[12px] text-accent-300 hover:text-accent-200">More on {title.toLowerCase()}<ArrowRight className="h-3 w-3" /></button>
  </section>
);

export const OverviewTab: React.FC<{ data: OwnerOverview; go: (t: TabId) => void }> = ({ data, go }) => {
  const r = data.revenue, v = data.visitors, period = periodLabel(data.days);
  const runs = data.tools.reduce((n, t) => n + t.runs, 0);
  const othersRuns = runs - data.kinds.you.runs - data.kinds.bot.runs;
  const othersCallers = data.callerCount - data.kinds.you.callers - data.kinds.bot.callers;
  const top = data.tools.filter((t) => t.runs > 0).sort((a, b) => b.runs - a.runs)[0];
  const lastPaid = data.recentPayments[0];
  // Runs by anyone who is neither you nor a directory or uptime bot: the ones worth reading.
  const outside = data.recentRuns.filter((x) => x.caller.kind !== 'you' && x.caller.kind !== 'bot');
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Money" tab="money" go={go}>
          <Figure label={`From others, ${period}`} value={usd(r.fromOthersWindowUsdc)} sub={`${usd(r.windowUsdc)} with your tests`} />
          <Figure label="From others, all time" value={usd(r.fromOthersUsdc)} sub={`${usd(r.allTimeUsdc)} in total`} />
          <Figure label="Payers besides you" value={num.format(r.otherPayers)} />
          <Figure label="Last payment" value={lastPaid ? ago(lastPaid.at) : '—'} sub={lastPaid ? `${usd(lastPaid.amountUsdc)} for ${lastPaid.tool}${lastPaid.mine ? ', yours' : ''}` : 'none yet'} />
        </Panel>
        <Panel title="Tools" tab="tools" go={go}>
          <Figure label={`Tool runs, ${period}`} value={num.format(runs)} sub={`${num.format(data.kinds.bot.runs)} by bots, ${num.format(data.kinds.you.runs)} by you`} />
          <Figure label="Runs by everyone else" value={num.format(othersRuns)} sub={plural(othersCallers, 'caller')} />
          <Figure label="Busiest tool" value={top ? <span className="font-mono text-[1.05rem]">{top.tool}</span> : '—'} sub={top ? plural(top.runs, 'run') : 'no runs'} />
          <Figure label="Callers" value={num.format(data.callerCount)} sub={`${num.format(data.kinds.bot.callers)} are bots`} />
        </Panel>
        <Panel title="Visitors" tab="visitors" go={go}>
          <Figure label="On the site now" value={num.format(v.liveNow)} sub={`${num.format(v.last30Minutes)} in 30 minutes`} />
          <Figure label="Last 24 hours" value={num.format(v.visitors24h)} sub={plural(v.views24h, 'page view')} />
          <Figure label={`Last ${period}`} value={num.format(v.visitors)} sub={plural(v.views, 'page view')} />
          <Figure label="Top page" value={v.pages[0] ? <span className="font-mono text-[1.05rem]">{v.pages[0].path}</span> : '—'} sub={v.pages[0] ? plural(v.pages[0].views, 'view') : 'no visits'} />
        </Panel>
      </div>
      <Card id="overview-outside" title="Latest runs by someone other than you or a bot">
        {outside.length ? <TableShell head={RUN_HEAD} minWidth={560}>
          {outside.slice(0, 10).map((x, i) => <RunRow key={`${x.at}-${i}`} r={x} />)}
        </TableShell> : <Empty>None among the latest {plural(data.recentRuns.length, 'run')} in this period.</Empty>}
        <Footnote>Picked from the latest {plural(data.recentRuns.length, 'run')}; the Runs tab has all of them, and Callers has everyone who called.</Footnote>
      </Card>
    </div>
  );
};
