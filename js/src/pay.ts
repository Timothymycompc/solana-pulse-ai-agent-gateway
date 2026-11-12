// Opt-in automatic payment: when a tool's free calls are used up, pay the call with x402 (USDC on Solana mainnet) from
// your own wallet, within spending caps you set. Loaded only when `pay` is passed, so the basic client needs no
// dependencies. Needs: npm install @x402/fetch @x402/svm @solana/kit
//
// Caps are checked against Pulse's price before anything is signed: a call over maxPerCallUsd, or one that would take
// today's total (UTC, this process) over maxPerDayUsd, is refused and nothing is paid. Only USDC on Solana mainnet is
// paid; any other asset or network in the terms is refused.

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

export interface PayOptions {
  /** The paying wallet's 64-byte secret key (a Solana keypair file's numbers). It needs USDC; no SOL (the facilitator pays network fees). */
  secretKey: Uint8Array | number[];
  /** Largest single payment, in USD. Default 0.05. */
  maxPerCallUsd?: number;
  /** Largest total per UTC day for this process, in USD. Default 1. */
  maxPerDayUsd?: number;
  /** Solana RPC used to build the payment. Default: the public mainnet RPC. */
  rpcUrl?: string;
}

interface Requirement { scheme: string; network: string; asset: string; amount: string; payTo: string }

// Spent per UTC day per paying wallet, in USDC base units (6 decimals). In memory: a restart starts the day over.
const spent = new Map<string, bigint>();
const today = () => new Date().toISOString().slice(0, 10);
const usdToBase = (usd: number) => BigInt(Math.round(usd * 1_000_000));

export class PaymentRefusedError extends Error {
  constructor(message: string, readonly amountUsd?: number) {
    super(message);
    this.name = "PaymentRefusedError";
  }
}

/** Picks the USDC-on-Solana payment terms and enforces the caps. Exported for tests. */
export function choosePayment(requirements: Requirement[], wallet: string, opts: Pick<PayOptions, "maxPerCallUsd" | "maxPerDayUsd">): Requirement {
  const req = requirements.find((r) => r.scheme === "exact" && r.network === SOLANA_MAINNET && r.asset === USDC_MINT);
  if (!req) throw new PaymentRefusedError("Pulse didn't offer USDC on Solana mainnet, the only payment this client makes.");
  const amount = BigInt(req.amount);
  const perCall = usdToBase(opts.maxPerCallUsd ?? 0.05);
  if (amount > perCall) throw new PaymentRefusedError(`This call costs $${Number(amount) / 1e6}, over your maxPerCallUsd of $${Number(perCall) / 1e6}.`, Number(amount) / 1e6);
  const key = `${today()}:${wallet}`;
  const perDay = usdToBase(opts.maxPerDayUsd ?? 1);
  const already = spent.get(key) ?? 0n;
  if (already + amount > perDay) throw new PaymentRefusedError(`Paying $${Number(amount) / 1e6} would take today's total to $${Number(already + amount) / 1e6}, over your maxPerDayUsd of $${Number(perDay) / 1e6}.`, Number(amount) / 1e6);
  return req;
}

/** Records a settled payment against today's total. Exported for tests. */
export function recordPayment(wallet: string, amountBase: bigint) {
  const key = `${today()}:${wallet}`;
  spent.set(key, (spent.get(key) ?? 0n) + amountBase);
}

/** Today's total paid by a wallet in this process, in USD. */
export const spentTodayUsd = (wallet: string) => Number(spent.get(`${today()}:${wallet}`) ?? 0n) / 1e6;

/** A fetch that pays 402 answers within the caps. */
export async function payingFetch(pay: PayOptions): Promise<{ fetch: typeof fetch; wallet: string }> {
  let mods: [any, any, any];
  try {
    mods = await Promise.all([import("@x402/fetch"), import("@x402/svm"), import("@solana/kit")]);
  } catch {
    throw new PaymentRefusedError("Automatic payment needs: npm install @x402/fetch @x402/svm @solana/kit");
  }
  const [{ wrapFetchWithPaymentFromConfig }, { ExactSvmScheme }, { createKeyPairSignerFromBytes }] = mods;
  const signer = await createKeyPairSignerFromBytes(Uint8Array.from(pay.secretKey));
  const wallet = String(signer.address);
  let chosen: Requirement | null = null;
  const paid = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: SOLANA_MAINNET, client: new ExactSvmScheme(signer, pay.rpcUrl ? { rpcUrl: pay.rpcUrl } : undefined) }],
    paymentRequirementsSelector: (_v: number, reqs: Requirement[]) => (chosen = choosePayment(reqs, wallet, pay)),
  });
  const wrapped = (async (input: RequestInfo | URL, init?: RequestInit) => {
    chosen = null;
    const res = await paid(input, init);
    // Count it only when the paid call went through (Pulse never charges a call that fails).
    if (chosen && res.ok) recordPayment(wallet, BigInt((chosen as Requirement).amount));
    return res;
  }) as typeof fetch;
  return { fetch: wrapped, wallet };
}
