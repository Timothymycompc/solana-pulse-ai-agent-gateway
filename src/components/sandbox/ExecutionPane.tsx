import React from 'react';
import { Activity, AlertTriangle, Check, Clock, Copy, Play, ShieldCheck } from 'lucide-react';
import type { ApiEndpoint, TestExecutionResult } from '../../types';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';
interface ExecutionPaneProps {
  selectedEndpoint: ApiEndpoint;
  requestMethod: Method;
  setRequestMethod: (method: Method) => void;
  requestPath: string;
  setRequestPath: (path: string) => void;
  requestHeadersText: string;
  setRequestHeadersText: (headers: string) => void;
  requestBodyText: string;
  setRequestBodyText: (body: string) => void;
  exampleNotice: string;
  methods: Method[];
  isMeteredRequest: boolean;
  trialCallsRemaining: number;
  isExecuting: boolean;
  testResult: TestExecutionResult | null;
  hasAuth: boolean;
  copiedCurl: boolean;
  generatedCurl: string;
  handleExecuteRequest: () => Promise<void>;
  copyCurl: () => void;
  loadPreset: (preset: Record<string, string>) => void;
}

const editorClass = 'w-full rounded-lg border border-slate-800 bg-[#080d18] px-3 py-2.5 font-mono text-xs text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10';

function interpretLiveResult(endpointId: string, raw: unknown): { title: string; detail: string } | null {
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return null; }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const result = data as Record<string, any>;
  const network = typeof result.network === 'string' ? ` on ${result.network}` : '';

  switch (endpointId) {
    case 'solana-balance':
      return typeof result.balance_sol === 'number'
        ? { title: `${result.balance_sol.toLocaleString()} SOL available${network}`, detail: 'This is the live balance for the wallet in the request.' }
        : null;
    case 'solana-token-accounts':
      return typeof result.tokenCount === 'number'
        ? { title: result.tokenCount ? `${result.tokenCount} token account${result.tokenCount === 1 ? '' : 's'} found${network}` : `No token accounts found${network}`, detail: 'Open the raw response to inspect each token mint, amount, and decimals.' }
        : null;
    case 'solana-transactions': {
      const latest = Array.isArray(result.transactions) ? result.transactions[0]?.signature : null;
      return typeof result.count === 'number'
        ? { title: `${result.count} recent transaction${result.count === 1 ? '' : 's'} found${network}`, detail: latest ? `Latest signature: ${latest}. Use Explain Transaction to inspect what it did.` : 'No recent signatures were returned for this wallet.' }
        : null;
    }
    case 'solana-find-ata':
      return typeof result.ataAddress === 'string'
        ? { title: result.exists ? 'The token account already exists' : 'The token account has not been created', detail: `Derived address: ${result.ataAddress}${network}. This lookup does not create or fund an account.` }
        : null;
    case 'solana-token-profile': {
      const security = result.security;
      if (!security) return null;
      const authorities = [
        security.freezeAuthorityEnabled ? 'freeze authority is active' : 'no freeze authority is reported',
        security.mintAuthorityEnabled ? 'mint authority is active' : 'no mint authority is reported',
      ].join('; ');
      return {
        title: `Token authority check: ${authorities}`,
        detail: `This is an on-chain authority signal, not a complete safety or honeypot check${network}.`,
      };
    }
    case 'solana-decode-tx':
      return typeof result.summary === 'string'
        ? { title: `${result.details?.status === 'SUCCESS' ? 'Transaction succeeded' : 'Transaction status: ' + (result.details?.status || 'unknown')}${network}`, detail: `${result.category || 'Transaction'}: ${result.summary}` }
        : null;
    case 'solana-validate-and-simulate':
      return typeof result.verdict === 'string'
        ? { title: `Preflight result: ${result.verdict}`, detail: result.verdict === 'SAFE' ? `No blocking issue was found in this simulation${network}. Simulation is not a guarantee that a later transaction will succeed.` : `${Array.isArray(result.issues) ? result.issues.length : 0} issue(s) need review. Expand the response for suggested fixes.` }
        : null;
    case 'solana-simulate':
      return typeof result.success === 'boolean'
        ? { title: result.success ? `Simulation passed${network}` : `Simulation failed${network}`, detail: result.success ? 'The transaction ran against current chain state without being broadcast.' : 'Review the program logs in the response to find the failing instruction.' }
        : null;
    case 'solana-optimal-fee':
      return typeof result.current_congestion === 'string'
        ? { title: `Current network congestion: ${result.current_congestion}`, detail: typeof result.tiers?.medium?.lamports === 'number' ? `The gateway recommends a medium priority fee of ${result.tiers.medium.lamports} per compute unit${network}.` : 'Review the returned fee tiers before building a transaction.' }
        : null;
    case 'solana-blockhash':
      return typeof result.blockhash === 'string'
        ? { title: `Fresh blockhash ready${network}`, detail: `Valid through block height ${result.lastValidBlockHeight ?? 'shown in the raw response'}. A blockhash helps build a transaction; it does not send one.` }
        : null;
    default:
      return null;
  }
}

export const ExecutionPane: React.FC<ExecutionPaneProps> = (props) => {
  const { selectedEndpoint: endpoint } = props;
  const metered = props.isMeteredRequest;
  const resultOk = props.testResult !== null && props.testResult.status >= 200 && props.testResult.status < 300;
  const interpretation = props.testResult && resultOk
    ? interpretLiveResult(props.testResult.endpointId, props.testResult.responseBody)
    : null;
  const resultHint = (status: number) => {
    if (status === 0) return 'The browser could not reach the gateway. Check your connection and try again.';
    if (status >= 200 && status < 300) return 'The request worked. The response below is from the live gateway.';
    if (status === 400) return 'The gateway received the request, but one or more values are missing or invalid. Review the path, query, and JSON body.';
    if (status === 401 || status === 402) return 'Your 27 visitor trial calls are used. Connect a wallet in the header, add credits, and try again.';
    if (status === 404) return 'That route or chain record was not found. Check the path and the wallet, mint, or transaction signature.';
    if (status === 429) return 'Too many requests were sent in a short time. Wait a moment and try again.';
    if (status >= 500) return 'The gateway or its Solana data provider had a problem. Try again shortly; check the request values if it continues.';
    return 'The gateway returned an error. Review the response details below.';
  };

  return (
    <div className="flex h-full min-h-[760px] flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/75 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-1 font-mono text-[10px] font-bold ${props.requestMethod === 'GET' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-indigo-500/10 text-indigo-300'}`}>{props.requestMethod}</span>
            <h3 className="text-sm font-semibold text-white">{endpoint.name}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${metered ? 'border-amber-500/20 text-amber-200' : 'border-emerald-500/20 text-emerald-300'}`}>
              {metered ? `${props.trialCallsRemaining} trial left · then 0.0022 SOL` : 'No call credit'}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-slate-400">{endpoint.summary}</p>
        </div>
        <span className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-500">{endpoint.category}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[130px_minmax(0,1fr)]">
        <label className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Method</span>
          <select value={props.requestMethod} onChange={(e) => props.setRequestMethod(e.target.value as Method)} className={editorClass}>
            {props.methods.map((method) => <option key={method} value={method}>{method}</option>)}
          </select>
        </label>
        <label className="min-w-0 space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Request path and query</span>
          <input value={props.requestPath} onChange={(e) => props.setRequestPath(e.target.value)} spellCheck={false} className={editorClass} placeholder="/api/solana/balance?wallet=…" />
        </label>
      </div>

      {endpoint.presets?.length ? <div className="flex flex-wrap gap-2">
        <span className="py-1 text-[10px] text-slate-500">Examples:</span>
        {endpoint.presets.map((preset) => <button key={preset.label} onClick={() => props.loadPreset(preset.params)} className="rounded-md border border-slate-700 px-2 py-1 text-[10px] text-indigo-200 hover:border-indigo-400 hover:bg-indigo-500/5">{preset.label}</button>)}
      </div> : null}

      <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] leading-5 text-slate-400">
        <strong className="text-slate-200">What to do:</strong> The sample path and values are ready to run. Change them to ask a different question; use the same wallet or mint throughout the request. Results come from the live gateway.
      </div>

      <div className="grid flex-1 content-start gap-3 lg:grid-cols-2">
        <label className="flex min-h-36 flex-col gap-1.5">
          <span className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Headers · JSON</span><span className="normal-case tracking-normal text-slate-600">{props.hasAuth ? 'wallet key attached privately' : 'trial calls need no API key'}</span>
          </span>
          <textarea value={props.requestHeadersText} onChange={(e) => props.setRequestHeadersText(e.target.value)} spellCheck={false} className={`${editorClass} min-h-32 flex-1 resize-y`} placeholder={'{\n  "Content-Type": "application/json"\n}'} />
        </label>
        <label className="flex min-h-36 flex-col gap-1.5">
          <span className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Body · JSON</span><span className="normal-case tracking-normal text-slate-600">{['GET', 'HEAD'].includes(props.requestMethod) ? 'ignored for this method' : 'Content-Type added automatically'}</span>
          </span>
          <textarea value={props.requestBodyText} onChange={(e) => props.setRequestBodyText(e.target.value)} spellCheck={false} className={`${editorClass} min-h-32 flex-1 resize-y`} placeholder={'{\n  "transaction": "<base64 serialized transaction>",\n  "network": "devnet"\n}'} />
        </label>
      </div>

      {props.exampleNotice && <div role="status" className="flex gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 text-[11px] leading-5 text-indigo-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{props.exampleNotice}</div>}
      {metered && <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-5 text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Each visitor gets 27 calls shared across HTTP and MCP. After those are used, each successful call costs one credit (0.0022 SOL); wallet sign-in is only needed to keep calling.</span></div>}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
        <button onClick={() => void props.handleExecuteRequest()} disabled={props.isExecuting} className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-950/50 transition hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60">
          {props.isExecuting ? <Activity className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{props.isExecuting ? 'Sending request…' : 'Run request'}
        </button>
        <button onClick={props.copyCurl} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2.5 text-xs text-slate-300 hover:border-slate-500 hover:text-white">
          {props.copiedCurl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}{props.copiedCurl ? 'Copied cURL' : 'Copy cURL'}
        </button>
        <details className="ml-auto max-w-full">
          <summary className="cursor-pointer text-[10px] text-slate-500 hover:text-slate-300">View generated cURL</summary>
          <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-slate-800 bg-[#080d18] p-3 font-mono text-[10px] leading-5 text-slate-400">{props.generatedCurl}</pre>
        </details>
      </div>

      <section aria-live="polite" className="min-h-32 rounded-xl border border-slate-800 bg-[#080d18]">
        {!props.testResult ? <div className="grid min-h-32 place-items-center px-4 text-center">
          <p className="max-w-sm text-xs leading-5 text-slate-500">The live response will appear here after you run a request. Example data isn’t shown as if it came from the API.</p>
        </div> : <div className="p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-md border px-2 py-1 font-mono text-[10px] font-bold ${resultOk ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300' : 'border-rose-500/20 bg-rose-500/5 text-rose-300'}`}>HTTP {props.testResult.status || 'NETWORK ERROR'}</span>
              <span className="text-[10px] text-slate-500">{props.testResult.method} {props.testResult.url}</span>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500"><Clock className="h-3 w-3" />{props.testResult.latencyMs} ms</span>
          </div>
          <p className={`mt-2 text-[11px] leading-5 ${resultOk ? 'text-emerald-300' : 'text-amber-200'}`}>{resultHint(props.testResult.status)}</p>
          {interpretation && <div className="mt-3 rounded-lg border border-indigo-400/20 bg-indigo-500/5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300">What the live data suggests</p>
            <p className="mt-1 text-sm font-semibold text-white">{interpretation.title}</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">{interpretation.detail}</p>
          </div>}
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-slate-200">{typeof props.testResult.responseBody === 'string' ? props.testResult.responseBody : JSON.stringify(props.testResult.responseBody, null, 2)}</pre>
          <details className="mt-3 border-t border-slate-800 pt-2">
            <summary className="cursor-pointer text-[10px] text-slate-500 hover:text-slate-300">Response headers</summary>
            <pre className="mt-2 overflow-auto font-mono text-[10px] leading-4 text-slate-500">{JSON.stringify(props.testResult.headers, null, 2)}</pre>
          </details>
        </div>}
      </section>
    </div>
  );
};
