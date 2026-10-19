import React from 'react';
import { Eye, Radio, Users } from 'lucide-react';
import type { OwnerOverview } from '../../lib/ownerApi';
import { ago, Card, Empty, num, periodLabel, Stat, StatRow, TableShell, td, tipHandlers, useTip } from './ui';

// Site visitors: real people's browsers, with bots and your own networks left out.

const VisitorBars: React.FC<{ v: OwnerOverview['visitors'] }> = ({ v }) => {
  const setTip = useTip();
  const max = Math.max(1, ...v.series.map((s) => s.visitors));
  const label = (iso: string) => v.bucket === 'hour'
    ? new Date(iso).toLocaleTimeString([], { hour: 'numeric' })
    : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const ticks = [0, Math.floor((v.series.length - 1) / 2), v.series.length - 1];
  return (
    <div className="px-4 pb-3 pt-4">
      <div className="relative h-36">
        <div aria-hidden className="absolute inset-x-0 top-0 border-t border-dashed border-white/[0.07]" />
        <span aria-hidden className="absolute right-0 top-0 -translate-y-full pb-0.5 text-[11px] tabular-nums text-ink-500">{num.format(max)}</span>
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-white/15">
          {v.series.map((s) => (
            <div key={s.start} className="flex h-full min-w-0 flex-1 items-end"
              {...tipHandlers(setTip, [label(s.start), `${num.format(s.visitors)} visitor${s.visitors === 1 ? '' : 's'}`, `${num.format(s.views)} page view${s.views === 1 ? '' : 's'}`])}>
              <div className="w-full rounded-t-[4px]" style={{ height: s.visitors ? `${Math.max(2, (s.visitors / max) * 100)}%` : 0, background: 'var(--color-kind-bot)' }} />
            </div>
          ))}
        </div>
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] tabular-nums text-ink-500">
        {ticks.filter((t, i, a) => a.indexOf(t) === i).map((t, i) => <span key={t} className="absolute" style={i === 0 ? { left: 0 } : i === ticks.length - 1 ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' }}>{label(v.series[t].start)}</span>)}
      </div>
    </div>
  );
};

const RankList: React.FC<{ rows: { label: string; value: number; sub?: string }[]; empty: string }> = ({ rows, empty }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.length ? <ul className="space-y-2 px-4 py-3 text-[12px]">
    {rows.map((r) => <li key={r.label}>
      <div className="flex items-baseline justify-between gap-3"><span className="truncate text-ink-200">{r.label}</span><span className="shrink-0 font-mono text-ink-400">{num.format(r.value)}{r.sub ? ` · ${r.sub}` : ''}</span></div>
      <div className="mt-1 h-1.5 rounded-[3px]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: 'var(--color-kind-bot)' }} />
    </li>)}
  </ul> : <Empty>{empty}</Empty>;
};

export const VisitorsSummary: React.FC<{ data: OwnerOverview }> = ({ data }) => {
  const v = data.visitors;
  return (
    <Card id="visitor-summary" title="Visitors at a glance"><StatRow>
      <Stat label="On the site now" value={num.format(v.liveNow)} sub={`${num.format(v.last30Minutes)} in the last 30 minutes`} icon={Radio} />
      <Stat label="Visitors, 24 hours" value={num.format(v.visitors24h)} sub={`${num.format(v.views24h)} page views`} icon={Users} />
      <Stat label={`Visitors, ${periodLabel(data.days)}`} value={num.format(v.visitors)} sub={`${num.format(v.views)} page views`} icon={Eye} />
      <Stat label="Phones and computers" value={`${num.format(v.mobile)} / ${num.format(v.desktop)}`} sub={`Left out: ${num.format(v.botViews)} bot, ${num.format(v.ownViews)} yours`} icon={Users} />
    </StatRow></Card>
  );
};

export const VisitorsTab: React.FC<{ data: OwnerOverview }> = ({ data }) => {
  const v = data.visitors;
  return (
    <div className="space-y-4">
      <VisitorsSummary data={data} />
      <Card id="visitors-chart" title={`Visitors per ${v.bucket}, last ${periodLabel(data.days)}`}><VisitorBars v={v} /></Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Card id="top-pages" title="Top pages"><RankList rows={v.pages.map((p) => ({ label: p.path, value: p.views, sub: `${num.format(p.visitors)} ppl` }))} empty="No visits yet." /></Card>
        <Card id="came-from" title="Came from"><RankList rows={v.referrers.map((r) => ({ label: r.host, value: r.views }))} empty="No visits yet." /></Card>
        <Card id="browsers" title="Browsers"><RankList rows={v.devices.map((d) => ({ label: d.name, value: d.visitors }))} empty="No visits yet." /></Card>
      </div>
      <Card id="latest-visits" title="Latest visits">
        {v.recent.length ? <TableShell head={['When', 'Page', 'Came from', 'Browser', 'Visitor']} minWidth={560}>
          {v.recent.slice(0, 15).map((r, i) => <tr key={i}>
            <td className={`${td} whitespace-nowrap`} title={new Date(r.at).toLocaleString()}>{ago(r.at)}</td>
            <td className={`${td} font-mono text-ink-100`}>{r.path}</td>
            <td className={td}>{r.referrer ?? '—'}</td>
            <td className={td}>{r.device}</td>
            <td className={`${td} tabular-nums text-ink-500`}>{r.visitor ?? '—'}</td>
          </tr>)}
        </TableShell> : <Empty>No visits recorded yet.</Empty>}
      </Card>
      <p className="text-[11.5px] leading-4 text-ink-500">A visitor is one network seen running the site in a browser; crawlers that don't run the page's script never count, and bots that do are left out. Your own networks are left out too.</p>
    </div>
  );
};
