import React, { useCallback, useEffect, useState } from "react";

interface AccountPanelProps {
  authHeaders: Record<string, string>;
}

const EMPTY = { wallet: "", token: "", signature: "", network: "" };

export const AccountPanel: React.FC<AccountPanelProps> = ({ authHeaders }) => {
  const hasKey = Boolean(authHeaders["x-api-key"] || authHeaders["Authorization"]);
  const [acct, setAcct] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const loadAccount = useCallback(async () => {
    if (!hasKey) { setAcct(null); return; }
    try {
      const v = await fetch("/api/keys/verify", { headers: authHeaders }).then((r) => r.json());
      setAcct(v.valid ? v : { invalid: true });
    } catch {
      setErr("Could not reach the gateway");
    }
  }, [authHeaders, hasKey]);

  const loadDefaults = useCallback(async () => {
    if (!hasKey) { setForm({ ...EMPTY }); return; }
    try {
      const d = await fetch("/api/keys/defaults", { headers: authHeaders }).then((r) => r.json());
      setForm({ ...EMPTY, ...(d.defaults || {}) });
    } catch {
      setErr("Could not load your defaults");
    }
  }, [authHeaders, hasKey]);

  useEffect(() => {
    setMsg("");
    setErr("");
    loadAccount();
    loadDefaults();
  }, [loadAccount, loadDefaults]);

  useEffect(() => {
    const onCall = () => { setTimeout(loadAccount, 600); };
    window.addEventListener("pulse:call-done", onCall);
    return () => window.removeEventListener("pulse:call-done", onCall);
  }, [loadAccount]);

  const save = async (values: typeof EMPTY) => {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/keys/defaults", {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok) setErr(json.error || "Could not save");
      else {
        setForm({ ...EMPTY, ...(json.defaults || {}) });
        setMsg("Saved. Blank calls now fill in with these values.");
      }
    } catch {
      setErr("Could not reach the gateway");
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof EMPTY, label: string, hint: string) => (
    <label className="block">
      <span className="text-[11px] text-slate-400">{label}</span>
      <input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={hint}
        className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
      />
    </label>
  );

  if (!hasKey) {
    return (
      <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900">
        <p className="text-xs font-bold uppercase text-amber-400">Your account</p>
        <p className="text-[11px] text-slate-400 mt-1">
          Sign in with your wallet above to see your connected wallet, your paid credits, and to change what blank calls fill in with.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase text-amber-400">Your account</p>
        <button onClick={() => { loadAccount(); loadDefaults(); }} className="text-[11px] text-slate-400 underline">Refresh</button>
      </div>

      {acct?.invalid && <p className="text-xs text-red-400 mt-2">This key is no longer active. Sign in again to get a new one.</p>}
      {acct && !acct.invalid && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 sm:col-span-1 min-w-0">
            <p className="text-sm font-bold text-white break-all" title={acct.address}>
              {acct.address.slice(0, 6)}...{acct.address.slice(-6)}
            </p>
            <p className="text-[11px] text-slate-400">Connected wallet</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <p className="text-xl font-bold text-white">{acct.paidCredits}</p>
            <p className="text-[11px] text-slate-400">Paid credits left</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <p className="text-xl font-bold text-white">{acct.totalCallsMade}</p>
            <p className="text-[11px] text-slate-400">Calls made</p>
          </div>
        </div>
      )}

      <p className="text-xs font-bold uppercase text-slate-300 mt-4">Live defaults for blank calls</p>
      <p className="text-[11px] text-slate-400 mt-0.5">Leave a field empty to use the built-in value (your wallet, USDC, a live Jupiter transaction, mainnet).</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        {field("wallet", "Default wallet", "Your connected wallet")}
        {field("token", "Default token (mint or ticker)", "USDC")}
        {field("signature", "Default transaction signature", "Latest Jupiter transaction")}
        <label className="block">
          <span className="text-[11px] text-slate-400">Network</span>
          <select
            value={form.network}
            onChange={(e) => setForm({ ...form, network: e.target.value })}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
          >
            <option value="">mainnet-beta (built-in)</option>
            <option value="mainnet-beta">mainnet-beta</option>
            <option value="devnet">devnet</option>
          </select>
        </label>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => save(form)} disabled={busy} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-50">
          {busy ? "Saving..." : "Save defaults"}
        </button>
        <button onClick={() => save({ ...EMPTY })} disabled={busy} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm disabled:opacity-50">
          Reset to built-in
        </button>
      </div>
      {msg && <p className="text-xs text-emerald-400 mt-2">{msg}</p>}
      {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
    </div>
  );
};
