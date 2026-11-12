// Loads the real @coinbase/agentkit and checks AgentKit picks up this provider's actions on a Solana wallet and skips
// it on an EVM one. Runs in CI (where devDependencies are installed); skipped when AgentKit isn't installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { solanaPulseActionProvider } from "../src/index";

let kit: any = null;
const AGENTKIT = "@coinbase/agentkit"; // a variable, so type checking doesn't need AgentKit installed
try { kit = await import(AGENTKIT); } catch { /* not installed here */ }

function fakeWallet(base: any, network: { protocolFamily: string; networkId: string }) {
  return Object.assign(Object.create(base.prototype), {
    getNetwork: () => network,
    getName: () => "fake",
    getAddress: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    getPublicKey: () => ({ toBase58: () => "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" }),
    signAndSendTransaction: async () => "sig",
  });
}

test("AgentKit lists the Pulse actions for a Solana wallet", { skip: !kit && "@coinbase/agentkit not installed" }, async () => {
  const agentkit = await kit.AgentKit.from({
    walletProvider: fakeWallet(kit.SvmWalletProvider, { protocolFamily: "svm", networkId: "solana-mainnet" }),
    actionProviders: [solanaPulseActionProvider()],
  });
  const names = agentkit.getActions().map((a: any) => a.name);
  for (const n of ["check_tx", "tx_matches", "token_safety", "check_and_send"]) assert.ok(names.includes(`SolanaPulseActionProvider_${n}`), n);
});

test("AgentKit leaves the Pulse actions out on an EVM wallet", { skip: !kit && "@coinbase/agentkit not installed" }, async () => {
  const agentkit = await kit.AgentKit.from({
    walletProvider: fakeWallet(kit.EvmWalletProvider, { protocolFamily: "evm", networkId: "base-mainnet" }),
    actionProviders: [solanaPulseActionProvider()],
  });
  assert.equal(agentkit.getActions().filter((a: any) => a.name.startsWith("SolanaPulse")).length, 0);
});
