import {
  invPhi, stats, criticalRatio, bestBatch, validateInputs, validateSimCount,
  parseHistory, fitNormal, LIMITS
} from "./newsvendor.js";

var $ = function (id) { return document.getElementById(id); };
var FIELDS = ["mu", "sd", "cu", "co", "cur", "days"];
var state = { source: "manual", estimateDays: 0 };
var pending = null; // estimate waiting for the user to accept or discard it

// ---------- safe DOM helpers: user text only ever goes in via textContent ----------
function el(tag, cls, text) {
  var node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fmt(x, d) {
  var s = Number(x).toFixed(d === undefined ? 1 : d);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

function dishName() {
  var n = $("name").value.trim().slice(0, 60);
  return n || "this dish";
}

function readRaw() {
  var raw = {};
  FIELDS.forEach(function (id) { raw[id] = $(id).value; });
  return raw;
}

function kpi(cls, big, small) {
  var box = el("div", "k" + (cls ? " " + cls : ""));
  box.appendChild(el("b", "", big));
  box.appendChild(el("span", "", small));
  return box;
}

function row(tag, cells) {
  var tr = el("tr");
  cells.forEach(function (c) {
    var text = Array.isArray(c) ? c[0] : c, cls = Array.isArray(c) ? c[1] : "";
    tr.appendChild(el(tag, cls, text));
  });
  return tr;
}

// ---------- validation feedback ----------
function showErrors(r) {
  var box = $("errors"), messages = Object.keys(r.errors).map(function (k) { return r.errors[k]; });
  box.replaceChildren();
  FIELDS.forEach(function (id) { $(id).setAttribute("aria-invalid", r.errors[id] ? "true" : "false"); });
  box.hidden = messages.length === 0;
  messages.forEach(function (m) { box.appendChild(el("div", "", m)); });
  var w = $("warnings");
  w.replaceChildren();
  r.warnings.forEach(function (m) { w.appendChild(el("div", "", m)); });
  w.hidden = r.warnings.length === 0;
}

function clearResults() {
  $("kpis").replaceChildren();
  $("why").textContent = "";
  $("chart").replaceChildren();
}

function updateSource() {
  $("source").textContent = state.source === "estimated"
    ? "Average and spread: estimated from " + state.estimateDays + " days of history. Editing either box switches to your own values."
    : "Average and spread: entered by you.";
}

// ---------- main calculation ----------
function render() {
  var r = validateInputs(readRaw());
  showErrors(r);
  if (!r.ok) { clearResults(); return null; }

  var p = r.values;
  var cr = criticalRatio(p.cu, p.co);
  var z = invPhi(cr);
  var Q = bestBatch(p.mu, p.sd, p.cu, p.co);           // the whole-portion batch used everywhere below
  var a = stats(p.cur, p), o = stats(Q, p);             // current batch and recommended batch
  var save = a.cost - o.cost;                            // >= 0: Q is the best integer and cur is an integer
  var pct = a.cost > 0 ? (100 * save) / a.cost : 0;
  var name = dishName();

  $("kpis").replaceChildren(
    kpi("", "Cook " + Q, "portions of " + name + " (Q*)"),
    kpi("b", fmt(cr * 100, 0) + "%", "critical ratio: chance of not running out"),
    kpi("w", fmt(o.left) + " vs " + fmt(a.left), "expected leftovers/day: new vs current"),
    kpi("r", fmt(o.short) + " vs " + fmt(a.short), "expected shortfall/day: new vs current"),
    kpi("", fmt(o.cost) + " vs " + fmt(a.cost), "expected cost/day: new vs current"),
    kpi("", "≈ " + Math.round(save * p.days).toLocaleString("en-IN") + "/yr",
      "saved over " + p.days + " days (" + fmt(pct, 0) + "% lower cost)")
  );

  $("why").textContent =
    "Running out costs " + fmt(p.cu / p.co, 1) + " times as much as wasting a portion, so the best plan covers demand on " +
    fmt(cr * 100, 0) + "% of days. The bell-curve target is " + fmt(p.mu, 1) + " + " + fmt(z, 2) + " × " + fmt(p.sd, 1) +
    " = " + fmt(p.mu + z * p.sd, 2) + " portions, and the best whole batch is " + Q + ". Compared with cooking " + p.cur +
    ", expected leftovers change by " + fmt(o.left - a.left, 1) + " and expected shortfalls by " + fmt(o.short - a.short, 1) + " portions a day.";

  chart(p, Q);
  return { p: p, Q: Q };
}

// ---------- chart using DOM methods (no innerHTML) ----------
function chart(p, Q) {
  var lo = Math.max(0, p.mu - 3 * p.sd), hi = p.mu + 3 * p.sd, N = 60, pts = [], mx = 0, i;
  for (i = 0; i <= N; i++) {
    var x = lo + ((hi - lo) * i) / N, c = stats(x, p).cost;
    pts.push([x, c]);
    if (c > mx) mx = c;
  }
  if (!(mx > 0)) mx = 1;
  var W = 640, H = 260, L = 48, R = 16, T = 16, B = 36;
  var X = function (v) { return L + ((v - lo) / (hi - lo)) * (W - L - R); };
  var Y = function (v) { return H - B - (v / mx) * (H - B - T); };

  var svgNS = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 640 260");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Expected daily cost against portions cooked");

  // X axis
  var xAxis = document.createElementNS(svgNS, "line");
  xAxis.setAttribute("x1", L);
  xAxis.setAttribute("y1", H - B);
  xAxis.setAttribute("x2", W - R);
  xAxis.setAttribute("y2", H - B);
  xAxis.setAttribute("style", "stroke:var(--line)");
  svg.appendChild(xAxis);

  // Y axis
  var yAxis = document.createElementNS(svgNS, "line");
  yAxis.setAttribute("x1", L);
  yAxis.setAttribute("y1", T);
  yAxis.setAttribute("x2", L);
  yAxis.setAttribute("y2", H - B);
  yAxis.setAttribute("style", "stroke:var(--line)");
  svg.appendChild(yAxis);

  // Cost curve path
  var d = pts.map(function (q, k) { return (k ? "L" : "M") + X(q[0]).toFixed(1) + " " + Y(q[1]).toFixed(1); }).join("");
  var path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("style", "stroke:var(--blue); stroke-width:2.5");
  svg.appendChild(path);

  // Current and best batch markers
  [[p.cur, "current", "var(--amber)", 14], [Q, "best", "var(--green)", 30]].forEach(function (m) {
    if (m[0] < lo || m[0] > hi) return;
    var cx = X(m[0]);
    var cy = Y(stats(m[0], p).cost);

    // Vertical line
    var vLine = document.createElementNS(svgNS, "line");
    vLine.setAttribute("x1", cx);
    vLine.setAttribute("y1", T);
    vLine.setAttribute("x2", cx);
    vLine.setAttribute("y2", H - B);
    vLine.setAttribute("style", "stroke:" + m[2] + "; stroke-width:2; stroke-dasharray:5 4");
    svg.appendChild(vLine);

    // Circle marker
    var circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", "5");
    circle.setAttribute("style", "fill:" + m[2]);
    svg.appendChild(circle);

    // Label
    var text = document.createElementNS(svgNS, "text");
    text.setAttribute("x", cx + 6);
    text.setAttribute("y", T + m[3]);
    text.setAttribute("style", "fill:" + m[2] + "; font-size:13");
    text.textContent = m[1] + " " + Math.round(m[0]);
    svg.appendChild(text);
  });

  // X axis label
  var xLabel = document.createElementNS(svgNS, "text");
  xLabel.setAttribute("x", W / 2);
  xLabel.setAttribute("y", H - 8);
  xLabel.setAttribute("text-anchor", "middle");
  xLabel.setAttribute("style", "fill:var(--mute); font-size:12");
  xLabel.textContent = "portions cooked";
  svg.appendChild(xLabel);

  // Y axis label
  var yLabel = document.createElementNS(svgNS, "text");
  yLabel.setAttribute("x", 14);
  yLabel.setAttribute("y", H / 2);
  yLabel.setAttribute("style", "fill:var(--mute); font-size:12");
  yLabel.setAttribute("transform", "rotate(-90 14 " + (H / 2) + ")");
  yLabel.setAttribute("text-anchor", "middle");
  yLabel.textContent = "expected cost per day";
  svg.appendChild(yLabel);

  $("chart").replaceChildren(svg);
}

// ---------- simulation ----------
function gauss() {
  var u = 1 - Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function simulate() {
  var r = validateInputs(readRaw());
  showErrors(r);
  var n = validateSimCount($("n").value);
  $("simerr").hidden = n.ok;
  $("simerr").textContent = n.ok ? "" : n.message;
  if (!r.ok || !n.ok) { $("simtab").replaceChildren(); return; }

  var p = r.values, Q = bestBatch(p.mu, p.sd, p.cu, p.co), N = n.value, demand = [], i;
  for (i = 0; i < N; i++) demand.push(Math.max(0, p.mu + p.sd * gauss()));  // same normal model as the formulas

  function run(q) {
    var left = 0, short = 0, out = 0;
    demand.forEach(function (d) {
      left += Math.max(q - d, 0);
      var s = Math.max(d - q, 0);
      short += s;
      if (s > 0) out++;
    });
    return { left: left / N, short: short / N, out: out, cost: (p.co * left + p.cu * short) / N };
  }
  var a = run(p.cur), o = run(Q);

  var t = $("simtab");
  t.replaceChildren(
    row("th", ["Policy (portions)", "Leftovers/day", "Shortfall/day", "Days ran out", "Cost/day"]),
    row("td", ["Current (" + p.cur + ")", fmt(a.left), fmt(a.short), a.out + " of " + N, fmt(a.cost)]),
    row("td", ["Best batch (" + Q + ")", fmt(o.left), fmt(o.short), o.out + " of " + N, fmt(o.cost)]),
    row("td", [["Change", "good"], fmt(o.left - a.left), fmt(o.short - a.short), String(o.out - a.out), [fmt(o.cost - a.cost), "good"]])
  );
}

// ---------- historical estimate: never changes Step 1 until the user accepts ----------
function clearPending() {
  pending = null;
  var box = $("pending");
  box.replaceChildren();
  box.hidden = true;
}

function showPending(est) {
  pending = est;
  var box = $("pending");
  box.replaceChildren(el("p", "note", "Estimate from " + est.days + " days: average " + est.mu + ", spread " + est.sd +
    ". Your values in Step 1 have not changed yet."));
  var apply = el("button", "", "Use these values in Step 1");
  apply.addEventListener("click", applyPending);
  var discard = el("button", "alt", "Discard estimate");
  discard.addEventListener("click", function () {
    clearPending();
    $("fitmsg").textContent = "Estimate discarded. Step 1 is unchanged.";
  });
  box.appendChild(apply);
  box.appendChild(discard);
  box.hidden = false;
}

function applyPending() {
  if (!pending) return;
  $("mu").value = String(pending.mu);
  $("sd").value = String(pending.sd);
  state.source = "estimated";
  state.estimateDays = pending.days;
  $("fitmsg").textContent = "Applied to average and spread. Portions you cook now was not changed.";
  clearPending();
  updateSource();
  render();
}

function estimate() {
  clearPending();
  var msg = $("fitmsg"), h = parseHistory($("hist").value);
  if (h.invalid.length) {
    var shown = h.invalid.slice(0, 5).map(function (t) { return '"' + t + '"'; }).join(", ");
    msg.textContent = "Not valid daily numbers: " + shown + (h.invalid.length > 5 ? " and more" : "") +
      ". Use numbers of 0 or more, separated by commas or spaces.";
    return;
  }
  if (h.values.length < LIMITS.minHistory) {
    msg.textContent = "Enter at least " + LIMITS.minHistory + " days. You entered " + h.values.length + ".";
    return;
  }
  var s = fitNormal(h.values);
  var mu = Math.round(s.mean * 10) / 10, sd = Math.round(s.sd * 10) / 10;
  if (!(mu > 0)) { msg.textContent = "The average of these days is zero, so there is nothing to cook for. Check the numbers."; return; }
  if (!(sd > 0)) { msg.textContent = "These days are all the same, so there is no spread to estimate. Enter the spread in Step 1 yourself."; return; }
  msg.textContent = "Estimate from " + h.values.length + " days. Nothing has changed yet.";
  showPending({ mu: mu, sd: sd, days: h.values.length });
}

// ---------- wiring ----------
["mu", "sd"].forEach(function (id) {
  $(id).addEventListener("input", function () { state.source = "manual"; updateSource(); render(); });
});
["name", "cu", "co", "cur", "days"].forEach(function (id) { $(id).addEventListener("input", render); });
$("fit").addEventListener("click", estimate);
$("run").addEventListener("click", simulate);

updateSource();
render();
