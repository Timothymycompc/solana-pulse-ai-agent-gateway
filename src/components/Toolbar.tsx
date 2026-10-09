import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { Check, ChevronDown, Menu, Shield, Wallet, X } from 'lucide-react';
import { SecureWalletClaim } from './SecureWalletClaim';

export type ToolItem = { id: string; label: string; icon?: ComponentType<{ className?: string }> };

type Props = {
  items: ToolItem[];
  active: string;
  onSelect: (id: string) => void;
  walletAuthenticated: boolean;
  onCredentialsApplied: (apiKey: string, headers: Record<string, string>) => void;
};

export default function Toolbar({ items, active, onSelect, walletAuthenticated, onCredentialsApplied }: Props) {
  const [open, setOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  useEffect(() => {
    if (!walletOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setWalletOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [walletOpen]);
  const pick = (id: string) => { onSelect(id); setOpen(false); };
  const renderItem = (item: ToolItem, mobile = false) => {
    const Icon = item.icon;
    const selected = active === item.id;
    return (
      <button key={item.id} onClick={() => pick(item.id)} aria-current={selected ? 'page' : undefined}
        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${mobile ? 'w-full justify-start' : ''} ${selected ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'}`}>
        {Icon && <Icon className="h-3.5 w-3.5" />}{item.label}
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 lg:px-8">
        <button onClick={() => pick('api')} className="flex min-w-0 items-center gap-2.5 text-left" aria-label="Solana Pulse Gateway home">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-indigo-400/20 bg-indigo-500/10"><Shield className="h-4 w-4 text-indigo-300" /></span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight text-white">Solana Pulse</span>
            <span className="hidden text-[10px] text-slate-500 sm:block">Developer gateway</span>
          </span>
        </button>
        <nav aria-label="Main navigation" className="ml-auto hidden items-center gap-1 md:flex">{items.map((item) => renderItem(item))}</nav>
        <a href="/llms.txt" className="hidden items-center gap-1 rounded-lg px-2 py-2 text-xs text-slate-400 hover:text-white lg:inline-flex">llms.txt <ChevronDown className="h-3 w-3 rotate-[-90deg]" /></a>
        <div id="wallet-control" className="relative ml-auto md:ml-0">
          <button
            type="button"
            onClick={() => setWalletOpen((value) => !value)}
            aria-expanded={walletOpen}
            aria-haspopup="dialog"
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${walletAuthenticated ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15' : 'border-indigo-400/30 bg-indigo-500/10 text-indigo-100 hover:bg-indigo-500/20'}`}
          >
            {walletAuthenticated ? <Check className="h-3.5 w-3.5" /> : <Wallet className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{walletAuthenticated ? 'Wallet connected' : 'Connect wallet'}</span>
            <span className="sm:hidden">{walletAuthenticated ? 'Wallet' : 'Connect'}</span>
          </button>
          {walletOpen && <button type="button" tabIndex={-1} aria-label="Close wallet panel" onClick={() => setWalletOpen(false)} className="fixed inset-0 z-40 cursor-default bg-black/20" />}
            <div hidden={!walletOpen} role="dialog" aria-modal="true" aria-label="Wallet sign-in" className="absolute right-0 top-full z-50 mt-3 w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/50">
              <div className="mb-2 flex items-center justify-between px-1">
                <div>
                  <h2 className="text-sm font-semibold text-white">Wallet access</h2>
                  <p className="mt-0.5 max-w-xs text-[11px] leading-5 text-slate-500">The first 27 calls need no wallet. Connect after that to add credits and keep calling.</p>
                </div>
                <button type="button" onClick={() => setWalletOpen(false)} aria-label="Close wallet panel" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              <SecureWalletClaim onCredentialsApplied={onCredentialsApplied} />
            </div>
        </div>
        <button onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}
          className="rounded-lg border border-slate-800 p-2 text-slate-300 hover:bg-slate-900 md:hidden">
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>
      {open && <nav aria-label="Mobile navigation" className="space-y-1 border-t border-slate-800 px-4 py-3 md:hidden">
        {items.map((item) => renderItem(item, true))}
        <a href="/llms.txt" className="block rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-900">LLM discovery file</a>
      </nav>}
    </header>
  );
}
