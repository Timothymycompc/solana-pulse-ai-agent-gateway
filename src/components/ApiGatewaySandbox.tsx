import { AccountPanel } from './AccountPanel';
import type React from 'react';
import { CreditsCheck } from './CreditsCheck';
import { SecureWalletClaim } from './SecureWalletClaim';
import { useApiGateway } from './sandbox/useApiGateway';
import { SuiteOverview } from './sandbox/SuiteOverview';
import { EndpointBrowser } from './sandbox/EndpointBrowser';
import { ExecutionPane } from './sandbox/ExecutionPane';
import { ServerControlStation } from './sandbox/ServerControlStation';
import { PanelFrame, PanelsMenu, usePanels } from './sandbox/PanelFrame';

interface ApiGatewaySandboxProps {
}

const PANELS = [
  { id: 'claim', title: 'Wallet sign-in' },
  { id: 'account', title: 'Your account' },
  { id: 'credits', title: 'Credits check' },
  { id: 'suites', title: 'Suites' },
  { id: 'endpoints', title: 'Endpoints' },
  { id: 'execute', title: 'Run a call' },
  { id: 'server', title: 'Server station' },
];
const T = (id: string) => PANELS.find((p) => p.id === id)!.title;

export const ApiGatewaySandbox: React.FC<ApiGatewaySandboxProps> = () => {
  const { state, actions } = useApiGateway();
  const panels = usePanels();

  return (
    <div className="space-y-6">
      <PanelsMenu api={panels} panels={PANELS} />

      <PanelFrame id="claim" title={T('claim')} api={panels}>
        <SecureWalletClaim
          onCredentialsApplied={(apiKey, newHeaders) => {
            // Merge the claimed headers into the sandbox's existing header state
            actions.setAuthHeaders(newHeaders);
          }}
        />
      </PanelFrame>

      <PanelFrame id="account" title={T('account')} api={panels}>
        <AccountPanel authHeaders={state.authHeaders} />
      </PanelFrame>

      <PanelFrame id="credits" title={T('credits')} api={panels}>
        <CreditsCheck />
      </PanelFrame>

      <PanelFrame id="suites" title={T('suites')} api={panels}>
        <SuiteOverview
          selectedSuite={state.selectedSuite}
          setSelectedSuite={actions.setSelectedSuite}
        />
      </PanelFrame>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <PanelFrame
          id="endpoints"
          title={T('endpoints')}
          api={panels}
          height="h-[740px]"
          resizeWidth
          className="w-full lg:w-[41%] lg:grow"
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
          title={T('execute')}
          api={panels}
          height="h-[740px]"
          resizeWidth
          className="w-full lg:w-[59%] lg:grow"
        >
          <ExecutionPane
            selectedEndpoint={state.selectedEndpoint}
            queryParams={state.queryParams}
            setQueryParams={actions.setQueryParams}
            requestBodyText={state.requestBodyText}
            setRequestBodyText={actions.setRequestBodyText}
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

      <PanelFrame id="server" title={T('server')} api={panels}>
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
    </div>
  );
};

export default ApiGatewaySandbox;
