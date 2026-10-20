// Writes the OpenAPI document (the same one GET /openapi.json serves) to a file, for listings that need a committed
// copy, like the Solana Foundation's pay-skills registry. Usage: npm run openapi -- <output path>
import fs from "fs";
import { openApiDocument } from "../server/openapi";

const out = process.argv[2] ?? "openapi.json";
fs.writeFileSync(out, JSON.stringify(openApiDocument("https://solana-pulse-gateway-1021990235790.us-central1.run.app"), null, 2) + "\n");
console.log(`Wrote ${out}`);
