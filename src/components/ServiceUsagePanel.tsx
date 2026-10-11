import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Bot, Clock3, RefreshCw, Users, UserCheck } from 'lucide-react';
import { useCountUp } from '../hooks/motion';

interface ServiceUsage {
  toolRuns24h: number;
  callers24h: number;
  otherCallers24h: number;
  otherToolRuns7d: number;
  otherCallers7d: number;
  pings24h: number;
  lastToolRunAt: string | null;
  tools: { endpoint: string; runs: number; otherCallers: number; lastRunAt: string }[];
  note: string;
}

const number = new Intl.NumberFormat();
const CountUp: React.FC<{ value: number }> = ({ value }) => <>{number.format(useCountUp(value))}</>;

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
    { label: 'Tool runs · 24h', value: usage ? <CountUp value={usage.toolRuns24h} /> : '—', icon: Activity, accent: 'text-indigo-300' },
    { label: 'Callers besides you · 24h', value: usage ? <CountUp value={usage.otherCallers24h} /> : '—', icon: Users, accent: 'text-emerald-300' },
    { label: 'Runs by others · 7 days', value: usage ? <><CountUp value={usage.otherToolRuns7d} /> · <CountUp value={usage.otherCallers7d} /> callers</> : '—', icon: UserCheck, accent: 'text-cyan-300' },
    { label: 'Uptime pings · 24h', value: usage ? <CountUp value={usage.pings24h} /> : '—', icon: Bot, accent: 'text-violet-300' },
  ];

  return (
    <section aria-labelledby="usage-heading" className="overflow-hidden rounded-2xl border border-white/10 glass">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
            <h2 id="usage-heading" className="text-sm font-semibold text-white">Live service usage</h2>
            
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Refreshes every 15 seconds · caller counts begin when caller tracking is enabled</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          {updatedAt && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />Updated {updatedAt.toLocaleTimeString()}</span>}
          <button onClick={() => void refresh()} aria-label="Refresh service usage" className="rounded-md border border-white/10 p-1.5 hover:border-slate-600 hover:text-white"><RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>
      {failed && !usage ? <p role="status" className="px-5 py-6 text-sm text-slate-400">Live usage is temporarily unavailable. Counts will appear when the analytics service responds.</p> : <>
        <div className="grid grid-cols-2 divide-x divide-y divide-white/10 sm:grid-cols-4 sm:divide-y-0">
          {stats.map(({ label, value, icon: Icon, accent }) => <div key={label} className="px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400"><Icon className={`h-3.5 w-3.5 ${accent}`} />{label}</div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-white">{value}</div>
          </div>)}
        </div>
        <div className="border-t border-white/10 px-5 py-4">
          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><span>Most used tools · 7 days</span><span>Runs · other callers</span></div>
          {usage?.tools.length ? <div className="grid gap-x-8 sm:grid-cols-2">
            {usage.tools.slice(0, 6).map((tool) => <div key={tool.endpoint} className="flex min-w-0 items-center justify-between gap-3 border-t border-white/10 py-2">
              <code className="truncate font-mono text-[11px] text-slate-300">{tool.endpoint}</code>
              <span className="shrink-0 font-mono text-[10px] text-slate-400">{number.format(tool.runs)} · {number.format(tool.otherCallers)}</span>
            </div>)}
          </div> : <p className="py-3 text-xs text-slate-400">{loading ? 'Loading tool counts…' : 'No tool runs recorded in the last 7 days.'}</p>}
          <p className="mt-3 max-w-4xl text-[10px] leading-4 text-slate-400">{usage?.note}</p>
        </div>
      </>}
    </section>
  );
};
