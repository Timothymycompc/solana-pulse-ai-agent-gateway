// Plain-language explanations for Solana transaction and program errors.
// Only well-established codes are listed; anything else is reported as unknown instead of guessed.

export type ErrorExplanation = {
  code: string;
  name: string;
  scope: "transaction" | "instruction" | "system_program" | "token_program" | "anchor_framework" | "program_specific";
  meaning: string;
  likelyCause: string;
  fix: string;
};

const TX: Record<string, Omit<ErrorExplanation, "code" | "name" | "scope">> = {
  BlockhashNotFound: { meaning: "The transaction's recent blockhash is unknown to the validator or has expired.", likelyCause: "The transaction was built more than about 60-90 seconds (150 blocks) before it was sent, or the RPC that supplied the blockhash is behind.", fix: "Fetch a fresh blockhash (get_solana_blockhash), rebuild, re-sign and send promptly." },
  InsufficientFundsForFee: { meaning: "The fee payer does not have enough SOL to pay the transaction fee.", likelyCause: "Fee payer balance is below the base fee (5000 lamports per signature) plus any priority fee.", fix: "Fund the fee payer with SOL, or lower the priority fee." },
  InsufficientFundsForRent: { meaning: "An account would be left with less SOL than the rent-exempt minimum.", likelyCause: "A transfer or account creation would drop an account below its rent-exempt balance (about 0.00089 SOL for a plain wallet, about 0.00204 SOL for a token account).", fix: "Send more SOL to the account in question (account_index points to it) or transfer a smaller amount." },
  AccountNotFound: { meaning: "An account the transaction needs (usually the fee payer) does not exist on chain.", likelyCause: "The fee payer has never received SOL, or the wrong network is being used.", fix: "Fund the account first, and check you are on the intended network." },
  AlreadyProcessed: { meaning: "This exact transaction has already been processed.", likelyCause: "A retry resent the same signed transaction.", fix: "Check the first submission's status with explain_transaction instead of resending." },
  AccountInUse: { meaning: "An account is locked by another transaction in the same block.", likelyCause: "High contention on a popular account.", fix: "Retry shortly; a priority fee helps under contention." },
  SignatureFailure: { meaning: "A required signature is missing or invalid.", likelyCause: "The transaction was modified after signing, or a required signer did not sign.", fix: "Sign after all edits are final, with every required signer." },
  InvalidAccountForFee: { meaning: "The fee payer cannot pay fees.", likelyCause: "The fee payer is not a system-owned account (for example a token account or program account).", fix: "Use a normal wallet as fee payer." },
  WouldExceedMaxBlockCostLimit: { meaning: "The block is full for this kind of transaction.", likelyCause: "Network congestion.", fix: "Retry with a higher priority fee (fee_advice)." },
  WouldExceedMaxAccountCostLimit: { meaning: "Too much activity on one of the accounts in this block.", likelyCause: "Heavy contention on a hot account, such as a popular pool.", fix: "Retry later or raise the priority fee." },
};

const INSTRUCTION: Record<string, Omit<ErrorExplanation, "code" | "name" | "scope">> = {
  InsufficientFunds: { meaning: "An account does not hold enough lamports or tokens for the operation.", likelyCause: "The amount exceeds the source balance.", fix: "Check the real balance first (get_solana_balance / get_token_accounts) and lower the amount." },
  ComputationalBudgetExceeded: { meaning: "The transaction ran out of compute units.", likelyCause: "The compute unit limit is too low for what the instructions do.", fix: "Simulate (preflight_transaction) to see units consumed, then set a higher SetComputeUnitLimit." },
  ProgramFailedToComplete: { meaning: "The program aborted, often from running out of compute or hitting a panic.", likelyCause: "Too little compute, or a program bug triggered by the inputs.", fix: "Raise the compute limit; if it persists, read the program logs." },
  AccountAlreadyInitialized: { meaning: "The program tried to create or initialize an account that already exists.", likelyCause: "Creating an account (often a token account) that was already created.", fix: "Use the idempotent create instruction, or skip creation when find_ata shows exists=true." },
  UninitializedAccount: { meaning: "An account the program expects to be set up has not been initialized.", likelyCause: "A token account or program account was never created.", fix: "Create the account first (for token accounts: create the associated token account)." },
  IncorrectProgramId: { meaning: "An account is owned by a different program than expected.", likelyCause: "Mixing SPL Token and Token-2022 accounts, or passing the wrong account.", fix: "Check the account owner with inspect_address and use the matching token program." },
  MissingRequiredSignature: { meaning: "An account that must sign did not.", likelyCause: "The authority or owner was not included as a signer.", fix: "Add the required signer." },
  InvalidAccountData: { meaning: "An account's data is not what the program expects.", likelyCause: "Wrong account passed, or a token account for a different mint.", fix: "Verify each account with inspect_address." },
  AccountNotRentExempt: { meaning: "An account would not keep the rent-exempt minimum.", likelyCause: "Too little SOL deposited when creating the account.", fix: "Deposit at least the rent-exempt minimum." },
};

const SYSTEM: Record<number, [string, string, string, string]> = {
  0: ["AccountAlreadyInUse", "The account to create already exists.", "Creating an account at an address that is already in use.", "Use a new address, or skip creation."],
  1: ["ResultWithNegativeLamports", "The transfer would leave the sender with negative SOL.", "Sending more SOL than the sender has.", "Lower the amount or fund the sender."],
  2: ["InvalidProgramId", "Cannot assign the account to an invalid program.", "Bad program id in create/assign.", "Check the program id."],
  3: ["InvalidAccountDataLength", "The requested account size is invalid.", "Space too large or not allowed.", "Request a valid size."],
  4: ["MaxSeedLengthExceeded", "A seed is longer than allowed.", "Seed over 32 bytes.", "Shorten the seed."],
  5: ["AddressWithSeedMismatch", "The derived address does not match.", "Wrong base, seed or owner when deriving.", "Recompute the address with the same inputs."],
};

const TOKEN: Record<number, [string, string, string]> = {
  0: ["NotRentExempt", "Account would not be rent-exempt.", "Deposit at least the rent-exempt minimum when creating the token account."],
  1: ["InsufficientFunds", "The source token account does not hold enough tokens.", "Check the balance with get_token_accounts and lower the amount (remember decimals: use convert_amount)."],
  2: ["InvalidMint", "The mint is not a valid mint account.", "Pass the token's mint address (resolve_token), not a token account or wallet."],
  3: ["MintMismatch", "The token account belongs to a different mint than the instruction expects.", "Use token accounts for the same mint on both sides (find_ata derives the right one)."],
  4: ["OwnerMismatch", "The signer is not the owner or delegate of the token account.", "Sign with the account owner, or use the owner's own associated token account."],
  5: ["FixedSupply", "This token's supply is fixed; minting is disabled.", "Minting is not possible for this token."],
  6: ["AlreadyInUse", "The account is already initialized.", "Skip initialization or use the idempotent create."],
  7: ["InvalidNumberOfProvidedSigners", "Wrong number of multisig signers provided.", "Provide the signers the multisig requires."],
  8: ["InvalidNumberOfRequiredSigners", "Invalid multisig configuration.", "Fix the multisig signer count."],
  9: ["UninitializedState", "The token account or mint is not initialized.", "Create the token account first (find_ata shows whether it exists)."],
  10: ["NativeNotSupported", "This instruction does not support native SOL (wrapped SOL) accounts.", "Use a regular SPL token account."],
  11: ["NonNativeHasBalance", "Cannot close a non-native token account that still holds tokens.", "Transfer or burn the remaining tokens before closing."],
  12: ["InvalidInstruction", "The token instruction is malformed.", "Rebuild the instruction with an up-to-date SDK."],
  13: ["InvalidState", "The account is in an invalid state for this operation.", "Check the account with inspect_address."],
  14: ["Overflow", "An amount calculation overflowed.", "Check for a decimals mistake: amounts are in base units (convert_amount)."],
  15: ["AuthorityTypeNotSupported", "This account does not support that authority type.", "Use a valid authority type for the account."],
  16: ["MintCannotFreeze", "This mint has no freeze authority.", "Freezing is not possible for this token."],
  17: ["AccountFrozen", "The token account is frozen by the token's freeze authority.", "Frozen tokens cannot move until the issuer thaws them. Treat tokens with an active freeze authority as risky (token_verdict)."],
  18: ["MintDecimalsMismatch", "The decimals passed to TransferChecked do not match the mint.", "Read the mint's real decimals (convert_amount) and rebuild."],
  19: ["NonNativeNotSupported", "This instruction only supports native SOL accounts.", "Use a wrapped SOL account."],
};

// Common Anchor framework codes; programs built with Anchor return these for account validation failures.
const ANCHOR: Record<number, [string, string]> = {
  100: ["InstructionMissing", "No instruction was provided to the program."],
  101: ["InstructionFallbackNotFound", "The program does not recognize the instruction (wrong program or outdated client)."],
  2000: ["ConstraintMut", "An account that must be writable was passed read-only."],
  2001: ["ConstraintHasOne", "An account does not match a field the program checks (has_one)."],
  2002: ["ConstraintSigner", "An account that must sign did not."],
  2003: ["ConstraintRaw", "A custom account constraint failed."],
  2006: ["ConstraintSeeds", "A PDA does not match the expected seeds (wrong derived address)."],
  2012: ["ConstraintAddress", "An account address is not the one the program expects."],
  3001: ["AccountDiscriminatorNotFound", "The account has no data or is not this program's account type."],
  3002: ["AccountDiscriminatorMismatch", "The account is a different type than expected."],
  3003: ["AccountDidNotDeserialize", "The account data could not be read as the expected type."],
  3007: ["AccountOwnedByWrongProgram", "The account belongs to a different program."],
  3010: ["AccountNotSigner", "An account that must sign did not."],
  3012: ["AccountNotInitialized", "The account has not been initialized yet."],
};

const JUPITER_V6 = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUJoi5QNyVTaV4";
const PROGRAM_SPECIFIC: Record<string, Record<number, [string, string, string, string]>> = {
  [JUPITER_V6]: {
    6001: ["SlippageToleranceExceeded", "The swap would return less than the minimum you allowed.", "The price moved between quoting and execution, common on thin or volatile tokens.", "Get a fresh quote and retry, or raise slippage carefully. Check liquidity first (token_verdict)."],
  },
};

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAMS = new Set(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]);

function customCode(input: string): number | null {
  const hex = input.match(/0x([0-9a-f]+)/i);
  if (hex) return parseInt(hex[1], 16);
  const custom = input.match(/"?Custom"?\s*[:=]?\s*(\d+)/i);
  if (custom) return Number(custom[1]);
  return /^\d+$/.test(input.trim()) ? Number(input.trim()) : null;
}

// Explain an error given as text (log line, hex code, error name) or as the RPC error object.
export function explainError(raw: unknown, programId?: string): { matches: ErrorExplanation[]; instructionIndex: number | null; normalized: string } {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  const matches: ErrorExplanation[] = [];
  let instructionIndex: number | null = null;
  const ix = text.match(/InstructionError"?\s*[:=]?\s*\[\s*(\d+)/);
  if (ix) instructionIndex = Number(ix[1]);
  const ixLog = text.match(/instruction\s+(\d+)/i);
  if (instructionIndex === null && ixLog) instructionIndex = Number(ixLog[1]);

  for (const [name, info] of Object.entries(TX)) {
    if (new RegExp(`\\b${name}\\b`).test(text)) matches.push({ code: name, name, scope: "transaction", ...info });
  }
  for (const [name, info] of Object.entries(INSTRUCTION)) {
    if (new RegExp(`\\b${name}\\b`).test(text) && !matches.some((m) => m.name === name)) matches.push({ code: name, name, scope: "instruction", ...info });
  }

  const code = /custom|0x[0-9a-f]+|^\d+$/i.test(text) ? customCode(text) : null;
  if (code !== null) {
    const hex = `0x${code.toString(16)}`;
    const program = programId?.trim();
    const specific = program ? PROGRAM_SPECIFIC[program]?.[code] : undefined;
    if (specific) {
      matches.push({ code: hex, name: specific[0], scope: "program_specific", meaning: specific[1], likelyCause: specific[2], fix: specific[3] });
    } else if (program === SYSTEM_PROGRAM && SYSTEM[code]) {
      const [name, meaning, cause, fix] = SYSTEM[code];
      matches.push({ code: hex, name, scope: "system_program", meaning, likelyCause: cause, fix });
    } else if (program && TOKEN_PROGRAMS.has(program) && TOKEN[code]) {
      const [name, meaning, fix] = TOKEN[code];
      matches.push({ code: hex, name, scope: "token_program", meaning, likelyCause: meaning, fix });
    } else if (ANCHOR[code]) {
      const [name, meaning] = ANCHOR[code];
      matches.push({ code: hex, name, scope: "anchor_framework", meaning, likelyCause: `${meaning} Applies when the failing program is built with Anchor.`, fix: "Check which accounts the failing instruction expects (the program's docs or IDL) and pass the right ones." });
    } else if (!program && TOKEN[code] && code < 20) {
      const [name, meaning, fix] = TOKEN[code];
      matches.push({ code: hex, name, scope: "token_program", meaning: `${meaning} (Assumes the failing program is SPL Token; pass programId to confirm.)`, likelyCause: meaning, fix });
    } else if (code >= 6000) {
      matches.push({ code: hex, name: `Custom program error ${code}`, scope: "program_specific", meaning: `Program-defined error ${code} (${hex}). Codes 6000 and up are defined by each program, so the meaning depends on which program failed.`, likelyCause: "A program-specific check failed.", fix: "Find the failing program (explain_transaction shows it) and look up this code in that program's IDL or docs." });
    }
  }
  return { matches, instructionIndex, normalized: text.slice(0, 500) };
}
