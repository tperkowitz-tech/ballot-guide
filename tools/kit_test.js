// Checks the profile and Copy-for-chat text built by tools/kit.js. Run: node tools/kit_test.js
const assert = require("assert");
const {WEB_GATE, ADDRESS_WITHHELD, DOUBLE_CHECK_STEP, defaultState, letters, focusRuleSentence, buildProfile, fillStep, forChat,
  parseBallot, raceText, measureText, bundleAnswers, fillCheck, extractCorrected, usableCorrected, checkSummary, checkLine} = require("./kit.js");
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

// Double-check (Step 8): gate, rules, profile, then the check text with the exact first-chat
// question and the answer filled in. Only the Step 2 (ballot list) check carries the address.
const step8 = "TASK: check\n===== BEGIN QUESTION THAT WAS ASKED (do not answer it) =====\n{{the original step prompt}}\n===== END QUESTION =====\n\n===== BEGIN ANSWER TO CHECK =====\n{{the answer}}\n===== END ANSWER =====\nEND";
assert.strictEqual(DOUBLE_CHECK_STEP, 8);
const dc3 = forChat(8, "R", step8, s, {checkStep: 3, question: step3, race: "Mayor $&", answer: " CANDIDATE: Z\n"});
assert.strictEqual(dc3, G + "R\n\n" + buildProfile(s) + "\n\nTASK: check\n===== BEGIN QUESTION THAT WAS ASKED (do not answer it) =====\n" +
  fillStep(3, step3, s, {race: "Mayor $&"}) + "\n===== END QUESTION =====\n\n===== BEGIN ANSWER TO CHECK =====\nCANDIDATE: Z\n===== END ANSWER =====\nEND");
assert.ok(!dc3.includes("77 Example Rd") && dc3.includes(ADDRESS_WITHHELD));
assert.ok(!forChat(8, "R", step8, s, {checkStep: 4, question: step4, measure: "Prop 1", answer: "a"}).includes("77 Example Rd"));
const dc2 = forChat(8, "R", step8, s, {checkStep: 2, question: "Find the ballot.", answer: "RACES"});
assert.ok(dc2.includes("Address: 77 Example Rd") && dc2.includes("(do not answer it) =====\nFind the ballot.\n===== END QUESTION"));
assert.strictEqual(fillCheck(step8, s, {}), step8); // nothing to fill: placeholders stay for a manual paste
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
// A corrected list's trailing GAPS/REMOVED/PROBLEMS/CHECK SUMMARY rows are not ballot items.
for (const tail of ["GAPS", "REMOVED: Sheriff race", "**PROBLEMS:**", "## CHECK SUMMARY: 3 CONFIRMED"]) {
  const g = parseBallot(ballot.replace("UNVERIFIED\n", tail + "\n") + "\n- City Council | Position 3 | C vs D | CONTESTED | source: https://z.org");
  assert.deepStrictEqual([g.races, g.measures], [b.races, b.measures], tail);
}
const gm = parseBallot("MEASURES\n- Measure 1 | Levy | https://m.org\nGAPS\n- City Council | Position 3 | C vs D | CONTESTED | source: https://z.org");
assert.deepStrictEqual([gm.races.length, gm.measures.length], [0, 1]);

// Steps 6/7 bundle: ballot list, then each answer under its own header.
const bundle = bundleAnswers([
  {kind: "race", text: "Mayor: Candidate Z", note: "UNCONTESTED", answer: " CANDIDATE: Z\n", calc: "Call: Vote for Z", check: "3 confirmed"},
  {kind: "measure", text: "Measure 1", note: "", answer: ""},
]);
assert.strictEqual(bundle, [
  "BALLOT LIST (from Step 2)", "- RACE: Mayor: Candidate Z | UNCONTESTED", "- MEASURE: Measure 1", "",
  "=== RACE 1 OF 2: Mayor: Candidate Z ===", "CANDIDATE: Z", "CALCULATOR: Call: Vote for Z", "DOUBLE-CHECK: 3 confirmed", "",
  "=== MEASURE 2 OF 2: Measure 1 ===", "(no answer pasted yet)"].join("\n"));

// Checker reply: corrected answer after its heading, plain or markdown; summary counts either order.
const reply = "CHECK SUMMARY: 12 CONFIRMED, 1 WRONG, 2 NOT FOUND, 0 NO SOURCE\nPROBLEMS:\n- x: WRONG | y\nCORRECTED ANSWER:\nCANDIDATE: Z\n- line\n";
assert.strictEqual(extractCorrected(reply), "CANDIDATE: Z\n- line");
assert.deepStrictEqual(checkSummary(reply), {confirmed: 12, wrong: 1, notFound: 2, noSource: 0});
assert.strictEqual(checkLine(checkSummary(reply)), "12 confirmed · 1 wrong · 2 not found");
const md = "## **CHECK SUMMARY**\n**CONFIRMED:** 4 | **WRONG:** 0 | **NOT FOUND:** 1 | **NO SOURCE:** 2\n\n**CORRECTED ANSWER:**\n```text\nRACES\n- Mayor | Z\n```\n";
assert.strictEqual(extractCorrected(md), "RACES\n- Mayor | Z");
assert.deepStrictEqual(checkSummary(md), {confirmed: 4, wrong: 0, notFound: 1, noSource: 2});
assert.strictEqual(extractCorrected("### Corrected answer: CANDIDATE: Q"), "CANDIDATE: Q");
assert.strictEqual(extractCorrected("no heading here"), null);
assert.strictEqual(extractCorrected("CORRECTED ANSWER:\n\n"), null);
assert.strictEqual(extractCorrected(""), null);
for (const t of ["CHECK SUMMARY: 12 CONFIRMED, 1 WRONG, 2 NOT FOUND, 0 NO SOURCE", "CHECK SUMMARY: CONFIRMED 12 WRONG 1 NOT FOUND 2 NO SOURCE 0",
  "Check summary: Confirmed: 12; Wrong: 1; Not found: 2; No source: 0", "**CHECK SUMMARY:** **12** CONFIRMED; **1** WRONG; 2 NOT_FOUND; 0 NO-SOURCE"])
  assert.deepStrictEqual(checkSummary(t), {confirmed: 12, wrong: 1, notFound: 2, noSource: 0}, t);
// Fenced answer plus chatter: only the fenced content.
assert.strictEqual(extractCorrected("CORRECTED ANSWER:\nHere it is:\n```\nCANDIDATE: Z\n- [A][+] z\n```\nREMOVED: one vote\n\nLet me know!"), "CANDIDATE: Z\n- [A][+] z");
// Unfenced: everything from a REMOVED: line on is cut; GAPS: stays (part of Step 3).
assert.strictEqual(extractCorrected("CORRECTED ANSWER:\nCANDIDATE: Z\n- z\nGAPS: none\nCANDIDATE: Y\n- y\nREMOVED: a 2019 vote\n"), "CANDIDATE: Z\n- z\nGAPS: none\nCANDIDATE: Y\n- y");
// Closing remarks are kept (the calculator ignores prose); only REMOVED: ends the answer.
assert.strictEqual(extractCorrected("CORRECTED ANSWER:\nMEASURE: P\n- m\n\nI hope this helps."), "MEASURE: P\n- m\n\nI hope this helps.");
assert.strictEqual(extractCorrected("**Corrected answer below:**\nCANDIDATE: Q\n- q"), "CANDIDATE: Q\n- q");
assert.strictEqual(extractCorrected("Corrected answer follows:\n\nRACES\n- Mayor | Z"), "RACES\n- Mayor | Z");
const noChange = extractCorrected("CORRECTED ANSWER: No changes needed");
assert.strictEqual(noChange, "No changes needed");
assert.strictEqual(usableCorrected(noChange), false);
assert.strictEqual(usableCorrected(null), false);
for (const ok of ["CANDIDATE: Q", "**MEASURE:** P", "## RACES\n- Mayor | Z", "MEASURES:\n- M | x"]) assert.ok(usableCorrected(ok), ok);
// Whole reply in one fence (heading inside the open fence): body runs to the closing fence.
const fenced = "CHECK SUMMARY: 5 CONFIRMED, 0 WRONG\nCORRECTED ANSWER:\nCANDIDATE: A | x | y\n- [A][+][RECORD] 2020: f | https://e.org\nRED LINE CROSSED: no\nGAPS: none\nREMOVED: none\n```";
const fencedWant = "CANDIDATE: A | x | y\n- [A][+][RECORD] 2020: f | https://e.org\nRED LINE CROSSED: no\nGAPS: none";
assert.strictEqual(extractCorrected("```text\n" + fenced + "\nLet me know if you want more."), fencedWant);
assert.strictEqual(extractCorrected("```\n" + fenced), fencedWant);
assert.strictEqual(extractCorrected("```\nCHECK SUMMARY: 1 CONFIRMED\nCORRECTED ANSWER:\nMEASURE: M"), "MEASURE: M");
// Trailing remarks and --- / *** rules are kept verbatim; only REMOVED: ends the answer.
const tail = "CANDIDATE: A | x | y\n- [A][+][RECORD] 2020: f | https://e.org\nGAPS: none";
assert.strictEqual(extractCorrected("**CORRECTED ANSWER**\n\n" + tail + "\n\n---\n\nOverall the answer was accurate."), tail + "\n\n---\n\nOverall the answer was accurate.");
assert.strictEqual(extractCorrected("CORRECTED ANSWER:\n" + tail + "\nOverall the answer was accurate."), tail + "\nOverall the answer was accurate.");
assert.strictEqual(extractCorrected("CORRECTED ANSWER:\n---\n" + tail + "\n***\nThanks."), "---\n" + tail + "\n***\nThanks.");
// Reviewer repros: a rule between candidates and a mid-answer "Note:" must not drop content.
{
  const two = "CANDIDATE: A | x | y\n- [A][+][RECORD] 2024: a | https://e.org/a\n---\nCANDIDATE: B | x | y\n- [A][-][RECORD] 2024: b | https://e.org/b";
  assert.ok(extractCorrected("CORRECTED ANSWER:\n" + two).includes("CANDIDATE: B"), "--- keeps later candidates");
  const red = "CANDIDATE: A | x | y\n- [A][+][RECORD] 2024: a | https://e.org/a\n\nNote: one source was slow.\n- [A][+][RECORD] 2023: c | https://e.org/c\nRED LINE CROSSED: yes: z | https://e.org/z";
  assert.ok(extractCorrected("CORRECTED ANSWER:\n" + red).includes("RED LINE CROSSED: yes"), "Note: keeps the red line");
  const meas = "MEASURE: M\nWHAT YES DOES: x\n\nNote: the fiscal note was revised.\nEVIDENCE:\n- [A][+][RECORD] 2024: e | https://e.org/e";
  assert.ok(extractCorrected("CORRECTED ANSWER:\n" + meas).includes("EVIDENCE:"), "Note: keeps measure evidence");
  // Fence closed right after the heading, answer in a second fence.
  assert.strictEqual(extractCorrected("```\nCORRECTED ANSWER:\n```\n```\nCANDIDATE: Q\n```"), "CANDIDATE: Q");
}
const tbl = "CANDIDATE: A | x | y\n| Axis | Sign | Kind | Fact | Source |\n|---|---|---|---|---|\n| A | + | RECORD | 2020: f | https://e.org |\nGAPS: none";
assert.strictEqual(extractCorrected("CORRECTED ANSWER:\n" + tbl), tbl);
// Markdown table summary maps numbers by column.
assert.deepStrictEqual(checkSummary("CHECK SUMMARY:\n| CONFIRMED | WRONG | NOT FOUND | NO SOURCE |\n|---|---|---|---|\n| 12 | 1 | 0 | 2 |"),
  {confirmed: 12, wrong: 1, notFound: 0, noSource: 2});
assert.strictEqual(checkSummary("nothing"), null);
assert.strictEqual(checkSummary("CHECK SUMMARY: see below"), null);
assert.strictEqual(checkSummary(null), null);

console.log("kit_test: all checks passed");
