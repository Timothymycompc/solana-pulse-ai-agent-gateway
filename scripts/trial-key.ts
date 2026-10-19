// Makes a free-trial key for a builder who took up the offer: prints the key to send them (privately) and the line to
// add to TRIAL_KEYS in server/meter.ts, which keeps only its SHA-256. Usage: npm run trial-key -- <name> [weeks, default 6]
import { createHash, randomBytes } from "crypto";

const [name, weeks = "6"] = process.argv.slice(2);
if (!name) throw new Error("Usage: npm run trial-key -- <name> [weeks]");
const key = `pulse_trial_${randomBytes(18).toString("base64url")}`;
const until = new Date(Date.now() + Number(weeks) * 7 * 86_400_000).toISOString().slice(0, 10) + "T23:59:59Z";
const hash = createHash("sha256").update(key).digest("hex");
console.log(`Send this key to ${name} (they send it as the x-api-key header, over HTTP or MCP):\n\n  ${key}\n`);
console.log(`Add this line to TRIAL_KEYS in server/meter.ts, then deploy:\n`);
console.log(`  { name: ${JSON.stringify(name)}, keySha256: "${hash}", until: "${until}", why: "Free trial, ${weeks} weeks, granted ${new Date().toISOString().slice(0, 10)}." },`);
