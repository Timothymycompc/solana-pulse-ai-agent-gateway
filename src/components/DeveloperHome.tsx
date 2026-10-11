import React from 'react';
import { ArrowDown, Bot, Check, Copy, ExternalLink, Terminal } from 'lucide-react';

const exampleMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

interface DeveloperHomeProps {
  onTryApi: () => void;
  onOpenMcp: () => void;
}

export const DeveloperHome: React.FC<DeveloperHomeProps> = ({ onTryApi, onOpenMcp }) => {
  const [copied, setCopied] = React.useState(false);
  const curl = `curl -X POST '${window.location.origin}/api/tools/convert_amount' \\
  -H 'content-type: application/json' \\
  -d '{"mint":"${exampleMint}","amount":"5"}'`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(curl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  };

  return (
    <section className="glass gradient-border mb-8 overflow-hidden rounded-3xl border">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:p-10">
        <div>
          <div className="animate-fade-up mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-400/10 px-3 py-1.5 text-xs font-medium text-indigo-100">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span> Live on Solana mainnet · 15 agent tools
          </div>
          <h1 className="animate-fade-up max-w-2xl text-3xl font-bold tracking-tight text-white [animation-delay:80ms] sm:text-4xl lg:text-[2.9rem] lg:leading-[1.1]">
            Stop your AI agent from <span className="text-gradient">losing money on Solana.</span>
          </h1>
          <p className="animate-fade-up mt-4 max-w-xl text-sm leading-6 text-slate-200 [animation-delay:160ms] sm:text-base sm:leading-7">
            An intelligence layer between Solana and your agent: check transactions before signing, confirm they match what you meant, vet tokens and explain failures. Over HTTP or MCP. Basic tools are free; paid tools have 3 free calls, then cost cents in USDC via x402. No account or API key.
          </p>
          <div className="animate-fade-up mt-6 flex flex-wrap gap-3 [animation-delay:240ms]">
            <button onClick={onTryApi} className="bg-accent-gradient group inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:brightness-110 active:scale-[0.98]">
              <Terminal className="h-4 w-4" /> Open playground <ArrowDown className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-0.5" />
            </button>
            <button onClick={onOpenMcp} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-white/30 hover:bg-white/10 active:scale-[0.98]">
              <Bot className="h-4 w-4" /> Explore MCP tools
            </button>
          </div>
          <div className="animate-fade-up mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4 text-xs text-slate-300 [animation-delay:320ms]">
            <span><strong className="text-white">3</strong> free calls per tool</span>
            <span><strong className="text-white">$0.001–$0.01</strong> USDC per paid call</span>
            <a href="/llms.txt" className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200">LLM guide <ExternalLink className="h-3 w-3" /></a>
          </div>
        </div>

        <div className="animate-scale-in min-w-0 rounded-2xl border border-white/10 glass-inset p-4 shadow-2xl shadow-indigo-950/40 [animation-delay:200ms] sm:p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <p className="text-xs font-semibold text-white">First live request</p>
              <p className="mt-1 text-[11px] text-slate-400">A free tool · no key, no sign-up.</p>
            </div>
            <button onClick={() => void copy()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-2 text-[11px] text-slate-300 hover:border-slate-500 hover:text-white" aria-label="Copy cURL example">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-6 text-emerald-200 sm:text-xs">{curl}<span aria-hidden className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-emerald-300/80" /></pre>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
            <span className="text-[11px] text-slate-400">Streamable HTTP · <code className="text-slate-300">/mcp</code></span>
            <a href="/.well-known/mcp.json" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200">Tool manifest <ExternalLink className="h-3 w-3" /></a>
          </div>
        </div>
      </div>
    </section>
  );
};
