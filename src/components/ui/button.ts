// One place for button styles. Use on <button> or <Link>/<a>: className={button('primary')}.
// To restyle every button on the site, edit these strings.

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400';

const variants: Record<Variant, string> = {
  primary: 'bg-accent-600 text-white hover:bg-accent-500 active:bg-accent-700',
  secondary: 'border border-ink-700 bg-panel/60 text-ink-100 hover:border-ink-500 hover:bg-panel',
  ghost: 'text-ink-300 hover:bg-white/5 hover:text-white',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[13px]',
  md: 'px-4.5 py-2.5 text-[15px]',
};

export const button = (variant: Variant = 'primary', size: Size = 'md', extra = '') => `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
