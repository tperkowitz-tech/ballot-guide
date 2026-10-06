// Checks tools/calc.js against the numbers `python3 scripts/score.py (ballot-guide/scripts/score.py after the folder move) --demo` asserts.
// Run: node tools/calc_test.js
const assert = require("assert");
const {pyRound, parseWeights, calculate, scoreRace} = require("./calc.js");

const rows = r => r.result.rows.map(o => [o.name, o.score, o.confidence]);

// Demo race "Seat": X = (3*1 + 2*-1)/5 -> 60 low; Y crosses a red line -> 20; call X.
// Also exercises unicode minus, lowercase kind, and spaces inside brackets.
let r = calculate("A | One | m | weight 3\nB | Two | m | weight 2", [
  "CANDIDATE: X | nonpartisan | none",
  "- [A][+][RECORD] 2025: a | https://example.org/source",
  "- [B][−][funder] 2025: b | https://example.org/source",
  "RED LINE CROSSED: no",
  "CANDIDATE: Y | nonpartisan | none",
  "- [ A ] [+] [Record] 2025: c | https://example.org/source",
  "RED LINE CROSSED: Yes: convicted | https://example.org/source",
].join("\n"));
assert.deepStrictEqual(r.errors, []);
assert.deepStrictEqual(rows(r), [["X", 60, "low"], ["Y", 20, "low"]]);
assert.strictEqual(r.result.call, "X");

// Demo measure "Prop 1": one gray-area STATED item -> YES 50, NO 50, Toss-up.
r = calculate("A=3, B=2", "MEASURE: Prop 1\nEVIDENCE:\n- [B][0][STATED]: neutral | https://example.org/source\nCLAIMS CHECKED:\n- a claim: TRUE | https://example.org/source");
assert.deepStrictEqual(rows(r), [["YES", 50, "low"], ["NO", 50, "low"]]);
assert.strictEqual(r.result.call, "Toss-up");

// Demo funder flood: 2 good records + 8 hostile funders -> P 60; Q has no evidence -> Not enough evidence.
r = calculate("A=3", ["CANDIDATE: P", ...Array(2).fill("- [A][+][RECORD] r"), ...Array(8).fill("- [A][-][FUNDER] f"), "CANDIDATE: Q"].join("\n"));
assert.strictEqual(r.result.rows[0].score, 60);
assert.strictEqual(r.result.rows[1].score, null);
assert.strictEqual(r.result.call, "Not enough evidence");

// Python-compatible rounding (half to even), e.g. 50 - 37.5 = 12.5 -> 12 in score.py.
assert.deepStrictEqual([0.5, 1.5, 2.5, 12.5, 12.6].map(pyRound), [0, 2, 2, 12, 13]);

// Invalid evidence lines are reported and skipped, not fatal.
r = calculate("A=3", "CANDIDATE: Z\n- [A][+][RECORD] ok\n- [C][+][RECORD] bad axis\n- [A][?][RECORD] bad sign\n- [A][+][RUMOR] bad kind\n- [A] RECORD unreadable");
assert.strictEqual(r.errors.length, 4);
assert.strictEqual(r.result.rows[0].items, 1);

// Profile parsing: template placeholders are ignored; first weight for a letter wins.
const w = parseWeights("A | {{name}} | {{meaning}} | weight {{1-3}}\nA | Mine | m | weight 2\nAddress: 1 Main St\nA | Example | m | weight 3");
assert.deepStrictEqual(w.weights, {A: 2});
assert.strictEqual(w.warnings.length, 1);

console.log("calc_test: all checks passed");

// Unopposed candidates: absolute cutoffs, same as score.py.
{
  const w = {A: 1};
  const solo = sign => scoreRace([{name: "Z", red_line: false, evidence: sign === null ? [] : [{axis: "A", sign, kind: "record"}]}], w, false).call;
  if (solo("+") !== "Vote for Z" || solo("0") !== "Your call" || solo("-") !== "Consider leaving blank or writing in" || solo(null) !== "Not enough evidence")
    { console.error("unopposed checks failed"); process.exit(1); }
  console.log("calc_test: unopposed checks passed");
}
