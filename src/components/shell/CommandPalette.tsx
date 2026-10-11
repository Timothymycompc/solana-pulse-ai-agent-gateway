import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, CornerDownLeft, Search } from 'lucide-react';
import { navigate } from '../../router';
import type { NavItem, NavSection } from '../../nav';

// ⌘K / Ctrl+K (or "/") search over every page and tool.
export const CommandPalette: React.FC<{ open: boolean; onClose: () => void; sections: NavSection[] }> = ({ open, onClose, sections }) => {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const all = sections.flatMap((s) => s.items.map((item) => ({ ...item, section: s.title })));
    const q = query.trim().toLowerCase();
    if (!q) return all;
    const words = q.split(/\s+/);
    return all
      .map((item) => {
        const hay = `${item.title} ${item.path} ${item.keywords ?? ''} ${item.section}`.toLowerCase();
        const hits = words.filter((w) => hay.includes(w)).length;
        return { item, score: hits === words.length ? (item.title.toLowerCase().startsWith(q) ? 3 : item.title.toLowerCase().includes(q) ? 2 : 1) : 0 };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);
  }, [sections, query]);

  useEffect(() => { if (open) { setQuery(''); setCursor(0); window.setTimeout(() => inputRef.current?.focus(), 10); } }, [open]);
  useEffect(() => { setCursor(0); }, [query]);

  if (!open) return null;
  const go = (item: NavItem) => {
    onClose();
    if (item.external) window.open(item.path, '_blank', 'noopener');
    else navigate(item.path);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter' && items[cursor]) { e.preventDefault(); go(items[cursor]); }
    else if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => e.stopPropagation()} className="glass-strong animate-scale-in w-full max-w-xl overflow-hidden rounded-xl border">
        <div className="flex items-center gap-2 border-b border-white/10 px-4">
          <Search className="h-4 w-4 text-slate-400" />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} placeholder="Search tools and docs…" aria-label="Search tools and docs"
            className="h-12 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none" />
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-slate-400">Esc</kbd>
        </div>
        <ul role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-400">No results for “{query}”.</li>}
          {items.map((item, i) => (
            <li key={item.path} role="option" aria-selected={i === cursor}>
              <button onMouseEnter={() => setCursor(i)} onClick={() => go(item)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${i === cursor ? 'bg-white/[0.07] text-white' : 'text-slate-300'}`}>
                <span className="w-24 shrink-0 truncate text-[10px] uppercase tracking-wider text-slate-500">{item.section}</span>
                <span className="flex-1 truncate">{item.title}</span>
                {item.badge && <span className="font-mono text-[10px] text-slate-500">{item.badge}</span>}
                {item.external ? <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" /> : i === cursor && <CornerDownLeft className="h-3.5 w-3.5 text-slate-500" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
