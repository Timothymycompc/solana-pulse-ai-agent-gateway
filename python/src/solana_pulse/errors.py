"""Every error this package raises. None of them means the transaction was checked and found fine."""
from __future__ import annotations

from typing import Optional


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


class PulsePaymentRefused(PulseError):
    """`pay` is set but the call was over a cap or couldn't be paid. Nothing was paid."""

    def __init__(self, message: str, amount_usd: Optional[float] = None):
        super().__init__(message)
        self.amount_usd = amount_usd
