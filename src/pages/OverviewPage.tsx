import React from 'react';
import { ArrowRight, BookOpen, Bot, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from '../router';
import { toolPath } from '../nav';
import { CATEGORY_LABELS, type ToolsIndex } from '../lib/toolsApi';
import { CodeBlock, H2 } from '../components/docs/DocParts';
import { button } from '../components/ui/button';
import { ServiceUsagePanel } from '../components/ServiceUsagePanel';

const HEADLINE = [
  { name: 'preflight_transaction', icon: ShieldAlert, line: 'See exactly what a transaction does to each wallet, and block drainers, before your agent signs.' },
  { name: 'check_transaction_intent', icon: ShieldCheck, line: 'Confirm a transaction sends exactly the token, amount and recipient that was asked for.' },
  { name: 'token_verdict', icon: Sparkles, line: 'SAFE, CAUTION or AVOID for any token, with the on-chain and market reasons.' },
];

export const OverviewPage: React.FC<{ index: ToolsIndex | null }> = ({ index }) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <div className="space-y-14">
      <section className="space-y-6 pt-2">
        <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-ink-300">
          <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success-400" /></span>
          Live on Solana mainnet · {index?.tools.length ?? 15} agent tools · MCP and HTTP
        </p>
        <h1 className="animate-fade-up max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-white [animation-delay:60ms] sm:text-5xl">
          Stop your AI agent from <span className="text-gradient">losing money on Solana.</span>
        </h1>
        <p className="animate-fade-up max-w-2xl text-base leading-7 text-ink-300 [animation-delay:120ms]">
          Solana Pulse is an intelligence layer between Solana and your agent. It checks transactions before signing, confirms they match what was meant, vets tokens, explains failures and converts amounts with real decimals. Open source and free to use: basic tools have no daily limit, every other tool gives 25 free calls a day, and heavier use costs cents in USDC via x402. No account or API key.
        </p>
        <div className="animate-fade-up flex flex-wrap gap-3 [animation-delay:180ms]">
          <Link to="/docs/quickstart" className={button('primary')}>
            <BookOpen className="h-4 w-4" />Quickstart
          </Link>
          <Link to={toolPath('preflight_transaction')} className={button('secondary')}>
            Try a tool live <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/docs/connect" className={button('ghost')}>
            <Bot className="h-4 w-4" />Connect an agent
          </Link>
        </div>
        <div className="max-w-2xl">
          <CodeBlock title="Your first call (free, no key)" code={`curl -X POST '${origin}/api/tools/convert_amount' \\\n  -H 'content-type: application/json' \\\n  -d '{"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"5"}'`} />
        </div>
      </section>

      <section>
        <H2>The checks agents pay for</H2>
        <div className="grid gap-3 md:grid-cols-3">
          {HEADLINE.map(({ name, icon: Icon, line }, i) => {
            const tool = index?.tools.find((t) => t.name === name);
            return (
              <Link key={name} to={toolPath(name)} className="surface group rounded-xl border p-5">
                <Icon className="h-5 w-5 text-accent-300" />
                <p className="mt-3 flex items-center justify-between gap-2 text-sm font-semibold text-white">{tool?.title ?? name}<span className="font-mono text-[11px] font-normal text-ink-500">{tool?.price ?? ''}</span></p>
                <p className="mt-1.5 text-[13px] leading-6 text-ink-400">{line}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs text-accent-300 transition group-hover:gap-2">Docs and live demo <ArrowRight className="h-3 w-3" /></span>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <H2>All tools</H2>
        {!index && <div className="grid gap-2 sm:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>}
        <div className="grid gap-8 md:grid-cols-2">
          {index && (Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map((category) => {
            const tools = index.tools.filter((t) => t.category === category);
            if (!tools.length) return null;
            return (
              <div key={category}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">{CATEGORY_LABELS[category]}</p>
                <ul className="divide-y divide-white/[0.06] rounded-lg border border-white/10">
                  {tools.map((t) => (
                    <li key={t.name}>
                      <Link to={toolPath(t.name)} className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
                        <span className="min-w-0"><span className="block truncate text-sm text-ink-100">{t.title}</span><code className="text-[11px] text-ink-500">{t.name}</code></span>
                        <span className={`shrink-0 font-mono text-[11px] ${t.price ? 'text-ink-400' : 'text-success-400/90'}`}>{t.price ?? 'Free'}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <H2>How a call works</H2>
        <ol className="grid gap-3 md:grid-cols-3">
          {[
            ['Send the inputs', 'POST /api/tools/<name> with JSON, or tools/call over MCP. Every tool page lists its inputs and where to get them.'],
            ['The gateway does the Solana work', 'It reads live chain state, simulates, decodes and cross-checks, so the model never has to guess decimals, addresses or effects.'],
            ['Get a verdict and the facts', 'Structured JSON with a verdict where it matters, the reasons, and a fix. Every field is documented with how it was computed.'],
          ].map(([title, text], i) => (
            <li key={title} className="rounded-xl border border-white/10 p-5">
              <span className="font-mono text-xs text-accent-300">0{i + 1}</span>
              <p className="mt-2 text-sm font-semibold text-white">{title}</p>
              <p className="mt-1.5 text-[13px] leading-6 text-ink-400">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section><ServiceUsagePanel /></section>
    </div>
  );
};
