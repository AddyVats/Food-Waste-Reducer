// Runs the real public/js/app.js against a small fake DOM (no browser needed).
import test from "node:test";
import assert from "node:assert/strict";

const DEFAULTS = {
  name: "Rajma chawal", mu: "200", sd: "30", cu: "5", co: "1", cur: "200", days: "200",
  n: "60", hist: "", fit: "", run: "",
};
const store = {};
function makeEl(id) {
  return {
    id, value: DEFAULTS[id] ?? "", textContent: "", innerHTML: "", className: "", hidden: false,
    attrs: {}, children: [], listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    replaceChildren(...cs) { this.children = cs; },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
  };
}
globalThis.document = {
  getElementById: (id) => (store[id] ??= makeEl(id)),
  createElement: (tag) => { const n = makeEl(tag); n.tag = tag; n.id = ""; return n; },
  createElementNS: (ns, tag) => { const n = makeEl(tag); n.tag = tag; n.ns = ns; n.id = ""; return n; },
};
await import("../public/js/app.js");

const $ = (id) => store[id] ??= makeEl(id);
const text = (n) => (n.textContent || "") + " " + n.children.map(text).join(" ");
const tags = (n) => [n.tag, ...n.children.flatMap(tags)].filter(Boolean);
const fire = (id, type = "input") => ($(id).listeners[type] || []).forEach((f) => f({ target: $(id) }));
const set = (id, v) => { $(id).value = v; fire(id); };
const buttonWith = (box, label) => box.children.find((c) => c.tag === "button" && text(c).includes(label));

function reset() {
  for (const k of Object.keys(DEFAULTS)) $(k).value = DEFAULTS[k];
  set("mu", "200"); set("sd", "30"); set("cu", "5"); set("co", "1"); set("cur", "200"); set("days", "200");
}

test("default values produce the expected recommendation", () => {
  reset();
  assert.match(text($("kpis")), /Cook 229\s+portions of Rajma chawal \(Q\*\)/);
  assert.match(text($("kpis")), /45\.0 vs 71\.8/);
  assert.equal($("errors").hidden, true);
});

test("empty input shows an error and hides results instead of using zero", () => {
  reset();
  set("mu", "");
  assert.match(text($("errors")), /Average daily demand is empty/);
  assert.equal($("mu").attrs["aria-invalid"], "true");
  assert.equal($("kpis").children.length, 0);
  set("mu", "200");
  assert.equal($("mu").attrs["aria-invalid"], "false");
  assert.match(text($("kpis")), /Cook 229/);
});

test("negative and zero inputs are reported with clear messages", () => {
  reset();
  set("mu", "-5");
  assert.match(text($("errors")), /cannot be negative/);
  set("mu", "200"); set("cu", "0");
  assert.match(text($("errors")), /must be greater than zero/);
  set("cu", "5"); set("days", "-365");
  assert.match(text($("errors")), /whole number from 1 to 366/);
  set("days", "200");
});

test("dish name is inserted as text, never as HTML", () => {
  reset();
  set("name", '<img src=x onerror="alert(1)"><b>x</b>');
  const kpis = $("kpis");
  assert.equal(kpis.innerHTML, "");
  assert.ok(!tags(kpis).includes("img"));
  assert.ok(text(kpis).includes('<img src=x onerror="alert(1)"><b>x</b>'));
  assert.ok(!$("chart").innerHTML.includes("onerror"));
  set("name", "   ");
  assert.match(text($("kpis")), /portions of this dish/);
  set("name", "Rajma chawal");
});

test("estimate from history never changes portions you cook now", () => {
  reset();
  set("cur", "150");
  $("hist").value = "180, 190, 210, 200, 220";
  fire("fit", "click");
  assert.equal($("cur").value, "150");
  assert.equal($("mu").value, "200", "not applied until the user accepts");
  assert.equal($("pending").hidden, false);
  assert.match(text($("pending")), /have not changed yet/);
  buttonWith($("pending"), "Use these values").listeners.click[0]();
  assert.equal($("mu").value, "200");
  assert.equal($("sd").value, "15.8");
  assert.equal($("cur").value, "150", "current batch still untouched");
  assert.match($("source").textContent, /estimated from 5 days/);
  assert.equal($("pending").hidden, true);
});

test("discarding an estimate leaves Step 1 unchanged", () => {
  reset();
  $("hist").value = "100, 120, 140, 160, 180";
  fire("fit", "click");
  buttonWith($("pending"), "Discard").listeners.click[0]();
  assert.equal($("mu").value, "200");
  assert.equal($("pending").hidden, true);
  assert.match($("fitmsg").textContent, /Estimate discarded/);
});

test("editing average or spread by hand switches the source to manual", () => {
  reset();
  $("hist").value = "100, 120, 140, 160, 180";
  fire("fit", "click");
  buttonWith($("pending"), "Use these values").listeners.click[0]();
  assert.match($("source").textContent, /estimated/);
  set("sd", "25");
  assert.match($("source").textContent, /entered by you/);
});

test("invalid history entries are reported, not silently dropped", () => {
  reset();
  $("hist").value = "100, abc, 120, -4, 140, 160, 180";
  fire("fit", "click");
  assert.match($("fitmsg").textContent, /"abc", "-4"/);
  assert.equal($("pending").hidden, true);
});

test("too few history days are rejected", () => {
  reset();
  $("hist").value = "100, 120";
  fire("fit", "click");
  assert.match($("fitmsg").textContent, /at least 5 days/);
});

test("identical history gives a clear message, not a divide-by-zero", () => {
  reset();
  $("hist").value = "50, 50, 50, 50, 50";
  fire("fit", "click");
  assert.match($("fitmsg").textContent, /no spread to estimate/);
});

test("warning appears when the normal model predicts negative demand", () => {
  reset();
  set("mu", "10");
  assert.equal($("warnings").hidden, false);
  assert.match(text($("warnings")), /negative demand/);
  set("mu", "200");
  assert.equal($("warnings").hidden, true);
});

test("simulation runs, shows the table, and rejects a bad day count", () => {
  reset();
  $("n").value = "500";
  fire("run", "click");
  const t = text($("simtab"));
  assert.match(t, /Current \(200\)/);
  assert.match(t, /Best batch \(229\)/);
  assert.match(t, /Change/);
  assert.equal($("simerr").hidden, true);
  $("n").value = "3";
  fire("run", "click");
  assert.equal($("simerr").hidden, false);
  assert.match($("simerr").textContent, /from 5 to 2000/);
  assert.equal($("simtab").children.length, 0);
});

test("simulated cost agrees with the formula (within random variation)", () => {
  reset();
  $("n").value = "2000";
  fire("run", "click");
  const rows = $("simtab").children;
  const bestCost = Number(rows[2].children[4].textContent);
  assert.ok(Math.abs(bestCost - 44.97) < 2.5, `simulated ${bestCost}`);
});

test("savings never go negative and scale with serving days", () => {
  reset();
  set("cur", "229");
  assert.match(text($("kpis")), /0% lower cost/);
  set("cur", "229"); set("days", "100");
  assert.match(text($("kpis")), /saved over 100 days/);
});
