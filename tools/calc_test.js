// Checks tools/calc.js against the cases `python3 ballot-guide/scripts/score.py --demo` asserts,
// then fuzzes both calculators for identical results. Run: node tools/calc_test.js
const assert = require("assert");
const path = require("path");
const {spawnSync} = require("child_process");
const {pyRound, parseWeights, parseResearch, calculate, scoreRace} = require("./calc.js");

const rows = r => r.result.rows.map(o => [o.name, o.score, o.evidence]);

// X: A record + (p=3/6) and B funder - (p=-1/4): 50 + 50*(3*0.5 - 2*0.25)/5 = 60, thin.
// Y crosses a red line: keeps its 65 but is excluded, so X is called alone (thin -> "Your call").
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
assert.deepStrictEqual(rows(r), [["X", 60, "thin"], ["Y", 65, "thin"]]);
assert.strictEqual(r.result.rows[1].excluded, "red line: convicted | https://example.org/source");
assert.strictEqual(r.result.call, "Your call");

// Measure: one mixed STATED item -> YES 50 only (no NO row), Toss-up.
r = calculate("A=3, B=2", "MEASURE: Prop 1\nEVIDENCE:\n- [B][0][STATED]: neutral | https://example.org/source\nCLAIMS CHECKED:\n- a claim: TRUE | https://example.org/source");
assert.deepStrictEqual(rows(r), [["YES", 50, "thin"]]);
assert.strictEqual(r.result.call, "Toss-up");

// Funder flood: 2 records + 8 hostile funders (one entry, mean -1) -> (6-1)/(6+1+3) -> 75; Q has no evidence.
r = calculate("A=3", ["CANDIDATE: P", "- [A][+][RECORD] r1", "- [A][+][RECORD] r2", ...[...Array(8).keys()].map(i => `- [A][-][FUNDER] f${i}`), "CANDIDATE: Q"].join("\n"));
assert.strictEqual(r.result.rows[0].score, 75);
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

// Markdown-dressed output must score exactly like the plain race above.
const W2 = "A | One | m | weight 3\nB | Two | m | weight 2";
const variants = {
  bold: ["**CANDIDATE: X | nonpartisan | none**", "- **[A][+][RECORD]** 2025: a | u", "* **[B][-][FUNDER]** b | u",
    "**CANDIDATE: Y**", "• [A][+][RECORD] c | u", "**RED LINE CROSSED:** yes | u"],
  numbered: ["### CANDIDATE: X", "1. [A][+][RECORD] a | u", "2) [B][-][FUNDER] b | u",
    "## CANDIDATE: Y", "1. [A][+][RECORD] c | u", "RED LINE CROSSED: yes"],
  words: ["CANDIDATE: X", "- [A][plus][record] a | u", "- [B][Opposes][Funder] b | u",
    "CANDIDATE: Y", "- [A][positive][Record] c | u", "RED LINE CROSSED: yes"],
  table: ["CANDIDATE: X", "| Axis | Sign | Kind | Fact | Source |", "|---|---|---|---|---|",
    "| A | + | RECORD | a | u |", "| **B** | minus | funder | b | u |",
    "CANDIDATE: Y", "| A | supports | Record | c | u |", "RED LINE CROSSED: yes"],
};
for (const [label, lines] of Object.entries(variants)) {
  r = calculate(W2, lines.join("\n"));
  assert.deepStrictEqual(r.errors, [], label);
  assert.deepStrictEqual(rows(r), [["X", 60, "thin"], ["Y", 65, "thin"]], label);
  assert.strictEqual(r.result.call, "Your call", label);
}
// Sign words for mixed: neutral, mixed and 0 all count as 0.
r = calculate("A=3", "MEASURE: M\n- [A][neutral][STATED] a\n- [A][Mixed][STATED] b\n- [A][0][STATED] c");
assert.deepStrictEqual(r.errors, []);
assert.strictEqual(r.result.rows[0].score, 50);

// Nothing is dropped silently: unreadable evidence-looking lines warn, and an option with
// text but no parsed items warns by name.
r = calculate("A=3", "CANDIDATE: X\n- A, +, RECORD: voted yes | u\n- (A)(+)(FUNDER) donor\n- [a] stray\nGAPS: none\nCANDIDATE: Y\nSome prose about Y.");
assert.deepStrictEqual(r.errors.map(e => e.line), ["A, +, RECORD: voted yes | u", "(A)(+)(FUNDER) donor", "[a] stray", "", ""]);
assert.ok(r.errors[3].msg.includes("No evidence lines recognized for X; check the format"));
assert.ok(r.errors[4].msg.includes("No evidence lines recognized for Y; check the format"));
r = calculate("A=3", "MEASURE: Prop 9\nWHAT YES DOES: things\nEVIDENCE:\n- A + RECORD funds schools");
assert.ok(r.errors.some(e => e.msg.includes("No evidence lines recognized for Prop 9")));
// A candidate with only RED LINE/GAPS lines has no text to misread, so no format warning.
r = calculate("A=3", "CANDIDATE: P\n- [A][+][RECORD] r\nCANDIDATE: Q\nRED LINE CROSSED: no\nGAPS: no records found");
assert.deepStrictEqual(r.errors, []);

console.log("calc_test: all checks passed");

// Unopposed candidates: absolute cutoffs, but thin evidence is always "Your call".
{
  const w = {A: 1};
  const recs = sign => [0, 1, 2].map(i => ({axis: "A", sign, kind: "record", event: "e" + i}));
  const solo = ev => scoreRace([{name: "Z", red_line: false, evidence: ev}], w, false).call;
  assert.strictEqual(solo(recs("+")), "Vote for Z");
  assert.strictEqual(solo(recs("0")), "Your call");
  assert.strictEqual(solo(recs("-")), "Consider leaving blank or writing in");
  assert.strictEqual(solo([]), "Not enough evidence");
  assert.strictEqual(solo(recs("+").slice(0, 1)), "Your call"); // 75 on one record: thin
  console.log("calc_test: unopposed checks passed");
}

// Table rows meant as evidence but with an unreadable kind must warn, not vanish.
{
  const r = calculate("A=3\nB=2", "CANDIDATE: X\n| A | + | RECORD | real | u |\n| B | - | Records | donor | u |\n| B | - | funding | donor | u |\n| B | - | Voting record | v | u |");
  assert.strictEqual(r.errors.length, 3, "three unreadable table rows warn");
  console.log("calc_test: table warning checks passed");
}

// Scoring model v2: the same cases score.py --demo asserts.
{
  const ev = (axis, sign, kind, extra) => ({axis, sign, kind, ...extra});
  const one = (w, opts, measure) => scoreRace(opts, w, !!measure);
  const eq4 = "A=2, B=2, C=2, D=2";
  // Same fact as 4 rows (same source and date) == 1 row.
  const fact = "- [A][+][RECORD] 2025-01-02: voted for the bill | https://example.org/v";
  const four = calculate(eq4, ["CANDIDATE: X", fact, fact, fact, fact].join("\n"));
  const single = calculate(eq4, ["CANDIDATE: X", fact].join("\n"));
  assert.deepStrictEqual(four.result.rows.map(o => [o.score, o.events]), single.result.rows.map(o => [o.score, o.events]));
  assert.deepStrictEqual(four.result.rows[0].gray, []);
  // One statement on 1 of 4 equal axes -> 53, thin.
  let r = calculate(eq4, "CANDIDATE: X\n- [A][+][STATED] 2025: said so | https://example.org/s");
  assert.deepStrictEqual([r.result.rows[0].score, r.result.rows[0].evidence, r.result.rows[0].coverage], [53, "thin", 0.25]);
  // Opposing record + favorable funder: the funder moves the score <= 12.5 (25 -> 36).
  assert.strictEqual(one({A: 3}, [{name: "X", evidence: [ev("A", "-", "record")]}]).rows[0].score, 25);
  assert.strictEqual(one({A: 3}, [{name: "X", evidence: [ev("A", "-", "record"), ev("A", "+", "funder")]}]).rows[0].score, 36);
  // Gray rows (sign words or the flag) leave the score unchanged and are listed.
  const base = calculate(eq4, "CANDIDATE: X\n- [A][+][RECORD] r");
  r = calculate(eq4, "CANDIDATE: X\n- [A][+][RECORD] r\n- [B][grey][STATED] torn topic\n- [C][torn][RECORD] t\n- [D][G][FUNDER] g");
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.result.rows[0].score, base.result.rows[0].score);
  assert.deepStrictEqual(r.result.rows[0].gray.map(g => g.text), ["torn topic", "t", "g"]);
  assert.strictEqual(one({A: 1}, [{name: "X", evidence: [ev("A", "+", "record", {gray: true}), ev("A", "+", "stated")]}]).rows[0].score, 62); // 62.5 rounds half to even
  // Four copies of one tagged record cannot give "strong".
  r = calculate("A=1", ["CANDIDATE: X", ...Array(4).fill("- [A][+][RECORD][hb1] 2025: voted | https://example.org/hb1")].join("\n"));
  assert.deepStrictEqual([r.result.rows[0].events, r.result.rows[0].records, r.result.rows[0].evidence], [1, 1, "thin"]);
  // Validation errors.
  assert.deepStrictEqual(one({A: 1}, []).errors, ["race has no options"]);
  assert.deepStrictEqual(one({A: 9}, [{name: "X", evidence: []}]).errors, ["weight for A must be an integer 1-3 (found 9)"]);
  // Conflicting same-kind tags on one event: warning, sign 0.
  r = calculate("A=1", "CANDIDATE: X\n- [A][+][RECORD][e1] a\n- [A][-][RECORD][e1] b");
  assert.strictEqual(r.result.rows[0].score, 50);
  assert.ok(r.warnings.some(w => w.includes("conflicting tags for one event (e1)")));
  // Red-lined leader is excluded; the other option is called.
  const strong = [ev("A", "+", "record", {event: "a1"}), ev("A", "+", "record", {event: "a2"}), ev("B", "+", "record", {event: "b1"})];
  r = one({A: 2, B: 1}, [{name: "X", red_line: true, evidence: strong.concat([ev("B", "+", "record", {event: "b2"})])}, {name: "Y", evidence: strong}]);
  assert.deepStrictEqual([r.call, r.rows[0].excluded, r.rows[0].score > r.rows[1].score], ["Vote for Y", "red line", true]);
  assert.strictEqual(one({A: 1}, [{name: "X", red_line: true, evidence: []}]).call, "All options crossed a red line");
  // One event decides the leader -> toss-up naming it.
  r = calculate("A=1", "CANDIDATE: X\n- [A][+][RECORD] 2024-05-01: voted for HB 1 | https://example.org/hb1\nCANDIDATE: Y\n- [A][0][RECORD] mixed record");
  assert.strictEqual(r.result.call, "Toss-up (turns on: 2024-05-01: voted for HB 1 | https://example.org/hb1)");
  assert.strictEqual(r.result.turns_on, "2024-05-01: voted for HB 1 | https://example.org/hb1");
  // Robust lead: clear with coverage, lean without.
  const x = ["A", "B"].flatMap(a => [0, 1, 2].map(i => ev(a, "+", "record", {event: a + i})));
  const y = ["A", "B"].flatMap(a => [0, 1, 2].map(i => ev(a, "-", "record", {event: a + i})));
  assert.strictEqual(one({A: 1, B: 1}, [{name: "X", evidence: x}, {name: "Y", evidence: y}]).call, "X");
  assert.strictEqual(one({A: 1, B: 1, C: 3, D: 3}, [{name: "X", evidence: x}, {name: "Y", evidence: y}]).call, "Lean X");
  // Measures: YES only; clear, lean, toss-up.
  r = one({A: 1, B: 1}, [{name: "YES", evidence: x}], true);
  assert.deepStrictEqual([r.call, r.rows.map(o => o.name)], ["YES", ["YES"]]);
  assert.strictEqual(one({A: 1, B: 1}, [{name: "YES", evidence: y}], true).call, "NO");
  assert.strictEqual(one({A: 1, B: 3}, [{name: "YES", evidence: x.slice(0, 3)}], true).call, "Lean YES");
  assert.strictEqual(one({A: 1}, [{name: "YES", evidence: [ev("A", "+", "stated", {event: "ad"})]}], true).call, "Toss-up (turns on: ad)");
  assert.strictEqual(one({A: 1}, [{name: "YES", evidence: [ev("A", "0", "record")]}], true).call, "Toss-up");
  // Parser: event bracket, source and date (the "https:" colon is not the date colon).
  const p = parseResearch("CANDIDATE: X\n- [A][+][RECORD][ hb1217 ] 2025-03-04: voted | https://example.org/a\n- [A][-][STATED] said 1999 things | https://example.org/b", {A: 1});
  assert.deepStrictEqual(p.options[0].evidence.map(e => [e.event, e.date, e.source]),
    [["hb1217", "2025-03-04", "https://example.org/a"], [undefined, undefined, "https://example.org/b"]]);
  // Event keys: same URL (no date/event) == 1 row; same text (no URL) == 1 row; distinct event ids count twice.
  const sameUrl = "- [A][+][RECORD] voted | https://example.org/v";
  const urlRows = [sameUrl, "- [A][+][RECORD] voted again | https://Example.ORG/v/?utm=1#x", sameUrl, sameUrl];
  r = calculate(eq4, ["CANDIDATE: X", ...urlRows].join("\n"));
  assert.deepStrictEqual(rows(r), rows(calculate(eq4, "CANDIDATE: X\n" + sameUrl)));
  assert.deepStrictEqual([r.result.rows[0].events, r.warnings], [1, []]);
  r = calculate(eq4, "CANDIDATE: X\n" + Array(4).fill("- [A][+][RECORD] 2025: voted for HB 1").join("\n"));
  assert.deepStrictEqual(rows(r), rows(calculate(eq4, "CANDIDATE: X\n- [A][+][RECORD] voted  for hb 1")));
  assert.deepStrictEqual(r.warnings, ["X: No source: duplicates of this line cannot be detected (2025: voted for HB 1)."]);
  r = calculate(eq4, "CANDIDATE: X\n- [A][+][RECORD][a] one | https://example.org/v\n- [A][+][RECORD][b] two | https://example.org/v");
  assert.strictEqual(r.result.rows[0].events, 2);
  // Funders: eight favorable == one (62.5 -> 62); opposing record + 8 favorable funders moves <= 12.5 (25 -> 36).
  const fund = n => [...Array(n).keys()].map(i => ev("A", "+", "funder", {source: `https://example.org/f${i}`}));
  const solo = evs => one({A: 3}, [{name: "X", evidence: evs}]).rows[0].score;
  assert.deepStrictEqual([solo(fund(8)), solo(fund(1))], [62, 62]);
  assert.strictEqual(solo([ev("A", "-", "record")].concat(fund(8))), 36);
  // Statements only: robust gap, full coverage, thin evidence -> lean (race and measure).
  const sx = [0, 1, 2].map(i => ev("A", "+", "stated", {event: "s" + i}));
  const sy = [0, 1, 2].map(i => ev("A", "-", "stated", {event: "s" + i}));
  r = one({A: 1}, [{name: "X", evidence: sx}, {name: "Y", evidence: sy}]);
  assert.deepStrictEqual([r.call, r.rows[0].score, r.rows[0].evidence], ["Lean X", 75, "thin"]);
  assert.strictEqual(one({A: 1}, [{name: "YES", evidence: sx}], true).call, "Lean YES");
  assert.strictEqual(one({A: 1}, [{name: "YES", evidence: sy}], true).call, "Lean NO");
  // A measure must have exactly one option.
  assert.deepStrictEqual(one({A: 1}, [{name: "YES", evidence: []}, {name: "NO", evidence: []}], true).errors,
    ["a measure must have exactly one option, the YES side (found 2)"]);
  // Red line text and source are kept; a bare yes stays "red line".
  const red = line => calculate("A=1", `CANDIDATE: X\n- [A][+][RECORD] r\n${line}`).result.rows[0].excluded;
  assert.strictEqual(red("RED LINE CROSSED: yes: took a bribe | https://example.org/c"), "red line: took a bribe | https://example.org/c");
  assert.strictEqual(red("RED LINE CROSSED: yes | https://example.org/c"), "red line: https://example.org/c");
  assert.strictEqual(red("RED LINE CROSSED: Yes"), "red line");
  assert.strictEqual(red("RED LINE CROSSED: no"), null);
  console.log("calc_test: v2 model checks passed");
}

// Parity fuzz: the same random races through score.py (JSON round trip) and calc.js.
{
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const maybe = (p, v) => rnd() < p ? v : undefined;
  const cases = [];
  for (let n = 0; n < 2000; n++) {
    const letters = ["A", "B", "C", "D", "E"].slice(0, 1 + Math.floor(rnd() * 4));
    const axes = {};
    for (const a of letters) axes[a] = rnd() < 0.02 ? pick([0, 4, 9]) : 1 + Math.floor(rnd() * 3);
    const measure = rnd() < 0.25;
    const nOpts = rnd() < 0.02 ? 0 : measure && rnd() < 0.95 ? 1 : 1 + Math.floor(rnd() * 3);
    const options = [];
    for (let o = 0; o < nOpts; o++) {
      const evidence = [];
      const nEv = Math.floor(rnd() * 8);
      for (let e = 0; e < nEv; e++) {
        evidence.push({
          axis: rnd() < 0.01 ? "Z" : pick(letters),
          sign: rnd() < 0.01 ? "?" : pick(["+", "+", "-", "-", "0", "gray"]),
          kind: rnd() < 0.01 ? "rumor" : pick(["record", "record", "stated", "funder"]),
          event: maybe(0.4, pick(["e1", "e2", "e3"])),
          source: maybe(0.4, pick(["https://a.example", "https://b.example", "HTTPS://A.Example/", "https://a.example?q=1#f", ""])),
          date: maybe(0.5, pick(["2024", "2025-01-02"])),
          gray: maybe(0.05, true),
          text: maybe(0.6, pick(["fact " + e, "Same  fact", "[A][+][RECORD] 2025: same fact", "2024-01-02: same FACT", ""])),
        });
      }
      options.push({name: measure ? "YES" : "O" + o, red_line: rnd() < 0.15 && pick([true, "", " bribe ", "bribe | https://c.example"]), evidence});
    }
    cases.push(JSON.parse(JSON.stringify({axes, race: {race: "R" + n, measure, options}})));
  }
  const py = spawnSync("python3", ["-c", `
import json, sys
sys.path.insert(0, sys.argv[1])
from score import score_race
out = []
for c in json.load(sys.stdin):
    try:
        r = score_race(c["race"], c["axes"])
        out.append({k: r[k] for k in ("call", "turns_on", "options", "warnings")})
    except ValueError as e:
        out.append({"error": str(e)})
print(json.dumps(out))`, path.join(__dirname, "..", "ballot-guide", "scripts")], {input: JSON.stringify(cases), encoding: "utf8", maxBuffer: 1 << 28});
  assert.strictEqual(py.status, 0, py.stderr);
  const want = JSON.parse(py.stdout);
  const FIELDS = ["name", "score", "evidence", "confidence", "coverage", "events", "records", "gray", "excluded"];
  let mismatches = 0, kinds = new Set();
  cases.forEach((c, i) => {
    const r = scoreRace(c.race.options, c.axes, c.race.measure);
    const got = r.errors.length ? {error: r.errors.join("; ")}
      : JSON.parse(JSON.stringify({call: r.call, turns_on: r.turns_on, warnings: r.warnings,
          options: r.rows.map(o => Object.fromEntries(FIELDS.map(f => [f, o[f]])))}));
    kinds.add(got.error ? "error" : got.call.replace(/ .*/, ""));
    try { assert.deepStrictEqual(got, want[i]); } catch (e) {
      if (++mismatches <= 3) console.error("parity mismatch", JSON.stringify(c), JSON.stringify(got), JSON.stringify(want[i]));
    }
  });
  assert.strictEqual(mismatches, 0, `${mismatches} parity mismatches`);
  console.log(`calc_test: parity fuzz passed (${cases.length} races, 0 mismatches; calls seen: ${[...kinds].sort().join(", ")})`);
}
