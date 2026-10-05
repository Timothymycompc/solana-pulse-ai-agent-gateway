const fs = require('fs');
const targetFile = 'server.ts';

if (!fs.existsSync(targetFile)) {
  console.error("File not found: " + targetFile);
  process.exit(1);
}

let content = fs.readFileSync(targetFile, 'utf8');

const base58DecoderHelper = `
// Resilient Base58 decoder for server.ts
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP: Record<string, number> = {};
for (let i = 0; i < B58_ALPHABET.length; i++) {
  B58_MAP[B58_ALPHABET.charAt(i)] = i;
}

function safeBs58Decode(str: string): Uint8Array {
  const b = bs58 as any;
  if (typeof b?.decode === 'function') return b.decode(str);
  if (typeof b?.default?.decode === 'function') return b.default.decode(str);
  
  // Pure JS fallback
  if (!str || str.length === 0) return new Uint8Array(0);
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (!(c in B58_MAP)) throw new Error("Invalid base58 character '" + c + "'");
    let carry = B58_MAP[c];
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}
`;

if (!content.includes('function safeBs58Decode')) {
  const loginPos = content.indexOf('app.post("/api/auth/login"');
  if (loginPos !== -1) {
    content = content.slice(0, loginPos) + base58DecoderHelper + "\n\n" + content.slice(loginPos);
  }
}

content = content.replace(/bs58\.decode\(signature\)/g, 'safeBs58Decode(signature)');

fs.writeFileSync(targetFile, content);
console.log("✓ Successfully patched server.ts with safe base58 decoder.");
