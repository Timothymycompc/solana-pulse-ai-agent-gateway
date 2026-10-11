import React, { useEffect, useState } from 'react';
import { Menu, Search, Shield, X, Zap } from 'lucide-react';
import { Link } from '../../router';
import { REPO_URL, type NavSection } from '../../nav';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export const AppShell: React.FC<{ sections: NavSection[]; path: string; children: React.ReactNode }> = ({ sections, path, children }) => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? '');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o); }
      else if (e.key === '/' && !typing) { e.preventDefault(); setPaletteOpen(true); }
      else if (e.key === 'Escape') setDrawerOpen(false);
    };
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll); };
  }, []);
  useEffect(() => { setDrawerOpen(false); }, [path]);

  return (
    <div className="relative isolate min-h-screen bg-ink-950 text-ink-100">

      <header className={`sticky top-0 z-40 border-b transition-colors duration-300 ${scrolled ? 'glass-strong' : 'border-white/[0.06] bg-ink-950/70 backdrop-blur-md'}`}>
        <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-3 px-4 lg:px-6">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open navigation" className="rounded-md p-1.5 text-ink-300 hover:bg-white/5 lg:hidden"><Menu className="h-5 w-5" /></button>
          <Link to="/" className="flex items-center gap-2" aria-label="Solana Pulse home">
            <span className="bg-accent-600 grid h-7 w-7 place-items-center rounded-md"><Shield className="h-3.5 w-3.5 text-white" /></span>
            <span className="text-sm font-semibold tracking-tight text-white">Solana Pulse</span>
            <span className="hidden rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-ink-400 sm:inline">Docs</span>
          </Link>
          <button onClick={() => setPaletteOpen(true)} className="ml-auto flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-left text-xs text-ink-400 transition hover:border-white/20 hover:text-ink-200 md:ml-8">
            <Search className="h-3.5 w-3.5" /><span className="flex-1">Search tools and docs…</span>
            <kbd className="hidden rounded border border-white/15 px-1.5 py-0.5 font-sans text-[10px] sm:inline">{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
          <Link to="/docs/pricing" className="hidden items-center gap-1.5 rounded-lg border border-success-500/25 bg-success-500/10 px-3 py-2 text-xs font-medium text-success-200 transition hover:bg-success-500/15 sm:inline-flex">
            <Zap className="h-3.5 w-3.5" />No API key · x402
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-[90rem] gap-8 px-4 lg:px-6">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto py-8 pr-2 lg:block">
          <Sidebar sections={sections} path={path} />
        </aside>
        <main key={path} style={{ viewTransitionName: 'page' }} className="min-w-0 flex-1 animate-fade-in py-8 lg:py-10">
          {children}
          <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-6 text-xs text-ink-500">
            <span>Solana Pulse · an intelligence layer between Solana and AI agents</span>
            <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer" className="hover:text-ink-300">Request a tool or report an issue ↗</a>
          </footer>
        </main>
      </div>

      {/* Mobile navigation drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={() => setDrawerOpen(false)} />
          <div className="glass-strong absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-[slide-in_280ms_cubic-bezier(0.22,1,0.36,1)] overflow-y-auto border-r p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Solana Pulse</span>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close navigation" className="rounded-md p-1.5 text-ink-300 hover:bg-white/5"><X className="h-5 w-5" /></button>
            </div>
            <Sidebar sections={sections} path={path} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} sections={sections} />
    </div>
  );
};
