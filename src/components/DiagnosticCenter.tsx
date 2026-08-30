import React, { useState } from 'react';
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Terminal,
  Cpu,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  Code,
  Trash2,
  RotateCcw,
  Smartphone,
  Server,
  Info
} from 'lucide-react';
import { DIAGNOSTIC_ISSUES } from '../data/diagnosticData';
import { DiagnosticIssue } from '../types';

export const DiagnosticCenter: React.FC = () => {
  const [issues, setIssues] = useState<DiagnosticIssue[]>(DIAGNOSTIC_ISSUES);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testingFixId, setTestingFixId] = useState<string | null>(null);
  const [showTerminalGuide, setShowTerminalGuide] = useState(true);

  const visibleIssues = issues.filter(i => !dismissedIds.includes(i.id));
  const resolvedCount = issues.filter(i => i.isResolved).length;

  const copyCommand = (id: string, cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSimulateFix = (id: string) => {
    setTestingFixId(id);
    setTimeout(() => {
      setIssues(prev =>
        prev.map(item => (item.id === id ? { ...item, isResolved: true } : item))
      );
      setTestingFixId(null);
    }, 600);
  };

  const handleDismissIssue = (id: string) => {
    setDismissedIds(prev => [...prev, id]);
  };

  const handleClearAllResolved = () => {
    const resolvedIds = issues.filter(i => i.isResolved).map(i => i.id);
    setDismissedIds(prev => Array.from(new Set([...prev, ...resolvedIds])));
  };

  const handleRestoreAll = () => {
    setDismissedIds([]);
    setIssues(DIAGNOSTIC_ISSUES.map(i => ({ ...i, isResolved: false })));
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
                <Wrench className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Termux & Local Environment Diagnostic Hub
              </h2>
            </div>
            <p className="text-xs text-slate-300 mt-2 max-w-2xl leading-relaxed">
              Automated root-cause analysis for Android/Termux mobile compilation faults, PyO3/Maturin missing wheels, 404 router registration drops, and process port bindings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-950 text-slate-300 border border-slate-800">
              Resolved: {resolvedCount} / {issues.length}
            </span>

            {resolvedCount > 0 && visibleIssues.some(i => i.isResolved) && (
              <button
                onClick={handleClearAllResolved}
                className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                title="Clear and remove all resolved issues from the view"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                Clear Resolved ({visibleIssues.filter(i => i.isResolved).length})
              </button>
            )}

            {dismissedIds.length > 0 && (
              <button
                onClick={handleRestoreAll}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore All ({dismissedIds.length} cleared)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Terminal Location Clarifier Card */}
      {showTerminalGuide && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 mt-0.5 shrink-0">
                <Info className="w-5 h-5" />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Which terminal is this Diagnostic Hub referring to?</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] uppercase font-mono">
                    Clarification
                  </span>
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  These diagnostics and commands refer to the <strong>terminal shell where you run your Python FastAPI backend</strong>. Depending on where you develop, that means:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs mb-1">
                      <Smartphone className="w-4 h-4 text-indigo-400" />
                      1. Android Termux App
                    </div>
                    <p className="text-[11px] text-slate-400">
                      The <code className="text-indigo-300 font-mono">Termux</code> terminal app installed on your Android device (e.g. running <code className="text-slate-300 font-mono">python3 main.py</code>).
                    </p>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs mb-1">
                      <Terminal className="w-4 h-4 text-cyan-400" />
                      2. Local Computer Shell
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Your standard Bash, Zsh, or PowerShell terminal window on Mac, Linux, or Windows WSL.
                    </p>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs mb-1">
                      <Server className="w-4 h-4 text-emerald-400" />
                      3. Cloud & Server Shell
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Remote SSH session, Docker container, or Cloud Run instance hosting the master gateway.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowTerminalGuide(false)}
              className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1 rounded-lg hover:bg-slate-800 transition shrink-0"
            >
              Dismiss Guide
            </button>
          </div>
        </div>
      )}

      {/* Issues Grid */}
      {visibleIssues.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">All Diagnostics Clean & Cleared!</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            All detected environment issues have been resolved and cleared. Your Termux and local gateway environment is 100% compliant.
          </p>
          <button
            onClick={handleRestoreAll}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold inline-flex items-center gap-2 border border-slate-700 transition"
          >
            <RotateCcw className="w-4 h-4" />
            Restore Diagnostics List
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleIssues.map((issue) => (
            <div
              key={issue.id}
              className={`border rounded-2xl p-6 transition shadow-lg ${
                issue.isResolved
                  ? 'bg-slate-900/60 border-emerald-500/30'
                  : issue.severity === 'critical'
                  ? 'bg-slate-900 border-rose-500/30'
                  : 'bg-slate-900 border-amber-500/30'
              }`}
            >
              {/* Issue Top */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2.5 rounded-xl ${
                      issue.isResolved
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : issue.severity === 'critical'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {issue.isResolved ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">{issue.title}</h3>
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          issue.isResolved
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : issue.severity === 'critical'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {issue.isResolved ? 'Resolved' : issue.severity}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{issue.summary}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!issue.isResolved ? (
                    <button
                      onClick={() => handleSimulateFix(issue.id)}
                      disabled={testingFixId === issue.id}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                    >
                      {testingFixId === issue.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      Mark Resolved
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-950/40 px-2.5 py-1 rounded-xl border border-emerald-800/60">
                        <Check className="w-3.5 h-3.5" />
                        Fixed
                      </span>
                      <button
                        onClick={() => handleDismissIssue(issue.id)}
                        className="px-3 py-1 bg-slate-800 hover:bg-rose-900/60 hover:text-rose-300 text-slate-300 border border-slate-700 hover:border-rose-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                        title="Dismiss and clear this resolved issue from view"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Clear Issue
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Error Log Snippet */}
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-rose-400" />
                    Captured Terminal Output (Termux Shell Log)
                  </p>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-rose-300/90 whitespace-pre-wrap overflow-x-auto">
                    {issue.detectedLogSnippet}
                  </div>
                </div>

                {/* Root Cause & Deep Explanation */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                      🔍 Deep Root Cause
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">{issue.rootCause}</p>
                  </div>

                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                    <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-1">
                      💡 Verified Fix Logic
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">{issue.fixExplanation}</p>
                  </div>
                </div>

                {/* One-Click Terminal Command */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Run This in Your Terminal (Termux / Linux / Mac)
                    </p>
                    <button
                      onClick={() => copyCommand(issue.id, issue.fixCommand)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
                    >
                      {copiedId === issue.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Command</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-emerald-400 whitespace-pre-wrap overflow-x-auto">
                    {issue.fixCommand}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
