// What a tool call's answer says about money, and how to report it. Pure functions: the toolbox renders them,
// tests/flow.test.ts checks them on real responses.

export type TrailStep = { to: string; what: string; at: number; ms: number; ok: boolean };

export type Movement = { amount: string; symbol: string; other: string[]; time?: string; tx?: string };
export type MoneyFlow = { wallet: string; cameIn: Movement[]; wentOut: Movement[]; note?: string };

const REPO = 'https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway';
export const REPORT_FORM = `${REPO}/issues/new?template=suspicious-transaction.yml`;

const num = (s: unknown) => Number(s);
const positive = (s: unknown) => num(s) > 0;
const negative = (s: unknown) => num(s) < 0;
const abs = (s: string) => (s.startsWith('-') ? s.slice(1) : s);
const tokenName = (r: any) => String(r.symbol || r.token || 'token');

// The header the server sends with "x-pulse-trail: 1"; anything unreadable counts as no trail.
export function parseTrail(header: string | null): TrailStep[] | null {
  if (!header) return null;
  try {
    const steps = JSON.parse(header);
    return Array.isArray(steps) ? steps.filter((s) => s && typeof s.what === 'string' && typeof s.ms === 'number') : null;
  } catch { return null; }
}

// Same service and method in a row become one line with a count, so 20 transaction reads stay readable.
export function groupTrail(steps: TrailStep[]): (TrailStep & { count: number; failed: number })[] {
  const out: (TrailStep & { count: number; failed: number })[] = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (last && last.to === s.to && last.what === s.what) {
      const end = Math.max(last.at + last.ms, s.at + s.ms);
      last.at = Math.min(last.at, s.at);
      last.ms = end - last.at;
      last.count += 1;
      if (!s.ok) { last.failed += 1; last.ok = false; }
    } else out.push({ ...s, count: 1, failed: s.ok ? 0 : 1 });
  }
  return out;
}

// For one wallet: the rows that grew are what came in, the rows that shrank went out.
// Counterparties are the other wallets whose same token moved the other way.
function fromBalanceRows(wallet: string, rows: { owner: string; token: string; symbol: string; change: string }[]): MoneyFlow {
  const mine = rows.filter((r) => r.owner === wallet && num(r.change) !== 0);
  const others = (r: { token: string; change: string }, sign: (s: unknown) => boolean) =>
    rows.filter((o) => o.owner !== wallet && o.token === r.token && sign(o.change)).map((o) => o.owner);
  return {
    wallet,
    cameIn: mine.filter((r) => positive(r.change)).map((r) => ({ amount: r.change, symbol: r.symbol, other: others(r, negative) })),
    wentOut: mine.filter((r) => negative(r.change)).map((r) => ({ amount: abs(r.change), symbol: r.symbol, other: others(r, positive) })),
  };
}

export function moneyFlow(tool: string, body: any): MoneyFlow | null {
  if (!body || typeof body !== 'object') return null;
  if (tool === 'check_tx' && Array.isArray(body.balance_changes)) {
    const you = body.balance_changes.find((r: any) => r.is_you)?.wallet ?? body.fee_payer;
    if (!you) return null;
    const rows = body.balance_changes.map((r: any) => ({ owner: r.wallet, token: r.token, symbol: tokenName(r), change: String(r.change) }));
    return { ...fromBalanceRows(you, rows), note: 'If you sign it. Nothing has moved yet.' };
  }
  if (tool === 'explain_tx' && body.fee_payer) {
    const rows = [
      ...(body.sol_changes ?? []).map((r: any) => ({ owner: r.account, token: 'SOL', symbol: 'SOL', change: String(r.change) })),
      ...(body.token_changes ?? []).map((r: any) => ({ owner: r.owner, token: r.token, symbol: tokenName(r), change: String(r.change) })),
    ];
    return { ...fromBalanceRows(body.fee_payer, rows), note: 'For the wallet that paid the fee. Its SOL out includes that fee.' };
  }
  if (tool === 'trace' && Array.isArray(body.flows)) {
    const cameIn: Movement[] = [];
    const wentOut: Movement[] = [];
    for (const f of body.flows) {
      const moves = [
        { amount: String(f.sol_change ?? '0'), symbol: 'SOL' },
        ...(f.token_changes ?? []).map((t: any) => ({ amount: String(t.change), symbol: tokenName(t) })),
      ];
      for (const m of moves) {
        if (num(m.amount) === 0) continue;
        const move = { amount: abs(m.amount), symbol: m.symbol, other: f.counterparty ? [f.counterparty] : [], time: f.time ?? undefined, tx: f.tx_id };
        (positive(m.amount) ? cameIn : wentOut).push(move);
      }
    }
    return { wallet: body.wallet, cameIn, wentOut, note: `Across the ${body.flows.length} transactions read. Small SOL amounts going out are usually fees.` };
  }
  return null;
}

// Pulse's own answer in one line: the verdict and the summary, or the trace report's problem.
export function answerLine(tool: string, body: any): string {
  if (!body || typeof body !== 'object') return '';
  const verdict = typeof body.verdict === 'string' ? `${body.verdict}: ` : '';
  const text = body.summary ?? body.report?.problem ?? body.explanation ?? '';
  return `${tool} said ${verdict}${text}`.trim();
}

// The GitHub report form, filled in from this call. Every field stays editable on GitHub before sending.
// Tools that look at a transaction or a wallet get a link; the rest return null.
export function reportUrl(tool: string, args: Record<string, unknown>, body: any): string | null {
  const params = new URLSearchParams();
  let title = '';
  if (tool === 'explain_tx' && typeof args.tx_id === 'string') {
    params.set('signature', args.tx_id);
    title = `${args.tx_id.slice(0, 8)}…`;
  } else if ((tool === 'check_tx' || tool === 'tx_matches') && typeof args.tx === 'string') {
    title = 'unsigned transaction';
  } else if (tool === 'trace' && typeof args.wallet === 'string') {
    params.set('wallet', args.wallet);
    title = `wallet ${args.wallet.slice(0, 8)}…`;
  } else return null;
  const answer = answerLine(tool, body);
  const tx = typeof args.tx === 'string' && args.tx.length <= 2500 ? `\n\nThe transaction it checked (base64):\n${args.tx}` : '';
  params.set('title', `Suspicious tx: ${title}`);
  params.set('pulse_answer', `${answer}${tx}`.slice(0, 3500));
  return `${REPORT_FORM}&${params.toString()}`;
}
