import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, LayoutGrid, X } from 'lucide-react';

export type PanelDef = { id: string; title: string };
type Saved = { closed: string[]; min: string[] };
const KEY = 'sandbox.panels.v1';

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        closed: Array.isArray(p.closed) ? p.closed : [],
        min: Array.isArray(p.min) ? p.min : [],
      };
    }
  } catch {}
  return { closed: [], min: [] };
}

export function usePanels() {
  const [s, setS] = useState<Saved>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  }, [s]);
  return {
    isClosed: (id: string) => s.closed.includes(id),
    isMin: (id: string) => s.min.includes(id),
    toggleMin: (id: string) =>
      setS((p) => ({ ...p, min: p.min.includes(id) ? p.min.filter((x) => x !== id) : [...p.min, id] })),
    close: (id: string) =>
      setS((p) => ({ ...p, closed: p.closed.includes(id) ? p.closed : [...p.closed, id] })),
    show: (id: string) => setS((p) => ({ ...p, closed: p.closed.filter((x) => x !== id) })),
    restoreAll: () => setS({ closed: [], min: [] }),
  };
}
export type PanelsApi = ReturnType<typeof usePanels>;

interface PanelFrameProps {
  id: string;
  title: string;
  api: PanelsApi;
  className?: string;
  height?: string;
  resizeWidth?: boolean;
  children: React.ReactNode;
}

export const PanelFrame: React.FC<PanelFrameProps> = ({
  id, title, api, className = '', height = '', resizeWidth = false, children,
}) => {
  if (api.isClosed(id)) return null;
  const min = api.isMin(id);
  const resize = min ? 'resize-none' : resizeWidth ? 'resize-y lg:resize' : 'resize-y';
  return (
    <div
      className={`flex flex-col overflow-hidden min-w-0 ${resize} ${min ? '' : height} ${className}`}
      style={min ? { height: 'auto' } : undefined}
    >
      <div className="flex items-center justify-between px-3 py-1.5 mb-1.5 rounded-xl bg-slate-800/70 border border-slate-700">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-300">{title}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => api.toggleMin(id)}
            title={min ? 'Expand' : 'Minimize'}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700"
          >
            {min ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => api.close(id)}
            title="Close (bring it back from the Panels menu)"
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {!min && <div className="flex-1 min-h-0 overflow-auto">{children}</div>}
    </div>
  );
};

export const PanelsMenu: React.FC<{ api: PanelsApi; panels: PanelDef[] }> = ({ api, panels }) => {
  const [open, setOpen] = useState(false);
  const hidden = panels.filter((p) => api.isClosed(p.id)).length;
  return (
    <div className="relative flex justify-end">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:border-slate-700"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Panels{hidden ? ` (${hidden} hidden)` : ''}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-64 p-2 rounded-xl bg-slate-900 border border-slate-700 shadow-xl space-y-1">
          {panels.map((p) => (
            <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={!api.isClosed(p.id)}
                onChange={() => (api.isClosed(p.id) ? api.show(p.id) : api.close(p.id))}
              />
              {p.title}
            </label>
          ))}
          <button
            onClick={() => { api.restoreAll(); setOpen(false); }}
            className="w-full mt-1 px-2 py-1.5 rounded-lg text-xs text-amber-400 hover:bg-slate-800 text-left"
          >
            Restore all panels
          </button>
        </div>
      )}
    </div>
  );
};
