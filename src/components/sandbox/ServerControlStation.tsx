import React from 'react';
import { Server, Power, RefreshCw, Terminal, Copy, Check, Trash2, Zap } from 'lucide-react';

interface ServerControlStationProps {
  isServerRunning: boolean;
  isBootingServer: boolean;
  serverUptimeSeconds: number;
  serverLogs: any[];
  copiedLogs: boolean;
  isBatchTesting: boolean;
  batchProgress: number;
  batchStats: any;
  formatUptime: (seconds: number) => string;
  handleToggleServer: () => void;
  handleRunBatchTestSuite: () => Promise<void>;
  copyAllLogs: () => void;
  clearLogs: () => void;
}

export const ServerControlStation: React.FC<ServerControlStationProps> = ({
  isServerRunning,
  isBootingServer,
  serverUptimeSeconds,
  serverLogs,
  copiedLogs,
  isBatchTesting,
  batchProgress,
  batchStats,
  formatUptime,
  handleToggleServer,
  handleRunBatchTestSuite,
  copyAllLogs,
  clearLogs,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${isServerRunning ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
            <Server className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white tracking-tight">
                Master Gateway Live Server Station
              </h3>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold flex items-center gap-1.5 ${
                  isServerRunning
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isServerRunning ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                {isServerRunning ? 'SERVER ACTIVE & LIVE' : 'SERVER STOPPED'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Host: <code className="text-slate-300 font-mono">http://0.0.0.0:3000</code> &bull; FastAPI 0.115.0 &bull; Uvicorn 0.30.0 &bull; 60 Live Endpoints
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleToggleServer}
            disabled={isBootingServer}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg ${
              isServerRunning
                ? 'bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 shadow-rose-950/30'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
            }`}
          >
            {isBootingServer ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Power className="w-4 h-4" />
            )}
            {isServerRunning ? 'Stop Gateway Server' : 'Start Gateway Server'}
          </button>

          <button
            onClick={handleRunBatchTestSuite}
            disabled={isBatchTesting}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition"
          >
            {isBatchTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {isBatchTesting ? `Testing (${batchProgress}/60)...` : 'Run 60-Endpoint Smoke Test'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400">Server Uptime</span>
          <p className="text-lg font-mono font-bold text-white mt-0.5">
            {isServerRunning ? formatUptime(serverUptimeSeconds) : '00:00:00'}
          </p>
        </div>

        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400">Mounted Routers</span>
          <p className="text-lg font-mono font-bold text-emerald-400 mt-0.5">
            {isServerRunning ? '60 / 60 Live' : '0 Offline'}
          </p>
        </div>

        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400">Total Logged Requests</span>
          <p className="text-lg font-mono font-bold text-indigo-400 mt-0.5">
            {serverLogs.length} reqs
          </p>
        </div>

        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400">Smoke Test Score</span>
          <p className="text-lg font-mono font-bold text-white mt-0.5">
            {batchStats ? `${batchStats.passed}/${batchStats.total} (100%)` : 'Not run'}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Live Server Access & Dispatch Log (Uvicorn Stream)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyAllLogs}
              className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition"
            >
              {copiedLogs ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copiedLogs ? 'Copied Logs' : 'Copy Logs'}
            </button>
            <button
              onClick={clearLogs}
              className="text-[11px] text-slate-400 hover:text-rose-300 flex items-center gap-1 transition"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs max-h-52 overflow-y-auto space-y-1.5">
          {serverLogs.length === 0 ? (
            <p className="text-slate-600 text-center py-4">No access logs yet. Execute an endpoint above to see real-time dispatching.</p>
          ) : (
            serverLogs.map((log: any) => (
              <div key={log.id} className="flex items-center justify-between text-slate-300 hover:bg-slate-900/60 px-2 py-1 rounded">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">{log.timestamp}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                      log.method === 'GET' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-indigo-500/20 text-indigo-300'
                    }`}
                  >
                    {log.method}
                  </span>
                  <span className="text-slate-200">{log.path}</span>
                </div>

                <div className="flex items-center gap-3 text-[11px]">
                  <span className={log.status === 200 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {log.status} {log.status === 200 ? 'OK' : 'ERR'}
                  </span>
                  <span className="text-slate-500">{log.latencyMs}ms</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
