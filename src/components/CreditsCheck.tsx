import React, { useState } from "react";

export const CreditsCheck: React.FC = () => {
  const [address, setAddress] = useState("");
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setErr("");
    setData(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/credits?address=${encodeURIComponent(address.trim())}`);
      const json = await res.json();
      if (!res.ok) setErr(json.error || "Lookup failed");
      else setData(json);
    } catch {
      setErr("Could not reach the gateway");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900">
      <p className="text-xs font-bold uppercase text-emerald-400">Check credits</p>
      <p className="text-[11px] text-slate-400 mt-0.5">Paste a wallet address to see paid credits and free calls left. This lookup is free.</p>
      <div className="flex gap-2 mt-3">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Wallet address"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
        />
        <button
          onClick={check}
          disabled={loading || !address.trim()}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {loading ? "..." : "Check"}
        </button>
      </div>
      {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
      {data && (
        <div className="grid grid-cols-2 gap-3 mt-3 text-center">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <p className="text-xl font-bold text-white">{data.paidCredits}</p>
            <p className="text-[11px] text-slate-400">Paid credits left</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <p className="text-xl font-bold text-white">{data.freeCallsRemaining}</p>
            <p className="text-[11px] text-slate-400">Free calls left (this connection)</p>
          </div>
        </div>
      )}
    </div>
  );
};
