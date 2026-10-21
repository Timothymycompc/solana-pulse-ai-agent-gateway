// Client for the owner dashboard (GET /api/owner/overview, owner key in x-api-key) and the site's page-view counter.

export type Kind = 'you' | 'bot' | 'ai_app' | 'script' | 'browser' | 'other' | 'unknown';

export type ToolStats = {
  tool: string; known: boolean; oldName: string | null; price: string | null;
  runs: number; http: number; mcp: number; errors: number; freeCalls: number; ownerCalls: number; paymentAsked: number;
  byKind: Record<Kind, number>; callers: number; lastRunAt: string | null;
  payments: number; revenueUsdc: number; paymentsWindow: number; revenueWindowUsdc: number; revenueOthersUsdc: number; otherPayers: number;
  // All-time payments under each name the tool was paid as: its current name first, then its pre-October-2026 name.
  byName: { name: string; payments: number; revenueUsdc: number }[];
};

export type CallerRef = { id: string; kind: Kind; name: string; network: string | null };

export type CallerStats = CallerRef & {
  clientKind: Kind; homepage: string | null; userAgent: string | null; mcpClient: string | null;
  runs: number; pings: number; reads: number; errors: number; paidCalls: number; paidUsdc: number;
  tools: { tool: string; runs: number }[]; firstSeen: string; lastSeen: string;
};

export type Visitors = {
  liveNow: number; last30Minutes: number; visitors24h: number; views24h: number;
  visitors: number; views: number; botViews: number; ownViews: number; mobile: number; desktop: number;
  bucket: 'hour' | 'day';
  series: { start: string; views: number; visitors: number }[];
  pages: { path: string; views: number; visitors: number }[];
  referrers: { host: string; views: number }[];
  devices: { name: string; visitors: number }[];
  recent: { at: string; path: string; referrer: string | null; device: string; visitor: string | null }[];
};

export type OwnerOverview = {
  generatedAt: string; days: number; kindLabels: Record<Kind, string>;
  revenue: {
    allTimeUsdc: number; windowUsdc: number; last24hUsdc: number; fromOthersUsdc: number; fromOthersWindowUsdc: number;
    payments: number; paymentsWindow: number; payers: number; otherPayers: number;
  };
  tools: ToolStats[];
  kinds: Record<Kind, { label: string; callers: number; runs: number; requests: number }>;
  callers: CallerStats[]; callerCount: number;
  outreach: { key: string; name: string; userAgent: string; tools: string; runs: number; since: string; until: string; active: boolean }[];
  recentRuns: { at: string; tool: string; transport: 'http' | 'mcp'; status: number; outcome: string; caller: CallerRef; noteSent: boolean; input: unknown; output: unknown }[];
  payers: { payer: string; mine: boolean; payments: number; usdc: number; tools: number; firstAt: string; lastAt: string }[];
  recentPayments: { at: string; tool: string; amountUsdc: number; payer: string; mine: boolean; txSignature: string; caller: CallerRef | null }[];
  visitors: Visitors;
};

export class OwnerKeyError extends Error {}

export async function loadOwnerOverview(key: string, days: number): Promise<OwnerOverview> {
  const r = await fetch(`/api/owner/overview?days=${days}`, { headers: { 'x-api-key': key }, cache: 'no-store' });
  const body = await r.json().catch(() => ({}));
  if (r.status === 401) throw new OwnerKeyError(body.error || 'That key was not accepted.');
  if (!r.ok) throw new Error(body.error || `The dashboard could not load (HTTP ${r.status}).`);
  return body;
}

// Calls tab: every tool call in a period from GET /api/owner/calls, filtered and paged by the server.
export type InputKind = 'own' | 'example' | 'empty';
export type CallStatus = 'ok' | 'error' | 'payment';
export type CallRow = {
  id: number; at: string; tool: string; transport: 'http' | 'mcp'; status: number; outcome: string; statusGroup: CallStatus;
  inputKind: InputKind; paidUsdc: number; noteSent: boolean; verdict: string | null; headline: string | null;
  caller: CallerRef & { userAgent: string | null; mcpClient: string | null; homepage: string | null; rotatesBrowsers: boolean };
};
export type GroupBy = 'caller' | 'network' | 'tool' | 'kind' | 'input';
export type GroupSort = 'calls' | 'recent' | 'own' | 'errors' | 'paid';
export type CallGroup = {
  key: string; label: string; filter: Partial<CallFilters>; kind: Kind | null; network: string | null; userAgent: string | null;
  rotatesBrowsers: boolean; calls: number; own: number; examples: number; empty: number; errors: number; payments: number; paidUsdc: number;
  firstAt: string; lastAt: string; tools: { tool: string; n: number }[]; names: string[]; networks: number;
};
export type OwnerCalls = {
  generatedAt: string; hours: number; matching: number; rows: CallRow[]; nextBefore: number | null;
  group: GroupBy | null; groups: CallGroup[] | null;
  summary: {
    calls: number; capped: boolean; networks: number; rotatingNetworks: number;
    byTool: Record<string, number>; byKind: Record<string, number>; byInput: Record<string, number>; byStatus: Record<string, number>;
  };
};
export type CallFilters = {
  hours: number; tool?: string; kind?: string; input?: string; status?: string; q?: string; caller?: string; network?: string;
  group?: GroupBy; sort?: GroupSort;
};

async function ownerGet<T>(key: string, path: string): Promise<T> {
  const r = await fetch(path, { headers: { 'x-api-key': key }, cache: 'no-store' });
  const body = await r.json().catch(() => ({}));
  if (r.status === 401) throw new OwnerKeyError(body.error || 'That key was not accepted.');
  if (!r.ok) throw new Error(body.error || `Could not load (HTTP ${r.status}).`);
  return body;
}

export function loadOwnerCalls(key: string, f: CallFilters & { before?: number; after?: number; limit?: number }): Promise<OwnerCalls> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') params.set(k, String(v));
  return ownerGet(key, `/api/owner/calls?${params}`);
}

export const loadOwnerCall = (key: string, id: number) => ownerGet<{ id: number; input: unknown; output: unknown }>(key, `/api/owner/calls/${id}`);

// Ends a personal note to a caller (they replied, or it went to the wrong caller).
export async function stopOutreach(key: string, outreachKey: string): Promise<void> {
  const r = await fetch('/api/owner/outreach/stop', { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ key: outreachKey }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Could not stop the note (HTTP ${r.status}).`);
}

// The owner key is kept for this tab only, unless the owner asks to stay signed in on this device.
const KEY_NAME = 'pulse-owner-key';
export const ownerKeyStore = {
  get(): string {
    try { return sessionStorage.getItem(KEY_NAME) || localStorage.getItem(KEY_NAME) || ''; } catch { return ''; }
  },
  set(key: string, remember: boolean) {
    try { sessionStorage.setItem(KEY_NAME, key); if (remember) localStorage.setItem(KEY_NAME, key); } catch { /* storage blocked */ }
  },
  clear() {
    try { sessionStorage.removeItem(KEY_NAME); localStorage.removeItem(KEY_NAME); } catch { /* storage blocked */ }
  },
};

// One page view per load and per in-site navigation: the path, plus the referring site on the first view only.
let firstView = true;
export function recordPageView(path: string) {
  const body = JSON.stringify({ path, referrer: firstView ? document.referrer : '' });
  firstView = false;
  try {
    if (navigator.sendBeacon?.('/api/analytics/view', new Blob([body], { type: 'application/json' }))) return;
  } catch { /* fall through to fetch */ }
  void fetch('/api/analytics/view', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
}
