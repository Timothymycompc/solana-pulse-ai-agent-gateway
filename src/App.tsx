import React, { useCallback, useState } from 'react';
import type { AppTab } from './components/Header';
import Toolbar from './components/Toolbar';
import { Terminal, Bot, Coins } from 'lucide-react';
import { ApiGatewaySandbox } from './components/ApiGatewaySandbox';
import { McpDocsView } from './components/McpDocsView';
import { AgentMonetizationStudio } from './components/AgentMonetizationStudio';
import { GetStartedWalkthrough } from './components/GetStartedWalkthrough';
import { ContactCustomRequests } from './components/ContactCustomRequests';

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('api');
  const [authHeaders, setAuthHeaders] = useState<Record<string, string>>({});
  const onCredentialsApplied = useCallback((_apiKey: string, headers: Record<string, string>) => {
    setAuthHeaders(headers);
  }, []);
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      <Toolbar
        items={[{ id: 'api', label: 'Playground', icon: Terminal }, { id: 'mcp_docs', label: 'MCP & Agents', icon: Bot }, { id: 'monetization', label: 'Pricing', icon: Coins }, { id: 'docs', label: 'API Reference' }]}
        active={activeTab}
        onSelect={(id) => (id === 'docs' ? window.open('/docs/', '_blank') : setActiveTab(id as AppTab))}
        walletAuthenticated={Boolean(authHeaders['x-api-key'] || authHeaders.Authorization)}
        onCredentialsApplied={onCredentialsApplied}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-8">
        {activeTab === 'api' && (
          <div>
            <ApiGatewaySandbox onOpenMcp={() => setActiveTab('mcp_docs')} authHeaders={authHeaders} />
            <ContactCustomRequests />
          </div>
        )}

        {activeTab === 'mcp_docs' && (
          <div>
            <McpDocsView />
            <ContactCustomRequests />
          </div>
        )}

        {activeTab === 'monetization' && (
          <div>
            <GetStartedWalkthrough />
            <div className="mt-10"><AgentMonetizationStudio /></div>
            <ContactCustomRequests />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
