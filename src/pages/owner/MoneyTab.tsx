import React, { useMemo, useState } from 'react';
import { CircleDollarSign, Users, Wallet } from 'lucide-react';
import type { OwnerOverview, ToolStats } from '../../lib/ownerApi';
import { ago, Asides, byNum, byText, byTime, Card, Empty, Footnote, num, periodLabel, plural, shown, Solscan, type SortOption, Stat, StatRow, Swatch, TableShell, td, usd, useSorted } from './ui';

// Money: what was earned, from whom, per tool (with the parts paid under a tool's old name), and every payment.

export const MoneySummary: React.FC<{ data: OwnerOverview }> = ({ data }) => {
  const r = data.revenue;
  const period = periodLabel(data.days);
  return (
    <Card id="revenue-summary" title="Money at a glance"><StatRow>
      <Stat label={`From others, ${period}`} value={usd(r.fromOthersWindowUsdc)} sub={`${usd(r.windowUsdc)} counting your test payments`} icon={CircleDollarSign} />
      <Stat label="From others, all time" value={usd(r.fromOthersUsdc)} sub={`${usd(r.allTimeUsdc)} in total · ${plural(r.payments, 'payment')}`} icon={Wallet} />
      <Stat label="Last 24 hours" value={usd(r.last24hUsdc)} sub={`${plural(r.paymentsWindow, 'payment')} in ${period}`} icon={CircleDollarSign} />
      <Stat label="Payers besides you" value={num.format(r.otherPayers)} sub={`${plural(r.payers, 'wallet')} ${r.payers === 1 ? 'has' : 'have'} paid`} icon={Users} />
    </StatRow></Card>
  );
};

// "$0.08 as token_safety (4) + $0.08 as token_verdict (5)": shown only when a tool was paid under more than one name.
const NameParts: React.FC<{ tool: ToolStats }> = ({ tool }) => tool.byName.length > 1
  ? <div className="mt-0.5 text-[11.5px] text-ink-500">{tool.byName.map((n, i) => <React.Fragment key={n.name}>
    {i > 0 && ' + '}{usd(n.revenueUsdc)} as <span className="font-mono">{n.name}</span> ({num.format(n.payments)})
  </React.Fragment>)}</div>
  : null;

const EARN_SORTS: SortOption<ToolStats>[] = [
  { label: 'Earned the most', compare: byNum((t) => t.revenueUsdc) },
  { label: 'Most from others', compare: byNum((t) => t.revenueOthersUsdc) },
  { label: 'Most paid calls', compare: byNum((t) => t.payments) },
  { label: 'Name A–Z', compare: byText((t) => t.tool) },
];
const EarnedPerTool: React.FC<{ data: OwnerOverview }> = ({ data }) => {
  const [showAll, setShowAll] = useState(false);
  const earning = useMemo(() => data.tools.filter((t) => t.payments > 0), [data.tools]);
  const unpaid = data.tools.filter((t) => t.known && !t.payments);
  const [rows, sortPicker] = useSorted(showAll ? [...earning, ...unpaid] : earning, EARN_SORTS);
  const period = periodLabel(data.days);
  return (
    <Card id="earned-per-tool" title="Earned per tool" aside={<Asides>{sortPicker}{unpaid.length > 0 && <button onClick={() => setShowAll((s) => !s)} className="text-[11px] text-ink-400 hover:text-white">{showAll ? 'Hide' : 'Show'} {plural(unpaid.length, 'tool')} not paid for yet</button>}</Asides>}>
      {rows.length ? <TableShell head={['Tool', 'Price', 'All time', 'From others', `In ${period}`]} minWidth={640}>
        {rows.map((t) => <tr key={t.tool} className={t.known ? '' : 'opacity-70'}>
          <td className={td}><div className="font-mono text-ink-100">{t.tool}</div><NameParts tool={t} /></td>
          <td className={`${td} tabular-nums`}>{t.price ?? '—'}</td>
          <td className={`${td} tabular-nums`}><div className="text-ink-100">{usd(t.revenueUsdc)}</div><div className="text-[11.5px] text-ink-500">{plural(t.payments, 'payment')}</div></td>
          <td className={`${td} tabular-nums`}><div className="text-ink-100">{usd(t.revenueOthersUsdc)}</div><div className="text-[11.5px] text-ink-500">{plural(t.otherPayers, 'payer')}</div></td>
          <td className={`${td} tabular-nums`}><div className="text-ink-100">{usd(t.revenueWindowUsdc)}</div><div className="text-[11.5px] text-ink-500">{plural(t.paymentsWindow, 'payment')}</div></td>
        </tr>)}
        <tr className="border-t border-white/15 font-semibold">
          <td className={`${td} text-ink-100`}>Total</td><td className={td} />
          <td className={`${td} tabular-nums text-ink-100`}>{usd(data.revenue.allTimeUsdc)}</td>
          <td className={`${td} tabular-nums text-ink-100`}>{usd(data.revenue.fromOthersUsdc)}</td>
          <td className={`${td} tabular-nums text-ink-100`}>{usd(data.revenue.windowUsdc)}</td>
        </tr>
      </TableShell> : <Empty>No payments yet.</Empty>}
      <Footnote>Tools were renamed in October 2026. A tool's total includes payments made under its old name, and the grey line under the name splits it by name, with the number of payments in brackets. Tools priced at $0.02 earn twice as much per paid call.</Footnote>
    </Card>
  );
};

type Payment = OwnerOverview['recentPayments'][number];
type Payer = OwnerOverview['payers'][number];
const PAYMENT_SORTS: SortOption<Payment>[] = [
  { label: 'Newest', compare: byTime((p) => p.at) },
  { label: 'Biggest', compare: byNum((p) => p.amountUsdc) },
  { label: 'Tool A–Z', compare: byText((p) => p.tool) },
  { label: 'Not yours first', compare: byNum((p) => (p.mine ? 0 : 1)) },
];
const PAYER_SORTS: SortOption<Payer>[] = [
  { label: 'Paid the most', compare: byNum((p) => p.usdc) },
  { label: 'Paid most recently', compare: byTime((p) => p.lastAt) },
  { label: 'Most payments', compare: byNum((p) => p.payments) },
];
const Payments: React.FC<{ data: OwnerOverview }> = ({ data }) => {
  const [payments, paymentSort] = useSorted(data.recentPayments, PAYMENT_SORTS);
  const [payers, payerSort] = useSorted(data.payers, PAYER_SORTS);
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
      <Card id="payments" title="Latest payments" aside={data.recentPayments.length > 1 && paymentSort}>
        {data.recentPayments.length ? <TableShell head={['When', 'Tool', 'Amount', 'Payer', 'Called by']} minWidth={620}>
          {payments.map((p) => <tr key={p.txSignature}>
            <td className={`${td} whitespace-nowrap`} title={new Date(p.at).toLocaleString()}><Solscan kind="tx" id={p.txSignature} label={ago(p.at)} /></td>
            <td className={`${td} font-mono`}>{p.tool}</td>
            <td className={`${td} tabular-nums text-ink-100`}>{usd(p.amountUsdc)}</td>
            <td className={td}><Solscan kind="account" id={p.payer} />{p.mine && <span className="ml-1.5 text-[11.5px] text-ink-500">your wallet</span>}</td>
            <td className={td}>{p.caller ? <span className="flex items-center gap-1.5"><Swatch kind={shown(p.caller.kind)} /><span className="text-ink-100">{p.caller.name}</span></span> : <span className="text-ink-500">Before caller tracking</span>}</td>
          </tr>)}
        </TableShell> : <Empty>No payments yet.</Empty>}
        {data.recentPayments.length > 0 && <Footnote>The latest 50 payments. Tools paid under an old name are shown by their current name.</Footnote>}
      </Card>
      <Card id="payers" title={`${plural(data.revenue.payers, 'payer')}`} aside={data.payers.length > 1 && payerSort}>
        <ul className="divide-y divide-white/[0.06] text-[12px]">
          {payers.slice(0, 15).map((p) => <li key={p.payer} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="min-w-0"><Solscan kind="account" id={p.payer} />{p.mine && <span className="ml-1.5 text-[11.5px] text-ink-500">you</span>}
              <span className="block text-[11.5px] text-ink-500">{plural(p.payments, 'payment')} · {plural(p.tools, 'tool name')} · last {ago(p.lastAt)}</span></span>
            <span className="shrink-0 tabular-nums text-ink-100">{usd(p.usdc)}</span>
          </li>)}
          {!data.payers.length && <li className="px-4 py-6 text-ink-500">No payers yet.</li>}
        </ul>
      </Card>
    </div>
  );
};

export const MoneyTab: React.FC<{ data: OwnerOverview }> = ({ data }) => (
  <div className="space-y-4">
    <MoneySummary data={data} />
    <EarnedPerTool data={data} />
    <Payments data={data} />
  </div>
);
