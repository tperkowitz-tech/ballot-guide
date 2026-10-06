// Checks the profile and Copy-for-chat text built by tools/kit.js. Run: node tools/kit_test.js
const assert = require("assert");
const {WEB_GATE, ADDRESS_WITHHELD, defaultState, letters, focusRuleSentence, buildProfile, fillStep, forChat,
  parseBallot, raceText, measureText, bundleAnswers} = require("./kit.js");
const {parseWeights} = require("./calc.js");

assert.deepStrictEqual(letters(4), ["A", "B", "C", "D"]);

// Neutral: no axes or values sections, has the neutral line; filled-in values stay out.
let s = defaultState();
s.axes[0].name = "Hidden";
s.gray = "something";
let p = buildProfile(s);
assert.ok(p.startsWith("VALUES PROFILE\nAddress: withheld (not needed for this step)\nElection date: not given\nMode: Neutral comparison\n"));
assert.ok(p.includes("Neutral mode: do not collect values, score, rank, or recommend."));
assert.ok(!/Value axes|Hidden|Gray areas|Viability/.test(p));
assert.ok(p.endsWith("Crowded races (5+ candidates): research every candidate"));

// Values: axes lettered with weights; empty optional sections omitted; calc reads the same lines.
s = defaultState();
Object.assign(s, {mode: "values", address: "1 Main St", date: "2026-11-03", gray: "\n  drug policy \n\n", viability: true});
s.axes = [{name: "Public services", meaning: "Fund schools", weight: 3}, {name: "Tax level", meaning: "Lower taxes", weight: 1}];
p = buildProfile(s, true);
assert.ok(p.includes("Address: 1 Main St\nElection date: 2026-11-03\nMode: Values match\n"));
assert.ok(p.includes("Value axes:\nA | Public services | Fund schools | weight 3\nB | Tax level | Lower taxes | weight 1\n"));
assert.ok(p.includes("Gray areas:\n- drug policy\n"));
assert.ok(!/Red lines|Personal stakes|Neutral mode/.test(p));
assert.ok(p.includes("Viability: show separately"));
assert.deepStrictEqual(parseWeights(p).weights, {A: 3, B: 1});

// Focus rule: sentence from filled fields; blank/negative thresholds ignored; nothing filled -> everyone.
s = defaultState();
s.crowded = "focus";
assert.strictEqual(focusRuleSentence(s), "");
assert.ok(buildProfile(s).endsWith("research every candidate"));
Object.assign(s, {minShare: "5", minMoney: "10000", includeOffice: true, always: "Pat Doe"});
assert.strictEqual(focusRuleSentence(s),
  "research candidates who meet any of these: at least 5% of the vote in a certified primary or polling average; " +
  "at least $10,000 in reported contributions; holds or held elected office, and always include Pat Doe");
assert.ok(buildProfile(s).endsWith("focus rule: " + focusRuleSentence(s) + "; excluded candidates are listed with the rule they missed."));
Object.assign(s, {minShare: "-1", minMoney: " ", includeOffice: false});
assert.strictEqual(focusRuleSentence(s), "always include Pat Doe");

// Step 3 / 4 substitution: only the RACE:/MEASURE: placeholder; "$" in user text stays literal.
const step3 = "TASK: x\nRACE: {{office, position, ALL candidates on the ballot}}\nCANDIDATE: {{name}}";
assert.strictEqual(fillStep(3, step3, s, {race: " Mayor: A vs B $& "}), "TASK: x\nRACE: Mayor: A vs B $&\nCANDIDATE: {{name}}");
assert.strictEqual(fillStep(3, step3, s, {race: "  "}), step3);
const step4 = "MEASURE: {{name/number}}\nOUTPUT FORMAT:\nMEASURE: {{name}}";
assert.strictEqual(fillStep(4, step4, s, {measure: "Prop 1"}), "MEASURE: Prop 1\nOUTPUT FORMAT:\nMEASURE: {{name}}");

// Step 7 gets the neutral table line only in neutral mode.
assert.ok(fillStep(7, "build", defaultState()).endsWith("\n\nNeutral mode: no scores, best matches or calls; use | Race | Choices | Key sourced differences |."));
assert.strictEqual(fillStep(7, "build", {...defaultState(), mode: "values"}), "build");

// Copy for chat: web gate, rules, profile, step; Step 0 = rules only; Step 1 = profile only.
s = defaultState();
const prof = buildProfile(s);
const G = WEB_GATE + "\n\n";
assert.ok(WEB_GATE.startsWith("First: if you cannot open web pages in this chat, and no source pages are pasted below, reply only with NO WEB ACCESS and stop."));
assert.strictEqual(forChat(3, "RULES", step3, s, {race: "Mayor"}), G + "RULES\n\n" + prof + "\n\n" + fillStep(3, step3, s, {race: "Mayor"}));
assert.strictEqual(forChat(0, "RULES", "RULES", s), G + "RULES");
assert.strictEqual(forChat(1, "RULES", "template", s), G + prof);
assert.strictEqual(forChat(6, "R", "check", s, {attach: "ANSWERS"}), G + "R\n\n" + prof + "\n\ncheck\n\nANSWERS");
for (let i = 0; i < 8; i++) assert.ok(forChat(i, "R", "x", s).startsWith(WEB_GATE), "gate on step " + i);

// The address goes only to the ballot lookup (Step 2); every other copy withholds it.
s = {...defaultState(), address: "77 Example Rd"};
for (let i = 0; i < 8; i++) {
  const t = forChat(i, "R", "x", s, {attach: "a"});
  assert.strictEqual(t.includes("77 Example Rd"), i === 2, "address on step " + i);
  if (i >= 1 && i !== 2) assert.ok(t.includes(ADDRESS_WITHHELD), "withheld line on step " + i);
}
assert.ok(!buildProfile(s).includes("77 Example Rd"));

// Step 2 answer -> checklist rows, tolerant of markdown bullets, bold, tables and "source:".
const ballot = [
  "**DISTRICTS**",
  "- Council: District 9 | source: https://example.org/d",
  "## RACES",
  "- City Council | Position 2 | Candidate X vs Candidate Y | CONTESTED | source: https://example.org/a",
  "* **Mayor** | Candidate Z | uncontested | https://example.org/b",
  "| Office | Position | Candidates | Status | Source |",
  "|---|---|---|---|---|",
  "| School Board | Seat 4 | A vs B vs C vs D vs E | CROWDED | https://example.org/c |",
  "1. Something without columns",
  "MEASURES:",
  "1. Measure 1 | Raises the library levy | source: https://example.org/m",
  "- None",
  "UNVERIFIED",
  "- Sheriff | ? | ?",
].join("\n");
const b = parseBallot(ballot);
assert.deepStrictEqual(b.races, [
  {office: "City Council", position: "Position 2", candidates: "Candidate X vs Candidate Y", status: "CONTESTED", source: "https://example.org/a"},
  {office: "Mayor", position: "", candidates: "Candidate Z", status: "UNCONTESTED", source: "https://example.org/b"},
  {office: "School Board", position: "Seat 4", candidates: "A vs B vs C vs D vs E", status: "CROWDED", source: "https://example.org/c"},
]);
assert.deepStrictEqual(b.measures, [{name: "Measure 1", summary: "Raises the library levy", source: "https://example.org/m"}]);
assert.deepStrictEqual(b.skipped, ["Something without columns"]);
assert.ok(!JSON.stringify(b).includes("District 9"), "DISTRICTS are not kept");
assert.strictEqual(raceText(b.races[0]), "City Council, Position 2: Candidate X vs Candidate Y");
assert.strictEqual(raceText(b.races[1]), "Mayor: Candidate Z");
assert.strictEqual(measureText(b.measures[0]), "Measure 1 (Raises the library levy)");
assert.strictEqual(parseBallot("no headings here").sawHeading, false);

// Steps 6/7 bundle: ballot list, then each answer under its own header.
const bundle = bundleAnswers([
  {kind: "race", text: "Mayor: Candidate Z", note: "UNCONTESTED", answer: " CANDIDATE: Z\n", calc: "Call: Vote for Z"},
  {kind: "measure", text: "Measure 1", note: "", answer: ""},
]);
assert.strictEqual(bundle, [
  "BALLOT LIST (from Step 2)", "- RACE: Mayor: Candidate Z | UNCONTESTED", "- MEASURE: Measure 1", "",
  "=== RACE 1 OF 2: Mayor: Candidate Z ===", "CANDIDATE: Z", "CALCULATOR: Call: Vote for Z", "",
  "=== MEASURE 2 OF 2: Measure 1 ===", "(no answer pasted yet)"].join("\n"));

console.log("kit_test: all checks passed");
