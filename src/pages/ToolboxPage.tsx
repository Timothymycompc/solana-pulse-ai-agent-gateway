import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Check, Copy, Eraser, Play, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import { CATEGORY_LABELS, loadExample, loadFreeCallsUsed, runTool, snippetFor, type RunResult, type ToolDoc, type ToolsIndex } from '../lib/toolsApi';
import { CATEGORY_ORDER, toolPath } from '../nav';
import { Link } from '../router';
import { ToolForm, toArguments } from '../components/playground/ToolForm';
import { ToolResult } from '../components/playground/ToolResult';
import { button } from '../components/ui/button';

// Every tool on one bench: pick any tool, edit any input (as a form or as raw JSON), run it on mainnet,
// and reopen any earlier call to change it and run it again. Drafts and calls stay in this browser.

type Values = Record<string, unknown>;
type Transport = 'http' | 'mcp';
type Call = { id: string; at: number; tool: string; transport: Transport; args: Values; result: RunResult };

const DRAFTS_KEY = 'pulse.toolbox.drafts';
const CALLS_KEY = 'pulse.toolbox.calls';
const MAX_CALLS = 40;
const MAX_BODY_CHARS = 40_000;
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function readStore<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function writeStore(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: the page still works, it just forgets */ }
}

// What a call keeps once saved: no headers, and no body if it is too large to keep.
function toStored(call: Call): Call {
  const { headers: _headers, ...result } = call.result;
  const size = JSON.stringify(result.body ?? '').length;
  return { ...call, result: { ...result, headers: {}, body: size > MAX_BODY_CHARS ? 'This response was too large to keep in the browser. Run the call again to see it.' : result.body } };
}

const ago = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString();
};
const argSummary = (args: Values) => Object.entries(args)
  .map(([k, v]) => `${k} ${typeof v === 'string' ? (v.length > 14 ? `${v.slice(0, 6)}…${v.slice(-4)}` : v) : JSON.stringify(v)}`)
  .join(', ') || 'no inputs';
const statusTone = (status: number) => status >= 200 && status < 300 ? 'bg-success-400' : status === 402 ? 'bg-warning-300' : 'bg-danger-400';

const Segmented = <T extends string>({ label, value, options, onChange, tone = 'ink' }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; tone?: 'ink' | 'wood' }) => (
  <div role="radiogroup" aria-label={label} className={`inline-flex rounded-md border p-0.5 text-[12px] ${tone === 'wood' ? 'border-tan-500/35 bg-wood-950/60' : 'border-line bg-code'}`}>
    {options.map(([v, text]) => (
      <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
        className={`rounded px-2 py-1 font-medium transition ${value === v ? (tone === 'wood' ? 'bg-gold-400/20 text-gold-200' : 'bg-white/10 text-white') : (tone === 'wood' ? 'text-tan-400 hover:text-tan-200' : 'text-ink-400 hover:text-white')}`}>{text}</button>
    ))}
  </div>
);

export const ToolboxPage: React.FC<{ index: ToolsIndex }> = ({ index }) => {
  const { tools, freeCallsPerTool } = index;
  const [name, setName] = useState(() => {
    const asked = new URLSearchParams(window.location.search).get('tool');
    return tools.some((t) => t.name === asked) ? asked! : tools[0].name;
  });
  const tool = tools.find((t) => t.name === name) ?? tools[0];

  const [drafts, setDrafts] = useState<Record<string, Values>>(() => readStore(DRAFTS_KEY, {}));
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [exampleState, setExampleState] = useState<Record<string, string>>({}); // 'loading' or an error message
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonText, setJsonText] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState('');
  const [rawArgs, setRawArgs] = useState<Values | null>(null);
  const [explain, setExplain] = useState(false);
  const [transport, setTransport] = useState<Transport>('http');
  const [running, setRunning] = useState<string | null>(null);
  const [shown, setShown] = useState<Record<string, Call>>({});
  const [calls, setCalls] = useState<Call[]>(() => readStore(CALLS_KEY, []));
  const [freeUsed, setFreeUsed] = useState<Record<string, number>>({});
  const [rackQuery, setRackQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'tool'>('all');
  const [clearArmed, setClearArmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const benchRef = useRef<HTMLElement>(null);

  useEffect(() => writeStore(DRAFTS_KEY, drafts), [drafts]);
  useEffect(() => writeStore(CALLS_KEY, calls), [calls]);
  useEffect(() => { void loadFreeCallsUsed().then(setFreeUsed); }, []);

  const fillExample = useCallback(async (toolName: string) => {
    setExampleState((e) => ({ ...e, [toolName]: 'loading' }));
    try {
      const args = await loadExample(toolName);
      setDrafts((d) => ({ ...d, [toolName]: args }));
      setExampleState(({ [toolName]: _done, ...rest }) => rest);
    } catch (e: any) { setExampleState((s) => ({ ...s, [toolName]: e.message })); }
  }, []);

  const resetJson = () => { setJsonText(null); setRawArgs(null); setJsonError(''); };

  // A tool opened for the first time starts from a live mainnet example; after that it keeps your edits.
  useEffect(() => {
    window.history.replaceState(null, '', `/toolbox?tool=${name}`);
    resetJson();
    if (!draftsRef.current[name]) void fillExample(name);
  }, [name, fillExample]);

  const values = drafts[name] ?? {};
  const setValues = (v: Values) => setDrafts((d) => ({ ...d, [name]: v }));
  const args = useMemo(() => (mode === 'json' && rawArgs ? rawArgs : toArguments(tool, values)), [mode, rawArgs, tool, values]);

  const onJson = (text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The inputs must be one JSON object, like {"address": "…"}.');
      setRawArgs(parsed);
      setValues(parsed);
      setJsonError('');
    } catch (e: any) { setJsonError(e instanceof SyntaxError ? `Not valid JSON yet: ${e.message}` : e.message); }
  };

  const run = useCallback(async (toolName: string, callArgs: Values, via: Transport) => {
    if (running) return;
    setRunning(toolName);
    let result: RunResult;
    try { result = await runTool(toolName, callArgs, via); }
    catch (e: any) { result = { status: 0, latencyMs: 0, body: { error: 'The browser could not reach the gateway.', fix: e.message }, headers: {}, freeCallsRemaining: null }; }
    const call: Call = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), tool: toolName, transport: via, args: callArgs, result };
    setShown((s) => ({ ...s, [toolName]: call }));
    setCalls((c) => [toStored(call), ...c].slice(0, MAX_CALLS));
    setRunning(null);
    void loadFreeCallsUsed().then(setFreeUsed);
  }, [running]);

  const blocked = mode === 'json' && Boolean(jsonError);
  const runCurrent = useCallback(() => { if (!blocked) void run(name, args, transport); }, [blocked, run, name, args, transport]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runCurrent(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runCurrent]);

  const pick = (toolName: string) => { setName(toolName); if (window.innerWidth < 1024) benchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const openCall = (call: Call, again = false) => {
    setName(call.tool);
    setDrafts((d) => ({ ...d, [call.tool]: call.args }));
    setTransport(call.transport);
    setMode('form');
    resetJson();
    if (again) void run(call.tool, call.args, call.transport);
    else setShown((s) => ({ ...s, [call.tool]: call }));
    benchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const clearCalls = () => {
    if (!clearArmed) { setClearArmed(true); window.setTimeout(() => setClearArmed(false), 3000); return; }
    setCalls([]); setClearArmed(false);
  };
  const copySnippet = async () => {
    try { await navigator.clipboard.writeText(snippetFor(window.location.origin, name, args, transport)); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const freeLeft = (t: ToolDoc) => Math.max(freeCallsPerTool - (freeUsed[t.name] ?? 0), 0);
  const q = rackQuery.trim().toLowerCase();
  const groups = CATEGORY_ORDER
    .map((category) => ({ category, tools: tools.filter((t) => t.category === category && (!q || `${t.name} ${t.title} ${t.useWhen}`.toLowerCase().includes(q))) }))
    .filter((g) => g.tools.length);
  const example = exampleState[name];
  const current = shown[name];
  const list = scope === 'tool' ? calls.filter((c) => c.tool === name) : calls;

  return (
    <div>
      <header className="mb-8 space-y-3">
        <h1 className="display text-[2.4rem] sm:text-[3.25rem]">Toolbox</h1>
        <p className="max-w-[62ch] text-[17px] leading-[1.65] text-ink-300">Every tool in one place. Pick a tool, change any input, run it on mainnet, and reopen any call you've made to change it and run it again.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] 2xl:grid-cols-[14rem_minmax(0,1fr)_minmax(0,1fr)]">
        {/* The rack: every tool, by category. Phones get a dropdown instead. */}
        <nav aria-label="Tools" className="hidden lg:row-span-2 lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
            <label className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-code px-2.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-ink-500" />
              <input value={rackQuery} onChange={(e) => setRackQuery(e.target.value)} placeholder="Find a tool" aria-label="Find a tool" className="h-9 w-full bg-transparent text-[13px] text-ink-100 outline-none placeholder:text-ink-500" />
            </label>
            {groups.map((g) => (
              <div key={g.category} className="mb-4">
                <p className="mb-1 px-2.5 text-[12.5px] font-semibold text-tan-400">{CATEGORY_LABELS[g.category]}</p>
                <ul className="space-y-0.5">
                  {g.tools.map((t) => {
                    const active = t.name === name;
                    return (
                      <li key={t.name}>
                        <button onClick={() => pick(t.name)} aria-current={active ? 'true' : undefined}
                          className={`relative flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${active ? 'bg-panel text-ink-50' : 'text-ink-400 hover:text-ink-100'}`}>
                          {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold-400" />}
                          <span className="truncate font-mono text-[13px]">{t.name}</span>
                          <span className={`shrink-0 text-[11.5px] tabular-nums ${active ? 'text-tan-300' : 'text-ink-500'}`}>{t.price ? `${freeLeft(t)} free` : 'Free'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {!groups.length && <p className="px-2.5 text-[13px] text-ink-500">No tool matches “{rackQuery}”.</p>}
          </div>
        </nav>

        {/* The bench: the chosen tool's inputs. */}
        <section ref={benchRef} aria-label={`Inputs for ${tool.name}`} className="min-w-0 scroll-mt-20 self-start overflow-hidden rounded-2xl border border-line surface">
          <div className="wood-head flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <label className="lg:hidden">
                <span className="sr-only">Tool</span>
                <select value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-tan-500/35 bg-wood-950/60 px-2 py-1.5 font-mono text-[14px] font-semibold text-gold-300 outline-none">
                  {CATEGORY_ORDER.map((c) => (
                    <optgroup key={c} label={CATEGORY_LABELS[c]}>
                      {tools.filter((t) => t.category === c).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <p className="hidden font-mono text-[16px] font-semibold text-gold-300 lg:block">{tool.name}</p>
              <p className="mt-0.5 truncate text-[13px] text-tan-300">{tool.title}</p>
            </div>
            <Segmented label="Transport" tone="wood" value={transport} onChange={setTransport} options={[['http', 'HTTP'], ['mcp', 'MCP']]} />
          </div>

          <div className="space-y-4 p-4">
            <p className="max-w-[70ch] text-[14px] leading-[1.6] text-ink-300">{tool.useWhen} <Link to={toolPath(tool.name)} className="whitespace-nowrap text-accent-300 hover:text-accent-200">Read the docs</Link></p>

            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="Edit as" value={mode} onChange={(m) => { setMode(m); resetJson(); }} options={[['form', 'Form'], ['json', 'JSON']]} />
              {mode === 'form' && (
                <button role="switch" aria-checked={explain} onClick={() => setExplain((x) => !x)} className={`rounded-md border px-2 py-1 text-[12px] transition ${explain ? 'border-gold-500/50 text-gold-200' : 'border-line text-ink-400 hover:text-white'}`}>Explain inputs</button>
              )}
              <span className="ml-auto flex gap-2">
                <button onClick={() => { resetJson(); void fillExample(name); }} disabled={example === 'loading'} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] text-ink-300 transition hover:border-ink-600 hover:text-white disabled:opacity-50">
                  <RefreshCw className={`h-3 w-3 ${example === 'loading' ? 'animate-spin' : ''}`} />Live example
                </button>
                <button onClick={() => { resetJson(); setValues({}); }} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] text-ink-300 transition hover:border-ink-600 hover:text-white">
                  <Eraser className="h-3 w-3" />Clear
                </button>
              </span>
            </div>

            {example === 'loading' && <p className="text-[12.5px] text-ink-400">Loading a live mainnet example…</p>}
            {example && example !== 'loading' && <p className="text-[12.5px] text-warning-200">No live example right now ({example}). Fill the inputs yourself.</p>}

            {mode === 'form'
              ? <ToolForm tool={tool} values={values} onChange={setValues} compact={!explain} />
              : (
                <div className="space-y-1.5">
                  <label htmlFor="toolbox-json" className="text-[12.5px] text-ink-400">The exact inputs sent with the request. Anything you type here is sent as it is, so you can also test how the tool handles bad input.</label>
                  <textarea id="toolbox-json" spellCheck={false} rows={Math.min(Math.max((jsonText ?? JSON.stringify(args, null, 2)).split('\n').length + 1, 6), 22)}
                    value={jsonText ?? JSON.stringify(args, null, 2)} onChange={(e) => onJson(e.target.value)}
                    className={`w-full resize-y rounded-lg border surface-inset px-3 py-2.5 font-mono text-[12.5px] leading-[1.6] text-ink-100 outline-none transition focus:ring-4 ${jsonError ? 'border-danger-400/60 focus:ring-danger-500/15' : 'border-line focus:border-accent-400/70 focus:ring-accent-500/15'}`} />
                  {jsonError && <p className="text-[12.5px] text-danger-300">{jsonError}</p>}
                </div>
              )}

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={runCurrent} disabled={Boolean(running) || blocked} className={button('primary', 'md', 'flex-1 active:scale-[0.98] disabled:cursor-wait')}>
                {running === name ? <Activity className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{running === name ? 'Running…' : `Run ${tool.name}`}
                {running !== name && <kbd className="ml-1 hidden rounded border border-white/25 bg-white/10 px-1 font-sans text-[10px] font-medium sm:inline">{isMac ? '⌘' : 'Ctrl'}↵</kbd>}
              </button>
              <button onClick={() => void copySnippet()} aria-label={transport === 'http' ? 'Copy as cURL' : 'Copy the MCP request'} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2.5 text-[13px] text-ink-300 transition hover:border-ink-600 hover:text-white">
                {copied ? <Check className="h-3.5 w-3.5 text-success-400" /> : <Copy className="h-3.5 w-3.5" />}{transport === 'http' ? 'cURL' : 'MCP'}
              </button>
            </div>
            <p className="text-[12.5px] text-ink-500">{tool.price ? `${freeLeft(tool)} of ${freeCallsPerTool} free calls left today for this tool, then ${tool.price} USDC per call.` : 'Free tool, rate-limited.'}</p>
          </div>
        </section>

        {/* The response, then every call made from this browser. */}
        <div className="min-w-0 space-y-6 lg:col-start-2 2xl:col-start-3 2xl:row-start-1">
          <section aria-label="Response" className="overflow-hidden rounded-2xl border border-line surface">
            <div className="wood-head flex items-baseline justify-between gap-3 px-4 py-3">
              <h2 className="text-[14px] font-semibold text-tan-200">Response</h2>
              {current && <span className="text-[12px] text-tan-400">{ago(current.at)} over {current.transport.toUpperCase()}</span>}
            </div>
            <div className="p-4"><ToolResult tool={tool} result={current?.result ?? null} running={running === name} /></div>
          </section>

          <section aria-label="Your calls" className="overflow-hidden rounded-2xl border border-line surface">
            <div className="wood-head flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <h2 className="text-[14px] font-semibold text-tan-200">Your calls <span className="font-normal tabular-nums text-tan-400">{list.length}</span></h2>
              <Segmented label="Show calls for" tone="wood" value={scope} onChange={setScope} options={[['all', 'All tools'], ['tool', tool.name]]} />
              {calls.length > 0 && (
                <button onClick={clearCalls} className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition ${clearArmed ? 'bg-danger-500/15 text-danger-300' : 'text-tan-400 hover:text-tan-200'}`}>
                  <Trash2 className="h-3 w-3" />{clearArmed ? 'Clear all calls?' : 'Clear'}
                </button>
              )}
            </div>
            {list.length ? (
              <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
                {list.map((call) => {
                  const open = current?.id === call.id && call.tool === name;
                  return (
                    <li key={call.id} className={`relative flex items-center gap-2 pr-2 transition-colors hover:bg-ink-800/40 ${open ? 'bg-wood-950/60' : ''}`}>
                      {open && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-gold-400" />}
                      <button onClick={() => openCall(call)} title="Open this call to change its inputs" className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${statusTone(call.result.status)}`} aria-label={`HTTP ${call.result.status}`} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="font-mono text-[13px] text-ink-100">{call.tool}</span>
                            <span className="font-mono text-[11.5px] text-ink-500">{call.result.status} {call.transport.toUpperCase()}</span>
                          </span>
                          <span className="block truncate font-mono text-[11.5px] text-ink-500">{argSummary(call.args)}</span>
                        </span>
                        <span className="shrink-0 text-[12px] text-ink-500">{ago(call.at)}</span>
                      </button>
                      <button onClick={() => openCall(call, true)} disabled={Boolean(running)} aria-label={`Run this ${call.tool} call again`} title="Run again"
                        className="shrink-0 rounded-md p-1.5 text-ink-400 transition hover:bg-white/5 hover:text-gold-300 disabled:opacity-40">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-6 text-[13px] leading-[1.6] text-ink-400">
                {calls.length ? `No calls to ${tool.name} yet.` : 'Calls you run appear here and stay in this browser. Open one to change its inputs and run it again.'}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
