import React, { useState, useEffect } from 'react';
import { Coins, Key, Bot, Copy, Check, Send, RefreshCw } from 'lucide-react';

const GATEWAY_WALLET = "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU";
const PRICE_PER_CALL_SOL = 0.0022;

export const AgentMonetizationStudio: React.FC = () => {
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [manifest, setManifest] = useState<string | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [isLoadingManifest, setIsLoadingManifest] = useState(false);
  const [copiedManifest, setCopiedManifest] = useState(false);

  const fetchManifest = async () => {
    setIsLoadingManifest(true);
    setManifestError(null);
    try {
      const res = await fetch('/.well-known/mcp.json');
      const json = await res.json();
      setManifest(JSON.stringify(json, null, 2));
    } catch (err: any) {
      setManifestError(err.message || 'Failed to fetch manifest');
    } finally {
      setIsLoadingManifest(false);
    }
  };

  useEffect(() => { fetchManifest(); }, []);

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(GATEWAY_WALLET);
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 2000);
  };

  const handleCopyManifest = () => {
    if (!manifest) return;
    navigator.clipboard.writeText(manifest);
    setCopiedManifest(true);
    setTimeout(() => setCopiedManifest(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950/70 via-slate-900 to-cyan-950/70 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Coins className="w-64 h-64 text-indigo-400" />
        </div>
        <div className="relative z-10">
          <h2 className="text-2xl font-bold text-white tracking-tight">Pricing &amp; Top-Up</h2>
          <p className="text-sm text-slate-300 max-w-2xl mt-1">
            Pay per call in SOL. No subscription, no monthly commitment — deposit once, spend it down as you use the gateway.
          </p>
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Coins className="w-5 h-5 text-indigo-400" />
          Pricing
        </h3>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 uppercase">Paid endpoints</span>
            <p className="text-2xl font-extrabold text-white mt-1">{PRICE_PER_CALL_SOL} SOL <span className="text-sm font-normal text-slate-400">/ call</span></p>
            <p className="text-xs text-slate-400 mt-1">Flat rate across every metered endpoint. Deducted from your credit balance.</p>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 uppercase">Free tier</span>
            <p className="text-2xl font-extrabold text-emerald-400 mt-1">50 calls</p>
            <p className="text-xs text-slate-400 mt-1">Lifetime pool per wallet, capped at 15 free calls per day. Balance and blockhash are always free, uncapped.</p>
          </div>
        </div>
      </div>

      {/* Get an API Key */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Key className="w-5 h-5 text-emerald-400" />
          Get an API Key
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Keys are issued by depositing SOL and proving wallet ownership — no signup form, no email.
        </p>

        <div className="mt-4">
          <label className="text-xs font-semibold text-slate-300">1. Send SOL to the gateway wallet</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={GATEWAY_WALLET}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none"
            />
            <button
              onClick={handleCopyWallet}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-xs font-semibold transition flex items-center gap-1 shrink-0"
            >
              {copiedWallet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedWallet ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">The amount you send becomes your credit balance, at {PRICE_PER_CALL_SOL} SOL per call.</p>
        </div>

        <div className="mt-5">
          <label className="text-xs font-semibold text-slate-300">2. Get a challenge, sign it, and claim your key</label>
          <p className="text-xs text-slate-400 mt-1">
            Once your deposit is detected, request a challenge, sign it with the same wallet you paid from, and claim your key:
          </p>
          <pre className="mt-2 p-3 bg-slate-950 rounded-lg text-[11px] font-mono text-indigo-300 overflow-x-auto border border-slate-800">
{`curl ${typeof window !== 'undefined' ? window.location.origin : ''}/api/keys/challenge

# Sign the returned challenge with your wallet's private key, then:
curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/keys/claim \\
  -H "Content-Type: application/json" \\
  -d '{"wallet": "<your_wallet>", "signature": "<base58_signature>", "challenge": "<challenge_from_above>"}'`}
          </pre>
          <p className="text-[11px] text-slate-500 mt-1">
            Keys are unrecoverable by design — only a hash is stored server-side. Sending more SOL from the same wallet issues a new key and invalidates the old one.
          </p>
        </div>

        <div className="mt-5">
          <label className="text-xs font-semibold text-slate-300">3. Use your key</label>
          <pre className="mt-2 p-3 bg-slate-950 rounded-lg text-[11px] font-mono text-indigo-300 overflow-x-auto border border-slate-800">
{`curl "${typeof window !== 'undefined' ? window.location.origin : ''}/api/solana/balance?wallet=<any_wallet>" \\
  -H "x-api-key: <your_key>"`}
          </pre>
        </div>
      </div>

      {/* Live MCP Manifest */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-indigo-400" />
              MCP Manifest (live)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Fetched directly from <code className="text-indigo-300 font-mono">/.well-known/mcp.json</code> on this gateway — not a static example.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchManifest}
              disabled={isLoadingManifest}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-xs font-semibold transition flex items-center gap-1.5"
            >
              {isLoadingManifest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
            <button
              onClick={handleCopyManifest}
              disabled={!manifest}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
            >
              {copiedManifest ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedManifest ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {manifestError && (
          <p className="text-xs text-rose-400">Could not load manifest: {manifestError}</p>
        )}

        <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto max-h-96">
          {manifest || (isLoadingManifest ? 'Loading...' : 'No data')}
        </pre>
      </div>
    </div>
  );
};
