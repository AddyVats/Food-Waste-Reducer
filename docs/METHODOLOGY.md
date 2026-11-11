# Methodology

## Problem

A kitchen chooses a batch size `Q` before it knows the day's demand `D`.

* If `D < Q`, the `Q - D` leftover portions cost `co` each.
* If `D > Q`, the `D - Q` unmet portions cost `cu` each.

Expected cost: `C(Q) = co * E[(Q - D)+] + cu * E[(D - Q)+]`.

## Optimal batch size

`C` is convex in `Q`. Differentiating, `C'(Q) = co * F(Q) - cu * (1 - F(Q))`,
and setting it to zero gives

```
F(Q*) = cu / (cu + co)
```

so the best batch is the quantile of demand at the critical ratio.

Portions are whole numbers, and the cost curve is asymmetric, so the best whole batch is not always the nearest integer to `Q*`. The code compares `floor(Q*)` and `floor(Q*) + 1` and keeps the cheaper one (a 25-in-19,514 random-case example shows plain rounding can cost more, e.g. 1.039 instead of 0.990 per day). Because
`F(Q*)` is also the probability of not running out, the model cooks enough to
cover demand on that share of days.

## Normal demand

If `D ~ N(mu, sigma^2)`, let `z = (Q - mu) / sigma`, with `phi` and `Phi` the
standard normal density and distribution function. Then

```
Q* = mu + sigma * Phi^-1( cu / (cu + co) )
E[leftover]  = sigma * ( z*Phi(z) + phi(z) )
E[shortfall] = sigma * ( phi(z) - z*(1 - Phi(z)) )
C(Q)         = co * E[leftover] + cu * E[shortfall]
```

A useful check: `leftover - shortfall = Q - D` on every day, so
`E[leftover] - E[shortfall] = Q - mu` (used in the tests).

## Worked example

`mu = 200, sigma = 30, cu = 5, co = 1`.

* Critical ratio 5/6 = 0.8333, `z = 0.9674`, `Q* = 229.02`, cook 229.
* At `Q = 200` (z = 0): leftover 11.97, shortfall 11.97, cost 71.81.
* At `Q = 229`: leftover 31.66, shortfall 2.66, cost 44.97.
* Saving 26.84 per day, about 37%, or 5,367 over 200 days.

## Assumptions and limits

Inputs are validated before use: empty, negative, non-numeric, zero (where not allowed), decimal current batches and out-of-range values are rejected with a message rather than silently replaced.

1. **Normality.** Real demand can be skewed or discrete. `optimal_quantity_empirical`
   gives a distribution-free alternative using the quantile of past demand.
2. **Censored data.** Sales hide demand on sold-out days, so the mean and
   spread estimated from sales are biased low.
3. **Independence.** Days are treated as independent; weekday effects, exams
   and weather are not modelled yet.
4. **Linear costs.** Cost per wasted or missed portion is constant, and
   leftovers have no salvage value or reuse.
5. **Cost inputs.** `cu` is the hardest number to set, because it includes
   dissatisfaction. Try a range and check how much `Q*` moves.
6. **Single dish.** Shared capacity (ovens, staff) is not modelled.
