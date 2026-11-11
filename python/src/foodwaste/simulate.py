"""Monte Carlo replay of two cooking policies on the same random days."""
from __future__ import annotations

import random
from dataclasses import dataclass


@dataclass(frozen=True)
class PolicyResult:
    quantity: float
    leftover_per_day: float
    shortfall_per_day: float
    days_ran_out: int
    cost_per_day: float


def simulate_policies(mu: float, sigma: float, cu: float, co: float,
                      quantities: dict[str, float], days: int = 1000,
                      seed: int | None = None) -> dict[str, PolicyResult]:
    """Draw `days` rounded, non-negative normal demands; score each policy."""
    if days < 1:
        raise ValueError("days must be >= 1")
    rng = random.Random(seed)
    demand = [max(0, round(rng.gauss(mu, sigma))) for _ in range(days)]
    out: dict[str, PolicyResult] = {}
    for name, q in quantities.items():
        left = sum(max(q - d, 0) for d in demand)
        short = sum(max(d - q, 0) for d in demand)
        ran_out = sum(1 for d in demand if d > q)
        out[name] = PolicyResult(q, left / days, short / days, ran_out,
                                 (co * left + cu * short) / days)
    return out
