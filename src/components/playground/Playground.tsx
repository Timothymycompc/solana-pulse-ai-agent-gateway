import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Check, Copy, PiggyBank, Play, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { CATEGORY_LABELS, loadExample, loadFreeCallsUsed, loadTools, runTool, type RunResult, type ToolDoc, type ToolsIndex } from '../../lib/toolsApi';
import { ToolForm, toArguments } from './ToolForm';
import { ToolResult } from './ToolResult';

type Category = 'all' | ToolDoc['category'];
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export const Playground: React.FC<{ initialTool?: string }> = ({ initialTool }) => {
  const [index, setIndex] = useState<ToolsIndex | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<string>(initialTool ?? 'preflight_transaction');
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [exampleState, setExampleState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [exampleError, setExampleError] = useState('');
  const [transport, setTransport] = useState<'http' | 'mcp'>('http');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [freeUsed, setFreeUsed] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadTools().then(setIndex).catch((e) => setLoadError(e.message));
    void loadFreeCallsUsed().then(setFreeUsed);
  }, []);

  const tool = index?.tools.find((t) => t.name === selected) ?? null;

  const fillExample = useCallback(async (name: string) => {
    setExampleState('loading');
    setExampleError('');
    try {
      setValues(await loadExample(name));
      setExampleState('ready');
    } catch (e: any) {
      setValues({});
      setExampleState('error');
      setExampleError(e.message);
    }
  }, []);

  // Every tool opens with fresh real mainnet inputs, so Run works without edits.
  useEffect(() => { if (tool) { setResult(null); void fillExample(tool.name); } }, [tool?.name, fillExample]);

  const args = useMemo(() => (tool ? toArguments(tool, values) : {}), [tool, values]);

  const run = useCallback(async () => {
    if (!tool || running) return;
    setRunning(true);
    try {
      setResult(await runTool(tool.name, args, transport));
    } catch (e: any) {
      setResult({ status: 0, latencyMs: 0, body: { error: 'The browser could not reach the gateway.', fix: e.message }, headers: {}, freeCallsRemaining: null });
    } finally {
      setRunning(false);
      if (tool.price) void loadFreeCallsUsed().then(setFreeUsed);
    }
  }, [tool, args, transport, running]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void run(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const snippet = tool ? (transport === 'http'
    ? `curl -X POST '${origin}/api/tools/${tool.name}' \\\n  -H 'content-type: application/json' \\\n  -d '${JSON.stringify(args)}'`
    : JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool.name, arguments: args } }, null, 2)) : '';
  const copySnippet = async () => {
    try { await navigator.clipboard.writeText(snippet); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const filtered = (index?.tools ?? []).filter((t) => (category === 'all' || t.category === category)
    && (!query || `${t.name} ${t.title} ${t.useWhen}`.toLowerCase().includes(query.toLowerCase())));
  const freeLeft = tool?.price ? Math.max((index?.freeCallsPerTool ?? 3) - (freeUsed[tool.name] ?? 0), 0) : null;

  if (loadError) return <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">Could not load the tools: {loadError}</p>;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(16rem,0.72fr)_minmax(0,1.6fr)]">
      {/* Tool list */}
      <section className="glass min-w-0 rounded-2xl border p-3 sm:p-4 xl:sticky xl:top-24">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tools, e.g. token, sign, fee" aria-label="Search tools"
            className="w-full rounded-xl border border-white/10 glass-inset py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-400/70 focus:ring-4 focus:ring-indigo-500/15" />
        </div>
        <div className="mb-3 flex flex-wrap gap-1">
          {(['all', 'transactions', 'tokens', 'wallets', 'network', 'reference'] as Category[]).map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${category === c ? 'bg-accent-gradient text-white shadow-md shadow-indigo-950/50' : 'border border-white/10 glass-inset text-slate-300 hover:text-white'}`}>
              {c === 'all' ? 'All' : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <div key={`${category}-${query}`} className="max-h-[34rem] space-y-1 overflow-y-auto pr-1">
          {!index && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
          {filtered.map((t, i) => {
            const active = t.name === selected;
            return (
              <button key={t.name} onClick={() => setSelected(t.name)} aria-current={active ? 'true' : undefined} style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                className={`animate-fade-up group flex w-full flex-col gap-1 rounded-xl p-3 text-left transition-all duration-300 ${active ? 'gradient-border bg-indigo-500/10 shadow-lg shadow-indigo-950/60' : 'border border-transparent hover:translate-x-0.5 hover:bg-white/5'}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-slate-100 group-hover:text-white">{t.title}</span>
                  <span className={`shrink-0 text-[10px] font-semibold ${t.price ? 'text-amber-300' : 'text-emerald-300'}`}>{t.price ?? 'Free'}</span>
                </span>
                <code className="truncate text-[10px] text-indigo-200/80">{t.name}</code>
              </button>
            );
          })}
          {index && !filtered.length && <p className="p-3 text-xs text-slate-400">No tools match.</p>}
        </div>
      </section>

      {/* Runner */}
      {tool ? (
        <section key={tool.name} className="glass animate-fade-in min-w-0 space-y-5 rounded-2xl border p-4 sm:p-5">
          <header className="space-y-2 border-b border-white/10 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-white">{tool.title}</h3>
              <code className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-indigo-200">{tool.name}</code>
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${tool.price ? 'border-amber-400/30 text-amber-200' : 'border-emerald-400/30 text-emerald-300'}`}>
                {tool.price ? `${freeLeft} free left · then ${tool.price} USDC` : 'Free'}
              </span>
            </div>
            <p className="text-sm leading-6 text-slate-200"><span className="font-semibold text-white">Use when:</span> {tool.useWhen}</p>
            <p className={`flex gap-2 rounded-lg border px-3 py-2 text-xs leading-5 ${tool.benefit.kind === 'money' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-100' : 'border-sky-500/20 bg-sky-500/5 text-sky-100'}`}>
              {tool.benefit.kind === 'money' ? <PiggyBank className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />}
              <span><strong>{tool.benefit.kind === 'money' ? 'Saves money: ' : 'Prevents hallucination: '}</strong>{tool.benefit.text}</span>
            </p>
          </header>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Inputs</h4>
              <button onClick={() => void fillExample(tool.name)} disabled={exampleState === 'loading'} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] text-slate-200 transition hover:border-white/30 hover:text-white disabled:opacity-60">
                <RefreshCw className={`h-3 w-3 ${exampleState === 'loading' ? 'animate-spin' : ''}`} />{exampleState === 'loading' ? 'Loading live example…' : 'Reload live example'}
              </button>
            </div>
            {exampleState === 'ready' && <p className="text-[11px] text-emerald-300">Filled with live mainnet data. Every field is editable; change anything and run.</p>}
            {exampleState === 'error' && <p className="text-[11px] text-amber-200">Live example unavailable ({exampleError}). Fill the fields in yourself, or retry.</p>}
            <ToolForm tool={tool} values={values} onChange={setValues} />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
            <button onClick={() => void run()} disabled={running} className={`bg-accent-gradient group inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-950/50 transition hover:brightness-110 active:scale-[0.97] disabled:cursor-wait disabled:opacity-70 ${!result && !running ? 'animate-pulse-ring' : ''}`}>
              {running ? <Activity className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />}{running ? 'Running…' : 'Run'}
              {!running && <kbd className="ml-1 hidden rounded border border-white/25 bg-white/10 px-1 font-sans text-[9px] font-medium sm:inline">{isMac ? '⌘' : 'Ctrl'}↵</kbd>}
            </button>
            <div role="radiogroup" aria-label="Transport" className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-[11px]">
              {(['http', 'mcp'] as const).map((t) => (
                <button key={t} role="radio" aria-checked={transport === t} onClick={() => setTransport(t)} className={`rounded-md px-2.5 py-1.5 font-semibold transition ${transport === t ? 'bg-white/15 text-white' : 'text-slate-300 hover:text-white'}`}>{t === 'http' ? 'HTTP' : 'MCP'}</button>
              ))}
            </div>
            <button onClick={() => void copySnippet()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-[11px] text-slate-200 transition hover:border-white/30 hover:text-white">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : transport === 'http' ? 'Copy cURL' : 'Copy MCP request'}
            </button>
          </div>
          <details className="rounded-lg border border-white/10 bg-white/[0.02]">
            <summary className="cursor-pointer px-3 py-2 text-[11px] text-slate-300 hover:text-white">{transport === 'http' ? `POST /api/tools/${tool.name}` : 'MCP tools/call request body'}</summary>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all border-t border-white/10 p-3 font-mono text-[11px] leading-5 text-slate-300">{snippet}</pre>
          </details>

          <ToolResult tool={tool} result={result} running={running} />
        </section>
      ) : (
        <div className="skeleton h-96 rounded-2xl" />
      )}
    </div>
  );
};
