"""Replays real answers recorded from the live Solana Pulse (tests/fixtures, made by scripts/record_fixtures.py).
No network: PulseClient._open is swapped for a fake that returns the recorded body for the tool asked."""
import base64
import io
import json
import pathlib
import sys
import unittest
import urllib.error
from email.message import Message

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "src"))
from solana_pulse import (PulseBlocked, PulseClient, PulsePaymentRequired, PulseUnavailable,  # noqa: E402
                          to_base64)

FIX = pathlib.Path(__file__).resolve().parent / "fixtures"


def fixture(name):
    return json.loads((FIX / f"{name}.json").read_text())


class FakeResponse(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class Replay(PulseClient):
    """Answers each tool from a fixture name per tool; records what was sent."""

    def __init__(self, answers, **kw):
        super().__init__(api_key=kw.pop("api_key", None), base_url="https://pulse.test", **kw)
        self.answers, self.sent = answers, []

    def _open(self, req):
        tool = req.full_url.rsplit("/", 1)[-1]
        self.sent.append((tool, json.loads(req.data), dict(req.header_items())))
        answer = self.answers[tool]
        if isinstance(answer, Exception):
            raise answer
        return FakeResponse(json.dumps(fixture(answer)["body"]).encode())


TRANSFER = fixture("check_tx_transfer")["input"]["tx"]
DRAINER = fixture("check_tx_drainer")["input"]["tx"]


class CheckBeforeSign(unittest.TestCase):
    def test_ok_returns_the_check(self):
        c = Replay({"check_tx": "check_tx_transfer"})
        check = c.check_before_sign(TRANSFER)
        self.assertEqual(check["verdict"], "OK")
        self.assertEqual(c.sent[0][1]["tx"], TRANSFER)

    def test_block_raises_with_pulse_summary(self):
        c = Replay({"check_tx": "check_tx_drainer"})
        with self.assertRaises(PulseBlocked) as e:
            c.check_before_sign(DRAINER)
        self.assertEqual(e.exception.verdict, "BLOCK")
        self.assertIn("AccountFrozen", str(e.exception))

    def test_wrong_amount_is_blocked_even_when_check_tx_is_ok(self):
        c = Replay({"check_tx": "check_tx_transfer", "tx_matches": "tx_matches_transfer_wrong_amount"})
        expected = fixture("tx_matches_transfer_wrong_amount")["input"]["expected"]
        with self.assertRaises(PulseBlocked) as e:
            c.check_before_sign(TRANSFER, expected=expected)
        self.assertEqual(e.exception.verdict, "MISMATCH")
        self.assertIn("Wrong amount", str(e.exception))
        self.assertEqual(c.sent[1][1]["expected"], expected)

    def test_unreachable_is_never_safe(self):
        c = Replay({"check_tx": urllib.error.URLError("no route")})
        with self.assertRaises(PulseUnavailable):
            c.check_before_sign(TRANSFER)

    def test_402_raises_payment_required_with_terms(self):
        # The x402 v2 shape Pulse sends: base64 JSON terms in the PAYMENT-REQUIRED header.
        terms = {"x402Version": 2, "accepts": [{"scheme": "exact", "network": "solana", "amount": "20000"}]}
        headers = Message()
        headers["payment-required"] = base64.b64encode(json.dumps(terms).encode()).decode()
        err = urllib.error.HTTPError("https://pulse.test/api/tools/check_tx", 402, "Payment Required", headers,
                                     io.BytesIO(b"{}"))
        c = Replay({"check_tx": err})
        with self.assertRaises(PulsePaymentRequired) as e:
            c.check_before_sign(TRANSFER)
        self.assertEqual(e.exception.terms["accepts"][0]["amount"], "20000")

    def test_api_key_is_sent(self):
        c = Replay({"check_tx": "check_tx_transfer"}, api_key="k-123")
        c.check_tx(TRANSFER)
        self.assertEqual(c.sent[0][2].get("X-api-key"), "k-123")


class Inputs(unittest.TestCase):
    def test_base64_text_passes_through(self):
        self.assertEqual(to_base64(TRANSFER), TRANSFER)

    def test_bytes_become_base64(self):
        raw = base64.b64decode(TRANSFER)
        self.assertEqual(to_base64(raw), TRANSFER)

    def test_solders_transaction(self):
        try:
            from solders.transaction import VersionedTransaction
        except ImportError:
            self.skipTest("solders not installed")
        tx = VersionedTransaction.from_bytes(base64.b64decode(TRANSFER))
        self.assertEqual(to_base64(tx), TRANSFER)

    def test_token_safety(self):
        c = Replay({"token_safety": "token_safety_jup"})
        self.assertEqual(c.token_safety("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN")["verdict"], "SAFE")


if __name__ == "__main__":
    unittest.main()
