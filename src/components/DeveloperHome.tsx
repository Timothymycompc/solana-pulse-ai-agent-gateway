import React from 'react';
import { ArrowDown, Bot, Check, Copy, ExternalLink, Terminal } from 'lucide-react';

const exampleWallet = 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU';

interface DeveloperHomeProps {
  onTryApi: () => void;
  onOpenMcp: () => void;
}

export const DeveloperHome: React.FC<DeveloperHomeProps> = ({ onTryApi, onOpenMcp }) => {
  const [copied, setCopied] = React.useState(false);
  const curl = `curl -b pulse-trial-cookies.txt -c pulse-trial-cookies.txt '${window.location.origin}/api/solana/balance?wallet=${exampleWallet}&network=mainnet-beta'`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(curl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  };

  return (
    <section className="mb-7 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:p-10">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1.5 text-xs font-medium text-indigo-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Solana data API · 20 MCP tools
          </div>
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[2.8rem] lg:leading-tight">
            Build with Solana data, without stitching every answer together.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
            Get current account data and ready-to-use analysis over HTTP or MCP. Try 27 calls as a visitor before wallet sign-in is needed.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={onTryApi} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400">
              <Terminal className="h-4 w-4" /> Open playground <ArrowDown className="h-4 w-4" />
            </button>
            <button onClick={onOpenMcp} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">
              <Bot className="h-4 w-4" /> Explore MCP tools
            </button>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-800 pt-4 text-xs text-slate-400">
            <span><strong className="text-white">27</strong> calls per visitor</span>
            <span><strong className="text-white">0.0022 SOL</strong> after trial</span>
            <a href="/llms.txt" className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200">LLM guide <ExternalLink className="h-3 w-3" /></a>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-800 bg-[#080d18] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <p className="text-xs font-semibold text-white">First live request</p>
              <p className="mt-1 text-[11px] text-slate-500">The cookie jar keeps your trial count between cURL calls.</p>
            </div>
            <button onClick={() => void copy()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-2 text-[11px] text-slate-300 hover:border-slate-500 hover:text-white" aria-label="Copy cURL example">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-6 text-emerald-200 sm:text-xs">{curl}</pre>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4">
            <span className="text-[11px] text-slate-500">Streamable HTTP · <code className="text-slate-300">/mcp</code></span>
            <a href="/.well-known/mcp.json" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200">Tool manifest <ExternalLink className="h-3 w-3" /></a>
          </div>
        </div>
      </div>
    </section>
  );
};
