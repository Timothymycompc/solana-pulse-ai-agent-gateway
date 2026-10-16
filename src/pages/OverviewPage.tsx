import React from 'react';
import { Link } from '../router';
import { CATEGORY_ORDER, SAFETY_CHECKS, siteOrigin, toolPath } from '../nav';
import { CATEGORY_LABELS, type ToolsIndex } from '../lib/toolsApi';
import { CodeBlock } from '../components/docs/DocParts';
import { button } from '../components/ui/button';
import { CheckLine, Stamp } from '../components/ui/verdict';
import { ServiceUsagePanel } from '../components/ServiceUsagePanel';

// A real check_tx result from Solana mainnet (12 October 2026), the same one the tool video shows, set in the
// instrument case. On load the checks come in one by one and the verdict lands last: the page's one moment of
// motion. With reduced motion it is all there at once.
const reveal = (ms: number): React.CSSProperties => ({ animation: `fade-up var(--duration-slow) var(--ease-out-soft) ${ms}ms both` });
const PreflightReport: React.FC = () => (
  <figure className="instrument-case">
    <div className="instrument-face">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-code/80 px-5 py-3.5">
        <div className="min-w-0 font-mono text-[12.5px] leading-6">
          <div className="text-ink-50">POST /api/tools/check_tx</div>
          <div className="truncate text-ink-500">{'{ "tx": "AQAAAA…" }'}</div>
        </div>
        <span className="readout shrink-0 text-[13px] text-ink-500">unsigned, base64</span>
      </div>
      <div className="px-5 pb-6 pt-6">
        <div className="flex items-center justify-between gap-4">
          <Stamp verdict="BLOCK" size="lg" style={{ animation: 'stamp 560ms var(--ease-out-soft) 1500ms both' }} />
          <span className="readout text-[13px] text-ink-500" style={reveal(1500)}>3 checks, 1 failed</span>
        </div>
        <ul className="mt-6 space-y-4 text-[15px] leading-[1.55] text-ink-300">
          <CheckLine status="pass" title="Simulation" style={reveal(250)}>dry run succeeded on live mainnet.</CheckLine>
          <CheckLine status="warn" title="Blockhash" style={reveal(600)}>expired. Rebuild with a fresh one before signing.</CheckLine>
          <CheckLine status="fail" title="Token approval" style={reveal(950)}>
            <span className="font-mono text-[13px] text-ink-100">9WzD…AWWM</span> can move up to 1,000,000,000,000 base units from your token account, at any time.
          </CheckLine>
        </ul>
        <p className="mt-6 border-l-2 border-danger-400/60 pl-3 text-[14px] text-ink-300" style={reveal(1200)}>This is the most common wallet-drainer pattern.</p>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-[13px] text-ink-500">
        <span>A real check on Solana mainnet, 12 October 2026</span>
        <Link to={toolPath('check_tx')} className="font-medium text-accent-300 hover:text-accent-200">Run it yourself</Link>
      </figcaption>
    </div>
  </figure>
);

const SectionTitle: React.FC<{ children: React.ReactNode; lead?: React.ReactNode }> = ({ children, lead }) => (
  <div className="mb-8 max-w-[60ch]">
    <h2 className="display text-[1.85rem] sm:text-[2.35rem]">{children}</h2>
    {lead && <p className="mt-3 text-[16px] leading-[1.65] text-ink-400">{lead}</p>}
  </div>
);

// The order an agent works in: two checks, its own step, the last check, then the signature.
const Pipeline: React.FC<{ priceOf: (name: string) => string }> = ({ priceOf }) => {
  const [token, matches, check] = SAFETY_CHECKS;
  const steps = [
    { kind: 'check' as const, ...token },
    { kind: 'agent' as const, name: 'Your agent', question: 'Builds the transaction, unsigned.' },
    { kind: 'check' as const, ...matches },
    { kind: 'check' as const, ...check },
  ];
  return (
    <ol className="relative grid gap-4 md:grid-cols-4 md:gap-0">
      <span aria-hidden className="absolute left-[1.15rem] top-6 bottom-6 w-px bg-gradient-to-b from-accent-500/70 via-accent-500/40 to-success-400/60 md:inset-x-[12.5%] md:bottom-auto md:left-[12.5%] md:top-[1.15rem] md:h-px md:w-auto md:bg-gradient-to-r" />
      {steps.map((s, i) => (
        <li key={s.name} className="relative grid grid-cols-[2.3rem_minmax(0,1fr)] gap-x-4 md:block md:px-3 md:text-center">
          <span className={`relative z-10 grid h-[2.3rem] w-[2.3rem] place-items-center rounded-full border readout text-[15px] md:mx-auto ${s.kind === 'agent' ? 'border-dashed border-ink-600 bg-ink-950 text-ink-400' : 'border-accent-400/70 bg-ink-950 text-accent-300 shadow-[0_0_0_4px_var(--color-ink-950),0_0_24px_-4px_rgb(207_171_102/0.45)]'}`}>{i + 1}</span>
          {s.kind === 'agent' ? (
            <div className="pb-2 md:mt-5">
              <p className="text-[15px] font-semibold text-ink-300">{s.name}</p>
              <p className="mt-1 text-[14px] leading-snug text-ink-500">{s.question}</p>
            </div>
          ) : (
            <Link to={toolPath(s.name)} className="group block rounded-2xl pb-2 md:mt-5 md:px-2">
              <span className="font-mono text-[13px] text-accent-300">{s.name}</span>
              <span className="mt-1 block text-[16px] font-semibold leading-snug text-ink-50 group-hover:text-white">{s.question}</span>
              <span className="mt-3 flex flex-wrap items-center gap-1.5 md:justify-center">
                {s.verdicts.map((v) => <Stamp key={v} verdict={v} size="sm" />)}
                <span className="readout ml-1 text-[13px] text-ink-500">{priceOf(s.name)}</span>
              </span>
            </Link>
          )}
        </li>
      ))}
    </ol>
  );
};

export const OverviewPage: React.FC<{ index: ToolsIndex | null }> = ({ index }) => {
  const origin = siteOrigin();
  const priceOf = (name: string) => index?.tools.find((t) => t.name === name)?.price ?? '$0.02';
  return (
    <div className="space-y-28">
      <section className="grid items-center gap-14 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,31rem)] lg:pt-10">
        <div>
          <h1 className="display text-[2.6rem] sm:text-[3.9rem] xl:text-[4.25rem]">Check before your agent signs.</h1>
          <p className="mt-7 max-w-[36rem] text-[18px] leading-[1.6] text-ink-300">
            Solana Pulse reads a transaction the way a careful person would. It simulates it on mainnet, compares it with what was asked for and checks the tokens involved, so your agent gets a verdict and the reasons before any money moves.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/docs/connect" className={button('primary')}>Connect an agent</Link>
            <Link to="/toolbox" className={button('secondary')}>Open the toolbox</Link>
          </div>
          <p className="mt-7 max-w-[36rem] text-[14px] leading-[1.6] text-ink-500">
            Works over MCP and plain HTTP. Every tool gives 25 free calls a day, then costs one or two cents a call in USDC through x402. No account or API key.
          </p>
        </div>
        <PreflightReport />
      </section>

      <section>
        <SectionTitle lead="Vet the token, let your agent build the transaction, confirm it matches the request, then check what it does. Sign only when all three agree.">Three checks before money moves</SectionTitle>
        <div className="rounded-3xl border border-line surface px-5 py-8 sm:px-8">
          <Pipeline priceOf={priceOf} />
        </div>
      </section>

      <section>
        <SectionTitle lead="Each tool page documents every input and returned field, and runs the tool live on mainnet data.">Every tool</SectionTitle>
        {!index && <div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}</div>}
        {index && (
          <div className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORY_ORDER.map((category) => {
              const tools = index.tools.filter((t) => t.category === category);
              if (!tools.length) return null;
              return (
                <div key={category} className="bg-panel p-5">
                  <h3 className="mb-3 text-[13px] font-semibold text-tan-400">{CATEGORY_LABELS[category]}</h3>
                  <ul className="space-y-0.5">
                    {tools.map((t) => (
                      <li key={t.name}>
                        <Link to={toolPath(t.name)} className="group -mx-2 flex items-baseline justify-between gap-4 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
                          <span className="min-w-0">
                            <span className="block text-[15px] text-ink-100 group-hover:text-white">{t.title}</span>
                            <code className="block font-mono text-[12px] text-ink-500">{t.name}</code>
                          </span>
                          <span className="readout shrink-0 text-[14px] text-ink-500">{t.price ?? 'Free'}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <Link to="/toolbox" className="group flex flex-col justify-end gap-2 bg-wood-950/80 p-5 transition-colors hover:bg-wood-900/80">
              <span className="text-[13px] font-semibold text-tan-400">Toolbox</span>
              <span className="text-[17px] font-semibold leading-snug text-tan-200 group-hover:text-gold-200">Run any of them on mainnet, change any input, and replay your calls.</span>
            </Link>
          </div>
        )}
      </section>

      <section className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <SectionTitle lead="Converts 5 USDC into the exact raw units a transfer needs, with the decimals read from the chain.">Your first call</SectionTitle>
          <CodeBlock title="Terminal" code={`curl -X POST '${origin}/api/tools/convert' \\\n  -H 'content-type: application/json' \\\n  -d '{"token":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"5"}'`} />
        </div>
        <div className="min-w-0">
          <SectionTitle>When the free calls run out</SectionTitle>
          <p className="max-w-[58ch] text-[16px] leading-[1.7] text-ink-300">
            The tool answers <span className="font-mono text-[14px] text-ink-100">402 Payment Required</span> with its price. An agent with an x402 client pays from its Solana wallet and retries, all within the same request. Calls that fail are never charged, and network fees are covered.
          </p>
          <Link to="/docs/pricing" className="mt-5 inline-block text-[15px] font-medium text-accent-300 underline decoration-accent-300/30 underline-offset-4 hover:decoration-accent-300">See prices and payment setup</Link>
        </div>
      </section>

      <section><ServiceUsagePanel /></section>
    </div>
  );
};
