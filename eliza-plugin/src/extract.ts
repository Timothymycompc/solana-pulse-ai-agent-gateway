// Finds a tool's input in what the user wrote, by its exact shape only. Nothing is guessed: if the input isn't there,
// the action asks for it instead of making one up.

const BASE58 = "1-9A-HJ-NP-Za-km-z";

// A transaction in base64: long, and longer than any signature or address.
export function findTx(text: string): string | undefined {
  return text.match(/[A-Za-z0-9+/]{100,}={0,2}/)?.[0];
}

// A transaction signature: 64 bytes in base58, which is 80 to 88 characters.
export function findSignature(text: string): string | undefined {
  return text.match(new RegExp(`(?<![${BASE58}])[${BASE58}]{80,88}(?![${BASE58}])`))?.[0];
}

// A Solana address (wallet, token mint, program): 32 bytes in base58, which is 32 to 44 characters.
export function findAddress(text: string): string | undefined {
  return text.match(new RegExp(`(?<![${BASE58}])[${BASE58}]{32,44}(?![${BASE58}])`))?.[0];
}

// A ticker written as $BONK, or a name after "find token" / "look up the coin".
export function findTicker(text: string): string | undefined {
  const dollar = text.match(/(?<![\w$])\$([A-Za-z][A-Za-z0-9]{1,14})\b/);
  if (dollar) return dollar[1];
  return text.match(/\b(?:find|look\s?up|search(?:\s+for)?)\s+(?:the\s+)?(?:token|ticker|coin|mint)\s+(?:for\s+|called\s+|named\s+)?\$?([A-Za-z][A-Za-z0-9 .-]{1,40}?)(?=[?.!,]|$)/i)?.[1]?.trim();
}

// An error as a wallet or RPC shows it.
export function findError(text: string): string | undefined {
  const custom = text.match(/custom program error:?\s*0x[0-9a-f]+/i);
  if (custom) return custom[0];
  const named = text.match(/\b(InsufficientFunds\w*|BlockhashNotFound|AccountNotFound|AccountFrozen|AccountInUse|InvalidAccountData|SlippageToleranceExceeded|ExceededSlippage|AlreadyProcessed|InstructionError\b[^\n]{0,80})/);
  if (named) return named[0];
  return text.match(/\berror(?: code)?:?\s*(0x[0-9a-f]{2,8})\b/i)?.[1];
}
