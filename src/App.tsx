import React, { useState } from 'react';
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
  const [showUpsell, setShowUpsell] = useState(() => { try { return localStorage.getItem('pulse_stay_free') !== '1'; } catch { return true; } });
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      <Toolbar
        items={[{ id: 'api', label: 'Playground', icon: Terminal }, { id: 'mcp_docs', label: 'Agent Docs', icon: Bot }, { id: 'monetization', label: 'Pricing & Top-Up', icon: Coins }, { id: 'docs', label: 'Docs' }]}
        active={activeTab}
        onSelect={(id) => (id === 'docs' ? window.open('/docs/', '_blank') : setActiveTab(id as AppTab))}
        showUpsell={showUpsell}
        onUpgrade={() => setActiveTab('monetization')}
        onStayFree={() => { setShowUpsell(false); try { localStorage.setItem('pulse_stay_free', '1'); } catch { /* ignore */ } }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-8">
        {activeTab === 'api' && (
          <div>
            <ApiGatewaySandbox />
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
