import React, { useState } from 'react';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes: Uint8Array): string {
  if (!bytes || bytes.length === 0) return '';
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) {
    leadingZeros++;
  }
  let result = ALPHABET[0].repeat(leadingZeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    result += ALPHABET[digits[i]];
  }
  return result;
}

interface SecureWalletClaimProps {
  onCredentialsApplied: (apiKey: string, headers: Record<string, string>) => void;
}

export const SecureWalletClaim: React.FC<SecureWalletClaimProps> = ({ onCredentialsApplied }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSecureClaim = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const provider = (window as any).solflare || (window as any).solana;
      if (!provider) {
        throw new Error("Please install the Solflare wallet extension.");
      }

      await provider.connect();
      const walletAddress = provider.publicKey.toString();

      const messageString = `Login to Solana Pulse Gateway.\nTimestamp: ${Date.now()}`;
      const messageBytes = new TextEncoder().encode(messageString);

      const signedMessage = await provider.signMessage(messageBytes, "utf8");
      
      const signatureBytes = signedMessage.signature ? signedMessage.signature : signedMessage;
      
      const signatureBase58 = encodeBase58(new Uint8Array(signatureBytes));

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: walletAddress,
          signature: signatureBase58,
          message: messageString
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to authenticate wallet");
      }

      if (data.apiKey || data.token) {
        const key = data.apiKey || data.token;
        onCredentialsApplied(key, {
          "Authorization": `Bearer ${key}`,
          "x-api-key": key
        });
        setSuccess(true);
      }
    } catch (err: any) {
      console.error("Secure claim error:", err);
      setError(err.message || "Wallet signature failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-6 p-4 rounded-lg bg-slate-900 border border-slate-800 text-slate-100">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Secure API Key Access</h3>
          <p className="text-xs text-slate-400">
            Sign a free transaction with your wallet to authenticate and load your headers.
          </p>
        </div>
        <button
          onClick={handleSecureClaim}
          disabled={loading || success}
          className="px-4 py-2 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {loading ? "Waiting for wallet..." : success ? "Authenticated ✓" : "Connect & Sign"}
        </button>
      </div>

      {error && (
        <div className="mt-3 text-xs p-2 rounded bg-red-950/50 border border-red-800 text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-3 text-xs p-2 rounded bg-green-950/50 border border-green-800 text-green-400 font-mono">
          ✓ Wallet verified. API Key loaded into headers.
        </div>
      )}
    </div>
  );
};
