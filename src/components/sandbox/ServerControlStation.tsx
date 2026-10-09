import React from 'react';
import { Activity, Check, Copy, RefreshCw, Terminal, Trash2, Zap } from 'lucide-react';

interface ServerAccessLog {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
}

interface ServerControlStationProps {
  serverLogs: ServerAccessLog[];
  copiedLogs: boolean;
  isBatchTesting: boolean;
  batchProgress: number;
  batchStats: { total: number; passed: number; failed: number; avgLatency: number } | null;
  handleRunBatchTestSuite: () => Promise<void>;
  copyAllLogs: () => void;
  clearLogs: () => void;
}

export const ServerControlStation: React.FC<ServerControlStationProps> = ({
  serverLogs,
  copiedLogs,
  isBatchTesting,
  batchProgress,
  batchStats,
  handleRunBatchTestSuite,
  copyAllLogs,
  clearLogs,
}) => {
  const passRate = batchStats?.total ? Math.round((batchStats.passed / batchStats.total) * 100) : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-indigo-500/15 text-indigo-300"><Activity className="w-6 h-6" /></div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Hosted Gateway Checks</h3>
            <p className="text-xs text-slate-400 mt-0.5">Requests run against this deployment. This panel cannot start or stop the hosted service.</p>
          </div>
        </div>
        <button
          onClick={handleRunBatchTestSuite}
          disabled={isBatchTesting}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition"
        >
          {isBatchTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {isBatchTesting ? `Checking ${batchProgress} routes…` : 'Check available routes'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400">Gateway URL</span>
          <p className="text-sm font-mono font-bold text-white mt-1 truncate" title={window.location.origin}>{window.location.host}</p>
        </div>
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400">Calls in this session</span>
          <p className="text-lg font-mono font-bold text-indigo-400 mt-0.5">{serverLogs.length}</p>
        </div>
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400">Last route check</span>
          <p className="text-lg font-mono font-bold text-white mt-0.5">{batchStats ? `${batchStats.passed}/${batchStats.total} passed` : 'Not run'}</p>
        </div>
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400">Average response</span>
          <p className="text-lg font-mono font-bold text-white mt-0.5">{batchStats ? `${batchStats.avgLatency} ms` : '—'}</p>
        </div>
      </div>

      {batchStats && <p className="text-xs text-slate-400">{passRate}% passed · {batchStats.failed} failed. Checks call the available free GET routes only; no paid credits are used.</p>}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Recent calls from this browser session</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={copyAllLogs} className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition">
              {copiedLogs ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copiedLogs ? 'Copied' : 'Copy'}
            </button>
            <button onClick={clearLogs} className="text-[11px] text-slate-400 hover:text-rose-300 flex items-center gap-1 transition">
              <Trash2 className="w-3 h-3" />Clear
            </button>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs max-h-52 overflow-y-auto space-y-1.5">
          {serverLogs.length === 0 ? (
            <p className="text-slate-600 text-center py-4">No calls in this browser session yet. Run an endpoint above to see its result here.</p>
          ) : serverLogs.map((log) => (
            <div key={log.id} className="flex items-center justify-between text-slate-300 hover:bg-slate-900/60 px-2 py-1 rounded">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] text-slate-500">{log.timestamp}</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${log.method === 'GET' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-indigo-500/20 text-indigo-300'}`}>{log.method}</span>
                <span className="text-slate-200 truncate">{log.path}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] shrink-0">
                <span className={log.status >= 200 && log.status < 300 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{log.status}</span>
                <span className="text-slate-500">{log.latencyMs}ms</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
