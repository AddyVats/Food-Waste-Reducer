"""Core newsvendor maths for a single dish and a single serving period.

Notation: D is demand (mean mu, std sigma), Q is portions cooked,
cu is the cost of each portion of unmet demand, co the cost of each
wasted portion. Leftovers = max(Q - D, 0); shortfall = max(D - Q, 0).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import NormalDist, mean, stdev
from typing import Sequence

_N = NormalDist()


@dataclass(frozen=True)
class Metrics:
    """Expected per-day outcomes of cooking Q portions."""

    quantity: float
    leftover: float
    shortfall: float
    cost: float
    service_level: float  # P(demand <= Q): share of days with no shortage


def _check(sigma: float, cu: float, co: float) -> None:
    if sigma <= 0:
        raise ValueError("sigma must be positive")
    if cu <= 0 or co <= 0:
        raise ValueError("cu and co must be positive")


def critical_ratio(cu: float, co: float) -> float:
    """Target probability of covering demand: cu / (cu + co)."""
    if cu <= 0 or co <= 0:
        raise ValueError("cu and co must be positive")
    return cu / (cu + co)


def optimal_quantity(mu: float, sigma: float, cu: float, co: float,
                     integer: bool = True) -> float:
    """Q* = mu + z * sigma with z = inverse normal CDF of the critical ratio."""
    _check(sigma, cu, co)
    q = max(mu + _N.inv_cdf(critical_ratio(cu, co)) * sigma, 0.0)
    if not integer:
        return q
    # Whole portions: the cost curve is asymmetric, so plain rounding can
    # pick the wrong neighbour. Compare floor and ceil directly.
    lo = math.floor(q)
    hi = lo + 1
    cost_lo = expected_metrics(lo, mu, sigma, cu, co).cost
    cost_hi = expected_metrics(hi, mu, sigma, cu, co).cost
    return float(hi if cost_hi < cost_lo else lo)


def expected_metrics(q: float, mu: float, sigma: float, cu: float,
                     co: float) -> Metrics:
    """Closed-form expected leftovers, shortfall and cost under normal demand.

    E[leftover]  = sigma * (z*Phi(z) + phi(z))
    E[shortfall] = sigma * (phi(z) - z*(1 - Phi(z)))
    """
    _check(sigma, cu, co)
    z = (q - mu) / sigma
    cdf, pdf = _N.cdf(z), _N.pdf(z)
    left = sigma * (z * cdf + pdf)
    short = sigma * (pdf - z * (1.0 - cdf))
    return Metrics(q, left, short, co * left + cu * short, cdf)


def fit_normal(demands: Sequence[float]) -> tuple[float, float]:
    """Sample mean and standard deviation of past daily demand."""
    if len(demands) < 5:
        raise ValueError("need at least 5 days of demand")
    if any(d < 0 for d in demands):
        raise ValueError("demand cannot be negative")
    return mean(demands), stdev(demands)


def optimal_quantity_empirical(demands: Sequence[float], cu: float,
                               co: float) -> float:
    """Distribution-free option: the critical-ratio quantile of past demand
    (linear interpolation between order statistics)."""
    if len(demands) < 5:
        raise ValueError("need at least 5 days of demand")
    p = critical_ratio(cu, co)
    xs = sorted(demands)
    pos = p * (len(xs) - 1)
    lo = math.floor(pos)
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (pos - lo) * (xs[hi] - xs[lo])
