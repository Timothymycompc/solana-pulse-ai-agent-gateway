import React, { useEffect, useState } from 'react';
import { H2, P, PageHeader, Table } from '../components/docs/DocParts';

// Solana arbitrage, measured: free, updated every 4 hours from random real mainnet blocks (the arb-study job). The page
// only shows what the job measured; the one estimate (per day) is labeled as one.
type Summary = {
  updated: string; runs: number; days_back: number; blocks: number; transactions: number; arbs: number; arb_share_pct: number | null;
  multi_dex_txs: number; multi_dex_failed: number; fail_pct: number | null; net_usd: number; net_after_failed_usd: number;
  per_block_usd: number | null; daily_estimate_usd: number | null; median_under_1_cent_runs: number; top5_share_pct: number | null;
  routes: [string, number][]; best: { tx: string; net_usd: number; dexes: string[]; time: number | null }[];
  recent: { run_utc: string; blocks: number; arbs: number; net_usd: number; net_after_failed_usd: number; median_usd: number | null; max_usd: number | null; multi_dex_txs: number; multi_dex_failed: number }[];
};

export const ARB_PATH = '/arbitrage';
export const ARB_TITLE = 'Solana arbitrage, measured · Solana Pulse';
export const ARB_DESCRIPTION = 'How much Solana arbitrage bots really make, how often they fail and who takes the profit: measured every 4 hours from random real mainnet blocks. Free.';

const usd = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? 'unknown' : `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const Stat: React.FC<{ big: string; label: string; note?: string }> = ({ big, label, note }) => (
  <div className="rounded-2xl border border-line surface p-5">
    <div className="readout text-[30px] leading-none text-accent-300">{big}</div>
    <div className="mt-2 text-[14.5px] text-ink-200">{label}</div>
    {note && <div className="mt-1 text-[12.5px] text-ink-500">{note}</div>}
  </div>
);

export const ArbitragePage: React.FC = () => {
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/api/research/arbitrage').then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); setS(j); })
      .catch((e) => setErr(String(e?.message ?? e)));
  }, []);
  return (
    <div className="max-w-5xl">
      <PageHeader kicker="Research · free" title="Solana arbitrage, measured"
        lead="How much arbitrage bots really make on Solana, how often they fail, and who takes the profit. Every 4 hours we read 400 random real blocks from the last 7 days and count it. Nothing is guessed; the one estimate is labeled." />
      {err && <p className="rounded-lg border border-danger-400/30 bg-danger-500/10 p-4 text-sm text-danger-100">{err} Unknown until the next update.</p>}
      {!s && !err && <div className="skeleton h-40 rounded-2xl" />}
      {s && s.runs > 0 && (<>
        <p className="mb-6 font-mono text-[12.5px] text-ink-500">Updated {s.updated.replace('T', ' ').replace(/:\d\dZ$/, ' UTC')} · {s.runs} run{s.runs === 1 ? '' : 's'} · {s.blocks.toLocaleString()} random blocks from the last {s.days_back} days · {s.transactions.toLocaleString()} transactions</p>
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat big={`${s.arb_share_pct}%`} label="of all transactions are arbitrage" note={`${s.arbs.toLocaleString()} round trips that ended with a profit`} />
          <Stat big={usd(s.net_after_failed_usd)} label="total profit in these blocks" note={`after fees, Jito tips and the same bots' failed attempts (${usd(s.net_usd)} before failed attempts)`} />
          <Stat big={`${s.fail_pct}%`} label="of multi-exchange transactions fail" note={`${s.multi_dex_failed.toLocaleString()} of ${s.multi_dex_txs.toLocaleString()}: bots fire many attempts, most lose the race`} />
          <Stat big={`${s.top5_share_pct ?? 'unknown'}%`} label="of the profit went to the top 5 bots" />
          <Stat big={`${s.median_under_1_cent_runs} of ${s.runs}`} label="runs where the median arbitrage made under 1 cent" />
          <Stat big={usd(s.daily_estimate_usd, 0)} label="a day for all bots together (estimate)" note={`${usd(s.per_block_usd, 4)} per block × ~400,000 blocks a day; one big trade moves it a lot`} />
        </div>

        <H2 id="best">Best trades seen</H2>
        <Table head={['Profit', 'Exchanges', 'Transaction']} rows={s.best.map((b) => [usd(b.net_usd, 4), b.dexes.join(' + '),
          <a href={`https://solscan.io/tx/${b.tx}`} className="font-mono text-accent-300 hover:text-accent-200" rel="nofollow noopener">{b.tx.slice(0, 10)}…</a>])} />

        <H2 id="routes">Busiest exchange pairs</H2>
        <Table head={['Exchanges', 'Arbitrages']} rows={s.routes.map(([r, c]) => [r, c.toLocaleString()])} />

        <H2 id="runs">Run by run</H2>
        <Table minWidth={640} head={['Run (UTC)', 'Blocks', 'Arbs', 'Profit', 'After failed', 'Median', 'Fail %']} rows={[...s.recent].reverse().map((r) => [
          r.run_utc.slice(0, 16).replace('T', ' '), r.blocks, r.arbs, usd(r.net_usd), usd(r.net_after_failed_usd), r.median_usd === null ? 'none' : usd(r.median_usd, 4),
          r.multi_dex_txs ? `${(100 * r.multi_dex_failed / r.multi_dex_txs).toFixed(1)}%` : 'none'])} />
      </>)}

      <H2 id="how">How it's measured</H2>
      <P>Arbitrage here means a successful transaction through two or more different exchanges (Jupiter's list of exchange programs) where the wallet paying the fee ends with more SOL, USDC or USDT and no other token changed. Fees and Jito tips are added back to get the gross and subtracted for the net. Failed attempts: fees paid on failed multi-exchange transactions by wallets that also landed an arbitrage in the same blocks.</P>
      <P>We checked the rule by hand on the first sample: a looser rule counted liquidity withdrawals and buys paid from a second account as profit ($722 instead of $3.91 on the same 40 blocks). Not counted: arbitrage split across several transactions, profit paid to another wallet, and bots' own costs (servers, data feeds), so real profit is lower than shown. Prices: Jupiter for SOL; USDC and USDT at $1.</P>
    </div>
  );
};
