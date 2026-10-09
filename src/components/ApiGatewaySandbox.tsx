import { AccountPanel } from './AccountPanel';
import React, { useCallback } from 'react';
import { DeveloperHome } from './DeveloperHome';
import { ServiceUsagePanel } from './ServiceUsagePanel';
import { CreditsCheck } from './CreditsCheck';
import { SecureWalletClaim } from './SecureWalletClaim';
import { useApiGateway } from './sandbox/useApiGateway';
import { EndpointBrowser } from './sandbox/EndpointBrowser';
import { ExecutionPane } from './sandbox/ExecutionPane';
import { ServerControlStation } from './sandbox/ServerControlStation';
import { PanelFrame, PanelsMenu, usePanels } from './sandbox/PanelFrame';

interface ApiGatewaySandboxProps { onOpenMcp: () => void }

const PANELS = [
  { id: 'claim', title: 'Wallet sign-in' },
  { id: 'account', title: 'Your account' },
  { id: 'credits', title: 'Credits check' },
  { id: 'endpoints', title: 'Endpoints' },
  { id: 'execute', title: 'Run a call' },
  { id: 'server', title: 'Server station' },
];
const T = (id: string) => PANELS.find((p) => p.id === id)!.title;

export const ApiGatewaySandbox: React.FC<ApiGatewaySandboxProps> = ({ onOpenMcp }) => {
  const { state, actions } = useApiGateway();
  const panels = usePanels();
  const applyWalletCredentials = useCallback((_apiKey: string, headers: Record<string, string>) => {
    actions.setAuthHeaders(headers);
  }, [actions.setAuthHeaders]);

  return (
    <div className="space-y-8">
      <DeveloperHome onOpenMcp={onOpenMcp} onTryApi={() => document.getElementById('playground-request')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
      <ServiceUsagePanel />
      <PanelsMenu api={panels} panels={PANELS} />

      <section id="playground-request" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">Interactive API explorer</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Make a real request</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">Choose a route, edit the full request, then inspect the live response. Paid calls ask before they run.</p>
          </div>
          <div className="flex gap-2 text-[11px]">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-emerald-300">Read-only lookups: free</span>
            <span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 text-amber-200">Paid tools: 0.0022 SOL</span>
          </div>
        </div>
        <div className="flex flex-col gap-4 items-stretch xl:flex-row">
        <PanelFrame
          id="endpoints"
          title="1 · Choose an endpoint"
          api={panels}
          height="h-[760px]"
          resizeWidth
          className="w-full xl:w-[36%] xl:shrink-0"
        >
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
        </PanelFrame>

        <PanelFrame
          id="execute"
          title="2 · Configure and run"
          api={panels}
          height="h-[760px]"
          resizeWidth
          className="w-full xl:flex-1"
        >
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
            isPaidRequest={state.isPaidRequest}
            hasAuth={Boolean(state.authHeaders['x-api-key'] || state.authHeaders.Authorization)}
            isExecuting={state.isExecuting}
            testResult={state.testResult}
            copiedCurl={state.copiedCurl}
            generatedCurl={state.generatedCurl}
            handleExecuteRequest={actions.handleExecuteRequest}
            copyCurl={actions.copyCurl}
            loadPreset={actions.loadPreset}
          />
        </PanelFrame>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <PanelFrame id="claim" title={T('claim')} api={panels}>
          <SecureWalletClaim onCredentialsApplied={applyWalletCredentials} />
        </PanelFrame>
        <PanelFrame id="account" title={T('account')} api={panels}>
          <AccountPanel authHeaders={state.authHeaders} />
        </PanelFrame>
        <PanelFrame id="credits" title={T('credits')} api={panels}>
          <CreditsCheck />
        </PanelFrame>
        <PanelFrame id="server" title="Diagnostics · current browser session" api={panels}>
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
        </PanelFrame>
      </section>

    </div>
  );
};

export default ApiGatewaySandbox;
