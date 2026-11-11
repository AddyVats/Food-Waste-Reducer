from pathlib import Path

import pytest

from foodwaste import expected_metrics, simulate_policies
from foodwaste.cli import main


def test_seed_is_reproducible():
    a = simulate_policies(200, 30, 5, 1, {"x": 220}, 200, seed=1)
    b = simulate_policies(200, 30, 5, 1, {"x": 220}, 200, seed=1)
    assert a == b


def test_simulation_matches_formula():
    r = simulate_policies(200, 30, 5, 1, {"best": 229}, 100_000, seed=42)["best"]
    exact = expected_metrics(229, 200, 30, 5, 1)
    assert r.cost_per_day == pytest.approx(exact.cost, rel=0.03)


def test_best_beats_current():
    r = simulate_policies(200, 30, 5, 1, {"cur": 200, "best": 229}, 20_000, seed=3)
    assert r["best"].cost_per_day < r["cur"].cost_per_day


def test_cli_optimize(capsys):
    main(["optimize", "--mean", "200", "--std", "30", "--cu", "5", "--co", "1"])
    out = capsys.readouterr().out
    assert "recommended batch  : 229" in out


def test_cli_from_csv(capsys):
    main(["from-csv", str(Path(__file__).resolve().parents[1] / "data" / "sample_demand.csv"), "--cu", "5", "--co", "1"])
    assert "recommended batch" in capsys.readouterr().out
