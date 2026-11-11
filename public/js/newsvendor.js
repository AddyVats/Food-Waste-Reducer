// Newsvendor maths shared by the web UI and the tests (normal demand).
//
// Notation: D ~ Normal(mu, sd) is daily demand, Q is portions cooked,
// cu is the cost of each unmet portion, co the cost of each wasted portion.
// Leftover = max(Q - D, 0), shortfall = max(D - Q, 0).

export const LIMITS = { maxValue: 1e6, maxDays: 366, minHistory: 5, minSim: 5, maxSim: 2000 };

export const LABELS = {
  mu: "Average daily demand",
  sd: "Day-to-day spread",
  cu: "Cost of running out",
  co: "Cost of one wasted portion",
  cur: "Portions you cook now",
  days: "Serving days per year",
};

const SQ2PI = Math.sqrt(2 * Math.PI);

export function phi(z) {
  return Math.exp(-z * z / 2) / SQ2PI;
}

// Standard normal CDF (Abramowitz and Stegun 26.2.17, error below 1e-7).
export function Phi(z) {
  var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = phi(z),
    p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

// Inverse standard normal CDF (Acklam's algorithm). Requires 0 < p < 1.
export function invPhi(p) {
  if (!(p > 0 && p < 1)) throw new RangeError("invPhi needs 0 < p < 1");
  var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239],
    b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
    c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783],
    d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416], pl = 0.02425, q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Target probability of covering demand: cu / (cu + co). */
export function criticalRatio(cu, co) {
  if (!(cu > 0 && co > 0)) throw new RangeError("cu and co must be positive");
  return cu / (cu + co);
}

/**
 * Expected leftovers, shortfall and cost of cooking Q portions.
 * p = {mu, sd, cu, co}. Closed form for normal demand:
 *   E[leftover]  = sd * (z*Phi(z) + phi(z))
 *   E[shortfall] = sd * (phi(z) - z*(1 - Phi(z)))   with z = (Q - mu) / sd
 */
export function stats(Q, p) {
  var z = (Q - p.mu) / p.sd, left = p.sd * (z * Phi(z) + phi(z)), short = p.sd * (phi(z) - z * (1 - Phi(z)));
  return { left: left, short: short, cost: p.co * left + p.cu * short, sl: Phi(z) };
}

/**
 * Best WHOLE-portion batch. The continuous optimum mu + z*sd is not always
 * the best integer (the cost curve is asymmetric), so compare floor and ceil.
 */
export function bestBatch(mu, sd, cu, co) {
  var cont = mu + invPhi(criticalRatio(cu, co)) * sd,
    lo = Math.max(0, Math.floor(cont)), p = { mu: mu, sd: sd, cu: cu, co: co };
  return stats(lo + 1, p).cost < stats(lo, p).cost ? lo + 1 : lo;
}

// Accepts plain decimal numbers only (rejects hex, "Infinity", "NaN", scientific notation, etc.).
// Scientific notation (e.g., 1e3) is rejected because it's not intuitive for kitchen staff.
var NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

export function parseNumber(text) {
  var s = String(text === undefined || text === null ? "" : text).trim();
  if (s === "") return { status: "empty" };
  if (!NUMBER_RE.test(s)) return { status: "invalid" };
  var value = Number(s);
  return Number.isFinite(value) ? { status: "ok", value: value } : { status: "invalid" };
}

function checkField(id, text) {
  var label = LABELS[id], parsed = parseNumber(text);
  if (parsed.status === "empty") return { error: label + " is empty. Enter a number." };
  if (parsed.status === "invalid") return { error: label + " must be a plain number, such as 200 or 12.5." };
  var v = parsed.value;
  if (id === "days") {
    if (!Number.isInteger(v) || v < 1 || v > LIMITS.maxDays) return { error: label + " must be a whole number from 1 to " + LIMITS.maxDays + "." };
    return { value: v };
  }
  if (v < 0) return { error: label + " cannot be negative." };
  if (id !== "cur" && v === 0) return { error: label + " must be greater than zero." };
  if (v > LIMITS.maxValue) return { error: label + " is above the limit of " + LIMITS.maxValue.toLocaleString("en-US") + "." };
  if (id === "cur" && !Number.isInteger(v)) return { error: label + " must be a whole number of portions." };
  return { value: v };
}

/**
 * Validates the Step 1 inputs. raw = {mu, sd, cu, co, cur, days} as typed.
 * Returns {ok, errors, values, warnings}; values is complete only when ok.
 */
export function validateInputs(raw) {
  var errors = {}, values = {}, warnings = [], ids = ["mu", "sd", "cu", "co", "cur", "days"];
  ids.forEach(function (id) {
    var c = checkField(id, raw[id]);
    if (c.error) errors[id] = c.error; else values[id] = c.value;
  });
  var ok = Object.keys(errors).length === 0;
  if (ok) {
    // Chance that the normal model produces negative demand.
    var pNeg = Phi(-values.mu / values.sd);
    if (pNeg > 0.01) {
      warnings.push("About " + Math.round(pNeg * 100) + "% of the time the bell-curve model predicts negative demand, because the average is small compared with the spread. Treat these results as rough estimates.");
    }
  }
  return { ok: ok, errors: errors, values: values, warnings: warnings };
}

/** Validates the number of simulated days. */
export function validateSimCount(text) {
  var parsed = parseNumber(text), msg = "Days to simulate must be a whole number from " + LIMITS.minSim + " to " + LIMITS.maxSim + ".";
  if (parsed.status !== "ok" || !Number.isInteger(parsed.value) || parsed.value < LIMITS.minSim || parsed.value > LIMITS.maxSim) {
    return { ok: false, message: msg };
  }
  return { ok: true, value: parsed.value };
}

/** Splits pasted history on commas, spaces or semicolons. Nothing is dropped silently. */
export function parseHistory(text) {
  var tokens = String(text === undefined || text === null ? "" : text).split(/[\s,;]+/).filter(function (t) { return t !== ""; });
  var values = [], invalid = [];
  tokens.forEach(function (t) {
    var r = parseNumber(t);
    if (r.status === "ok" && r.value >= 0 && r.value <= LIMITS.maxValue) values.push(r.value); else invalid.push(t);
  });
  return { values: values, invalid: invalid };
}

/** Sample mean and sample standard deviation (n - 1 denominator). */
export function fitNormal(values) {
  if (values.length < 2) throw new RangeError("need at least 2 values");
  var n = values.length, mean = values.reduce(function (s, v) { return s + v; }, 0) / n;
  var sq = values.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0);
  return { mean: mean, sd: Math.sqrt(sq / (n - 1)) };
}

