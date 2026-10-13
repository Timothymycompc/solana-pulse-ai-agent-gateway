import React, { useEffect, useState } from 'react';
import { Menu, Search, X } from 'lucide-react';
import { Link } from '../../router';
import { button } from '../ui/button';
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
      <div aria-hidden className="video-backdrop pointer-events-none fixed inset-0 -z-10" />

      <header className={`sticky top-0 z-40 border-b transition-colors duration-300 ${scrolled ? 'glass-strong' : 'border-transparent'}`}>
        <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-3 px-4 lg:px-6">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open navigation" className="rounded-md p-1.5 text-ink-300 hover:bg-white/5 lg:hidden"><Menu className="h-5 w-5" /></button>
          <Link to="/" className="flex items-center gap-2.5" aria-label="Solana Pulse home">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent-400" />
            <span className="whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em] text-white">Solana Pulse</span>
          </Link>
          <button onClick={() => setPaletteOpen(true)} className="ml-auto flex h-9 w-full min-w-0 max-w-xs items-center gap-2 rounded-lg border border-line bg-code/70 px-3 text-left text-[13px] text-ink-400 transition hover:border-ink-600 hover:text-ink-200 md:ml-10">
            <Search className="h-3.5 w-3.5 shrink-0" /><span className="flex-1 truncate">Search tools and docs</span>
            <kbd className="hidden rounded border border-line px-1.5 py-0.5 font-sans text-[11px] text-ink-500 sm:inline">{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
          <Link to="/docs/connect" className={button('secondary', 'sm', 'shrink-0 max-sm:hidden md:ml-auto')}>Connect an agent</Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-[90rem] gap-8 px-4 lg:px-6">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto py-8 pr-2 lg:block">
          <Sidebar sections={sections} path={path} />
        </aside>
        <main key={path} style={{ viewTransitionName: 'page' }} className="min-w-0 flex-1 animate-fade-in py-8 lg:py-10">
          {children}
          <footer className="mt-20 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-[13px] text-ink-500">
            <span>Solana Pulse is open source under the MIT license.</span>
            <span className="flex gap-5">
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-ink-200">Source on GitHub</a>
              <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer" className="hover:text-ink-200">Request a tool or report an issue</a>
            </span>
          </footer>
        </main>
      </div>

      {/* Mobile navigation drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="popup-scrim absolute inset-0 animate-fade-in" onClick={() => setDrawerOpen(false)} />
          <div className="popup absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-[slide-in_280ms_cubic-bezier(0.22,1,0.36,1)] overflow-y-auto border-y-0 border-l-0">
            <div className="wood-head sticky top-0 z-10 flex items-center justify-between px-4 py-3">
              <span className="text-[15px] font-semibold text-tan-200">Solana Pulse</span>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close navigation" className="rounded-md p-1.5 text-tan-300 hover:bg-white/5 hover:text-tan-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4"><Sidebar sections={sections} path={path} onNavigate={() => setDrawerOpen(false)} /></div>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} sections={sections} />
    </div>
  );
};
