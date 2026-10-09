import { useState } from "react";
import type { ComponentType } from "react";
import { Shield, Menu, X } from "lucide-react";

export type ToolItem = { id: string; label: string; icon?: ComponentType<{ className?: string }> };

type Props = {
  items: ToolItem[];
  ownerItems?: ToolItem[];
  active: string;
  onSelect: (id: string) => void;
  showUpsell: boolean;
  onUpgrade: () => void;
  onStayFree: () => void;
};

const tab = (on: boolean) =>
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " +
  (on ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200");

export default function Toolbar(p: Props) {
  const [open, setOpen] = useState(false);
  const all = [...p.items, ...(p.ownerItems ?? [])];
  const pick = (id: string) => { p.onSelect(id); setOpen(false); };
  const btn = (it: ToolItem, cls = "") => (
    <button key={it.id} onClick={() => pick(it.id)} className={tab(p.active === it.id) + " " + cls}>
      {it.icon && <it.icon className="h-3.5 w-3.5" />}{it.label}
    </button>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 lg:px-8">
        <Shield className="h-5 w-5 shrink-0 text-indigo-400" />
        <span className="shrink-0 text-sm font-bold text-white">Solana Pulse Gateway</span>
        <nav className="ml-4 hidden items-center gap-1 md:flex">{all.map((it) => btn(it))}</nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={p.onUpgrade} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500">View pricing</button>
          <button onClick={() => setOpen(!open)} aria-label="Menu" className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 md:hidden">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      {open && <nav className="flex flex-col gap-1 border-t border-slate-800 px-4 py-3 md:hidden">{all.map((it) => btn(it, "w-full"))}</nav>}
      {p.showUpsell && (
        <div className="border-t border-slate-800 bg-slate-900/70">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-xs lg:px-8">
            <span className="text-slate-300">Basic lookups are always free. Paid calls use credits you add with your wallet.</span>
            <button onClick={p.onUpgrade} className="rounded-md bg-indigo-600 px-3 py-1 font-semibold text-white hover:bg-indigo-500">View pricing</button>
            <button onClick={p.onStayFree} className="text-slate-400 hover:text-slate-200 hover:underline">Dismiss</button>
          </div>
        </div>
      )}
    </header>
  );
}
