import React from 'react';
import { ArrowDown, ArrowRight, Bot, Check, Code2, Copy, ExternalLink, Terminal } from 'lucide-react';

const exampleWallet = 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU';

interface DeveloperHomeProps {
  onTryApi: () => void;
  onOpenMcp: () => void;
}

export const DeveloperHome: React.FC<DeveloperHomeProps> = ({ onTryApi, onOpenMcp }) => {
  const [copied, setCopied] = React.useState('');
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(''), 1800);
    } catch {
      setCopied('');
    }
  };

  const mcpConfig = JSON.stringify({ mcpServers: { solanaPulse: { url: `${window.location.origin}/mcp` } } }, null, 2);
  const curl = `curl '${window.location.origin}/api/solana/balance?wallet=${exampleWallet}&network=mainnet-beta'`;

  return (
    <div className="mb-8 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950">
      <section className="relative px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(79,70,229,0.18),_transparent_52%)]" />
        <div className="relative grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1.5 text-xs font-medium text-indigo-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              HTTP API + Model Context Protocol
            </div>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-[3.5rem] lg:leading-[1.08]">
              Solana data your app and agents can use.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
              One hosted gateway for wallet lookups, token metadata, transaction simulation, fee estimates, and decoded activity. Call it over HTTP or connect an MCP client.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={onTryApi} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition hover:bg-indigo-400">
                <Terminal className="h-4 w-4" /> Try a live API call <ArrowDown className="h-4 w-4" />
              </button>
              <button onClick={onOpenMcp} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">
                <Bot className="h-4 w-4" /> Connect an MCP client <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
              <span><strong className="text-white">10</strong> MCP tools</span>
              <span><strong className="text-white">5</strong> free read-only tools</span>
              <span><strong className="text-white">0.0022 SOL</strong> per paid call</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#080d18] p-4 shadow-2xl shadow-black/30 sm:p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300"><Code2 className="h-4 w-4 text-indigo-300" /> First request</div>
              <button onClick={() => void copy('curl', curl)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Copy curl example">
                {copied === 'curl' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}{copied === 'curl' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-6 text-emerald-200">{curl}</pre>
            <div className="mt-5 border-t border-slate-800 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-300"><Bot className="h-4 w-4 text-indigo-300" /> MCP endpoint</div>
                <a href="/.well-known/mcp.json" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-300">Manifest <ExternalLink className="h-3 w-3" /></a>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-300">
                <span className="min-w-0 flex-1 truncate">{window.location.host}/mcp</span>
                <button onClick={() => void copy('mcp', `${window.location.origin}/mcp`)} aria-label="Copy MCP endpoint" className="rounded p-1 text-slate-500 hover:text-white">
                  {copied === 'mcp' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] text-indigo-300 hover:text-indigo-200">Show MCP client config</summary>
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-[10px] leading-5 text-slate-400">{mcpConfig}</pre>
                  <button onClick={() => void copy('config', mcpConfig)} aria-label="Copy MCP client config" className="rounded p-1 text-slate-500 hover:text-white">
                    {copied === 'config' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>
      </section>
      <div className="grid border-t border-slate-800 bg-slate-900/50 sm:grid-cols-3">
        {[
          ['01', 'Read chain data', 'Balances, token accounts, recent signatures, and ATA derivation.'],
          ['02', 'Give agents tools', 'Expose typed Solana actions through one MCP connection.'],
          ['03', 'Meter paid analysis', 'Wallet sign-in and credits are only needed for paid tools.'],
        ].map(([number, title, body]) => (
          <div key={number} className="border-b border-slate-800 px-6 py-5 last:border-0 sm:border-b-0 sm:border-r sm:last:border-0 lg:px-8">
            <div className="text-[10px] font-mono text-indigo-300">{number}</div>
            <h2 className="mt-1 text-sm font-semibold text-white">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">{body}</p>
          </div>
        ))}
      </div>
      <section className="grid gap-4 border-t border-slate-800 px-6 py-6 sm:grid-cols-[0.7fr_1.3fr] sm:px-8">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-300">Illustrative agent workflow</p>
          <h2 className="mt-1 text-base font-semibold text-white">Ground an answer in a real transaction</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">An agent can fetch recent signatures, then request a decoded summary for the transaction it wants to explain.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-[#080d18] p-3">
            <div className="text-[10px] text-slate-500">1 · Free lookup</div>
            <code className="mt-1 block break-all font-mono text-[10px] leading-5 text-cyan-200">GET /api/solana/transactions?wallet={exampleWallet}</code>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">Returns recent signatures from the selected Solana network.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#080d18] p-3">
            <div className="text-[10px] text-slate-500">2 · Decoded analysis</div>
            <code className="mt-1 block break-all font-mono text-[10px] leading-5 text-violet-200">GET /api/solana/decode-tx?signature=…</code>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">Costs one credit (0.0022 SOL). The agent can cite returned fields in its answer.</p>
          </div>
        </div>
        <p className="text-[10px] leading-4 text-slate-500 sm:col-start-2">Example workflow only; no customer quote or measured hallucination-reduction claim is implied. Agents should still handle RPC errors and incomplete transaction data.</p>
      </section>
    </div>
  );
};
