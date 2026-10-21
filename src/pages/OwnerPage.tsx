import React, { useCallback, useEffect, useState } from 'react';
import { Clock3, KeyRound, LogOut, RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/docs/DocParts';
import { button } from '../components/ui/button';
import { loadOwnerOverview, OwnerKeyError, ownerKeyStore, type OwnerOverview } from '../lib/ownerApi';
import { TipContext, TipLayer, type Tip } from './owner/ui';
import { TABS, tabFromHash, type TabId } from './owner/tabs';
import { OverviewTab } from './owner/OverviewTab';
import { MoneyTab } from './owner/MoneyTab';
import { ToolsTab } from './owner/ToolsTab';
import { CallersTab } from './owner/CallersTab';
import { VisitorsTab } from './owner/VisitorsTab';
import { ExplorerTab } from './owner/ExplorerTab';

// Owner dashboard: money, tool runs, callers, site visitors and the latest runs, one tab each. Data needs the owner key.
// The tabs live in src/pages/owner/, with the pieces they share in owner/ui.tsx.

const RANGES = [{ days: 1, label: '24 hours' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }];

const SignIn: React.FC<{ error: string; onSubmit: (key: string, remember: boolean) => void }> = ({ error, onSubmit }) => {
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  return (
    <form className="max-w-md space-y-3 rounded-xl border border-white/10 p-5 surface" onSubmit={(e) => { e.preventDefault(); if (key.trim()) onSubmit(key.trim(), remember); }}>
      <label className="block text-sm font-medium text-white" htmlFor="owner-key">Owner key</label>
      <input id="owner-key" type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)}
        className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-accent-400" placeholder="OWNER_API_KEY" />
      <label className="flex items-center gap-2 text-[12px] text-ink-300"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Stay signed in on this device</label>
      {error && <p role="alert" className="text-[12px] text-danger-300">{error}</p>}
      <button type="submit" className={button('primary', 'md')}><KeyRound className="h-4 w-4" />Open dashboard</button>
      <p className="text-[11px] leading-5 text-ink-500">The key is the OWNER_API_KEY secret. Get it with <code className="font-mono">gcloud secrets versions access latest --secret=OWNER_API_KEY</code>. It stays in this browser and is only sent to this site.</p>
    </form>
  );
};

// The tab bar: sticks under the site header while scrolling, and scrolls sideways on a phone.
const TabBar: React.FC<{ tab: TabId; onChange: (t: TabId) => void }> = ({ tab, onChange }) => (
  <nav role="tablist" aria-label="Dashboard sections" className="sticky top-16 z-20 flex gap-1 lg:top-4 overflow-x-auto rounded-xl border border-white/10 bg-ink-950/90 p-1 backdrop-blur">
    {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => onChange(t.id)}
      className={`shrink-0 rounded-lg px-3.5 py-2 text-[13px] transition ${tab === t.id ? 'bg-white/10 font-semibold text-white' : 'text-ink-400 hover:text-white'}`}>{t.label}</button>)}
  </nav>
);

export const OwnerPage: React.FC = () => {
  const [key, setKey] = useState(ownerKeyStore.get);
  const [days, setDays] = useState(7);
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [data, setData] = useState<OwnerOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tip, setTip] = useState<Tip>(null);

  const refresh = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    try {
      setData(await loadOwnerOverview(key, days));
      setError('');
    } catch (e) {
      if (e instanceof OwnerKeyError) { ownerKeyStore.clear(); setKey(''); setData(null); }
      setError(e instanceof Error ? e.message : 'The dashboard could not load.');
    } finally {
      setLoading(false);
    }
  }, [key, days]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Keep this page out of search results.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  // Back and forward move between tabs too.
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const openTab = (t: TabId) => {
    if (t !== tab) window.history.pushState(null, '', t === 'overview' ? window.location.pathname : `#${t}`);
    setTab(t);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const signOut = () => { ownerKeyStore.clear(); setKey(''); setData(null); setError(''); };

  return (
    <TipContext.Provider value={setTip}>
      <article className="space-y-6">
        <PageHeader title="Owner dashboard"
          lead="Money, tool runs, callers and site visitors. Only you can open this page."
          aside={key ? <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Period" className="flex overflow-hidden rounded-lg border border-white/10">
              {RANGES.map((o) => <button key={o.days} onClick={() => setDays(o.days)} aria-pressed={days === o.days}
                className={`px-2.5 py-1.5 text-[11px] transition ${days === o.days ? 'bg-white/10 text-white' : 'text-ink-400 hover:text-white'}`}>{o.label}</button>)}
            </div>
            <button onClick={() => void refresh()} aria-label="Refresh" className={button('secondary', 'sm')}><RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /></button>
            <button onClick={signOut} className={button('ghost', 'sm')}><LogOut className="h-3 w-3" />Sign out</button>
          </div> : undefined} />

        {!key ? <SignIn error={error} onSubmit={(k, remember) => { ownerKeyStore.set(k, remember); setError(''); setKey(k); }} />
          : !data ? (error ? <p role="alert" className="rounded-lg border border-danger-400/30 bg-danger-500/10 p-4 text-sm text-danger-100">{error}</p>
            : <div className="space-y-4"><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-80 rounded-xl" /></div>)
          : <>
            <TabBar tab={tab} onChange={openTab} />
            {error && <p role="status" className="text-[12px] text-warning-300">Could not refresh: {error} Showing the last numbers.</p>}
            <p className="flex items-center gap-1.5 text-[11px] text-ink-500"><Clock3 className="h-3 w-3" />Updated {new Date(data.generatedAt).toLocaleTimeString()}. Refreshes every 30 seconds. The period buttons above set the window for every tab except Explorer, which has its own and updates live.</p>
            <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label}>
              {tab === 'overview' && <OverviewTab data={data} go={openTab} />}
              {tab === 'money' && <MoneyTab data={data} />}
              {tab === 'tools' && <ToolsTab data={data} />}
              {tab === 'callers' && <CallersTab data={data} ownerKey={key} onChange={() => void refresh()} />}
              {tab === 'visitors' && <VisitorsTab data={data} />}
              {tab === 'explorer' && <ExplorerTab ownerKey={key} />}
            </div>
          </>}
      </article>
      <TipLayer tip={tip} />
    </TipContext.Provider>
  );
};
