import { AccountPanel } from './AccountPanel';
import React from 'react';
import { DeveloperHome } from './DeveloperHome';
import { ServiceUsagePanel } from './ServiceUsagePanel';
import { CreditsCheck } from './CreditsCheck';
import { useApiGateway } from './sandbox/useApiGateway';
import { EndpointBrowser } from './sandbox/EndpointBrowser';
import { ExecutionPane } from './sandbox/ExecutionPane';
import { ServerControlStation } from './sandbox/ServerControlStation';
import { API_ENDPOINTS } from '../data/endpointsData';

interface ApiGatewaySandboxProps {
  onOpenMcp: () => void;
  authHeaders: Record<string, string>;
}

export const ApiGatewaySandbox: React.FC<ApiGatewaySandboxProps> = ({ onOpenMcp, authHeaders }) => {
  const { state, actions } = useApiGateway(authHeaders);
  const starterTasks = [
    { id: 'solana-balance', title: 'Check a wallet', detail: 'Read its current SOL balance' },
    { id: 'solana-token-accounts', title: 'See token holdings', detail: 'List tokens owned by a wallet' },
    { id: 'solana-token-profile', title: 'Assess a token', detail: 'Check mint and freeze authorities' },
    { id: 'solana-decode-tx', title: 'Explain a transaction', detail: 'Summarize activity and balance changes' },
    { id: 'solana-validate-and-simulate', title: 'Preflight a transaction', detail: 'Simulate and surface issues before signing' },
  ];
  const startTask = (id: string) => {
    const endpoint = API_ENDPOINTS.find((item) => item.id === id);
    if (!endpoint) return;
    void actions.handleSelectEndpoint(endpoint);
    document.getElementById('playground-request')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-8">
      <DeveloperHome onOpenMcp={onOpenMcp} onTryApi={() => document.getElementById('playground-request')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

      <section id="playground-request" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">Interactive API explorer</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Make a real request</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">New here? Start with a live example. You get 27 calls as a visitor before billing begins; edit any part of the request, run it, then inspect the live response.</p>
          </div>
          <div className="flex gap-2 text-[11px]">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-emerald-300">{state.trialCallsRemaining} visitor trial calls left</span>
            <span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 text-amber-200">Then 0.0022 SOL per successful call</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold text-white">What do you want to find out?</h3>
            <p className="text-[10px] text-slate-500">Choose a task; the request below will be prepared with example values.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {starterTasks.map((task) => <button key={task.id} type="button" onClick={() => startTask(task.id)} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-left transition hover:border-indigo-400/50 hover:bg-indigo-500/5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-300">Try it · live</span>
              <span className="mt-1 block text-xs font-semibold text-slate-100">{task.title}</span>
              <span className="mt-1 block text-[10px] leading-4 text-slate-500">{task.detail}</span>
            </button>)}
          </div>
        </div>
        <p className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-xs leading-5 text-slate-400">
          Edit the path, query values, headers, or JSON body before running. Your visitor trial is shared across this playground and MCP.
        </p>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(17rem,.78fr)_minmax(0,1.55fr)]">
        <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 sm:p-4">
          <div className="mb-3 px-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300">1 · Choose</p>
            <h3 className="mt-1 text-sm font-semibold text-white">Find the task you need</h3>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Search by question or browse the groups.</p>
          </div>
          <EndpointBrowser
            filteredEndpoints={state.filteredEndpoints || []}
            selectedEndpoint={state.selectedEndpoint}
            selectedSuite={state.selectedSuite}
            setSelectedSuite={actions.setSelectedSuite}
            methodFilter={state.methodFilter}
            setMethodFilter={actions.setMethodFilter}
            searchQuery={state.searchQuery}
            setSearchQuery={actions.setSearchQuery}
            handleSelectEndpoint={actions.handleSelectEndpoint}
          />
        </section>

        <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 sm:p-4">
          <div className="mb-3 px-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300">2 · Customize</p>
            <h3 className="mt-1 text-sm font-semibold text-white">Review the request, then run it</h3>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Every field is editable. The result comes from the live gateway.</p>
          </div>
          <ExecutionPane
            selectedEndpoint={state.selectedEndpoint}
            requestMethod={state.requestMethod}
            setRequestMethod={actions.setRequestMethod}
            requestPath={state.requestPath}
            setRequestPath={actions.setRequestPath}
            requestHeadersText={state.requestHeadersText}
            setRequestHeadersText={actions.setRequestHeadersText}
            requestBodyText={state.requestBodyText}
            setRequestBodyText={actions.setRequestBodyText}
            exampleNotice={state.exampleNotice}
            methods={state.methods}
            isMeteredRequest={state.isMeteredRequest}
            trialCallsRemaining={state.trialCallsRemaining}
            hasAuth={Boolean(authHeaders['x-api-key'] || authHeaders.Authorization)}
            isExecuting={state.isExecuting}
            testResult={state.testResult}
            copiedCurl={state.copiedCurl}
            generatedCurl={state.generatedCurl}
            handleExecuteRequest={actions.handleExecuteRequest}
            copyCurl={actions.copyCurl}
            loadPreset={actions.loadPreset}
          />
        </section>
        </div>
      </section>

      <details className="group rounded-2xl border border-slate-800 bg-slate-900/50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div><h2 className="text-sm font-semibold text-white">Account, live usage, and diagnostics</h2><p className="mt-1 text-xs text-slate-500">Open these supporting tools when you need them.</p></div>
          <span className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 group-open:hidden">Show</span>
          <span className="hidden rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 group-open:inline">Hide</span>
        </summary>
        <div className="grid gap-4 border-t border-slate-800 p-4 lg:grid-cols-2">
          <AccountPanel authHeaders={authHeaders} />
          <CreditsCheck />
          <ServiceUsagePanel />
          <ServerControlStation
            serverLogs={state.serverLogs}
            copiedLogs={state.copiedLogs}
            isBatchTesting={state.isBatchTesting}
            batchProgress={state.batchProgress}
            batchStats={state.batchStats}
            handleRunBatchTestSuite={actions.handleRunBatchTestSuite}
            copyAllLogs={actions.copyAllLogs}
            clearLogs={() => actions.setServerLogs([])}
          />
        </div>
      </details>

    </div>
  );
};

export default ApiGatewaySandbox;
