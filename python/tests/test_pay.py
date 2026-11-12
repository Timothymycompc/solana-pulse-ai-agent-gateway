"""Automatic payment: caps are enforced before anything is signed. The 402 is the live answer Pulse gave on 2026-11-12
(tests/fixtures/check_tx_402.json). The end-to-end tests need the [pay] extra and run a local stand-in for Pulse; a
real paid call runs only with PULSE_LIVE_PAY=1 and a funded wallet (PULSE_PAYER_KEY=path to a keypair file), never in CI.
"""
import http.server
import importlib.util
import json
import os
import pathlib
import sys
import threading
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "src"))
from solana_pulse import Pay, PulseBlocked, PulseClient, PulsePaymentRefused  # noqa: E402
from solana_pulse.pay import (SOLANA_MAINNET, USDC_MINT, choose_payment, record_payment,  # noqa: E402
                              spent_today_usd)

FIX = pathlib.Path(__file__).resolve().parent / "fixtures"
LIVE_402 = json.loads((FIX / "check_tx_402.json").read_text())
TRANSFER = json.loads((FIX / "check_tx_transfer.json").read_text())["input"]["tx"]
HAS_PAY = all(importlib.util.find_spec(m) for m in ("x402", "requests", "solders"))


def usdc(amount):
    return {"scheme": "exact", "network": SOLANA_MAINNET, "asset": USDC_MINT, "amount": amount,
            "payTo": "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU"}


def throwaway_key():
    from solders.keypair import Keypair  # never funded
    return list(bytes(Keypair()))


class Caps(unittest.TestCase):
    def test_live_terms_offer_usdc_on_solana_at_pulses_price(self):
        self.assertEqual(choose_payment(LIVE_402["terms"]["accepts"], "w-live")["amount"], "20000")  # $0.02 check_tx

    def test_refuses_a_call_over_max_per_call(self):
        with self.assertRaises(PulsePaymentRefused) as e:
            choose_payment([usdc("20000")], "w1", max_per_call_usd=0.01)
        self.assertEqual(e.exception.amount_usd, 0.02)

    def test_refuses_terms_that_are_not_usdc_on_solana_mainnet(self):
        with self.assertRaisesRegex(PulsePaymentRefused, "only payment this client makes"):
            choose_payment([{**usdc("10000"), "network": "eip155:8453"}], "w2")
        with self.assertRaises(PulsePaymentRefused):
            choose_payment([{**usdc("10000"), "asset": "So11111111111111111111111111111111111111112"}], "w2")

    def test_default_caps_are_5_cents_per_call_and_50_dollars_per_day(self):
        self.assertEqual(Pay(secret_key=b"").max_per_call_usd, 0.05)
        record_payment("w4", 49_990_000)
        self.assertEqual(choose_payment([usdc("10000")], "w4")["amount"], "10000")  # reaches exactly $50
        record_payment("w4", 10_000)
        with self.assertRaisesRegex(PulsePaymentRefused, r"over your max_per_day_usd of \$50"):
            choose_payment([usdc("10000")], "w4")

    def test_daily_cap_counts_what_this_wallet_already_paid_today(self):
        record_payment("w3", 980_000)
        self.assertEqual(spent_today_usd("w3"), 0.98)
        self.assertEqual(choose_payment([usdc("20000")], "w3", max_per_day_usd=1)["amount"], "20000")  # exactly $1
        record_payment("w3", 20_000)
        with self.assertRaisesRegex(PulsePaymentRefused, "over your max_per_day_usd"):
            choose_payment([usdc("10000")], "w3", max_per_day_usd=1)

    def test_secret_key_must_be_a_64_byte_keypair(self):
        with self.assertRaisesRegex(PulsePaymentRefused, "64 bytes"):
            Pay(secret_key=[1, 2, 3]).key_bytes()


class Stand402(http.server.BaseHTTPRequestHandler):
    """Answers every call like Pulse after the free tier: 402 with the live payment terms. Records request headers."""
    seen = []

    def do_POST(self):
        self.rfile.read(int(self.headers.get("content-length", 0)))
        Stand402.seen.append({k.lower(): v for k, v in self.headers.items()})
        body = b"{}"
        self.send_response(402)
        self.send_header("payment-required", LIVE_402["paymentRequiredHeader"])
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


@unittest.skipUnless(HAS_PAY, 'needs pip install "solana-pulse[pay]" solders')
class EndToEnd(unittest.TestCase):
    def setUp(self):
        Stand402.seen = []
        self.server = http.server.HTTPServer(("127.0.0.1", 0), Stand402)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def test_an_over_cap_call_is_refused_and_nothing_is_signed_or_sent(self):
        client = PulseClient(base_url=self.url, pay=Pay(secret_key=throwaway_key(), max_per_call_usd=0.01))
        with self.assertRaisesRegex(PulsePaymentRefused, "over your max_per_call_usd"):
            client.check_before_sign(TRANSFER)
        self.assertGreaterEqual(len(Stand402.seen), 1)
        for headers in Stand402.seen:
            self.assertNotIn("payment-signature", headers)
            self.assertNotIn("x-payment", headers)

    def test_without_pay_a_402_stays_payment_required(self):
        from solana_pulse import PulsePaymentRequired
        with self.assertRaises(PulsePaymentRequired) as e:
            PulseClient(base_url=self.url).check_tx(TRANSFER)
        self.assertEqual(e.exception.terms["accepts"][0]["amount"], "20000")


@unittest.skipUnless(os.environ.get("PULSE_LIVE_PAY") == "1", "set PULSE_LIVE_PAY=1 and PULSE_PAYER_KEY")
class Live(unittest.TestCase):
    def test_pays_one_check_tx_within_the_caps(self):
        client = PulseClient(pay=Pay(secret_key=os.environ["PULSE_PAYER_KEY"], max_per_call_usd=0.05, max_per_day_usd=0.5))
        try:
            client.check_before_sign(TRANSFER)
        except PulseBlocked:
            pass  # the recorded transfer may have expired by now; what matters is that the call was paid and answered
        self.assertGreater(spent_today_usd(client._payer.wallet), 0)


if __name__ == "__main__":
    unittest.main()
