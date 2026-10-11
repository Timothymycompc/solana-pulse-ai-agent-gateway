import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from '../../router';
import type { NavSection } from '../../nav';

export const Sidebar: React.FC<{ sections: NavSection[]; path: string; onNavigate?: () => void }> = ({ sections, path, onNavigate }) => (
  <nav aria-label="Documentation" className="space-y-6 text-sm">
    {sections.map((section) => (
      <div key={section.title}>
        <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">{section.title}</p>
        <ul className="space-y-0.5">
          {section.items.map((item) => {
            const active = !item.external && path === item.path;
            const className = `group relative flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 transition-colors ${active ? 'bg-white/[0.06] text-white' : 'text-ink-400 hover:bg-white/[0.03] hover:text-ink-100'}`;
            const content = (
              <>
                {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent-400" />}
                <span className="truncate">{item.title}</span>
                {item.badge && <span className={`shrink-0 font-mono text-[10px] ${item.badge === 'Free' ? 'text-success-400/80' : 'text-ink-500 group-hover:text-ink-400'}`}>{item.badge}</span>}
                {item.external && <ArrowUpRight className="h-3 w-3 shrink-0 opacity-50" />}
              </>
            );
            return (
              <li key={item.path}>
                {item.external
                  ? <a href={item.path} target="_blank" rel="noreferrer" className={className}>{content}</a>
                  : <Link to={item.path} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={className}>{content}</Link>}
              </li>
            );
          })}
        </ul>
      </div>
    ))}
  </nav>
);
