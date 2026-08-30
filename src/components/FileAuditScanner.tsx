import React, { useState, useMemo, useRef } from 'react';
import {
  Upload,
  FolderOpen,
  FileCode,
  AlertTriangle,
  File,
  Eye,
  X,
  Search,
  CheckCircle2,
  Layers,
  Sparkles,
  Download,
  Terminal,
  ShieldCheck,
  Wrench,
  Copy,
  Check,
  Zap,
  Trash2,
  ArrowRight
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid
} from 'recharts';
import { ScannedFile, ExtensionStat } from '../types';

interface FileAuditScannerProps {
  files: ScannedFile[];
  onFilesChange: (files: ScannedFile[]) => void;
  onLoadSampleRepo: (repoType: 'termux_gateway' | 'fastapi_suite' | 'clean_python') => void;
}

const EXT_COLORS: Record<string, string> = {
  py: '#3b82f6',
  ts: '#6366f1',
  tsx: '#818cf8',
  js: '#f59e0b',
  json: '#10b981',
  sh: '#ec4899',
  txt: '#64748b',
  md: '#06b6d4',
  lock: '#a855f7',
  env: '#ef4444',
  so: '#dc2626',
  whl: '#b91c1c',
  pyc: '#991b1b',
  default: '#64748b'
};

export const FileAuditScanner: React.FC<FileAuditScannerProps> = ({
  files,
  onFilesChange,
  onLoadSampleRepo,
}) => {
  const [isAuditStarted, setIsAuditStarted] = useState<boolean>(true);
  const [selectedExt, setSelectedExt] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [previewFile, setPreviewFile] = useState<ScannedFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [remediatingFile, setRemediatingFile] = useState<ScannedFile | null>(null);
  const [appliedFix, setAppliedFix] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Auto-remediate pydantic_core risk
  const handleAutoFixPydanticRisk = (fileToFix: ScannedFile) => {
    // Replace the problematic pydantic_core binary/wheel with compatible pure-python pydantic v1.10.18
    const updatedFiles = files.map(f => {
      if (f.id === fileToFix.id || f.name.includes('pydantic_core')) {
        return {
          ...f,
          name: 'pydantic-1.10.18 (Pure Python)',
          path: 'site-packages/pydantic/__init__.py',
          size: 14200,
          extension: 'py',
          type: 'text/x-python',
          isHeavyCompileRisk: false,
          isBinary: false,
          status: 'compatible' as const,
          contentPreview: `# Pydantic v1.10.18 (Pure-Python Mode)
# No Rust, no Cargo, no Maturin build required.
# 100% Native ARM / Termux & aarch64 Python Compatibility.`
        };
      }
      if (f.name === 'requirements.txt') {
        return {
          ...f,
          contentPreview: `fastapi==0.115.0\nuvicorn==0.30.0\npydantic<2.0.0\nrequests==2.31.0\n`
        };
      }
      return f;
    });

    onFilesChange(updatedFiles);
    setAppliedFix(true);
    setTimeout(() => {
      setRemediatingFile(null);
      setAppliedFix(false);
    }, 1200);
  };

  // Instant Purge of Heavy Binaries
  const handlePurgeHeavyBinaries = () => {
    const updated = files.map(f => {
      if (f.extension === 'whl' || f.isHeavyCompileRisk || f.name.includes('pydantic_core')) {
        return {
          ...f,
          name: 'pydantic-1.10.18 (Pure Python)',
          path: 'site-packages/pydantic/__init__.py',
          size: 14200,
          extension: 'py',
          type: 'text/x-python',
          isHeavyCompileRisk: false,
          isBinary: false,
          status: 'compatible' as const,
          contentPreview: `# Pydantic v1.10.18 (Pure-Python Mode)\n# Reduced size to ~14.2 KB`
        };
      }
      return f;
    });
    onFilesChange(updated);
  };

  // Delete Individual File
  const handleDeleteFile = (fileId: string) => {
    onFilesChange(files.filter(f => f.id !== fileId));
  };

  // Parse raw files
  const processFiles = (rawFiles: FileList | File[]) => {
    const list: File[] = Array.from(rawFiles);
    const parsed: ScannedFile[] = list.map((file, idx) => {
      const path = (file as any).webkitRelativePath || file.name;
      const parts = file.name.split('.');
      const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : 'no-ext';
      const isDotfile = file.name.startsWith('.');
      const isBinary = ['so', 'whl', 'pyc', 'bin', 'tar', 'gz', 'zip'].includes(ext);
      const isHeavyCompileRisk = ['c', 'cpp', 'rs', 'whl', 'so'].includes(ext) || file.name.includes('pydantic_core');

      let status: ScannedFile['status'] = 'compatible';
      if (isDotfile) status = 'hidden';
      else if (isHeavyCompileRisk) status = 'compile-risk';
      else if (file.size === 0) status = 'empty';

      return {
        id: `file-${idx}-${file.name}`,
        name: file.name,
        path: path,
        size: file.size,
        extension: ext,
        lastModified: file.lastModified,
        type: file.type || 'text/plain',
        isDotfile,
        isBinary,
        isHeavyCompileRisk,
        status,
        rawFile: file,
        contentPreview: file.size < 50000 ? `[Click preview to read ${file.name}]` : '[File size > 50KB]'
      };
    });

    onFilesChange(parsed);
    setSelectedExt(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  // Extension distribution statistics
  const extensionStats: ExtensionStat[] = useMemo(() => {
    const map = new Map<string, { count: number; totalSize: number }>();
    files.forEach(f => {
      const ext = f.extension || 'no-ext';
      const curr = map.get(ext) || { count: 0, totalSize: 0 };
      map.set(ext, { count: curr.count + 1, totalSize: curr.totalSize + f.size });
    });

    return Array.from(map.entries()).map(([ext, data]) => {
      let category: ExtensionStat['category'] = 'code';
      if (['json', 'yaml', 'yml', 'env', 'toml', 'ini'].includes(ext)) category = 'config';
      else if (['txt', 'md', 'doc', 'rst'].includes(ext)) category = 'document';
      else if (['csv', 'sql', 'db', 'sqlite'].includes(ext)) category = 'data';
      else if (['so', 'whl', 'pyc', 'bin', 'exe'].includes(ext)) category = 'binary';
      else if (ext.startsWith('.')) category = 'hidden';

      return {
        ext,
        name: ext === 'no-ext' ? '[none]' : `.${ext}`,
        count: data.count,
        totalSize: data.totalSize,
        color: EXT_COLORS[ext] || EXT_COLORS.default,
        category
      };
    }).sort((a, b) => b.count - a.count);
  }, [files]);

  // Filtered files table
  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      const matchesExt = !selectedExt || f.extension === selectedExt;
      const matchesSearch =
        !searchQuery ||
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.path.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesCategory = true;
      if (filterCategory === 'risk') matchesCategory = f.isHeavyCompileRisk || f.status === 'compile-risk';
      if (filterCategory === 'hidden') matchesCategory = f.isDotfile;
      if (filterCategory === 'code') matchesCategory = ['py', 'ts', 'tsx', 'js', 'sh'].includes(f.extension);

      return matchesExt && matchesSearch && matchesCategory;
    });
  }, [files, selectedExt, searchQuery, filterCategory]);

  const totalBytes = useMemo(() => files.reduce((acc, f) => acc + f.size, 0), [files]);
  const hiddenCount = useMemo(() => files.filter(f => f.isDotfile).length, [files]);
  const compileRiskCount = useMemo(() => files.filter(f => f.isHeavyCompileRisk).length, [files]);

  const handleReadPreview = async (f: ScannedFile) => {
    if (f.rawFile) {
      try {
        const text = await f.rawFile.text();
        setPreviewFile({ ...f, contentPreview: text.slice(0, 10000) });
      } catch (err) {
        setPreviewFile({ ...f, contentPreview: '// Could not read binary or protected file stream.' });
      }
    } else {
      setPreviewFile(f);
    }
  };

  const exportAuditReport = () => {
    const report = {
      auditTimestamp: new Date().toISOString(),
      totalFiles: files.length,
      totalBytes,
      extensionDistribution: extensionStats,
      detectedRisks: {
        compileRiskFiles: compileRiskCount,
        hiddenDotfiles: hiddenCount
      },
      fileList: files.map(f => ({ name: f.name, path: f.path, size: f.size, ext: f.extension }))
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `file-visibility-audit-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Workspace selector */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Scanned</p>
            <h3 className="text-2xl font-bold text-white mt-1">{files.length} <span className="text-sm font-normal text-slate-400">files</span></h3>
          </div>
          <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Size</p>
              <h3 className="text-2xl font-bold text-white mt-1">
                {(totalBytes / 1024).toFixed(1)} <span className="text-sm font-normal text-slate-400">KB</span>
              </h3>
            </div>
            <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
              <FileCode className="w-5 h-5" />
            </div>
          </div>
          {totalBytes > 50000 && (
            <button
              onClick={handlePurgeHeavyBinaries}
              className="mt-3 w-full py-1 px-2 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              Purge Heavy Binaries (→ 15 KB)
            </button>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Compile / Rust Risks</p>
            <h3 className={`text-2xl font-bold mt-1 ${compileRiskCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {compileRiskCount} <span className="text-sm font-normal text-slate-400">items</span>
            </h3>
          </div>
          <div className={`p-3 rounded-xl border ${compileRiskCount > 0 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hidden Dotfiles</p>
            <h3 className="text-2xl font-bold text-white mt-1">{hiddenCount} <span className="text-sm font-normal text-slate-400">detected</span></h3>
          </div>
          <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20 text-purple-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Upload Zone and Presets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Drag and Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`lg:col-span-2 border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition cursor-pointer relative bg-slate-950/40 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-950/20'
              : 'border-slate-800 hover:border-slate-700'
          }`}
          onClick={() => folderInputRef.current?.click()}
        >
          <div className="h-16 w-16 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-center mb-4 text-indigo-400 shadow-inner">
            <Upload className="w-8 h-8 animate-bounce" />
          </div>
          <h3 className="text-base font-semibold text-white">
            Drag & Drop Your Project Directory or Files Here
          </h3>
          <p className="text-xs text-slate-400 max-w-md mt-1.5 leading-relaxed">
            Recursively scans all sub-folders, identifies Python/Rust build artifacts, flags Termux-incompatible wheels, and parses extension frequencies.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                folderInputRef.current?.click();
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition"
            >
              <FolderOpen className="w-4 h-4" />
              Scan Folder (Recursive)
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition border border-slate-700"
            >
              <File className="w-4 h-4" />
              Select Individual Files
            </button>
          </div>

          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && processFiles(e.target.files)}
            // @ts-ignore
            webkitdirectory="true"
            directory="true"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && processFiles(e.target.files)}
          />
        </div>

        {/* Preset Repositories for instant testing */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white mb-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Instant Workspace Presets
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Load simulated real-world repository structures to audit extension distributions and identify compilation risks immediately:
            </p>

            <div className="space-y-2.5">
              <button
                onClick={() => onLoadSampleRepo('clean_python')}
                className="w-full text-left p-3 rounded-xl bg-slate-950/60 hover:bg-indigo-950/30 border border-slate-800 hover:border-indigo-500/50 transition group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 group-hover:text-indigo-300">
                    Termux Clean Gateway (~18 KB)
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold">
                    Pure Python
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Optimized workspace with zero compile risks, pure python pydantic, and fast execution.
                </p>
              </button>

              <button
                onClick={() => onLoadSampleRepo('heavy_rust')}
                className="w-full text-left p-3 rounded-xl bg-slate-950/60 hover:bg-rose-950/20 border border-slate-800 hover:border-rose-500/40 transition group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 group-hover:text-rose-300">
                    Simulate Rust Error (2.8 MB Wheel)
                  </span>
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded">
                    Has Rust Wheel
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Includes heavy pydantic_core binary wheel to test risk detection and automatic remediation.
                </p>
              </button>
            </div>
          </div>

          {files.length > 0 && (
            <button
              onClick={exportAuditReport}
              className="mt-4 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Export Audit JSON
            </button>
          )}
        </div>
      </div>

      {/* Bar Chart & Interactive Extension Frequency */}
      {extensionStats.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  File Extension Frequency & Volume
                </h3>
                {selectedExt && (
                  <span className="text-xs bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                    Filtered to: .{selectedExt}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Click any bar below to instantly isolate and inspect the corresponding files in the table.
              </p>
            </div>

            {selectedExt && (
              <button
                onClick={() => setSelectedExt(null)}
                className="self-start sm:self-auto text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
              >
                Clear Selection
              </button>
            )}
          </div>

          {/* Recharts Bar Chart */}
          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={extensionStats}
                margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload.length > 0) {
                    const ext = e.activePayload[0].payload.ext;
                    setSelectedExt(selectedExt === ext ? null : ext);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  interval={0}
                />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as ExtensionStat;
                      return (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 shadow-2xl text-xs space-y-1">
                          <p className="font-bold text-white flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: data.color }} />
                            Extension: {data.name}
                          </p>
                          <p className="text-slate-400">Total Count: <strong className="text-slate-200">{data.count}</strong> files</p>
                          <p className="text-slate-400">Disk Volume: <strong className="text-slate-200">{(data.totalSize / 1024).toFixed(1)} KB</strong></p>
                          <p className="text-[10px] text-indigo-400 pt-1">💡 Click bar to filter table</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="count"
                  radius={[6, 6, 0, 0]}
                  cursor="pointer"
                >
                  {extensionStats.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={selectedExt === entry.ext ? '#818cf8' : entry.color}
                      stroke={selectedExt === entry.ext ? '#ffffff' : 'transparent'}
                      strokeWidth={1.5}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Quick Extension Chips */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
            {extensionStats.map((item) => (
              <button
                key={item.ext}
                onClick={() => setSelectedExt(selectedExt === item.ext ? null : item.ext)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition ${
                  selectedExt === item.ext
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                    : 'bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span>{item.name}</span>
                <span className="text-[10px] opacity-75 font-bold">({item.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Detailed File List & Search Table */}
      {files.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {/* Table Header Controls */}
          <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search file name or relative path..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <button
                onClick={() => setFilterCategory('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  filterCategory === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                All ({files.length})
              </button>
              <button
                onClick={() => setFilterCategory('code')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  filterCategory === 'code'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Code Files
              </button>
              <button
                onClick={() => setFilterCategory('risk')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  filterCategory === 'risk'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Compile Risks ({compileRiskCount})
              </button>
              <button
                onClick={() => setFilterCategory('hidden')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  filterCategory === 'hidden'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Dotfiles ({hiddenCount})
              </button>
            </div>
          </div>

          {/* Table Body */}
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] sticky top-0 z-10 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">File Name & Path</th>
                  <th className="py-3 px-4">Ext</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Audit Status</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredFiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No files match the current query or filter.
                    </td>
                  </tr>
                ) : (
                  filteredFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-slate-800/40 transition group">
                      <td className="py-2.5 px-4 font-mono font-medium text-slate-200">
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4 text-indigo-400 shrink-0" />
                          <div>
                            <p className="text-white font-semibold">{file.name}</p>
                            <p className="text-[10px] text-slate-500">{file.path}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{
                            backgroundColor: `${EXT_COLORS[file.extension] || '#64748b'}20`,
                            color: EXT_COLORS[file.extension] || '#94a3b8'
                          }}
                        >
                          .{file.extension}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-400">
                        {(file.size / 1024).toFixed(1)} KB
                      </td>
                      <td className="py-2.5 px-4">
                        {file.isHeavyCompileRisk ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <AlertTriangle className="w-3 h-3" />
                            Termux Rust Risk
                          </span>
                        ) : file.isDotfile ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            Hidden Dotfile
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            Clean
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {file.isHeavyCompileRisk && (
                            <button
                              onClick={() => setRemediatingFile(file)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition inline-flex items-center gap-1 text-[11px] font-semibold"
                              title="Resolve Termux Rust / Maturin compilation blocker"
                            >
                              <Wrench className="w-3 h-3 text-amber-400" />
                              Fix Risk
                            </button>
                          )}
                          <button
                            onClick={() => handleReadPreview(file)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white transition inline-flex items-center gap-1 text-[11px]"
                            title="Inspect file contents"
                          >
                            <Eye className="w-3 h-3" />
                            View
                          </button>
                          <button
                            onClick={() => handleDeleteFile(file.id)}
                            className="p-1 rounded-lg bg-slate-800/80 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700/50 hover:border-rose-500/40 transition"
                            title="Delete file from workspace audit"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Remediate / Fix Risk Modal */}
      {remediatingFile && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Resolve Termux Rust Compilation Risk</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{remediatingFile.name}</p>
                </div>
              </div>
              <button
                onClick={() => setRemediatingFile(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-300">
              <div className="bg-amber-950/30 border border-amber-800/60 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Root Cause Analysis:</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  <code className="bg-amber-900/40 text-amber-200 px-1 py-0.5 rounded font-mono">pydantic_core</code> is a compiled Rust extension (Maturin / PyO3). In Android/Termux environments, pre-compiled wheels for Python 3.12+ are unavailable on PyPI, which triggers an in-place <code className="bg-slate-950 px-1 py-0.5 rounded font-mono">cargo build</code> that fails without full Rust toolchain headers.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider">Recommended Remediation</h4>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-200">Switch to Pure-Python Pydantic (<code className="text-emerald-400">pydantic&lt;2.0.0</code>)</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Pydantic v1.10.x runs 100% in pure Python without requiring Rust or Maturin, providing instant, error-free execution on Termux.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold text-slate-400">Terminal Command:</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText('pip install "fastapi==0.115.0" "uvicorn==0.30.0" "pydantic<2.0.0" "requests==2.31.0"');
                          setCopiedScript(true);
                          setTimeout(() => setCopiedScript(false), 2000);
                        }}
                        className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-[11px] transition"
                      >
                        {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedScript ? 'Copied!' : 'Copy pip Command'}
                      </button>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono text-emerald-400 text-[11px] overflow-x-auto">
                      pip install "fastapi==0.115.0" "uvicorn==0.30.0" "pydantic&lt;2.0.0" "requests==2.31.0"
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Applies clean audit status to workspace</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRemediatingFile(null)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAutoFixPydanticRisk(remediatingFile)}
                  disabled={appliedFix}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition"
                >
                  {appliedFix ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                  {appliedFix ? 'Applied!' : 'Apply Clean Audit Fix'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Drawer / Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-400" />
                <div>
                  <h4 className="text-sm font-bold text-white">{previewFile.name}</h4>
                  <p className="text-[10px] text-slate-400">{previewFile.path} ({(previewFile.size / 1024).toFixed(2)} KB)</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-950/80 flex-1 overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
              {previewFile.contentPreview || '// Content unavailable or binary data.'}
            </div>

            <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setPreviewFile(null)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
