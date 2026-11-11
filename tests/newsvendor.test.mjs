import test from "node:test";
import assert from "node:assert/strict";
import {
  invPhi, Phi, phi, stats, criticalRatio, bestBatch,
  validateInputs, validateSimCount, parseHistory, parseNumber, fitNormal
} from "../public/js/newsvendor.js";

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b} (tol ${tol})`);
const p = { mu: 200, sd: 30, cu: 5, co: 1 };

// Deterministic pseudo-random numbers so failures are reproducible.
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// ---------- reference values ----------
test("critical ratio", () => close(criticalRatio(5, 1), 5 / 6, 1e-12));
test("inverse normal: z for 5/6 is 0.9674", () => close(invPhi(5 / 6), 0.9674, 1e-4));
test("Phi and invPhi are inverses", () => close(Phi(invPhi(0.9)), 0.9, 1e-6));
test("invPhi rejects p outside (0,1)", () => {
  assert.throws(() => invPhi(0)); assert.throws(() => invPhi(1)); assert.throws(() => invPhi(NaN));
});
test("criticalRatio rejects non-positive costs", () => {
  assert.throws(() => criticalRatio(0, 1)); assert.throws(() => criticalRatio(1, -2));
});
test("best batch for the reference example is 229", () => assert.equal(bestBatch(200, 30, 5, 1), 229));
test("reference costs", () => {
  close(stats(200, p).cost, 71.81, 0.01);
  close(stats(229, p).cost, 44.97, 0.01);
});

// ---------- mathematical verification ----------
test("closed-form leftover and shortfall match numerical integration", () => {
  // E[(Q-D)+] and E[(D-Q)+] by Simpson's rule over mu +/- 12 sd.
  const f = (x) => phi((x - p.mu) / p.sd) / p.sd;
  for (const Q of [150, 200, 229, 260]) {
    const a = p.mu - 12 * p.sd, n = 20000, h = (Q - a) / n;
    let left = 0;
    for (let i = 0; i <= n; i++) {
      const x = a + i * h, w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      left += w * Math.max(Q - x, 0) * f(x);
    }
    left *= h / 3;
    const s = stats(Q, p);
    close(s.left, left, 1e-4);
    close(s.left - s.short, Q - p.mu, 1e-9);
  }
});
test("cost is minimised at the critical ratio (first-order condition)", () => {
  const q = p.mu + invPhi(5 / 6) * p.sd;
  close(stats(q, p).sl, 5 / 6, 1e-6);
});
test("best whole batch equals brute-force minimum over integers", () => {
  const rnd = lcg(12345);
  for (let i = 0; i < 300; i++) {
    const mu = 5 + rnd() * 300, sd = 0.5 + rnd() * 60, cu = 0.1 + rnd() * 10, co = 0.1 + rnd() * 10;
    const q = { mu, sd, cu, co }, top = Math.ceil(mu + 10 * sd);
    let best = Infinity;
    for (let k = 0; k <= top; k++) best = Math.min(best, stats(k, q).cost);
    const chosen = bestBatch(mu, sd, cu, co);
    assert.ok(Number.isInteger(chosen) && chosen >= 0);
    close(stats(chosen, q).cost, best, 1e-9);
  }
});
test("regression: plain rounding is NOT always the best whole batch", () => {
  // continuous optimum 104.53: round gives 105 (cost 1.0395), floor 104 gives 0.9903
  const q = { mu: 104.85, sd: 0.51, cu: 1.12, co: 3.08 };
  assert.equal(Math.round(q.mu + invPhi(criticalRatio(1.12, 3.08)) * 0.51), 105);
  assert.equal(bestBatch(104.85, 0.51, 1.12, 3.08), 104);
  assert.ok(stats(104, q).cost < stats(105, q).cost);
});
test("fitNormal uses the sample (n-1) standard deviation", () => {
  const s = fitNormal([180, 190, 210, 200, 220]);
  close(s.mean, 200, 1e-12);
  close(s.sd, Math.sqrt(250), 1e-12);
});

// ---------- input validation ----------
const base = { mu: "200", sd: "30", cu: "5", co: "1", cur: "200", days: "200" };
const withField = (k, v) => ({ ...base, [k]: v });

test("valid defaults pass with no errors or warnings", () => {
  const r = validateInputs(base);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, {});
  assert.deepEqual(r.warnings, []);
  assert.equal(r.values.mu, 200);
});
test("empty fields are reported, not treated as zero", () => {
  const r = validateInputs(withField("mu", "  "));
  assert.equal(r.ok, false);
  assert.match(r.errors.mu, /is empty/);
});
test("negative average demand is rejected", () => {
  assert.match(validateInputs(withField("mu", "-5")).errors.mu, /cannot be negative/);
});
test("zero demand, spread and costs are rejected", () => {
  for (const k of ["mu", "sd", "cu", "co"]) {
    assert.match(validateInputs(withField(k, "0")).errors[k], /must be greater than zero/, k);
  }
});
test("zero current batch is allowed (cook nothing)", () => {
  assert.equal(validateInputs(withField("cur", "0")).ok, true);
});
test("negative current batch is rejected", () => {
  assert.match(validateInputs(withField("cur", "-3")).errors.cur, /cannot be negative/);
});
test("decimal current batch is rejected (portions are whole)", () => {
  assert.match(validateInputs(withField("cur", "200.5")).errors.cur, /whole number of portions/);
});
test("serving days must be a whole number 1 to 366", () => {
  for (const bad of ["-365", "0", "200.5", "400"]) {
    assert.ok(validateInputs(withField("days", bad)).errors.days, bad);
  }
  assert.equal(validateInputs(withField("days", "366")).ok, true);
});
test("decimal demand and spread are accepted", () => {
  const r = validateInputs({ ...base, mu: "187.5", sd: "12.25" });
  assert.equal(r.ok, true);
  assert.equal(r.values.sd, 12.25);
});
test("extremely large values are rejected", () => {
  assert.match(validateInputs(withField("mu", "1000000000")).errors.mu, /above the limit/);
  assert.equal(validateInputs(withField("mu", "1000000")).ok, true);
});
test("non-numeric text is rejected, including hex and Infinity", () => {
  for (const bad of ["abc", "0x10", "Infinity", "NaN", "12abc"]) {
    assert.match(validateInputs(withField("cu", bad)).errors.cu, /plain number/, bad);
  }
});
test("parseNumber accepts plain decimals only", () => {
  assert.deepEqual(parseNumber(" 12.5 "), { status: "ok", value: 12.5 });
  assert.deepEqual(parseNumber(".5"), { status: "ok", value: 0.5 });
  assert.deepEqual(parseNumber("1000"), { status: "ok", value: 1000 });
  assert.equal(parseNumber("").status, "empty");
  assert.equal(parseNumber("1e3").status, "invalid");
  assert.equal(parseNumber("1E3").status, "invalid");
  assert.equal(parseNumber("1.5e2").status, "invalid");
});
test("warns when the bell-curve model predicts noticeable negative demand", () => {
  const r = validateInputs({ ...base, mu: "10", sd: "30" });
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /negative demand/);
  assert.equal(validateInputs(base).warnings.length, 0);
});
test("simulation count must be a whole number from 5 to 2000", () => {
  assert.equal(validateSimCount("60").ok, true);
  for (const bad of ["", "4", "2001", "2.5", "x"]) assert.equal(validateSimCount(bad).ok, false, bad);
});

// ---------- historical data ----------
test("history parsing keeps valid values and reports invalid tokens", () => {
  const h = parseHistory("188, 215; 172 abc -3 240");
  assert.deepEqual(h.values, [188, 215, 172, 240]);
  assert.deepEqual(h.invalid, ["abc", "-3"]);
});
test("history parsing handles empty input", () => {
  assert.deepEqual(parseHistory(""), { values: [], invalid: [] });
});
