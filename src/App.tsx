import React, { useEffect, useMemo } from 'react';
import { usePath } from './router';
import { buildSections, useToolsIndex } from './nav';
import { AppShell } from './components/shell/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import { ToolPage } from './pages/ToolPage';
import { CallsPage, ConnectPage, NotFoundPage, PricingPage, QuickstartPage, StatusPage } from './pages/GuidePages';

export function App() {
  const path = usePath();
  const { index, error } = useToolsIndex();
  const sections = useMemo(() => buildSections(index?.tools ?? null), [index]);

  let page: React.ReactNode;
  const toolMatch = path.match(/^\/docs\/tools\/([a-z_]+)$/);
  if (path === '/') page = <OverviewPage index={index} />;
  else if (path === '/docs/quickstart') page = <QuickstartPage />;
  else if (path === '/docs/calls') page = <CallsPage />;
  else if (path === '/docs/connect') page = <ConnectPage />;
  else if (path === '/docs/pricing') page = <PricingPage />;
  else if (path === '/status') page = <StatusPage />;
  else if (toolMatch) {
    page = index ? <ToolPage name={toolMatch[1]} index={index} />
      : error ? <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">Could not load the tools: {error}</p>
      : <div className="space-y-4"><div className="skeleton h-10 w-72 rounded-lg" /><div className="skeleton h-4 w-full max-w-2xl rounded" /><div className="skeleton h-64 rounded-xl" /></div>;
  } else page = <NotFoundPage />;

  // Per-page tab title, from the same navigation data the sidebar uses.
  useEffect(() => {
    const item = sections.flatMap((s) => s.items).find((i) => i.path === path);
    document.title = path === '/' ? 'Solana Pulse · Safety layer for AI agents on Solana' : `${item?.title ?? 'Not found'} · Solana Pulse`;
  }, [path, sections]);

  return <AppShell sections={sections} path={path}>{page}</AppShell>;
}

export default App;
