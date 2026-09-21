import React, { useEffect, useState } from 'react';
import type { AppTab } from './components/Header';
import Toolbar from './components/Toolbar';
import { Terminal, Bot, Coins, Lock } from 'lucide-react';
import { ApiGatewaySandbox } from './components/ApiGatewaySandbox';
import { McpDocsView } from './components/McpDocsView';
import { AgentMonetizationStudio } from './components/AgentMonetizationStudio';
import { AutomatedPromotionStudio } from './components/AutomatedPromotionStudio';
import { OwnerAnalyticsPortal } from './components/OwnerAnalyticsPortal';
import { ContactCustomRequests } from './components/ContactCustomRequests';

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('api');
  const [ownerSubTab, setOwnerSubTab] = useState<'promo' | 'analytics'>('promo');
  const [isServerRunning, setIsServerRunning] = useState(true);
  const [freeLeft, setFreeLeft] = useState<number | null>(null);
  const [showUpsell, setShowUpsell] = useState(() => { try { return localStorage.getItem('pulse_stay_free') !== '1'; } catch { return true; } });
  const ownerMode = new URLSearchParams(window.location.search).get('owner') === '1';
  useEffect(() => {
    const orig = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await orig(...args);
      const v = res.headers.get('x-free-calls-remaining');
      if (v !== null && v.trim() !== '' && !Number.isNaN(Number(v))) setFreeLeft(Number(v));
      return res;
    };
    return () => { window.fetch = orig; };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      <Toolbar
        items={[{ id: 'api', label: 'Playground', icon: Terminal }, { id: 'mcp_docs', label: 'Agent Docs', icon: Bot }, { id: 'monetization', label: 'Pricing & Top-Up', icon: Coins }]}
        ownerItems={ownerMode ? [{ id: 'owner_studio', label: 'Owner Hub', icon: Lock }] : []}
        active={activeTab}
        onSelect={(id) => setActiveTab(id as AppTab)}
        freeLeft={freeLeft}
        showUpsell={showUpsell}
        onUpgrade={() => setActiveTab('monetization')}
        onStayFree={() => { setShowUpsell(false); try { localStorage.setItem('pulse_stay_free', '1'); } catch { /* ignore */ } }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-8">
        {activeTab === 'api' && (
          <div>
            <ApiGatewaySandbox isServerRunning={isServerRunning} setIsServerRunning={setIsServerRunning} />
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
            <AgentMonetizationStudio />
            <ContactCustomRequests />
          </div>
        )}

        {activeTab === 'owner_studio' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white">Owner & Marketing Control Hub</h2>
                <p className="text-xs text-slate-400">Manage viral outreach campaigns, track leads, and view server revenue analytics.</p>
              </div>
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setOwnerSubTab('promo')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    ownerSubTab === 'promo' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Automated Promotion Studio
                </button>
                <button
                  onClick={() => setOwnerSubTab('analytics')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    ownerSubTab === 'analytics' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Owner Analytics Portal
                </button>
              </div>
            </div>

            {ownerSubTab === 'promo' ? <AutomatedPromotionStudio /> : <OwnerAnalyticsPortal />}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
