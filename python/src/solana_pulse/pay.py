"""Opt-in automatic payment: when a tool's free calls are used up, pay the call with x402 (USDC on Solana mainnet) from
your own wallet, within spending caps you set. Imported only when `pay` is passed, so the basic client keeps no
dependencies. Needs: pip install "solana-pulse[pay]"

Caps are checked against Pulse's price before anything is signed: a call over max_per_call_usd, or one that would take
today's total (UTC, this process) over max_per_day_usd, is refused and nothing is paid. Only USDC on Solana mainnet is
paid; any other asset or network in the terms is refused. A payment is counted only when the paid call succeeds.
"""
from __future__ import annotations

import datetime
import json
import os
import threading
from dataclasses import dataclass, field
from typing import Any, Optional, Sequence, Union

from .errors import PulsePaymentRefused

USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
INSTALL_HINT = 'Automatic payment needs: pip install "solana-pulse[pay]"'


@dataclass
class Pay:
    """The paying wallet and its caps.

    secret_key: the wallet's 64-byte secret key, as bytes, a list of numbers (a Solana keypair file's contents), or
    the path to a keypair file. It needs USDC; no SOL (the facilitator pays network fees).
    """
    secret_key: Union[bytes, Sequence[int], str] = field(repr=False)
    max_per_call_usd: float = 0.05
    max_per_day_usd: float = 50.0
    rpc_url: Optional[str] = None  # Solana RPC used to build the payment. Default: the public mainnet RPC.

    def key_bytes(self) -> bytes:
        key = self.secret_key
        if isinstance(key, str):
            with open(os.path.expanduser(key)) as f:
                key = json.load(f)
        key = bytes(key)
        if len(key) != 64:
            raise PulsePaymentRefused(f"secret_key must be 64 bytes (a Solana keypair), got {len(key)}.")
        return key


# Spent per UTC day per paying wallet, in USDC base units (6 decimals). In memory: a restart starts the day over.
_spent: dict = {}
_lock = threading.Lock()


def _today() -> str:
    return datetime.datetime.now(datetime.timezone.utc).date().isoformat()


def _base(usd: float) -> int:
    return round(usd * 1_000_000)


def _get(req: Any, *names: str) -> Any:
    for name in names:
        value = req.get(name) if isinstance(req, dict) else getattr(req, name, None)
        if value is not None:
            return value
    return None


def choose_payment(requirements: Sequence[Any], wallet: str, max_per_call_usd: float = 0.05,
                   max_per_day_usd: float = 50.0) -> Any:
    """Picks the USDC-on-Solana payment terms and enforces the caps. Raises PulsePaymentRefused otherwise."""
    req = next((r for r in requirements if _get(r, "scheme") == "exact" and _get(r, "network") == SOLANA_MAINNET
                and _get(r, "asset") == USDC_MINT), None)
    if req is None:
        raise PulsePaymentRefused("Pulse didn't offer USDC on Solana mainnet, the only payment this client makes.")
    amount = int(_get(req, "amount"))
    per_call = _base(max_per_call_usd)
    if amount > per_call:
        raise PulsePaymentRefused(f"This call costs ${amount / 1e6:g}, over your max_per_call_usd of ${per_call / 1e6:g}.",
                                  amount / 1e6)
    per_day = _base(max_per_day_usd)
    with _lock:
        already = _spent.get((_today(), wallet), 0)
    if already + amount > per_day:
        raise PulsePaymentRefused(f"Paying ${amount / 1e6:g} would take today's total to ${(already + amount) / 1e6:g}, "
                                  f"over your max_per_day_usd of ${per_day / 1e6:g}.", amount / 1e6)
    return req


def record_payment(wallet: str, amount_base: int) -> None:
    """Records a settled payment against today's total."""
    with _lock:
        key = (_today(), wallet)
        _spent[key] = _spent.get(key, 0) + amount_base


def spent_today_usd(wallet: str) -> float:
    """Today's total paid by a wallet in this process, in USD."""
    with _lock:
        return _spent.get((_today(), wallet), 0) / 1e6


class Payer:
    """A requests session that pays 402 answers within the caps. One per Pay object."""

    def __init__(self, pay: Pay):
        try:
            import requests
            from x402 import x402ClientSync
            from x402.http.clients.requests import PaymentError, wrapRequestsWithPayment
            from x402.mechanisms.svm.exact import ExactSvmClientScheme
            from x402.mechanisms.svm.signers import KeypairSigner
        except ImportError:
            raise PulsePaymentRefused(INSTALL_HINT) from None
        signer = KeypairSigner.from_bytes(pay.key_bytes())
        self.wallet = str(signer.address)
        self._chosen = threading.local()

        def select(_version: int, reqs: list) -> Any:
            self._chosen.req = choose_payment(reqs, self.wallet, pay.max_per_call_usd, pay.max_per_day_usd)
            return self._chosen.req

        client = x402ClientSync(payment_requirements_selector=select)
        client.register(SOLANA_MAINNET, ExactSvmClientScheme(signer, rpc_url=pay.rpc_url))
        self.session = wrapRequestsWithPayment(requests.Session(), client)
        self.request_error = requests.RequestException
        self.payment_error = PaymentError

    def post(self, url: str, body: bytes, headers: dict, timeout: float):
        """Returns (status, headers, body). Counts the payment only when the paid call went through."""
        self._chosen.req = None
        try:
            res = self.session.post(url, data=body, headers=headers, timeout=timeout)
        except self.payment_error as e:
            cause = e.__cause__
            if isinstance(cause, PulsePaymentRefused):
                raise cause from None
            raise PulsePaymentRefused(f"The call couldn't be paid: {cause or e}. Nothing was charged.") from None
        chosen = getattr(self._chosen, "req", None)
        if chosen is not None and res.ok:
            record_payment(self.wallet, int(_get(chosen, "amount")))
        return res.status_code, res.headers, res.content
