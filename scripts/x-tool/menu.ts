// Terminal helpers for the Pulse X tool: colours, an arrow-key menu, and plain prompts.
import readline from "node:readline";

const wrap = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;
export const c = { bold: wrap("1"), dim: wrap("2"), cyan: wrap("36"), green: wrap("32"), yellow: wrap("33"), red: wrap("31"), inverse: wrap("7") };
export const clear = () => process.stdout.write("\x1b[2J\x1b[H");
export const width = () => Math.max(40, Math.min(process.stdout.columns || 80, 100));
export const cut = (s: string, n = width() - 6) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

let redraw: (() => void) | null = null;
// Background loads call this so the open menu shows what just arrived.
export const refresh = () => redraw?.();

readline.emitKeypressEvents(process.stdin);

// Arrow keys (or j/k) move, Enter or a number picks, q or Esc goes back. Resolves with the index, or -1.
export function choose(items: string[], header: () => string, start = 0): Promise<number> {
  let at = Math.min(start, items.length - 1);
  const draw = () => {
    clear();
    process.stdout.write(header() + "\n");
    items.forEach((it, i) => process.stdout.write(i === at ? ` ${c.cyan("▸")} ${c.inverse(` ${i + 1}  ${it} `)}\n` : `    ${c.dim(String(i + 1))}  ${it}\n`));
    process.stdout.write(c.dim("\n  ↑↓ move · Enter or number to pick · q back\n"));
  };
  return new Promise((resolve) => {
    const done = (i: number) => {
      process.stdin.off("keypress", onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      redraw = null;
      resolve(i);
    };
    const onKey = (str: string, key: readline.Key) => {
      if (key?.ctrl && key.name === "c") return done(-1);
      if (key?.name === "up" || str === "k") at = (at + items.length - 1) % items.length;
      else if (key?.name === "down" || str === "j") at = (at + 1) % items.length;
      else if (key?.name === "return") return done(at);
      else if (/^[1-9]$/.test(str ?? "") && Number(str) <= items.length) return done(Number(str) - 1);
      else if (str === "q" || key?.name === "escape") return done(-1);
      draw();
    };
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("keypress", onKey);
    redraw = draw;
    draw();
  });
}

export async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((r) => rl.question(question, r));
  rl.close();
  return answer.trim();
}

export const pause = () => ask(c.dim("\nPress Enter to go back. "));
export const yes = async (question: string) => /^y(es)?$/i.test(await ask(question));
