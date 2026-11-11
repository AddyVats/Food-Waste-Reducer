"""foodwaste: choose how many portions to cook using the newsvendor model."""
from .newsvendor import (
    Metrics,
    critical_ratio,
    expected_metrics,
    fit_normal,
    optimal_quantity,
    optimal_quantity_empirical,
)
from .simulate import simulate_policies

__all__ = [
    "Metrics",
    "critical_ratio",
    "expected_metrics",
    "fit_normal",
    "optimal_quantity",
    "optimal_quantity_empirical",
    "simulate_policies",
]
__version__ = "0.1.0"
