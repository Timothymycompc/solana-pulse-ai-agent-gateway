import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Run a state update inside a View Transition when the browser supports it, so page changes cross-fade.
export function withViewTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || reducedMotion()) return update();
  doc.startViewTransition(() => flushSync(update));
}

// Reveal every [data-reveal] element inside the returned ref once it scrolls into view.
// Items in the same batch are staggered by their data-reveal-index.
export function useReveal<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items: HTMLElement[] = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]:not([data-reveal="shown"])'));
    if (reducedMotion() || !('IntersectionObserver' in window)) {
      items.forEach((el) => { el.dataset.reveal = 'shown'; });
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        el.style.setProperty('--reveal-delay', `${Number(el.dataset.revealIndex || 0) * 60}ms`);
        el.dataset.reveal = 'shown';
        observer.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

// Animate a number from its previous value to the new one.
export function useCountUp(target: number, durationMs = 700) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reducedMotion() || from.current === target) { from.current = target; setValue(target); return; }
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(begin + (target - begin) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}
