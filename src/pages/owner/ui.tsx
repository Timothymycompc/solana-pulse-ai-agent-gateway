import React, { useMemo, useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import type { Kind, ToolStats } from '../../lib/ownerApi';

// Pieces shared by every tab of the owner dashboard: caller kinds and colors, number formats, cards, tables, sorting.

// Caller kinds in stack and legend order. "No user agent" folds into "Other". Colors are the --color-kind-* tokens in index.css.
export type ShownKind = Exclude<Kind, 'unknown'>;
export const SHOWN: ShownKind[] = ['you', 'bot', 'ai_app', 'script', 'browser', 'other'];
export const LABEL: Record<ShownKind, string> = { you: 'You', bot: 'Indexer or uptime bot', ai_app: 'AI app', script: 'Script or SDK', browser: 'Browser', other: 'Other or unnamed' };
const COLOR: Record<ShownKind, string> = {
  you: 'var(--color-kind-you)', bot: 'var(--color-kind-bot)', ai_app: 'var(--color-kind-ai-app)',
  script: 'var(--color-kind-script)', browser: 'var(--color-kind-browser)', other: 'var(--color-kind-other)',
};
export const shown = (k: Kind): ShownKind => (k === 'unknown' ? 'other' : k);
export const byShownKind = (byKind: Record<Kind, number>) => SHOWN.map((k) => ({ kind: k, n: k === 'other' ? byKind.other + byKind.unknown : byKind[k] }));

export const num = new Intl.NumberFormat();
// Under a dollar, a tenth of a cent is shown when there is one (some early test payments were less than a cent).
export const usd = (v: number) => (v === 0 ? '$0' : v < 1 ? `$${v.toFixed(Math.round(v * 1000) % 10 ? 3 : 2)}` : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const short = (s: string) => (s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s);
export const plural = (n: number, word: string) => `${num.format(n)} ${word}${n === 1 ? '' : 's'}`;
export const periodLabel = (days: number) => (days === 1 ? '24 hours' : `${days} days`);
export function ago(iso: string | null) {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Hover tooltip shared by every chart on the page.
export type Tip = { x: number; y: number; lines: React.ReactNode[] } | null;
export const TipContext = React.createContext<(t: Tip) => void>(() => {});
export const useTip = () => React.useContext(TipContext);
export const tipHandlers = (setTip: (t: Tip) => void, lines: React.ReactNode[]) => ({
  onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, lines }),
  onMouseLeave: () => setTip(null),
});
export const TipLayer: React.FC<{ tip: Tip }> = ({ tip }) => tip && (
  <div role="tooltip" className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-white/15 bg-ink-900/95 px-3 py-2 text-[11px] leading-5 text-ink-200 shadow-xl backdrop-blur"
    style={{ left: Math.min(tip.x + 14, window.innerWidth - 260), top: tip.y + 14 }}>
    {tip.lines.map((l, i) => <div key={i} className={i === 0 ? 'font-semibold text-white' : ''}>{l}</div>)}
  </div>
);

export const Swatch: React.FC<{ kind: ShownKind }> = ({ kind }) => <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLOR[kind] }} />;

export const Legend: React.FC = () => (
  <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-ink-300">
    {SHOWN.map((k) => <li key={k} className="flex items-center gap-1.5"><Swatch kind={k} />{LABEL[k]}</li>)}
  </ul>
);

// One tool's runs as a bar: length is total runs (against the busiest tool), segments are who made them.
export const KindBar: React.FC<{ tool: ToolStats; max: number }> = ({ tool, max }) => {
  const setTip = useTip();
  const parts = byShownKind(tool.byKind).filter((p) => p.n > 0);
  const width = max ? Math.max(2, (tool.runs / max) * 100) : 0;
  if (!tool.runs) return <span className="text-[11px] text-ink-500">No runs</span>;
  return (
    <div className="flex h-5 items-center gap-[2px]" style={{ width: `${width}%` }} aria-label={parts.map((p) => `${LABEL[p.kind]} ${p.n}`).join(', ')}>
      {parts.map((p) => (
        <div key={p.kind} className="flex h-full min-w-[3px] items-center" style={{ flexGrow: p.n, flexBasis: 0 }}
          {...tipHandlers(setTip, [`${tool.tool} · ${LABEL[p.kind]}`, `${num.format(p.n)} of ${num.format(tool.runs)} runs (${Math.round((p.n / tool.runs) * 100)}%)`])}>
          <div className="h-2.5 w-full rounded-[3px]" style={{ background: COLOR[p.kind] }} />
        </div>
      ))}
    </div>
  );
};

export const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ElementType }> = ({ label, value, sub, icon: Icon }) => (
  <div className="px-4 py-4 sm:px-5">
    <div className="flex items-center gap-2 text-[12.5px] text-ink-400"><Icon className="h-3.5 w-3.5 text-accent-300" />{label}</div>
    <div className="display mt-2 text-[1.9rem] font-bold tabular-nums">{value}</div>
    {sub && <div className="mt-1 text-[11px] text-ink-400">{sub}</div>}
  </div>
);

// Number tiles, inside a card so they fold like everything else.
export const StatRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-2 divide-x divide-y divide-white/10 sm:grid-cols-4 sm:divide-y-0">{children}</div>
);

// Which cards the owner folded, remembered in this browser only (the page works the same without it).
const FOLD_KEY = 'owner-folded';
const readFolded = (): string[] => { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '[]'); } catch { return []; } };
const useFolded = (id: string) => {
  const [folded, setFolded] = useState(() => readFolded().includes(id));
  const toggle = () => setFolded((f) => {
    const next = !f;
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...readFolded().filter((x) => x !== id), ...(next ? [id] : [])])); } catch { /* not remembered */ }
    return next;
  });
  return [folded, toggle] as const;
};

// A card folds up when its title is clicked; the aside (sort, filters) hides with the contents.
export const Card: React.FC<{ id: string; title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ id, title, aside, children, className = '' }) => {
  const [folded, toggle] = useFolded(id);
  return (
    <section className={`overflow-hidden rounded-xl border border-white/10 surface ${className}`}>
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${folded ? '' : 'border-b border-white/10'}`}>
        <button onClick={toggle} aria-expanded={!folded} className="flex items-center gap-1.5 text-left text-[14px] font-semibold text-ink-100 hover:text-white">
          <ChevronDown className={`h-4 w-4 shrink-0 text-ink-500 transition ${folded ? '-rotate-90' : ''}`} />{title}
        </button>
        {!folded && aside}
      </div>
      {!folded && children}
    </section>
  );
};

// The small print under a card: what a number means and where it comes from.
export const Footnote: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="px-4 py-3 text-[11.5px] leading-4 text-ink-500">{children}</p>;
export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="px-4 py-6 text-[12px] text-ink-500">{children}</p>;

// "Sort by" for a table: the options are named in plain words, the first is the default.
export type SortOption<T> = { label: string; compare: (a: T, b: T) => number };
export function useSorted<T>(rows: T[], options: SortOption<T>[]) {
  const [pick, setPick] = useState(0);
  const sorted = useMemo(() => [...rows].sort(options[pick].compare), [rows, options, pick]);
  const picker = <label className="flex items-center gap-1.5 text-[11px] text-ink-500">Sort by
    <select value={pick} onChange={(e) => setPick(Number(e.target.value))} className="rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-[11px] text-ink-100">
      {options.map((o, i) => <option key={o.label} value={i}>{o.label}</option>)}
    </select>
  </label>;
  return [sorted, picker] as const;
}
export const byText = <T,>(f: (x: T) => string) => (a: T, b: T) => f(a).localeCompare(f(b));
export const byNum = <T,>(f: (x: T) => number) => (a: T, b: T) => f(b) - f(a);
export const byTime = <T,>(f: (x: T) => string | null) => (a: T, b: T) => (f(b) ? Date.parse(f(b)!) : 0) - (f(a) ? Date.parse(f(a)!) : 0);
export const chip = (active: boolean) => `rounded-full border px-2.5 py-1 text-[11px] transition ${active ? 'border-accent-400/60 bg-accent-500/15 text-white' : 'border-white/10 text-ink-400 hover:border-white/25 hover:text-ink-100'}`;
export const Asides: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="flex flex-wrap items-center gap-3">{children}</div>;

// Filter chips by caller kind: "All" plus one chip per kind given.
export const KindChips: React.FC<{ kinds: { kind: ShownKind; note?: string }[]; value: ShownKind | 'all'; onChange: (k: ShownKind | 'all') => void }> = ({ kinds, value, onChange }) => (
  <div className="flex flex-wrap gap-2 px-4 py-3">
    <button className={chip(value === 'all')} onClick={() => onChange('all')}>All</button>
    {kinds.map((k) => <button key={k.kind} className={`${chip(value === k.kind)} inline-flex items-center gap-1.5`} onClick={() => onChange(k.kind)}>
      <Swatch kind={k.kind} />{LABEL[k.kind]}{k.note && <span className="tabular-nums text-ink-500">{k.note}</span>}
    </button>)}
  </div>
);

export const KindTag: React.FC<{ kind: Kind }> = ({ kind }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-ink-300"><Swatch kind={shown(kind)} />{LABEL[shown(kind)]}</span>
);

export const Solscan: React.FC<{ kind: 'tx' | 'account'; id: string; label?: string }> = ({ kind, id, label }) => (
  <a href={`https://solscan.io/${kind}/${id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-accent-300 hover:text-accent-200">
    {label ?? short(id)}<ExternalLink className="h-3 w-3 opacity-60" />
  </a>
);

export const td = 'px-3 py-2.5 align-top';
export const TableShell: React.FC<{ head: string[]; children: React.ReactNode; minWidth?: number }> = ({ head, children, minWidth = 640 }) => (
  <div className="table-scroll">
    <table className="data-table text-[12px] text-ink-300" style={{ minWidth }}>
      <thead className="text-[12px]"><tr>{head.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

// A row that opens to show more underneath it when clicked.
export const OpenRow: React.FC<{ cells: React.ReactNode[]; first: React.ReactNode; detail: React.ReactNode; dim?: boolean }> = ({ cells, first, detail, dim }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className={`row-button ${open ? 'row-open' : ''} ${dim ? 'opacity-70' : ''}`} onClick={() => setOpen((o) => !o)}>
        <td className={td}>
          <button aria-expanded={open} className="flex items-start gap-1.5 text-left">
            <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500 transition ${open ? '' : '-rotate-90'}`} /><span className="min-w-0">{first}</span>
          </button>
        </td>
        {cells}
      </tr>
      {open && <tr className="row-detail"><td colSpan={cells.length + 1} className="px-3 py-3">{detail}</td></tr>}
    </>
  );
};
