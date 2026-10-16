// Which page a path shows, and its title and description. Shared by the browser (App.tsx) and the server
// (src/ssr.tsx), so a page rendered on the server for crawlers and AI readers is the same page people see.
import React from 'react';
import type { ToolsIndex } from '../lib/toolsApi';
import type { NavSection } from '../nav';
import { OverviewPage } from './OverviewPage';
import { ToolPage } from './ToolPage';
import { CallsPage, ConnectPage, NotFoundPage, PricingPage, QuickstartPage, StatusPage } from './GuidePages';
import { OwnerPage } from './OwnerPage';
import { ToolboxPage } from './ToolboxPage';

const toolName = (path: string) => path.match(/^\/docs\/tools\/([a-z_]+)$/)?.[1];

export function isKnownPath(path: string, index: ToolsIndex | null): boolean {
  if (['/', '/docs/quickstart', '/docs/calls', '/docs/connect', '/docs/pricing', '/status', '/owner', '/toolbox'].includes(path)) return true;
  const name = toolName(path);
  return Boolean(name && (!index || index.tools.some((t) => t.name === name)));
}

export function pageFor(path: string, index: ToolsIndex | null, error: string): React.ReactNode {
  const name = toolName(path);
  if (path === '/') return <OverviewPage index={index} />;
  if (path === '/docs/quickstart') return <QuickstartPage />;
  if (path === '/docs/calls') return <CallsPage />;
  if (path === '/docs/connect') return <ConnectPage />;
  if (path === '/docs/pricing') return <PricingPage />;
  if (path === '/status') return <StatusPage />;
  if (path === '/owner') return <OwnerPage />;
  if (name || path === '/toolbox') {
    if (index) return name ? <ToolPage name={name} index={index} /> : <ToolboxPage index={index} />;
    return error ? <p className="rounded-lg border border-danger-400/30 bg-danger-500/10 p-4 text-sm text-danger-100">Could not load the tools: {error}</p>
      : <div className="space-y-4"><div className="skeleton h-10 w-72 rounded-lg" /><div className="skeleton h-4 w-full max-w-2xl rounded" /><div className="skeleton h-64 rounded-xl" /></div>;
  }
  return <NotFoundPage />;
}

export const SITE_TITLE = 'Solana Pulse · Safety layer for AI agents on Solana';
const SITE_DESCRIPTION = 'Stop AI agents losing money on Solana: check transactions before signing, verify intent, vet tokens and explain failures. MCP and HTTP, pay per call with x402.';
const DESCRIPTIONS: Record<string, string> = {
  '/docs/quickstart': 'Make a real Solana Pulse call in under a minute. No account, no API key; every tool gives you 25 free calls a day.',
  '/docs/calls': 'What a call is: one question sent to the Solana Pulse gateway and the one answer that comes back, explained simply.',
  '/docs/connect': 'Connect Claude, ChatGPT, Cursor or any MCP client to Solana Pulse. One URL and every tool, with its documentation, is available to the model.',
  '/docs/pricing': 'Solana Pulse pricing: 25 free calls per tool per day, then a few cents in USDC per call through x402. Failed calls are never charged.',
  '/toolbox': 'Try every Solana Pulse tool live in the browser: edit the inputs, run it, and copy the call as curl, TypeScript or MCP.',
  '/status': 'Live Solana Pulse usage: real tool runs, callers and uptime pings, counted without storing IP addresses.',
};

export function metaFor(path: string, sections: NavSection[], index: ToolsIndex | null): { title: string; description: string } {
  if (path === '/') return { title: SITE_TITLE, description: SITE_DESCRIPTION };
  const item = sections.flatMap((s) => s.items).find((i) => i.path === path);
  const tool = index?.tools.find((t) => t.name === toolName(path));
  const title = path === '/owner' ? 'Owner dashboard' : tool ? `${tool.name}: ${tool.title}` : item?.title ?? 'Not found';
  const sentence = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);
  const description = tool ? `${tool.name}: ${sentence(tool.title)} ${tool.useWhen}` : DESCRIPTIONS[path] ?? SITE_DESCRIPTION;
  return { title: `${title} · Solana Pulse`, description };
}
