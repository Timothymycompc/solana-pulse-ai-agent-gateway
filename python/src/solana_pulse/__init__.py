"""Solana Pulse for Python: check a Solana transaction before you sign it.

    from solana_pulse import check_before_sign
    check_before_sign(tx)          # raises PulseBlocked unless Pulse answers OK
    signed = VersionedTransaction(tx.message, [keypair])

Every answer comes from a dry run on live Solana mainnet and names what each wallet gains and loses. "OK" means none of
the traps Pulse knows about are present; no check can promise a transaction is safe. No dependencies: the standard
library only. Each tool gives 25 free calls a day per caller; after that Pulse answers 402 with x402 payment terms,
raised here as PulsePaymentRequired (calls that fail are never charged). Set PULSE_API_KEY to use a key.
"""
from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from typing import Any, Optional

__version__ = "0.1.0"
__all__ = ["PulseClient", "check_before_sign", "check_tx", "tx_matches", "token_safety", "to_base64",
           "PulseError", "PulseBlocked", "PulseUnavailable", "PulsePaymentRequired", "DEFAULT_URL"]

DEFAULT_URL = "https://solana-pulse-gateway-1021990235790.us-central1.run.app"


class PulseError(Exception):
    """Base class for every error this package raises."""


class PulseBlocked(PulseError):
    """Pulse looked at the transaction and did not answer OK (or the transfer/swap is not what you asked for)."""

    def __init__(self, message: str, verdict: str, check: Optional[dict] = None):
        super().__init__(message)
        self.verdict = verdict
        self.check = check or {}


class PulseUnavailable(PulseError):
    """Pulse could not be reached or could not check the transaction. Not checked is never treated as safe."""


class PulsePaymentRequired(PulseError):
    """Today's free calls for this tool are used up. `terms` holds the x402 payment terms Pulse sent."""

    def __init__(self, message: str, terms: Optional[dict] = None):
        super().__init__(message)
        self.terms = terms


def to_base64(tx: Any) -> str:
    """Base64 for a transaction given as base64 text, raw bytes, a solders VersionedTransaction/Transaction, or a
    solana-py Transaction (serialized unsigned, so it can be checked before signing)."""
    if isinstance(tx, str):
        return tx
    if isinstance(tx, (bytes, bytearray, memoryview)):
        return base64.b64encode(bytes(tx)).decode()
    serialize = getattr(tx, "serialize", None)
    if callable(serialize):  # solana-py Transaction
        try:
            raw = serialize(verify_signatures=False)
        except TypeError:
            raw = serialize()
        return base64.b64encode(bytes(raw)).decode()
    try:  # solders types support bytes()
        return base64.b64encode(bytes(tx)).decode()
    except TypeError as e:
        raise TypeError(f"Can't turn {type(tx).__name__} into a transaction: pass base64, bytes or a solders/solana-py transaction") from e


class PulseClient:
    """Calls Solana Pulse tools over HTTPS. `api_key` and `base_url` default to PULSE_API_KEY and PULSE_URL."""

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None, timeout: float = 30.0,
                 user_agent: Optional[str] = None):
        self.api_key = api_key if api_key is not None else os.environ.get("PULSE_API_KEY")
        self.base_url = (base_url or os.environ.get("PULSE_URL") or DEFAULT_URL).rstrip("/")
        self.timeout = timeout
        self.user_agent = user_agent or f"solana-pulse-python/{__version__}"

    def call(self, tool: str, payload: dict) -> dict:
        """Calls one tool and returns its JSON answer. Raises PulsePaymentRequired on 402, PulseUnavailable otherwise."""
        headers = {"content-type": "application/json", "user-agent": self.user_agent}
        if self.api_key:
            headers["x-api-key"] = self.api_key
        req = urllib.request.Request(f"{self.base_url}/api/tools/{tool}", data=json.dumps(payload).encode(),
                                     headers=headers, method="POST")
        try:
            with self._open(req) as res:
                return json.loads(res.read() or b"{}")
        except urllib.error.HTTPError as e:
            body = _json(e.read())
            if e.code == 402:
                terms = _terms(e.headers.get("payment-required"))
                raise PulsePaymentRequired(
                    f"{tool}: today's 25 free calls are used up. Pay per call with x402 (USDC on Solana), set "
                    f"PULSE_API_KEY, or wait for the reset at 00:00 UTC. Details: {self.base_url}/docs/connect", terms) from None
            raise PulseUnavailable(f"{tool}: Solana Pulse answered HTTP {e.code}: {body.get('error', 'no details')}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise PulseUnavailable(f"Could not reach Solana Pulse at {self.base_url}: {e}") from None

    def _open(self, req):  # one place to swap out in tests
        return urllib.request.urlopen(req, timeout=self.timeout)

    def check_tx(self, tx: Any, network: str = "mainnet-beta") -> dict:
        """Dry-runs the transaction and answers OK, REVIEW or BLOCK with each wallet's SOL and token changes."""
        return self.call("check_tx", {"tx": to_base64(tx), "network": network})

    def tx_matches(self, tx: Any, expected: dict, network: str = "mainnet-beta") -> dict:
        """Confirms a transfer ({token, amount, to}) or swap ({action: "swap", sell, amount, buy}) does exactly that."""
        return self.call("tx_matches", {"tx": to_base64(tx), "expected": expected, "network": network})

    def token_safety(self, token: str, network: str = "mainnet-beta") -> dict:
        """SAFE, CAUTION or AVOID for a token mint, with the reasons."""
        return self.call("token_safety", {"token": token, "network": network})

    def check_before_sign(self, tx: Any, expected: Optional[dict] = None, allow_review: bool = False,
                          network: str = "mainnet-beta") -> dict:
        """Call right before signing. Returns Pulse's check when it answers OK (or REVIEW with allow_review=True).
        Raises PulseBlocked on BLOCK, on REVIEW unless allowed, and when `expected` is given and the transaction does
        not match it. Raises PulseUnavailable / PulsePaymentRequired when it couldn't check: never treated as safe."""
        check = self.check_tx(tx, network)
        verdict = str(check.get("verdict", "UNKNOWN"))
        if not (verdict == "OK" or (verdict == "REVIEW" and allow_review)):
            raise PulseBlocked(str(check.get("summary") or f"Pulse answered {verdict}."), verdict, check)
        if expected is not None:
            match = self.tx_matches(tx, expected, network)
            if str(match.get("verdict")) != "MATCH":
                raise PulseBlocked(str(match.get("summary") or "The transaction doesn't match what you asked for."),
                                   str(match.get("verdict", "MISMATCH")), match)
            check = {**check, "tx_matches": match}
        return check


def _json(raw: bytes) -> dict:
    try:
        data = json.loads(raw or b"{}")
        return data if isinstance(data, dict) else {}
    except ValueError:
        return {}


def _terms(header: Optional[str]) -> Optional[dict]:
    if not header:
        return None
    try:
        return json.loads(base64.b64decode(header))
    except ValueError:
        return None


_default: Optional[PulseClient] = None


def _client() -> PulseClient:
    global _default
    if _default is None:
        _default = PulseClient()
    return _default


def check_before_sign(tx: Any, expected: Optional[dict] = None, allow_review: bool = False,
                      network: str = "mainnet-beta") -> dict:
    """Module-level shortcut for PulseClient().check_before_sign(...)."""
    return _client().check_before_sign(tx, expected, allow_review, network)


def check_tx(tx: Any, network: str = "mainnet-beta") -> dict:
    return _client().check_tx(tx, network)


def tx_matches(tx: Any, expected: dict, network: str = "mainnet-beta") -> dict:
    return _client().tx_matches(tx, expected, network)


def token_safety(token: str, network: str = "mainnet-beta") -> dict:
    return _client().token_safety(token, network)
