"""Command line interface: `foodwaste optimize | from-csv | simulate`."""
from __future__ import annotations

import argparse
import csv
import sys

from .newsvendor import (critical_ratio, expected_metrics, fit_normal,
                         optimal_quantity, optimal_quantity_empirical)
from .simulate import simulate_policies


def _report(mu, sigma, cu, co, current, days_per_year):
    q = optimal_quantity(mu, sigma, cu, co)
    best = expected_metrics(q, mu, sigma, cu, co)
    now = expected_metrics(current, mu, sigma, cu, co)
    saved = now.cost - best.cost
    print(f"critical ratio     : {critical_ratio(cu, co):.3f}")
    print(f"demand             : mean {mu:.1f}, std {sigma:.1f}")
    print(f"recommended batch  : {q:.0f} portions")
    print(f"current batch      : {current:.0f} portions")
    print(f"leftover/day       : {best.leftover:.1f} (now {now.leftover:.1f})")
    print(f"shortfall/day      : {best.shortfall:.1f} (now {now.shortfall:.1f})")
    print(f"expected cost/day  : {best.cost:.2f} (now {now.cost:.2f})")
    print(f"saving per year    : {saved * days_per_year:,.0f} "
          f"over {days_per_year} days")


def _read_demand(path, column):
    with open(path, newline="") as fh:
        rows = list(csv.DictReader(fh))
    if not rows or column not in rows[0]:
        sys.exit(f"column '{column}' not found in {path}")
    return [float(r[column]) for r in rows if r[column].strip()]


def build_parser():
    p = argparse.ArgumentParser(prog="foodwaste", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(s):
        s.add_argument("--cu", type=float, required=True,
                       help="cost of running out, per portion")
        s.add_argument("--co", type=float, required=True,
                       help="cost of one wasted portion")
        s.add_argument("--current", type=float,
                       help="portions cooked today (default: the mean)")
        s.add_argument("--days", type=int, default=200,
                       help="serving days per year (default 200)")

    o = sub.add_parser("optimize", help="give mean and std directly")
    o.add_argument("--mean", type=float, required=True)
    o.add_argument("--std", type=float, required=True)
    common(o)

    c = sub.add_parser("from-csv", help="estimate mean and std from a CSV")
    c.add_argument("file")
    c.add_argument("--column", default="demand")
    common(c)

    s = sub.add_parser("simulate", help="replay policies on random days")
    s.add_argument("--mean", type=float, required=True)
    s.add_argument("--std", type=float, required=True)
    s.add_argument("--sim-days", type=int, default=1000)
    s.add_argument("--seed", type=int)
    common(s)
    return p


def main(argv=None):
    a = build_parser().parse_args(argv)
    if a.cmd == "from-csv":
        xs = _read_demand(a.file, a.column)
        mu, sigma = fit_normal(xs)
        print(f"empirical quantile : "
              f"{optimal_quantity_empirical(xs, a.cu, a.co):.1f} portions")
    else:
        mu, sigma = a.mean, a.std
    current = a.current if a.current is not None else mu
    _report(mu, sigma, a.cu, a.co, current, a.days)
    if a.cmd == "simulate":
        q = optimal_quantity(mu, sigma, a.cu, a.co)
        res = simulate_policies(mu, sigma, a.cu, a.co,
                                {"current": current, "best": q},
                                a.sim_days, a.seed)
        print(f"\nsimulation over {a.sim_days} days")
        for name, r in res.items():
            print(f"  {name:8s} Q={r.quantity:.0f}  leftover {r.leftover_per_day:.1f}"
                  f"  short {r.shortfall_per_day:.1f}  ran out {r.days_ran_out}d"
                  f"  cost {r.cost_per_day:.2f}")


if __name__ == "__main__":
    main()
