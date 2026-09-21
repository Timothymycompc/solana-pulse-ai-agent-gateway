import React from 'react';
import { useApiGateway } from './sandbox/useApiGateway';
import { SuiteOverview } from './sandbox/SuiteOverview';
import { EndpointBrowser } from './sandbox/EndpointBrowser';
import { ExecutionPane } from './sandbox/ExecutionPane';
import { ServerControlStation } from './sandbox/ServerControlStation';

interface ApiGatewaySandboxProps {
  gatewayStatus: 'online' | 'offline' | 'checking';
  isServerRunning: boolean;
  setIsServerRunning: React.Dispatch<React.SetStateAction<boolean>>;
}

export const ApiGatewaySandbox: React.FC<ApiGatewaySandboxProps> = ({
  isServerRunning,
  setIsServerRunning,
}) => {
  const { state, actions } = useApiGateway({ isServerRunning, setIsServerRunning });

  return (
    <div className="space-y-6">
      <SuiteOverview
        selectedSuite={state.selectedSuite}
        setSelectedSuite={actions.setSelectedSuite}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <EndpointBrowser
          filteredEndpoints={state.filteredEndpoints || []} // Added check as it was missing from state return in useApiGateway
          selectedEndpoint={state.selectedEndpoint}
          selectedSuite={state.selectedSuite}
          setSelectedSuite={actions.setSelectedSuite}
          methodFilter={state.methodFilter}
          setMethodFilter={actions.setMethodFilter}
          searchQuery={state.searchQuery}
          setSearchQuery={actions.setSearchQuery}
          handleSelectEndpoint={actions.handleSelectEndpoint}
        />

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
      </div>

      <ServerControlStation
        isServerRunning={isServerRunning}
        isBootingServer={state.isBootingServer}
        serverUptimeSeconds={state.serverUptimeSeconds}
        serverLogs={state.serverLogs}
        copiedLogs={state.copiedLogs}
        isBatchTesting={state.isBatchTesting}
        batchProgress={state.batchProgress}
        batchStats={state.batchStats}
        formatUptime={actions.formatUptime}
        handleToggleServer={actions.handleToggleServer}
        handleRunBatchTestSuite={actions.handleRunBatchTestSuite}
        copyAllLogs={actions.copyAllLogs}
        clearLogs={() => actions.setServerLogs([])}
      />
    </div>
  );
};

export default ApiGatewaySandbox;
