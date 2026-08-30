import React, { useState } from 'react';
import { Terminal, Copy, Check, Download, FileCode, CheckCircle2, Play, Sparkles } from 'lucide-react';
import { CODE_SNIPPETS } from '../data/codeSnippets';

export const BashScriptStudio: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<'bootstrap' | 'main' | 'solana' | 'test' | 'reqs'>('bootstrap');
  const [copied, setCopied] = useState(false);

  const getActiveCode = () => {
    switch (selectedFile) {
      case 'bootstrap':
        return CODE_SNIPPETS.fullBashBootstrap;
      case 'main':
        return CODE_SNIPPETS.mainPy;
      case 'solana':
        return CODE_SNIPPETS.solanaPulsePy;
      case 'test':
        return CODE_SNIPPETS.testGatewaySh;
      case 'reqs':
        return CODE_SNIPPETS.requirementsTxt;
      default:
        return CODE_SNIPPETS.fullBashBootstrap;
    }
  };

  const getFilename = () => {
    switch (selectedFile) {
      case 'bootstrap':
        return 'setup_master_gateway.sh';
      case 'main':
        return 'main.py';
      case 'solana':
        return 'routers/solana_pulse.py';
      case 'test':
        return 'test_gateway.sh';
      case 'reqs':
        return 'requirements.txt';
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([getActiveCode()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getFilename().replace('/', '_');
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Terminal className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">
              One-Click Bash Setup & Code Exporter
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Run the automated bootstrap script directly inside your Termux terminal to generate all missing router files, fix pure-Python dependencies, and mount all 60 endpoints instantly.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied Script!' : 'Copy Entire Setup Script'}
          </button>
          <button
            onClick={handleDownload}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-700 transition"
          >
            <Download className="w-4 h-4" />
            Download File
          </button>
        </div>
      </div>

      {/* Code Viewer Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        {/* Navigation Tabs */}
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedFile('bootstrap')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                selectedFile === 'bootstrap'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
              ⚡ Complete Bootstrap (setup.sh)
            </button>

            <button
              onClick={() => setSelectedFile('main')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                selectedFile === 'main'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              main.py
            </button>

            <button
              onClick={() => setSelectedFile('solana')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                selectedFile === 'solana'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              routers/solana_pulse.py
            </button>

            <button
              onClick={() => setSelectedFile('test')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                selectedFile === 'test'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              test_gateway.sh
            </button>

            <button
              onClick={() => setSelectedFile('reqs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                selectedFile === 'reqs'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              requirements.txt
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">{getFilename()}</span>
          </div>
        </div>

        {/* Code Body */}
        <div className="p-4 bg-slate-950/90 overflow-x-auto max-h-[600px] font-mono text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
          {getActiveCode()}
        </div>
      </div>
    </div>
  );
};
