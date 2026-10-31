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
import { TrackRecordPage } from './TrackRecordPage';
import { FlowsPage } from './FlowsPage';
import { MinePage } from './MinePage';
import { ReportPage, ReportsPage } from './ReportsPage';
import { publishedReports } from '../../server/reports/list';

const toolName = (path: string) => path.match(/^\/docs\/tools\/([a-z_]+)$/)?.[1];
// A public report's page; unpublished reports don't exist publicly.
const reportOf = (path: string) => { const n = path.match(/^\/reports\/([a-z0-9-]+)$/)?.[1]; return n ? publishedReports().find((r) => r.name === n) : undefined; };

export function isKnownPath(path: string, index: ToolsIndex | null): boolean {
  if (['/', '/docs/quickstart', '/docs/calls', '/docs/connect', '/docs/pricing', '/status', '/track-record', '/owner', '/mine', '/reports', '/toolbox', '/docs/flows'].includes(path)) return true;
  if (reportOf(path)) return true;
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
  if (path === '/track-record') return <TrackRecordPage />;
  if (path === '/owner') return <OwnerPage />;
  if (path === '/mine') return <MinePage index={index} />;
  if (path === '/reports') return <ReportsPage />;
  const report = reportOf(path);
  if (report) return <ReportPage name={report.name} index={index} />;
  if (name || path === '/toolbox' || path === '/docs/flows') {
    if (index) return name ? <ToolPage name={name} index={index} /> : path === '/docs/flows' ? <FlowsPage index={index} /> : <ToolboxPage index={index} />;
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
  '/docs/flows': 'How every Solana Pulse tool answers, in one table: what you send, what it looks up on the chain (measured), and what it sends back.',
  '/track-record': 'Solana Pulse track record: what token_safety said about new and well-known tokens, against what really happened a day and a week later. Measured, not assumed.',
  '/reports': 'Every check we ran, searchable: Solana code that breaks on version 1 transactions (with the fix) and casino and earn apps that take players\' money. Every source named.',
  '/status': 'Live Solana Pulse usage: real tool runs, callers and uptime pings, counted without storing IP addresses.',
};

export function metaFor(path: string, sections: NavSection[], index: ToolsIndex | null): { title: string; description: string } {
  if (path === '/') return { title: SITE_TITLE, description: SITE_DESCRIPTION };
  const item = sections.flatMap((s) => s.items).find((i) => i.path === path);
  const tool = index?.tools.find((t) => t.name === toolName(path));
  const report = reportOf(path);
  if (report) return { title: `${report.project}: what we found · Solana Pulse reports`, description: report.summary.slice(0, 300) };
  const title = path === '/owner' ? 'Owner dashboard' : path === '/mine' ? 'Your report' : path === '/reports' ? 'Reports' : tool ? `${tool.name}: ${tool.title}` : item?.title ?? 'Not found';
  const sentence = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);
  const description = tool ? `${tool.name}: ${sentence(tool.title)} ${tool.useWhen}` : DESCRIPTIONS[path] ?? SITE_DESCRIPTION;
  return { title: `${title} · Solana Pulse`, description };
}
