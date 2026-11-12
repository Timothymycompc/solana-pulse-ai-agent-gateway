"""Records real answers from the live Solana Pulse for the Python client's tests.

Each call carries x-pulse-test, so it shows in Pulse's usage log as the owner's test, never as a user.
Run from python/:  python3 scripts/record_fixtures.py
"""
import json
import pathlib
import urllib.request
from datetime import datetime, timezone

BASE = "https://solana-pulse-gateway-1021990235790.us-central1.run.app"
HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
OUT = HERE.parent / "tests" / "fixtures"

# A drainer approval already recorded in the main repo's fixtures (real mainnet transaction).
drainer = json.loads((REPO / "tests/fixtures/preflight-drainer-approval.json").read_text())["args"]["transaction"]
# Fresh unsigned transactions built by Pulse's build_tx from a public, well-funded wallet (nothing is signed or sent).
FROM = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
TO = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9"
USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
TRANSFER = {"action": "transfer", "from": FROM, "to": TO, "token": "SOL", "amount": "0.01"}
SWAP = {"action": "swap", "from": FROM, "token": "SOL", "amount": "0.01", "buy": USDC}


def call(tool, payload):
    req = urllib.request.Request(
        f"{BASE}/api/tools/{tool}",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json", "user-agent": "solana-pulse-python/record",
                 "x-pulse-test": "python-client-fixtures"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.status, json.loads(res.read())


built = {name: call("build_tx", args)[1] for name, args in (("transfer", TRANSFER), ("swap", SWAP))}
for name, b in built.items():
    print("build_tx", name, sorted(b)[:8])
transfer_tx = built["transfer"].get("tx") or built["transfer"].get("transaction")
swap_tx = built["swap"].get("tx") or built["swap"].get("transaction")

CALLS = {
    "check_tx_drainer": ("check_tx", {"tx": drainer}),
    "check_tx_transfer": ("check_tx", {"tx": transfer_tx}),
    "tx_matches_transfer": ("tx_matches", {"tx": transfer_tx, "expected": {"token": "SOL", "amount": "0.01", "to": TO, "from": FROM}}),
    "tx_matches_transfer_wrong_amount": ("tx_matches", {"tx": transfer_tx, "expected": {"token": "SOL", "amount": "0.02", "to": TO, "from": FROM}}),
    "check_tx_swap": ("check_tx", {"tx": swap_tx}),
    "token_safety_jup": ("token_safety", {"token": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"}),
}

OUT.mkdir(parents=True, exist_ok=True)
for name, (tool, payload) in CALLS.items():
    status, body = call(tool, payload)
    record = {"tool": tool, "recordedAt": datetime.now(timezone.utc).isoformat(), "status": status,
              "input": payload, "body": body}
    (OUT / f"{name}.json").write_text(json.dumps(record, indent=2))
    print(name, status, body.get("verdict") or body.get("match") or "", str(body.get("summary", ""))[:110])
