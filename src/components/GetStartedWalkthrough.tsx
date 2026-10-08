import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { encodeBase58 } from './SecureWalletClaim';

type LogEntry = {
  id: number;
  label: string;
  method: string;
  url: string;
  status: number;
  ms: number;
  body: unknown;
  headers: Record<string, string>;
};
type DepositOption = { calls: number; lamports: number; sol: number };
type DepositInfo = { payout_address: string; price_per_call_lamports: number; deposit_options?: DepositOption[] };

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function getProvider(): any {
  const w = window as any;
  return w.phantom?.solana ?? w.solflare ?? w.backpack ?? w.solana ?? null;
}

function maskKeys(v: any): any {
  if (!v || typeof v !== 'object') return v;
  const out: any = Array.isArray(v) ? [] : {};
  for (const k of Object.keys(v)) {
    const val = v[k];
    out[k] =
      (k === 'apiKey' || k === 'token' || k === 'key') && typeof val === 'string'
        ? val.slice(0, 6) + '... (full key is shown in step 3)'
        : maskKeys(val);
  }
  return out;
}

const card = 'rounded-2xl border border-slate-800 bg-slate-900 p-5';
const btn =
  'rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40';
const ghost = 'text-[11px] text-slate-400 underline hover:text-slate-200 disabled:opacity-40';

const Step: React.FC<{
  n: number;
  title: string;
  route: string;
  done: boolean;
  active: boolean;
  children: React.ReactNode;
}> = ({ n, title, route, done, active, children }) => (
  <div className={`${card} ${active ? 'border-indigo-500/60' : ''} ${!done && !active ? 'opacity-60' : ''}`}>
    <div className="flex items-start gap-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? 'bg-emerald-500/20 text-emerald-300' : active ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
        }`}
      >
        {done ? <Check className="h-4 w-4" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <code className="text-[11px] text-indigo-300">{route}</code>
        </div>
        {children}
      </div>
    </div>
  </div>
);

export const GetStartedWalkthrough: React.FC = () => {
  const [wallet, setWallet] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [deposit, setDeposit] = useState<DepositInfo | null>(null);
  const [choice, setChoice] = useState(0);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [credited, setCredited] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [mint, setMint] = useState(USDC_MINT);
  const [firstDone, setFirstDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const baseline = useRef(0);
  const nextId = useRef(1);
  const alive = useRef(true);
  const provider = useRef<any>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const call = async (label: string, path: string, init?: RequestInit) => {
    const t0 = performance.now();
    const method = init?.method ?? 'GET';
    const res = await fetch(path, init);
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    const headers: Record<string, string> = {};
    const left = res.headers.get('x-credits-remaining');
    if (left !== null) headers['x-credits-remaining'] = left;
    setLog((l) => [
      ...l,
      { id: nextId.current++, label, method, url: path, status: res.status, ms: Math.round(performance.now() - t0), body: maskKeys(body), headers },
    ]);
    return { ok: res.ok, status: res.status, body, headers };
  };

  const quietStatus = async (addr: string) => {
    try {
      const r = await fetch(`/api/payments/status?wallet=${addr}`);
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  };

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  const connect = () =>
    run('connect', async () => {
      const p = getProvider();
      if (!p) throw new Error('No Solana wallet found. Install Phantom, Solflare or Backpack, then reload this page.');
      const r = await p.connect();
      const pk = r?.publicKey ?? p.publicKey;
      if (!pk) throw new Error('The wallet did not return an address.');
      provider.current = p;
      setWallet(pk.toString());
    });

  const getChallenge = () =>
    run('challenge', async () => {
      const r = await call('Get a challenge', '/api/auth/challenge');
      if (!r.ok || !r.body?.message) throw new Error(r.body?.error || 'Could not get a challenge');
      setChallenge(r.body.message);
    });

  const signIn = () =>
    run('login', async () => {
      const p = provider.current;
      if (!p || !wallet || !challenge) throw new Error('Connect your wallet and get a challenge first.');
      if (typeof p.signMessage !== 'function') throw new Error('This wallet cannot sign messages.');
      const signed = await p.signMessage(new TextEncoder().encode(challenge), 'utf8');
      const sigBytes = signed?.signature ?? signed;
      const r = await call('Sign in', '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, signature: encodeBase58(new Uint8Array(sigBytes)), message: challenge }),
      });
      const key = r.body?.apiKey || r.body?.token;
      if (!r.ok || !key) {
        setChallenge(null);
        throw new Error(r.body?.error || 'Sign in failed. Get a new challenge and try again.');
      }
      setApiKey(key);
    });

  const getDeposit = () =>
    run('deposit', async () => {
      const r = await call('Get deposit info', '/api/claim/deposit-info');
      if (!r.ok || !r.body?.payout_address) throw new Error(r.body?.error || 'Could not get deposit info');
      const base = wallet ? await quietStatus(wallet) : null;
      baseline.current = Number(base?.total_credits_ever || 0);
      setDeposit(r.body);
      setChoice(0);
    });

  const options: DepositOption[] = deposit
    ? deposit.deposit_options && deposit.deposit_options.length
      ? deposit.deposit_options
      : [{ calls: 1, lamports: deposit.price_per_call_lamports, sol: deposit.price_per_call_lamports / 1e9 }]
    : [];

  const sendDeposit = () =>
    run('send', async () => {
      const p = provider.current;
      const opt = options[choice];
      if (!p || !wallet || !deposit || !opt) throw new Error('Connect your wallet and load the deposit info first.');
      if (typeof p.signAndSendTransaction !== 'function') {
        throw new Error('This wallet cannot send from the page. Send the SOL from your wallet app, then press Watch.');
      }
      const bh = await call('Get a blockhash', '/api/solana/blockhash');
      const blockhash = bh.body?.blockhash ?? bh.body?.recentBlockhash ?? bh.body?.data?.blockhash;
      if (!bh.ok || typeof blockhash !== 'string') throw new Error('Could not read a blockhash from the gateway.');
      const from = new PublicKey(wallet);
      const tx = new Transaction();
      tx.feePayer = from;
      tx.recentBlockhash = blockhash;
      tx.add(
        SystemProgram.transfer({
          fromPubkey: from,
          toPubkey: new PublicKey(deposit.payout_address),
          lamports: opt.lamports,
        })
      );
      const res = await p.signAndSendTransaction(tx);
      setTxSig(typeof res === 'string' ? res : res?.signature ?? null);
    });

  const watch = () =>
    run('watch', async () => {
      if (!wallet) return;
      const end = Date.now() + 180000;
      while (alive.current && Date.now() < end) {
        const s = await quietStatus(wallet);
        if (s && s.deposit_detected && Number(s.total_credits_ever) > baseline.current) {
          await call('Check payment status', `/api/payments/status?wallet=${wallet}`);
          const c = await call('Check credits', `/api/credits?address=${wallet}`);
          setCredits(Number(c.body?.paidCredits ?? 0));
          setCredited(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
      if (alive.current) throw new Error('No deposit seen yet. It can take a minute after the transaction confirms. Press Watch again.');
    });

  const useExisting = () =>
    run('existing', async () => {
      if (!wallet) return;
      const c = await call('Check credits', `/api/credits?address=${wallet}`);
      const n = Number(c.body?.paidCredits ?? 0);
      if (!c.ok || n < 1) throw new Error('This wallet has no credits yet.');
      setCredits(n);
      setCredited(true);
    });

  const firstCall = () =>
    run('first', async () => {
      if (!apiKey) throw new Error('Sign in first.');
      const r = await call('First paid call', `/api/solana/token-profile?mint=${encodeURIComponent(mint.trim())}`, {
        headers: { 'x-api-key': apiKey },
      });
      const left = r.headers['x-credits-remaining'];
      if (r.ok && left !== undefined) setCredits(Number(left));
      if (!r.ok) throw new Error(r.body?.error || `The call returned status ${r.status}. No credit was used.`);
      setFirstDone(true);
    });

  const startOver = () => {
    setWallet(null);
    setChallenge(null);
    setApiKey(null);
    setDeposit(null);
    setChoice(0);
    setTxSig(null);
    setCredited(false);
    setCredits(null);
    setFirstDone(false);
    setError(null);
    setLog([]);
    provider.current = null;
  };

  const stepDone = [!!wallet, !!(challenge || apiKey), !!apiKey, !!deposit, credited, firstDone];
  const cur = stepDone.findIndex((d) => !d);
  const act = (i: number) => cur === i;
  const curl = apiKey ? `curl -H "x-api-key: ${apiKey}" "${origin}/api/solana/token-profile?mint=${mint.trim() || USDC_MINT}"` : '';

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Get started: sign in, add credits, make your first call</h2>
        <p className="mt-1 text-xs text-slate-400">
          Your wallet is your account. There is no signup form and no email. Every step below is a real call to the gateway, and each one is listed at the bottom with its full response.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-xs text-red-300">{error}</div>}

      <Step n={1} title="Connect your wallet" route="Wallet extension (Phantom, Solflare or Backpack)" done={stepDone[0]} active={act(0)}>
        {wallet ? (
          <p className="break-all font-mono text-xs text-slate-300">{wallet}</p>
        ) : (
          <p className="text-xs text-slate-400">This only shares your public address. Nothing is sent to the network.</p>
        )}
        {!wallet && (
          <button className={btn} disabled={!act(0) || !!busy} onClick={connect}>
            {busy === 'connect' ? 'Waiting for wallet...' : 'Connect wallet'}
          </button>
        )}
      </Step>

      <Step n={2} title="Ask for a challenge" route="GET /api/auth/challenge" done={stepDone[1]} active={act(1)}>
        {challenge ? (
          <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-300">{challenge}</pre>
        ) : (
          <p className="text-xs text-slate-400">The gateway gives you a short message with a one-time number. It expires after 5 minutes.</p>
        )}
        {!stepDone[1] && (
          <button className={btn} disabled={!act(1) || !!busy} onClick={getChallenge}>
            {busy === 'challenge' ? 'Asking...' : 'Get a challenge'}
          </button>
        )}
      </Step>

      <Step n={3} title="Sign it and log in" route="POST /api/auth/login" done={stepDone[2]} active={act(2)}>
        {apiKey ? (
          <div className="space-y-3">
            <p className="text-xs text-emerald-300">You are signed in. This is your key. Copy it now, because it cannot be shown again.</p>
            <div>
              <p className="mb-1 text-[11px] uppercase text-slate-500">Your header</p>
              <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
                <code className="min-w-0 flex-1 break-all text-[11px] text-slate-200">x-api-key: {apiKey}</code>
                <button className={ghost} onClick={() => copy('key', apiKey)}>
                  {copied === 'key' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] uppercase text-slate-500">Try it from a terminal</p>
              <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
                <code className="min-w-0 flex-1 break-all text-[11px] text-slate-300">{curl}</code>
                <button className={ghost} onClick={() => copy('curl', curl)}>
                  {copied === 'curl' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">Signing in again makes a new key and stops the old one working. Your credits stay with your wallet.</p>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Your wallet signs the message. This is free and sends nothing to the network. You get back an API key.</p>
        )}
        {!apiKey && (
          <button className={btn} disabled={!act(2) || !!busy} onClick={signIn}>
            {busy === 'login' ? 'Waiting for wallet...' : 'Sign and log in'}
          </button>
        )}
      </Step>

      <Step n={4} title="See where to send credits" route="GET /api/claim/deposit-info" done={stepDone[3]} active={act(3)}>
        {deposit ? (
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Send to</span>
              <code className="break-all text-[11px]">{deposit.payout_address}</code>
              <button className={ghost} onClick={() => copy('addr', deposit.payout_address)}>
                {copied === 'addr' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p>
              Price: {deposit.price_per_call_lamports.toLocaleString()} lamports ({deposit.price_per_call_lamports / 1e9} SOL) per paid call.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-400">The gateway tells you its payout address and the price per call.</p>
        )}
        {!deposit && (
          <button className={btn} disabled={!act(3) || !!busy} onClick={getDeposit}>
            {busy === 'deposit' ? 'Loading...' : 'Get deposit info'}
          </button>
        )}
      </Step>

      <Step n={5} title="Send SOL and wait for your credits" route="GET /api/solana/blockhash, then GET /api/payments/status and GET /api/credits" done={stepDone[4]} active={act(4)}>
        {credited ? (
          <p className="text-xs text-emerald-300">Deposit counted. You have {credits ?? 0} credits.</p>
        ) : deposit ? (
          <div className="space-y-3">
            <p className="text-xs text-amber-300">This sends real SOL on Solana mainnet from your wallet. Pick the smallest amount to try.</p>
            <div className="flex flex-wrap gap-2">
              {options.map((o, i) => (
                <button
                  key={o.calls}
                  onClick={() => setChoice(i)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    choice === i ? 'border-indigo-500 bg-indigo-500/10 text-white' : 'border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {o.calls} calls, {o.sol} SOL
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className={btn} disabled={!act(4) || !!busy || !!txSig} onClick={sendDeposit}>
                {busy === 'send' ? 'Waiting for wallet...' : 'Send with my wallet'}
              </button>
              <button className={btn} disabled={!act(4) || !!busy} onClick={watch}>
                {busy === 'watch' ? 'Watching for your deposit...' : 'Watch for my deposit'}
              </button>
              <button className={ghost} disabled={!act(4) || !!busy} onClick={useExisting}>
                I already have credits
              </button>
            </div>
            {txSig && (
              <p className="break-all text-[11px] text-slate-400">
                Sent: <a className="underline" href={`https://solscan.io/tx/${txSig}`} target="_blank" rel="noreferrer">{txSig}</a>. Now press Watch for my deposit.
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              If your wallet cannot send from this page, send the SOL from your wallet app to the address in step 4, then press Watch. Watching checks every few seconds for up to 3 minutes.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Finish step 4 first.</p>
        )}
      </Step>

      <Step n={6} title="Make your first paid call" route="GET /api/solana/token-profile" done={stepDone[5]} active={act(5)}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-[11px] text-white"
            placeholder="Token mint address"
          />
          <button className={btn} disabled={!(act(5) || firstDone) || !!busy} onClick={firstCall}>
            {busy === 'first' ? 'Calling...' : firstDone ? 'Call again' : 'Make my first paid call'}
          </button>
        </div>
        {firstDone && (
          <p className="text-xs text-emerald-300">
            It worked. Credits left: {credits ?? 'unknown'}. Open the call log below to see the full response, then use the same header on any paid call.
          </p>
        )}
        <p className="text-[11px] text-slate-500">A call that ends in an error is refunded, so it does not cost a credit.</p>
      </Step>

      <div className="flex justify-end">
        <button className={ghost} onClick={startOver}>Start over</button>
      </div>

      {log.length > 0 && (
        <div className={card}>
          <h3 className="mb-2 text-sm font-bold text-white">Every call made on this page</h3>
          <div className="space-y-2">
            {log.map((e) => (
              <details key={e.id} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                <summary className="cursor-pointer text-xs text-slate-300">
                  <span className="font-mono text-indigo-300">{e.method} {e.url}</span> · {e.status} · {e.ms} ms · {e.label}
                </summary>
                {Object.keys(e.headers).length > 0 && (
                  <p className="mt-2 font-mono text-[11px] text-slate-400">
                    {Object.entries(e.headers).map(([k, v]) => `${k}: ${v}`).join('  ')}
                  </p>
                )}
                <pre className="mt-2 max-h-64 overflow-auto text-[11px] text-slate-300">{JSON.stringify(e.body, null, 2)}</pre>
              </details>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default GetStartedWalkthrough;
