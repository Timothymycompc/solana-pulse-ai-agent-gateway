// One place for button styles. Use on <button> or <Link>/<a>: className={button('primary')}.
// To restyle every button on the site, edit these strings.

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400';

const variants: Record<Variant, string> = {
  primary: 'bg-accent-600 text-white hover:bg-accent-500 active:bg-accent-700',
  secondary: 'border border-white/15 bg-white/[0.03] text-ink-100 hover:border-white/30 hover:bg-white/[0.06]',
  ghost: 'text-ink-300 hover:bg-white/5 hover:text-white',
};

const sizes: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-[11px]',
  md: 'px-4 py-2.5 text-sm',
};

export const button = (variant: Variant = 'primary', size: Size = 'md', extra = '') => `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
