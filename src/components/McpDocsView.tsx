import React, { useEffect, useState } from 'react';
import { Bot, Copy, Check, Terminal, Sparkles, PiggyBank, ShieldCheck } from 'lucide-react';
import { CATEGORY_LABELS, loadTools, type ToolDoc } from '../lib/toolsApi';

export const McpDocsView: React.FC = () => {
  const [copied, setCopied] = useState<string | null>(null);
  const [tools, setTools] = useState<ToolDoc[] | null>(null);
  const [docsError, setDocsError] = useState('');
  useEffect(() => { loadTools().then((index) => setTools(index.tools)).catch((e) => setDocsError(e.message)); }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const claudeConfig = JSON.stringify({
    "mcpServers": {
      "solana-pulse": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp"]
      }
    }
  }, null, 2);


  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Hero Banner */}
      <div className="glass gradient-border animate-fade-up border rounded-2xl p-6 lg:p-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Model Context Protocol (MCP)</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Connect autonomous LLMs to <span className="text-gradient">Solana</span>
            </h2>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              Give Claude, Cursor, and agents typed Solana data tools. Basic reads are free; other tools have 3 free calls, then a small USDC price paid per call with x402. No account or API key.
            </p>
          </div>
          <div className="glass-inset border border-white/10 p-4 rounded-xl min-w-[280px]">
            <div className="text-xs text-slate-400 font-medium mb-1">Live MCP Endpoint (Streamable HTTP):</div>
            <div className="text-xs text-indigo-400 font-mono break-all select-all">
              https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp
            </div>
          </div>
        </div>
      </div>

      {/* Claude Desktop & Cursor Integration */}
      <div className="glass border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
      <h3 className="text-base font-bold text-white">Claude Desktop & Cursor Configuration</h3>
              <p className="text-xs text-slate-400">Add this snippet to <code className="text-indigo-300">claude_desktop_config.json</code> or Cursor's <code className="text-indigo-300">mcp.json</code> (requires Node.js) to enable all 15 tools. Paid tools need an x402-capable client (see Pricing) once their 3 free calls are used.</p>
            </div>
          </div>
          <button
            onClick={() => copyToClipboard(claudeConfig, 'claude')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/10 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            {copied === 'claude' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied === 'claude' ? 'Copied!' : 'Copy Config'}</span>
          </button>
        </div>
        <pre className="glass-inset border border-white/10 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-x-auto">
          {claudeConfig}
        </pre>
      </div>

      {/* Tool reference, generated from the live registry */}
      <div>
        <h3 className="mb-1 flex items-center gap-2 text-lg font-bold text-white">
          <Terminal className="h-5 w-5 text-indigo-400" />
          <span>Tool reference</span>
        </h3>
        <p className="mb-4 text-xs text-slate-300">Every input (with how to get it) and every returned field (with what it means and how it's computed). Generated from the same definitions the server runs, so it can't drift.</p>
        {docsError && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">Could not load the tool reference: {docsError}</p>}
        {!tools && !docsError && <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>}
        <div className="space-y-4">
          {tools?.map((t, idx) => (
            <details key={t.name} data-reveal data-reveal-index={idx % 6} className="lift group rounded-xl border border-white/10 glass transition-colors hover:border-white/15">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-indigo-300">{t.name}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${t.price ? 'border-amber-400/30 text-amber-200' : 'border-emerald-400/30 text-emerald-300'}`}>{t.priceText}</span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-300">{CATEGORY_LABELS[t.category]}</span>
                  </div>
                  <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-200"><span className="font-semibold text-white">Use when:</span> {t.useWhen}</p>
                  <p className={`mt-2 flex max-w-4xl gap-2 rounded-lg border px-3 py-2 text-xs leading-5 ${t.benefit.kind === 'money' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-100' : 'border-sky-500/20 bg-sky-500/5 text-sky-100'}`}>
                    {t.benefit.kind === 'money' ? <PiggyBank className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />}
                    <span><strong className="font-semibold">{t.benefit.kind === 'money' ? 'Saves money: ' : 'Prevents hallucination: '}</strong>{t.benefit.text}</span>
                  </p>
                </div>
                <span className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-[10px] text-slate-300 group-open:hidden">Details</span>
                <span className="hidden shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-[10px] text-slate-300 group-open:inline">Close</span>
              </summary>
              <div className="space-y-5 border-t border-white/10 p-4 sm:p-5">
                <p className="text-xs leading-5 text-slate-300">{t.description} <span className="font-mono text-slate-400">HTTP: POST {t.http.path} · MCP: tools/call "{t.name}"</span></p>
                <div>
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-indigo-300">Inputs</h4>
                  <div className="overflow-x-auto rounded-lg border border-white/10">
                    <table className="w-full min-w-[560px] text-left text-[11px]">
                      <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">What it is</th><th className="px-3 py-2">How to get it</th></tr></thead>
                      <tbody>{t.inputs.map((i) => (
                        <tr key={i.name} className="border-t border-white/5 align-top">
                          <td className="px-3 py-2"><code className="text-indigo-200">{i.name}</code>{i.required && <span className="text-rose-300">*</span>}<div className="text-[10px] text-slate-400">{i.type}{i.required ? '' : ' · optional'}</div></td>
                          <td className="px-3 py-2 text-slate-200">{i.description}</td>
                          <td className="px-3 py-2 text-slate-300">{i.howToGet}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-indigo-300">Returned fields</h4>
                  <div className="overflow-x-auto rounded-lg border border-white/10">
                    <table className="w-full min-w-[640px] text-left text-[11px]">
                      <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-2">Field</th><th className="px-3 py-2">What it means</th><th className="px-3 py-2">How it's computed</th></tr></thead>
                      <tbody>{t.outputs.map((o) => (
                        <tr key={o.field} className="border-t border-white/5 align-top">
                          <td className="px-3 py-2"><code className="text-indigo-200">{o.field}</code><div className="text-[10px] text-slate-400">{o.type}</div></td>
                          <td className="px-3 py-2 text-slate-200">{o.meaning}</td>
                          <td className="px-3 py-2 text-slate-300">{o.howComputed}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
                {t.notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-[11px] text-slate-300">{t.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
};
