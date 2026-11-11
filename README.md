# Dining Hall Food Waste Reducer

[![CI](https://github.com/AddyVats/food-waste-reducer/actions/workflows/ci.yml/badge.svg)](https://github.com/AddyVats/food-waste-reducer/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/python-3.9%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

Cooking exactly the average number of portions is a mistake: running out of a
dish usually costs more than wasting one portion. This project uses the
**newsvendor model** to find the batch size that minimises expected daily cost,
and shows what that saves compared with current practice.

It ships as three parts that share the same maths:

| Part | Where | Use it for |
|---|---|---|
| Website | `public/` | Interactive calculator, chart and simulation, deployed on Vercel |
| Python package | `python/` | Reusable functions and a CLI for analysis and notebooks |
| Tests | `tests/`, `python/tests/` | Both implementations are checked against the same reference values |

## Run it locally

```bash
git clone https://github.com/AddyVats/food-waste-reducer.git
cd food-waste-reducer

# website (no build step)
npm run dev            # serves public/ at http://localhost:3000
npm test               # JavaScript tests

# Python package
cd python
pip install -e ".[dev]"
pytest
foodwaste optimize --mean 200 --std 30 --cu 5 --co 1
```

Output of the last command:

```
critical ratio     : 0.833
recommended batch  : 229 portions
current batch      : 200 portions
leftover/day       : 31.7 (now 12.0)
shortfall/day      : 2.7 (now 12.0)
expected cost/day  : 44.97 (now 71.81)
saving per year    : 5,367 over 200 days
```

## Deploy the website on Vercel

The site is plain HTML, CSS and JavaScript, so there is no build step.
`vercel.json` already sets the framework to "Other" and the output directory to
`public`.

1. Push this repo to GitHub.
2. Go to <https://vercel.com/new>, import the repo, and keep the defaults
   (Framework Preset: Other, no build command, output directory `public`).
3. Click Deploy. Every push to `main` then redeploys automatically, and pull
   requests get preview URLs.

Or with the CLI: `npm i -g vercel`, then `vercel` for a preview and
`vercel --prod` for production.

## The model in one minute

Let `D` be daily demand (mean `mu`, standard deviation `sigma`), `Q` the
portions cooked, `cu` the cost of each unmet portion and `co` the cost of each
wasted one. The expected cost is minimised when the probability of covering
demand equals the **critical ratio**:

```
F(Q*) = cu / (cu + co)        Q* = mu + z * sigma,   z = inverse normal CDF of the ratio
```

With `cu = 5` and `co = 1` the ratio is 5/6, so `z = 0.9674` and
`Q* = 200 + 0.9674 * 30 = 229`. Full derivation, the loss-function formulas and
assumptions are in [docs/METHODOLOGY.md](docs/METHODOLOGY.md).

## Validation

* Python and JavaScript tests check the closed-form results against
  independently computed values and against the identity `E[leftover] - E[shortfall] = Q - mu`.
* A 100,000-day simulation agrees with the closed-form cost to within 3%.
* In a 5,000-day simulation the best batch ran out on 16.4% of days, close to
  the theoretical 1 - 5/6 = 16.7%.

## Repository layout

```
public/                 website served by Vercel
  index.html
  css/style.css
  js/newsvendor.js      maths (also imported by the tests)
  js/app.js             user interface
python/                 package, CLI, pytest suite, sample_demand.csv (synthetic)
tests/                  JavaScript tests (node --test)
docs/METHODOLOGY.md     derivation, worked example, limits
vercel.json             deployment settings
.github/workflows/      CI: Python 3.9 to 3.12 and Node 20
```

## Using it on real data

1. Record, per dish and day, the portions prepared and the portions left over.
2. Estimate demand as sold portions, and add an estimate for the days the dish
   sold out (otherwise demand is understated).
3. Set `cu` and `co` with the kitchen: `co` is mostly ingredient and labour
   cost; `cu` includes lost sales and student dissatisfaction.
4. Run `foodwaste from-csv` (in `python/`), trial the recommendation for two weeks on one
   station, and compare waste and stock-outs with the previous fortnight.

The sample CSV is synthetic. Do not draw conclusions about any real dining
hall from it.

## Roadmap

- [ ] Several dishes with shared capacity
- [ ] Weekday and weather demand profiles
- [ ] Censored-demand estimation for sold-out days
- [ ] Non-normal demand (for example negative binomial)
- [ ] CSV export from the web app

## References

* Edgeworth, F. Y. (1888). The mathematical theory of banking. *Journal of the
  Royal Statistical Society* 51(1), 113-127. (Earliest form of the problem.)
* Arrow, K. J., Harris, T., and Marschak, J. (1951). Optimal inventory policy.
  *Econometrica* 19(3), 250-272. (Modern formulation.)

## Contributing

Issues and pull requests are welcome. Please add a test for any change to the
maths and run `pytest` before opening a pull request.

## License

MIT. See [LICENSE](LICENSE).
