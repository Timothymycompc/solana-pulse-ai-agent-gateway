import React, { useEffect, useState } from 'react';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function encodeBase58(bytes: Uint8Array): string {
  if (!bytes.length) return '';
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let encoded = ALPHABET[0].repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) encoded += ALPHABET[digits[i]];
  return encoded;
}

type WalletProvider = {
  publicKey?: { toString(): string };
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<unknown>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, encoding?: string) => Promise<{ signature?: Uint8Array } | Uint8Array>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  off?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  isSolflare?: boolean;
  isPhantom?: boolean;
};

function getWalletProvider(): WalletProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as Window & { solflare?: WalletProvider; solana?: WalletProvider };
  return w.solflare ?? w.solana;
}

interface SecureWalletClaimProps {
  onCredentialsApplied: (apiKey: string, headers: Record<string, string>) => void;
}

export const SecureWalletClaim: React.FC<SecureWalletClaimProps> = ({ onCredentialsApplied }) => {
  const [provider, setProvider] = useState<WalletProvider>();
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const detected = getWalletProvider();
    setProvider(detected);
    if (!detected) return;
    const accountChanged = (key?: { toString(): string } | null) => {
      const nextAddress = key?.toString() ?? '';
      setWalletAddress(nextAddress);
      setAuthenticated(false);
      onCredentialsApplied('', {});
    };
    const disconnected = () => accountChanged(null);
    detected.on?.('accountChanged', accountChanged);
    detected.on?.('disconnect', disconnected);
    return () => {
      detected.off?.('accountChanged', accountChanged);
      detected.off?.('disconnect', disconnected);
      detected.removeListener?.('accountChanged', accountChanged);
      detected.removeListener?.('disconnect', disconnected);
    };
  }, [onCredentialsApplied]);

  const connect = async () => {
    setError('');
    const activeProvider = provider ?? getWalletProvider();
    if (!activeProvider) {
      setError('No Solana wallet was detected. Install or enable a wallet such as Phantom or Solflare, then reload this page.');
      return;
    }
    setLoading(true);
    try {
      await activeProvider.connect();
      if (!activeProvider.publicKey) throw new Error('The wallet connected but did not return an account.');
      setProvider(activeProvider);
      setWalletAddress(activeProvider.publicKey.toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Wallet connection was not completed.');
    } finally {
      setLoading(false);
    }
  };

  const signIn = async () => {
    const activeProvider = provider ?? getWalletProvider();
    if (!activeProvider?.publicKey) return connect();
    if (!activeProvider.signMessage) {
      setError('This wallet does not support message signing. Choose a Solana wallet with signMessage support.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const challengeResponse = await fetch('/api/auth/challenge', { cache: 'no-store' });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok || typeof challenge.message !== 'string') {
        throw new Error(challenge.error || 'Could not get a sign-in challenge.');
      }
      const result = await activeProvider.signMessage(new TextEncoder().encode(challenge.message), 'utf8');
      const signature = result instanceof Uint8Array ? result : result.signature;
      if (!signature) throw new Error('The wallet did not return a signature.');
      const wallet = activeProvider.publicKey.toString();
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, message: challenge.message, signature: encodeBase58(new Uint8Array(signature)) }),
      });
      const login = await loginResponse.json();
      if (!loginResponse.ok) throw new Error(login.error || 'Wallet sign-in failed. Request a fresh challenge and retry.');
      const key = login.apiKey || login.token;
      if (!key) throw new Error('Sign-in succeeded but the API did not return a key.');
      setWalletAddress(wallet);
      setAuthenticated(true);
      onCredentialsApplied(key, { Authorization: `Bearer ${key}`, 'x-api-key': key });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Wallet sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    try { await provider?.disconnect?.(); } catch { /* Clear local credentials even if the wallet disconnect call fails. */ }
    setWalletAddress('');
    setAuthenticated(false);
    setError('');
    onCredentialsApplied('', {});
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 text-slate-100" aria-labelledby="wallet-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${authenticated ? 'bg-emerald-400' : walletAddress ? 'bg-amber-400' : 'bg-slate-600'}`} />
            <h3 id="wallet-title" className="text-sm font-semibold text-white">Wallet access</h3>
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
              {authenticated ? 'Signed in' : walletAddress ? 'Connected' : provider ? 'Ready' : 'Wallet not found'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {authenticated ? 'API key is held in this tab’s memory and attached to playground requests.' : 'Connect a Solana wallet, then sign a one time login message. No transaction or network fee.'}
          </p>
          {walletAddress && <p className="mt-2 break-all font-mono text-xs text-slate-300">{walletAddress}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {!walletAddress && <button onClick={connect} disabled={loading} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:border-indigo-400 hover:text-white disabled:opacity-50">{loading ? 'Connecting…' : 'Connect wallet'}</button>}
          {walletAddress && !authenticated && <button onClick={signIn} disabled={loading} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">{loading ? 'Waiting for signature…' : 'Sign in to gateway'}</button>}
          {walletAddress && <button onClick={disconnect} disabled={loading} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:border-rose-500 hover:text-rose-200 disabled:opacity-50">Disconnect</button>}
        </div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">{error}</p>}
      {authenticated && <p role="status" className="mt-4 rounded-lg border border-emerald-900 bg-emerald-950/30 p-3 text-xs text-emerald-200">Wallet verified. Your key remains in memory and is not saved to browser storage.</p>}
    </section>
  );
};
