import math

import pytest

from foodwaste import (critical_ratio, expected_metrics, fit_normal,
                       optimal_quantity, optimal_quantity_empirical)


def test_critical_ratio():
    assert critical_ratio(5, 1) == pytest.approx(5 / 6)


def test_symmetric_costs_cook_the_mean():
    assert optimal_quantity(200, 30, 2, 2, integer=False) == pytest.approx(200)


def test_reference_example():
    # Independently computed: z = 0.9674, Q* = 229.02
    assert optimal_quantity(200, 30, 5, 1, integer=False) == pytest.approx(229.02, abs=0.01)
    assert optimal_quantity(200, 30, 5, 1) == 229


def test_reference_costs():
    assert expected_metrics(200, 200, 30, 5, 1).cost == pytest.approx(71.81, abs=0.01)
    assert expected_metrics(229, 200, 30, 5, 1).cost == pytest.approx(44.97, abs=0.01)


@pytest.mark.parametrize("q", [150, 200, 229, 260])
def test_leftover_minus_shortfall_equals_q_minus_mu(q):
    m = expected_metrics(q, 200, 30, 5, 1)
    assert m.leftover - m.shortfall == pytest.approx(q - 200)


def test_optimum_beats_neighbours():
    q = optimal_quantity(200, 30, 5, 1, integer=False)
    best = expected_metrics(q, 200, 30, 5, 1).cost
    for dq in (-5, 5):
        assert expected_metrics(q + dq, 200, 30, 5, 1).cost > best


def test_service_level_matches_critical_ratio_at_optimum():
    q = optimal_quantity(200, 30, 5, 1, integer=False)
    assert expected_metrics(q, 200, 30, 5, 1).service_level == pytest.approx(5 / 6)


def test_fit_normal_and_empirical():
    xs = [10, 12, 14, 16, 18]
    mu, sd = fit_normal(xs)
    assert mu == 14 and sd == pytest.approx(math.sqrt(10))
    assert optimal_quantity_empirical(xs, 1, 1) == pytest.approx(14)


@pytest.mark.parametrize("bad", [(0, 1, 1), (10, 0, 1), (10, 1, 0)])
def test_invalid_inputs(bad):
    sigma, cu, co = bad
    with pytest.raises(ValueError):
        optimal_quantity(100, sigma or 0, cu, co)


def test_too_little_data():
    with pytest.raises(ValueError):
        fit_normal([1, 2, 3])


def test_integer_batch_is_best_neighbour_not_plain_rounding():
    # continuous optimum 104.53: round gives 105, but 104 is cheaper
    assert optimal_quantity(104.85, 0.51, 1.12, 3.08) == 104
    from foodwaste import expected_metrics
    assert (expected_metrics(104, 104.85, 0.51, 1.12, 3.08).cost
            < expected_metrics(105, 104.85, 0.51, 1.12, 3.08).cost)
