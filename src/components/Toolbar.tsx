import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { ArrowUpRight, Menu, Shield, X, Zap } from 'lucide-react';

export type ToolItem = { id: string; label: string; icon?: ComponentType<{ className?: string }>; external?: boolean };

type Props = {
  items: ToolItem[];
  active: string;
  onSelect: (id: string) => void;
};

export default function Toolbar({ items, active, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Slide the highlight under the active tab; re-measure when the layout changes.
  useLayoutEffect(() => {
    const measure = () => {
      const el = navRef.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
      setIndicator(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, items]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const pick = (id: string) => { onSelect(id); setOpen(false); };

  return (
    <header className={`sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300 ${scrolled ? 'glass-strong' : 'border-transparent bg-slate-950/30 backdrop-blur-md'}`}>
      <div className={`mx-auto flex max-w-7xl items-center gap-4 px-4 transition-[padding] duration-300 lg:px-8 ${scrolled ? 'py-2' : 'py-3.5'}`}>
        <button onClick={() => pick('api')} className="group flex min-w-0 items-center gap-2.5 text-left" aria-label="Solana Pulse Gateway home">
          <span className="bg-accent-gradient grid h-8 w-8 shrink-0 place-items-center rounded-lg shadow-lg shadow-indigo-900/50 transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-105">
            <Shield className="h-4 w-4 text-white" />
          </span>
          <span className="min-w-0">
            <span className="text-gradient block truncate text-sm font-bold tracking-tight">Solana Pulse</span>
            <span className="hidden text-[10px] text-slate-400 sm:block">Intelligence layer for agents</span>
          </span>
        </button>

        <nav ref={navRef} aria-label="Main navigation" className="relative ml-auto hidden items-center gap-1 rounded-xl border glass p-1 md:flex">
          {indicator && (
            <span aria-hidden className="gradient-border absolute top-1 bottom-1 rounded-lg bg-indigo-500/15 transition-[left,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ left: indicator.left, width: indicator.width }} />
          )}
          {items.map((item) => {
            const Icon = item.icon;
            const selected = active === item.id;
            return (
              <button key={item.id} data-tab={item.id} onClick={() => pick(item.id)} aria-current={selected ? 'page' : undefined}
                className={`relative z-10 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${selected ? 'text-white' : 'text-slate-300 hover:text-white'}`}>
                {Icon && <Icon className="h-3.5 w-3.5" />}{item.label}
                {item.external && <ArrowUpRight className="h-3 w-3 opacity-60" />}
              </button>
            );
          })}
        </nav>

        <button onClick={() => pick('monetization')} className="group ml-auto inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:border-emerald-400/50 hover:bg-emerald-500/15 md:ml-0">
          <Zap className="h-3.5 w-3.5 transition-transform duration-300 group-hover:scale-110" />
          <span className="hidden sm:inline">No API key · x402</span><span className="sm:hidden">x402</span>
        </button>

        <button onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}
          className="rounded-lg border border-white/10 p-2 text-slate-300 transition hover:bg-white/5 md:hidden">
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && <nav aria-label="Mobile navigation" className="glass-strong animate-slide-down space-y-1 border-t px-4 py-3 md:hidden">
        {items.map((item, i) => {
          const Icon = item.icon;
          const selected = active === item.id;
          return (
            <button key={item.id} onClick={() => pick(item.id)} aria-current={selected ? 'page' : undefined} style={{ animationDelay: `${i * 40}ms` }}
              className={`animate-fade-up flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition ${selected ? 'bg-indigo-500/15 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
              {Icon && <Icon className="h-4 w-4" />}{item.label}{item.external && <ArrowUpRight className="ml-auto h-3.5 w-3.5 opacity-60" />}
            </button>
          );
        })}
        <a href="/llms.txt" className="block rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200">llms.txt · LLM discovery file</a>
      </nav>}
    </header>
  );
}
