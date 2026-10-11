import React, { useCallback, useEffect, useState } from 'react';
import Toolbar from './components/Toolbar';
import { Terminal, Bot, Coins, BookOpen } from 'lucide-react';
import { ApiGatewaySandbox } from './components/ApiGatewaySandbox';
import { McpDocsView } from './components/McpDocsView';
import { PricingView } from './components/PricingView';
import { ContactCustomRequests } from './components/ContactCustomRequests';
import { useReveal, withViewTransition } from './hooks/motion';

type AppTab = 'api' | 'mcp_docs' | 'monetization';

// Each page has its own hash so links, reloads and the back button land on the right page.
const TAB_HASH: Record<AppTab, string> = { api: '#playground', mcp_docs: '#mcp', monetization: '#pricing' };
const tabFromHash = (): AppTab => (Object.keys(TAB_HASH) as AppTab[]).find((tab) => TAB_HASH[tab] === window.location.hash) ?? 'api';

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(tabFromHash);
  const pageRef = useReveal<HTMLDivElement>([activeTab]);

  const go = useCallback((tab: AppTab) => {
    if (tab === activeTab) return;
    withViewTransition(() => setActiveTab(tab));
    window.history.pushState(null, '', TAB_HASH[tab]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  useEffect(() => {
    const onPop = () => withViewTransition(() => setActiveTab(tabFromHash()));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <div className="relative isolate flex min-h-screen flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Aurora background behind the glass panels; purely decorative. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="aurora-blob left-[-10%] top-[-15%] h-[520px] w-[620px] bg-indigo-600/25" />
        <div className="aurora-blob right-[-12%] top-[10%] h-[460px] w-[560px] bg-violet-600/20 [animation-delay:-6s]" />
        <div className="aurora-blob bottom-[-20%] left-[25%] h-[480px] w-[640px] bg-cyan-500/[0.12] [animation-delay:-12s]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      </div>
      <Toolbar
        items={[
          { id: 'api', label: 'Playground', icon: Terminal },
          { id: 'mcp_docs', label: 'MCP & Agents', icon: Bot },
          { id: 'monetization', label: 'Pricing', icon: Coins },
          { id: 'docs', label: 'API Reference', icon: BookOpen, external: true },
        ]}
        active={activeTab}
        onSelect={(id) => (id === 'docs' ? window.open('/docs/', '_blank') : go(id as AppTab))}
      />

      <main className="relative mx-auto w-full max-w-7xl flex-1 px-4 py-8 lg:px-8">
        <div key={activeTab} ref={pageRef} style={{ viewTransitionName: 'page' }} className="animate-fade-in">
          {activeTab === 'api' && <ApiGatewaySandbox onOpenMcp={() => go('mcp_docs')} />}
          {activeTab === 'mcp_docs' && <McpDocsView />}
          {activeTab === 'monetization' && <PricingView />}
          <div data-reveal><ContactCustomRequests /></div>
        </div>
      </main>
    </div>
  );
}

export default App;
