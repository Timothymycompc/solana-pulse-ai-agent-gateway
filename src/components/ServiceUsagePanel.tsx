import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Bot, Clock3, RefreshCw, Users } from 'lucide-react';

interface ServiceUsage {
  window: string;
  calls: number;
  identifiedWallets: number;
  httpCalls: number;
  mcpCalls: number;
  lastCallAt: string | null;
  services: { endpoint: string; calls: number; identifiedWallets: number; lastCallAt: string }[];
  note: string;
}

const number = new Intl.NumberFormat();

export const ServiceUsagePanel: React.FC = () => {
  const [usage, setUsage] = useState<ServiceUsage | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/analytics/usage', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Usage counts are unavailable');
      setUsage(body);
      setUpdatedAt(new Date());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const stats = [
    { label: 'Service calls · 24h', value: usage ? number.format(usage.calls) : '—', icon: Activity, accent: 'text-indigo-300' },
    { label: 'HTTP API calls', value: usage ? number.format(usage.httpCalls) : '—', icon: Activity, accent: 'text-cyan-300' },
    { label: 'MCP calls', value: usage ? number.format(usage.mcpCalls) : '—', icon: Bot, accent: 'text-violet-300' },
    { label: 'Identified wallets · 24h', value: usage ? number.format(usage.identifiedWallets) : '—', icon: Users, accent: 'text-emerald-300' },
  ];

  return (
    <section aria-labelledby="usage-heading" className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/65">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
            <h2 id="usage-heading" className="text-sm font-semibold text-white">Live service usage</h2>
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">rolling 24 hours</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Refreshes every 15 seconds · totals begin when live tracking is enabled</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          {updatedAt && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />Updated {updatedAt.toLocaleTimeString()}</span>}
          <button onClick={() => void refresh()} aria-label="Refresh service usage" className="rounded-md border border-slate-800 p-1.5 hover:border-slate-600 hover:text-white"><RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>
      {failed && !usage ? <p role="status" className="px-5 py-6 text-sm text-slate-400">Live usage is temporarily unavailable. Counts will appear when the analytics service responds.</p> : <>
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-800 sm:grid-cols-4 sm:divide-y-0">
          {stats.map(({ label, value, icon: Icon, accent }) => <div key={label} className="px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500"><Icon className={`h-3.5 w-3.5 ${accent}`} />{label}</div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-white">{value}</div>
          </div>)}
        </div>
        <div className="border-t border-slate-800 px-5 py-4">
          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><span>Most called routes</span><span>Calls · wallets</span></div>
          {usage?.services.length ? <div className="grid gap-x-8 sm:grid-cols-2">
            {usage.services.slice(0, 6).map((service) => <div key={service.endpoint} className="flex min-w-0 items-center justify-between gap-3 border-t border-slate-800/70 py-2">
              <code className="truncate font-mono text-[11px] text-slate-300">{service.endpoint}</code>
              <span className="shrink-0 font-mono text-[10px] text-slate-500">{number.format(service.calls)} · {number.format(service.identifiedWallets)}</span>
            </div>)}
          </div> : <p className="py-3 text-xs text-slate-500">{loading ? 'Loading route counts…' : 'No calls recorded in this window yet.'}</p>}
          <p className="mt-3 max-w-4xl text-[10px] leading-4 text-slate-500">{usage?.note || 'Calls include anonymous requests. Wallet totals count authenticated wallet accounts only; anonymous callers are counted as calls but are not individually identified.'}</p>
        </div>
      </>}
    </section>
  );
};
