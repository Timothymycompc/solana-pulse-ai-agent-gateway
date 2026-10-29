// The Telegram bot: someone pastes a token, wallet or transaction into the chat (or /check it in a group) and gets
// Pulse's answer in plain words. It runs the same tools as /api and /mcp, in-process, with the same 25 free calls a
// day per tool, counted per Telegram user instead of per IP. Every run is logged like any other tool run
// (endpoint /telegram/tools/<name>), with the Telegram user ID kept only as a keyed hash.
// Telegram calls POST /telegram/webhook; scripts/telegram-setup.sh points it there.
import { createHash, timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { PublicKey, type Connection } from "@solana/web3.js";
import { recordServiceUsage } from "./db";
import { hashTelegramUser, refundFreeCallFor, reserveFreeCallFor } from "./meter";
import { FREE_CALLS_PER_TOOL } from "./pricing";
import { askPulse, ASK_DAILY_LIMIT, ASK_MODEL, type AskResult } from "./ask";

const SITE = "https://solana-pulse-gateway-1021990235790.us-central1.run.app";
export const TELEGRAM_CLIENT = "Telegram bot (Solana Pulse)";

// ---------- What the message asks for ----------
export type Ask =
  | { kind: "token_or_address"; address: string }
  | { kind: "tx"; signature: string }
  | { kind: "ticker"; name: string }
  | { kind: "question"; text: string }
  | { kind: "help" }
  | { kind: "myid" }
  | { kind: "none" };

const B58 = "1-9A-HJ-NP-Za-km-z";
const B58_RUN = new RegExp(`(?<![${B58}])[${B58}]{32,88}(?![${B58}])`, "g");

// Pulls the first address (32-44 base58 characters) or transaction signature (86-88) out of the text, so links
// from Solscan, pump.fun or Dexscreener work as well as a bare address. A $TICKER or /find <name> searches by name.
// In a group the bot only answers commands, so a chat's normal messages never use anyone's free calls.
// With plain-English answers on (smart), /ask and any private message of 4+ words go to Claude (ask.ts), even when
// they contain an address; a bare address, signature or name keeps the direct, free check.
export function parseAsk(text: string, isGroup: boolean, smart = false): Ask {
  const trimmed = text.trim();
  const command = trimmed.match(/^\/([a-z_]+)(?:@\w+)?\s*([\s\S]*)$/i);
  const name = command?.[1].toLowerCase();
  if (name === "start" || name === "help") return { kind: "help" };
  if (name === "myid") return { kind: "myid" };
  if (name === "ask") return smart && command![2].trim() ? { kind: "question", text: command![2].trim() } : { kind: "help" };
  if (name === "find") return command![2].trim() ? { kind: "ticker", name: command![2].trim().replace(/^\$/, "").slice(0, 40) } : { kind: "help" };
  if (isGroup && name !== "check") return { kind: "none" };
  const body = name === "check" ? command![2] : trimmed;
  if (smart && !name && !isGroup && wordCount(body.replace(B58_RUN, "")) >= 4) return { kind: "question", text: trimmed };
  for (const run of body.match(B58_RUN) ?? []) {
    if (run.length >= 86) return { kind: "tx", signature: run };
    if (run.length <= 44) return { kind: "token_or_address", address: run };
  }
  const ticker = body.match(/\$([A-Za-z][A-Za-z0-9]{0,14})\b/);
  if (ticker) return { kind: "ticker", name: ticker[1] };
  // In a private chat one bare word ("CITY") is a token name; a greeting gets the help text.
  const word = body.trim().match(/^[A-Za-z][A-Za-z0-9]{1,14}$/);
  if (word && !isGroup && !GREETINGS.test(word[0])) return { kind: "ticker", name: word[0] };
  return name === "check" || !isGroup ? { kind: "help" } : { kind: "none" };
}
const wordCount = (s: string) => s.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length;
const GREETINGS = /^(hi|hello|hey|gm|gn|yo|sup|thanks|thx|ty|help|start|menu|ok|okay)$/i;

// How long a token has been trading, from its first pool: "3 years 5 months", "12 days", "5 hours".
export function ageText(firstTraded: string | null | undefined, now = Date.now()): string | null {
  const at = firstTraded ? Date.parse(firstTraded) : NaN;
  if (Number.isNaN(at)) return null;
  const hours = Math.max(0, (now - at) / 3_600_000);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (hours < 1) return "under an hour";
  if (hours < 48) return plural(Math.floor(hours), "hour");
  const days = Math.floor(hours / 24);
  if (days < 60) return plural(days, "day");
  const months = Math.floor(days / 30.44);
  if (months < 24) return plural(months, "month");
  const years = Math.floor(months / 12), rest = months % 12;
  return rest ? `${plural(years, "year")} ${plural(rest, "month")}` : plural(years, "year");
}

const usd = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;
const price = (n: number) => n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${n.toPrecision(3)}`;

// The facts line under a token's name: age first, since brand-new tokens are where most rugs happen.
export function tokenFacts(about: any, now = Date.now()): string {
  const age = ageText(about?.first_traded, now);
  const young = age !== null && now - Date.parse(about.first_traded) < 86_400_000;
  return [
    age ? `${young ? "🆕" : "📅"} Trading for ${age} (since ${String(about.first_traded).slice(0, 10)})` : "📅 Age unknown",
    typeof about?.liquidity_usd === "number" ? `💧 ${usd(about.liquidity_usd)} liquidity` : null,
    typeof about?.holders === "number" ? `👥 ${about.holders.toLocaleString("en-US")} holders` : null,
    typeof about?.usd_price === "number" ? `💲 ${price(about.usd_price)}` : null,
  ].filter(Boolean).join(" · ");
}

// ---------- Replies (Telegram HTML) ----------
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const code = (s: string) => `<code>${esc(s)}</code>`;
const short = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
const pretty = (check: string) => check.replace(/^extension:/, "extension ").replace(/_/g, " ");
const SOURCE_NAMES: Record<string, string> = { "on-chain": "Solana mainnet", jupiter: "Jupiter", rugcheck: "RugCheck", simulation: "a simulated sell" };
const clip = (s: string) => (s.length > 3900 ? `${s.slice(0, 3900)}…` : s);

export const HELP = [
  "🛡 <b>Solana Pulse</b> looks for the known ways people get robbed on Solana, using live on-chain data.",
  "",
  "<b>Just paste one of these:</b>",
  "🪙 <b>Token address</b>, or a pump.fun / Dexscreener / Solscan link → scam-trap check: can it be sold, can someone mint or freeze, can the liquidity be pulled, who launched it, how old it is",
  "🔁 <b>Transaction signature</b> → what really moved, and why it failed",
  "👛 <b>Wallet or any address</b> → what it is, and whether it's safe to send to",
  "🔎 <b>A token name</b> (BONK or $BONK) → the real token, and how many copycats use the name",
  "",
  "In a group: /check &lt;address, link or signature&gt; · /find &lt;name&gt;",
  "",
  `Free: ${FREE_CALLS_PER_TOOL} checks a day of each kind. Every answer names its source. SAFE only means none of the traps we know about were found.`,
  "",
  `🤖 Building an agent? The same checks over MCP and HTTP: ${SITE}`,
].join("\n");

const ASK_HELP = `\n\n💬 <b>Or ask in plain words</b>, like "where did the SOL in &lt;wallet&gt; go?" (in a group: /ask). ${ASK_DAILY_LIMIT} questions a day.`;
const askFailed = (stopped: AskResult["stopped"]) => stopped === "refusal"
  ? "I can't help with that one. Paste a token, wallet or transaction and I'll check it."
  : "Couldn't answer that right now, and it didn't count against your questions. Try again, or paste the address on its own.";

const VERDICT_LINE: Record<string, string> = {
  SAFE: "🟢 <b>SAFE</b>: none of the scam traps we know about were found",
  CAUTION: "🟡 <b>CAUTION</b>: something needs a look",
  AVOID: "🔴 <b>AVOID</b>: at least one known scam trap is present",
};

// The summary isn't shown: its sentences are the same ones the check lines give, so it only repeated them.
export function formatTokenSafety(b: any, address: string, now = Date.now()): string {
  const about = b.about ?? {};
  const checks: any[] = Array.isArray(b.checks) ? b.checks : [];
  const by = (r: string) => checks.filter((c) => c.result === r);
  const line = (icon: string) => (c: any) => `${icon} <b>${esc(pretty(c.name))}</b>: ${esc(c.detail)}`;
  const passed = by("pass").map((c) => pretty(c.name));
  const sources = [...new Set(checks.map((c) => SOURCE_NAMES[c.source] ?? c.source).filter(Boolean))];
  return clip([
    VERDICT_LINE[b.verdict] ?? `<b>${esc(b.verdict)}</b>`,
    `${esc(about.symbol ?? "Unknown symbol")}${about.name ? ` (${esc(about.name)})` : ""} · ${code(address)}`,
    esc(tokenFacts(about, now)),
    "",
    ...by("fail").map(line("❌")), ...by("warn").map(line("⚠️")), ...by("info").slice(0, 4).map(line("ℹ️")),
    ...(passed.length ? [`✅ Passed: ${esc(passed.join(", "))}`] : []),
    "",
    ...(sources.length ? [`Sources: ${esc(sources.join(", "))}. Age, liquidity, holders and price: Jupiter.`] : []),
    "<i>A check can't make a token safe. SAFE only means none of the traps we know about are present, and it says nothing about the price.</i>",
    `<a href="${SITE}/docs/tools/token_safety">How the check works</a> · <a href="https://solscan.io/token/${esc(address)}">Solscan</a>`,
  ].join("\n"));
}

export function formatExplainTx(b: any, signature: string): string {
  const sol: any[] = Array.isArray(b.sol_changes) ? b.sol_changes : [];
  const tokens: any[] = Array.isArray(b.token_changes) ? b.token_changes : [];
  const f = b.failure?.explanation;
  return clip([
    b.result === "failed" ? "❌ <b>Failed</b>" : "✅ <b>Succeeded</b>",
    b.time ? esc(b.time) : "",
    "",
    esc(b.summary),
    ...(sol.length ? ["", "<b>SOL changes</b>", ...sol.slice(0, 6).map((c) => `${code(short(c.account))} ${esc(c.change)} SOL`)] : []),
    ...(tokens.length ? ["", "<b>Token changes</b>", ...tokens.slice(0, 6).map((c) => `${code(short(c.owner))} ${esc(c.change)} ${esc(c.symbol ?? short(c.token))}`)] : []),
    ...(f ? ["", `<b>Why it failed:</b> ${esc(f.meaning)}`, `<b>Fix:</b> ${esc(f.fix)}`] : []),
    "",
    "Source: Solana mainnet.",
    `<a href="https://solscan.io/tx/${esc(signature)}">Solscan</a>`,
  ].filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n"));
}

export function formatWhatsThis(b: any, address: string): string {
  return clip([
    `<b>${esc(String(b.kind ?? "unknown").replace(/_/g, " "))}</b> · ${code(address)}`,
    "",
    esc(b.summary),
    ...(b.exists ? [`Holds ${esc(b.sol)} SOL${b.owner_program_name ? ` · owned by ${esc(b.owner_program_name)}` : ""}`] : []),
    "",
    "Source: Solana mainnet.",
    `<a href="https://solscan.io/account/${esc(address)}">Solscan</a>`,
  ].join("\n"));
}

export function formatFindToken(b: any): string {
  const list: any[] = Array.isArray(b.candidates) ? b.candidates.slice(0, 3) : [];
  return clip([
    `<b>${esc(b.name)}</b>`,
    b.best ? `Best match (${esc(b.confidence)} confidence): ${esc(b.best.symbol)} ${code(b.best.address)}` : "No single token is safe to pick for this name.",
    ...(b.copycats ? [`⚠️ ${esc(b.copycats)} unverified tokens use the same name. Copycats are a common scam.`] : []),
    ...(list.length ? ["", ...list.map((c) => `${c.verified ? "✅ verified" : "❔ unverified"} ${esc(c.symbol)} ${code(c.address)}`)] : []),
    "",
    esc(b.next_step),
    "Send me an address to run the full scam-trap check. Source: Jupiter's token list.",
  ].join("\n"));
}

export const limitReply = (what: string) =>
  `You've used today's ${FREE_CALLS_PER_TOOL} free ${what}. They reset at 00:00 UTC.\nDevelopers can pay per call in USDC (x402): ${SITE}/docs/pricing`;

export const errorReply = (body: any) =>
  `Couldn't finish that: ${esc(body?.error ?? "unknown error")}${body?.fix ? `\n${esc(body.fix)}` : ""}\nFailed checks never count against your free checks.`;

// ---------- Handling one update ----------
export type ToolResult = { status: number; body: Record<string, any> };
export type BotDeps = {
  runTool: (tool: string, args: Record<string, unknown>) => Promise<ToolResult>;
  isToken: (address: string) => Promise<boolean>;
  send: (chatId: number, html: string, replyTo?: number) => Promise<void>;
  typing: (chatId: number) => Promise<void>;
  // Reserves one free call; false when today's are used up. refund gives it back after a failed run.
  reserve: (userId: number, tool: string) => Promise<boolean>;
  refund: (userId: number, tool: string) => Promise<void>;
  record: (o: { userId: number; tool: string; status: number; input: unknown; output: unknown; owner: boolean }) => Promise<void>;
  ownerIds: Set<number>;
  // Plain-English questions (ask.ts); absent when ANTHROPIC_API_KEY isn't set.
  ask?: (question: string) => Promise<AskResult>;
};

const WHAT: Record<string, string> = { token_safety: "token checks", explain_tx: "transaction lookups", whats_this: "address lookups", find_token: "name searches" };

export async function handleUpdate(update: any, deps: BotDeps): Promise<void> {
  const msg = update?.message ?? update?.edited_message;
  if (!msg?.text || !msg.chat || !msg.from || msg.from.is_bot) return;
  const isGroup = msg.chat.type !== "private";
  const ask = parseAsk(msg.text, isGroup, Boolean(deps.ask));
  const reply = (html: string) => deps.send(msg.chat.id, html, isGroup ? msg.message_id : undefined);
  if (ask.kind === "none") return;
  if (ask.kind === "help") return reply(deps.ask ? HELP + ASK_HELP : HELP);
  if (ask.kind === "myid") return reply(`Your Telegram user ID is ${code(String(msg.from.id))}.`);
  const owner = deps.ownerIds.has(msg.from.id);

  if (ask.kind === "question") {
    if (!deps.ask) return reply(HELP);
    await deps.typing(msg.chat.id);
    if (!owner && !(await deps.reserve(msg.from.id, "ask"))) return reply(`You've used today's ${ASK_DAILY_LIMIT} questions. They reset at 00:00 UTC. Pasting an address still works.`);
    const result = await deps.ask(ask.text);
    const failed = !result.answer;
    if (failed && !owner) await deps.refund(msg.from.id, "ask");
    await deps.record({ userId: msg.from.id, tool: "ask", status: failed ? 502 : 200, input: { question: ask.text }, output: result, owner });
    const checked = [...new Set(result.tools.map((t) => t.name))];
    return reply(failed ? askFailed(result.stopped) : clip(esc(result.answer)) + (checked.length ? `\n\n<i>Checked with ${checked.join(", ")}.</i>` : ""));
  }

  await deps.typing(msg.chat.id);
  let tool: string, args: Record<string, unknown>, format: (b: any) => string;
  if (ask.kind === "tx") [tool, args, format] = ["explain_tx", { tx_id: ask.signature }, (b) => formatExplainTx(b, ask.signature)];
  else if (ask.kind === "ticker") [tool, args, format] = ["find_token", { name: ask.name }, formatFindToken];
  else if (await deps.isToken(ask.address)) [tool, args, format] = ["token_safety", { token: ask.address }, (b) => formatTokenSafety(b, ask.address)];
  else [tool, args, format] = ["whats_this", { address: ask.address }, (b) => formatWhatsThis(b, ask.address)];

  if (!owner && !(await deps.reserve(msg.from.id, tool))) return reply(limitReply(WHAT[tool]));
  const result = await deps.runTool(tool, args);
  if (result.status >= 400 && !owner) await deps.refund(msg.from.id, tool);
  await deps.record({ userId: msg.from.id, tool, status: result.status, input: args, output: result.body, owner });
  await reply(result.status >= 400 ? errorReply(result.body) : format(result.body));
}

// ---------- The webhook ----------
// Telegram sends this secret in a header on every call, so nobody else can post fake updates. It's derived from the
// bot token, so there is one secret to keep, not two.
export const webhookSecret = (botToken: string) => createHash("sha256").update(`pulse-telegram-webhook:${botToken}`).digest("hex");

export function telegramWebhook(botToken: string, deps: BotDeps) {
  const secret = Buffer.from(webhookSecret(botToken));
  const seen: number[] = [];
  return async (req: Request, res: Response) => {
    const given = Buffer.from(String(req.headers["x-telegram-bot-api-secret-token"] ?? ""));
    if (given.length !== secret.length || !timingSafeEqual(given, secret)) return res.status(401).json({ error: "Not Telegram." });
    // Telegram resends an update it thinks failed; answer each one once.
    const id = Number(req.body?.update_id);
    if (seen.includes(id)) return res.json({ ok: true });
    seen.push(id);
    if (seen.length > 500) seen.shift();
    try {
      await handleUpdate(req.body, deps);
    } catch (error) {
      console.error("telegram update failed:", error);
    }
    res.json({ ok: true });
  };
}

// Turns the bot on when TELEGRAM_BOT_TOKEN is set. TELEGRAM_OWNER_IDS (comma-separated, from /myid) marks the owner's
// own Telegram accounts: their checks are unlimited and labelled as the owner's tests, so they never count as users.
export function mountTelegram(app: Express, runTool: BotDeps["runTool"], mainnet: () => Connection) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;
  const api = telegramApi(botToken);
  const ownerIds = new Set((process.env.TELEGRAM_OWNER_IDS ?? "").split(",").map((s) => Number(s.trim())).filter(Boolean));
  app.post("/telegram/webhook", telegramWebhook(botToken, {
    runTool, ownerIds, send: api.send, typing: api.typing,
    ask: process.env.ANTHROPIC_API_KEY ? (question) => askPulse(question, runTool) : undefined,
    isToken: async (address) => {
      try {
        const info = await mainnet().getParsedAccountInfo(new PublicKey(address));
        return (info.value?.data as any)?.parsed?.type === "mint";
      } catch { return false; }
    },
    reserve: async (userId, tool) => (await reserveFreeCallFor(hashTelegramUser(userId), tool, tool === "ask" ? ASK_DAILY_LIMIT : undefined)) !== null,
    refund: (userId, tool) => refundFreeCallFor(hashTelegramUser(userId), tool),
    record: ({ userId, tool, status, input, output, owner }) => recordServiceUsage({
      endpoint: `/telegram/tools/${tool}`, method: "POST", status, callerHash: hashTelegramUser(userId), client: TELEGRAM_CLIENT,
      via: owner ? "owner" : "free_call", input, output, testName: owner ? "telegram" : null,
    }),
  }));
  console.log(`Telegram bot on (${ownerIds.size} owner account${ownerIds.size === 1 ? "" : "s"}; plain-English questions ${process.env.ANTHROPIC_API_KEY ? `on, ${ASK_MODEL}` : "off"})`);
}

export function telegramApi(botToken: string) {
  const call = async (method: string, body: unknown) => {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    const data: any = await r.json().catch(() => ({}));
    if (!data.ok) console.error(`telegram ${method} failed:`, data.description ?? r.status);
  };
  return {
    send: (chatId: number, html: string, replyTo?: number) => call("sendMessage", {
      chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true },
      ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
    }),
    typing: (chatId: number) => call("sendChatAction", { chat_id: chatId, action: "typing" }),
  };
}
