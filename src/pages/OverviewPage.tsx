import React from 'react';
import { Link } from '../router';
import { toolPath } from '../nav';
import { CATEGORY_LABELS, type ToolsIndex } from '../lib/toolsApi';
import { CodeBlock } from '../components/docs/DocParts';
import { button } from '../components/ui/button';
import { CheckLine, Stamp } from '../components/ui/verdict';
import { ServiceUsagePanel } from '../components/ServiceUsagePanel';

// The three checks an agent should run before money moves, with the verdicts each one can return.
const SAFETY_CHECKS = [
  { name: 'token_verdict', question: 'Is this token safe to buy or accept?', verdicts: ['SAFE', 'CAUTION', 'AVOID'] },
  { name: 'check_transaction_intent', question: 'Does it do exactly what was asked, and nothing else?', verdicts: ['MATCH', 'MISMATCH'] },
  { name: 'preflight_transaction', question: 'What will this transaction do to each wallet?', verdicts: ['OK', 'REVIEW', 'BLOCK'] },
];

// A real preflight_transaction result from Solana mainnet (12 October 2026), the same one the tool video shows.
// On load the checks come in one by one and the verdict lands last; with reduced motion it is all there at once.
const reveal = (ms: number): React.CSSProperties => ({ animation: `fade-up var(--duration-slow) var(--ease-out-soft) ${ms}ms both` });
const PreflightReport: React.FC = () => (
  <figure className="overflow-hidden rounded-2xl border border-line surface shadow-[0_30px_80px_-40px_rgb(0_0_0/0.9)]">
    <div className="bg-code px-5 py-4 font-mono text-[13px] leading-6">
      <div className="text-ink-50">POST /api/tools/preflight_transaction</div>
      <div className="truncate text-ink-500">{'{ "transaction": "AQAAAA…" }'}  <span className="text-ink-600">unsigned, base64</span></div>
    </div>
    <div className="px-5 pb-6 pt-5">
      <Stamp verdict="BLOCK" size="lg" style={{ animation: 'stamp 560ms var(--ease-out-soft) 1500ms both' }} />
      <ul className="mt-5 space-y-3.5 text-[15px] leading-[1.55] text-ink-300">
        <CheckLine status="pass" title="Simulation" style={reveal(250)}>dry run succeeded on live mainnet.</CheckLine>
        <CheckLine status="warn" title="Blockhash" style={reveal(600)}>expired. Rebuild with a fresh one before signing.</CheckLine>
        <CheckLine status="fail" title="Token approval" style={reveal(950)}>
          <span className="font-mono text-[13px] text-ink-100">9WzD…AWWM</span> can move up to 1,000,000,000,000 base units from your token account, at any time.
        </CheckLine>
      </ul>
      <p className="mt-5 text-[14px] text-ink-400" style={reveal(1200)}>This is the most common wallet-drainer pattern.</p>
    </div>
    <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-[13px] text-ink-500">
      <span>A real check on Solana mainnet, 12 October 2026</span>
      <Link to={toolPath('preflight_transaction')} className="text-accent-300 hover:text-accent-200">Run it yourself</Link>
    </figcaption>
  </figure>
);

const SectionTitle: React.FC<{ children: React.ReactNode; lead?: React.ReactNode }> = ({ children, lead }) => (
  <div className="mb-6 max-w-[62ch]">
    <h2 className="display text-[1.9rem] font-bold sm:text-[2.2rem]">{children}</h2>
    {lead && <p className="mt-2 text-[15px] leading-[1.7] text-ink-400">{lead}</p>}
  </div>
);

export const OverviewPage: React.FC<{ index: ToolsIndex | null }> = ({ index }) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const priceOf = (name: string) => index?.tools.find((t) => t.name === name)?.price ?? '$0.02';
  return (
    <div className="space-y-24">
      <section className="grid items-center gap-12 pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,29rem)] lg:pt-8">
        <div>
          <h1 className="display text-[3.1rem] leading-[0.98] sm:text-[4.4rem]">Check before your agent signs.</h1>
          <p className="mt-6 max-w-[34rem] text-[18px] leading-[1.6] text-ink-300">
            Solana Pulse reads a transaction the way a careful person would. It simulates it on mainnet, compares it with what was asked for and checks the tokens involved, so your agent gets a verdict and the reasons before any money moves.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/docs/connect" className={button('primary')}>Connect an agent</Link>
            <Link to="/docs/quickstart" className={button('secondary')}>Make a first call</Link>
          </div>
          <p className="mt-6 max-w-[34rem] text-[14px] leading-[1.6] text-ink-500">
            Works over MCP and plain HTTP. Every tool gives 25 free calls a day, then costs one or two cents a call in USDC through x402. No account or API key.
          </p>
        </div>
        <PreflightReport />
      </section>

      <section>
        <SectionTitle lead="Run them in this order: vet the token, build the transaction, confirm it matches the request, then check what it does before signing.">Three checks before money moves</SectionTitle>
        <ul className="overflow-hidden rounded-2xl border border-line surface">
          {SAFETY_CHECKS.map((c) => (
            <li key={c.name} className="border-t border-line first:border-t-0">
              <Link to={toolPath(c.name)} className="group grid gap-3 px-5 py-5 transition-colors hover:bg-white/[0.02] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-6">
                <span className="min-w-0">
                  <span className="block font-mono text-[13px] text-accent-300">{c.name}</span>
                  <span className="mt-1 block text-[19px] font-semibold tracking-[-0.015em] text-ink-50 group-hover:underline group-hover:decoration-ink-600 group-hover:underline-offset-4">{c.question}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {c.verdicts.map((v) => <Stamp key={v} verdict={v} size="sm" />)}
                  <span className="ml-2 text-[13px] tabular-nums text-ink-500">{priceOf(c.name)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle lead="Each tool page documents every input and returned field, and runs the tool live on mainnet data.">Every tool</SectionTitle>
        {!index && <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-40 rounded-xl" />)}</div>}
        <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {index && (Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map((category) => {
            const tools = index.tools.filter((t) => t.category === category);
            if (!tools.length) return null;
            return (
              <div key={category}>
                <h3 className="mb-2 text-[15px] font-semibold text-ink-200">{CATEGORY_LABELS[category]}</h3>
                <ul className="border-t border-line">
                  {tools.map((t) => (
                    <li key={t.name} className="border-b border-line">
                      <Link to={toolPath(t.name)} className="group flex items-baseline justify-between gap-4 py-2.5">
                        <span className="min-w-0">
                          <span className="text-[15px] text-ink-100 group-hover:text-white">{t.title}</span>
                          <code className="ml-2 hidden font-mono text-[12px] text-ink-500 sm:inline">{t.name}</code>
                        </span>
                        <span className="shrink-0 text-[13px] tabular-nums text-ink-500">{t.price ?? 'Free'}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <SectionTitle lead="Converts 5 USDC into the exact base units a transfer needs, with the decimals read from the chain.">Your first call</SectionTitle>
          <CodeBlock title="Terminal" code={`curl -X POST '${origin}/api/tools/convert_amount' \\\n  -H 'content-type: application/json' \\\n  -d '{"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"5"}'`} />
        </div>
        <div className="min-w-0">
          <SectionTitle>When the free calls run out</SectionTitle>
          <p className="max-w-[58ch] text-[15px] leading-[1.7] text-ink-300">
            The tool answers <span className="font-mono text-[13px] text-ink-100">402 Payment Required</span> with its price. An agent with an x402 client pays from its Solana wallet and retries, all within the same request. Calls that fail are never charged, and network fees are covered.
          </p>
          <Link to="/docs/pricing" className="mt-4 inline-block text-[15px] text-accent-300 underline decoration-accent-300/30 underline-offset-4 hover:decoration-accent-300">See prices and payment setup</Link>
        </div>
      </section>

      <section><ServiceUsagePanel /></section>
    </div>
  );
};
