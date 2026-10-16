// Checks the profile and Copy-for-chat text built by tools/kit.js. Run: node tools/kit_test.js
const assert = require("assert");
const {WEB_GATE, ADDRESS_WITHHELD, DOUBLE_CHECK_STEP, NEUTRAL_EVIDENCE, defaultState, letters, focusRuleSentence, safePlace, placeFromAddress, buildProfile, fillStep, fixFormat, splitForChat, longCopyNote, forChat,
  mayHaveAddress, parseBallot, calcProfile, raceText, measureText, bundleAnswers, fillCheck, extractCorrected, usableCorrected, checkSummary, checkLine,
  REPORT_STATES, REPORT_OVERALL, REPORT_KEYS, testReportUrl} = require("./kit.js");
const {parseWeights, countEvidence, hasGrayTopics} = require("./calc.js");
// A gray topic typed like a weight never becomes an axis.
assert.deepStrictEqual(Object.keys(parseWeights(require("./kit.js").calcProfile({...require("./kit.js").defaultState(), mode: "values", axes: [{name: "Housing", meaning: "", weight: 2}], gray: "D=3 policing\nE weight 2"})).weights), ["A"]);

assert.deepStrictEqual(letters(4), ["A", "B", "C", "D"]);

// Neutral: no axes or values sections, has the neutral line; filled-in values stay out.
let s = defaultState();
s.axes[0].name = "Hidden";
s.gray = "something";
let p = buildProfile(s);
assert.ok(p.startsWith("YOUR ELECTION (the profile the steps call VALUES PROFILE)\nAddress: withheld (not needed for this step)\nPlace: not given\nElection date: not given\nMode: Neutral comparison\n"));
assert.ok(p.includes("Neutral mode: do not collect values, score, rank, or recommend."));
assert.ok(!/Value axes|Hidden|Gray areas|Viability/.test(p));
assert.ok(p.endsWith("Crowded races (5+ candidates): research every candidate"));

// Values: axes lettered with weights; empty optional sections omitted; calc reads the same lines.
s = defaultState();
Object.assign(s, {mode: "values", address: "1 Main St", date: "2026-11-03", gray: "\n  drug policy \n\n", viability: true});
s.axes = [{name: "Public services", meaning: "Fund schools", weight: 3}, {name: "Tax level", meaning: "Lower taxes", weight: 1}];
p = buildProfile(s, true);
assert.ok(p.startsWith("VALUES PROFILE\n"));
assert.ok(p.includes("Address: 1 Main St\nPlace: not given\nElection date: 2026-11-03\nMode: Values match\n"));
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

// Neutral edits checked against the real prompts.md text, so a prompt edit cannot silently
// bring back the sign legend or the scored checks.
{
  const md = require("fs").readFileSync(require("path").join(__dirname, "../ballot-guide/references/prompts.md"), "utf8");
  const real = [...md.matchAll(/^## Step (\d)[^\n]*\n[\s\S]*?```text\n([\s\S]*?)\n```/gm)].map(m => m[2]);
  const neutral = defaultState(), values = {...defaultState(), mode: "values"};
  for (const i of [3, 4]) {
    const t = fillStep(i, real[i], neutral);
    assert.ok(t.includes(NEUTRAL_EVIDENCE), "neutral line in step " + i);
    assert.ok(!/gray|\+ \/ -|agrees with|axis letter|does a YES vote agree/i.test(t), "no sign legend in neutral step " + i);
    assert.ok(t.includes("- [{{TOPIC}}][0][RECORD / QUESTIONNAIRE"), "topic form in step " + i);
    assert.strictEqual(fillStep(i, real[i], values), real[i], "values step " + i + " unchanged");
    // The neutral example line from the prompt counts as evidence, and the fix-format message uses it.
    assert.ok(fixFormat(i, real[i], neutral).includes("[{{TOPIC}}][0]"));
    assert.ok(fixFormat(i, real[i], values).includes("[{{axis}}][{{+ / - / 0 / gray}}]"));
  }
  const c = countEvidence("CANDIDATE: Jane Doe | x\n- [Housing][0][RECORD] 2025: Voted yes. | https://a.gov/1\nGAPS: none");
  assert.deepStrictEqual([c.recognized, c.errors.length], [1, 0]);
  const s6 = fillStep(6, real[6], neutral);
  assert.ok(!/GRAY|score math|red line|Step 5|turns on|in the math|Calibration|viability|highest weight/i.test(s6), s6);
  assert.ok(s6.includes("10b. Is any candidate list") && s6.includes("20. Donors and endorsements: are FUNDER and ENDORSEMENT items grouped (one per group, donors by industry or interest)?"));
  assert.ok(s6.includes("If RESULT is FAIL: fix the outputs, then run this step again."));
  assert.strictEqual(fillStep(6, real[6], values), real[6]);
  assert.ok(fixFormat(2, real[2], neutral).includes("RACES\n- {{office}} | {{position}}"));
  assert.throws(() => fixFormat(3, "no format here", neutral));
}

// Long Step 6/7 text splits at "=== " headers; parts carry the wait and final task lines.
{
  const pre = "TASK: check.\n" + "r".repeat(50);
  const blocks = [1, 2, 3, 4].map(i => `=== RACE ${i} OF 4: R${i} ===\n` + "x".repeat(60));
  const text = [pre, ...blocks].join("\n");
  assert.deepStrictEqual(splitForChat(text, 10000), [text]);
  const parts = splitForChat(text, 150);
  assert.strictEqual(parts.length, 4);
  parts.slice(0, -1).forEach((t, i) => assert.ok(t.startsWith(`Part ${i + 1} of 4. Reply only OK and wait for the rest.\n\n`)));
  assert.ok(parts[3].startsWith("Part 4 of 4.\n\n") && parts[3].endsWith("\n\nNow do the task above using all parts."));
  assert.ok(parts[0].includes("TASK: check.") && parts[0].includes("=== RACE 1 OF 4"));
  // Joined back without the added lines, nothing is lost or reordered.
  const strip = t => t.replace(/^Part \d+ of \d+\.( Reply only OK and wait for the rest\.)?\n\n/, "").replace(/\n\nNow do the task above using all parts\.$/, "");
  assert.strictEqual(parts.map(strip).join("\n"), text);
  // No headers to split at: one part, even if long.
  assert.deepStrictEqual(splitForChat("y".repeat(200), 150), ["y".repeat(200)]);
  assert.ok(splitForChat(text).length === 1, "default limit is about 12k");
}

// Copy for chat: web gate, rules, profile, step; Step 0 = rules only; Step 1 = profile only.
s = defaultState();
const prof = buildProfile(s);
const G = WEB_GATE + "\n\n";
assert.ok(WEB_GATE.startsWith("First: if you cannot search the web or open web pages in this chat, and no source pages are pasted below, reply only with NO WEB ACCESS and stop. Searching the web counts as access."));
// Refusals and chat errors are told apart from answers.
{
  const {chatRefused} = require("./kit.js");
  assert.strictEqual(chatRefused("NO WEB ACCESS"), "noweb");
  assert.strictEqual(chatRefused("I seem to be encountering an error. Can I try something else for you?"), "error");
  assert.strictEqual(chatRefused("I encountered an error doing what you asked. Could you try again?"), "error");
  assert.strictEqual(chatRefused("I can't help with responses on elections and political figures right now."), "error");
  assert.strictEqual(chatRefused("I can’t help with responses on elections and political figures right now."), "error");
  assert.strictEqual(chatRefused("CANDIDATE: X\n- [Housing][0][RECORD] 2025: a | https://a.gov/1"), "");
  for (const real of ["CANDIDATE: X\n- [A][+][RECORD] 2025: filed after the city site said try again later. | https://a.gov/1",
    "MEASURE: M\n- [Taxes][0][STATED] She said \"something went wrong\" with the levy.",
    "- [Safety][0][RECORD] 2024: staff encountered an error in booking logs",
    "RACES\n- Mayor | A vs B | CONTESTED\nUNVERIFIED: county site said try again later"]) assert.strictEqual(chatRefused(real), "", real);
}
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
// Stored answers lose Markdown escapes before any copy: ChatGPT renders "\[A\]" as math.
assert.ok(fillCheck(step8, s, {answer: "CANDIDATE: Z\n- \\[A\\]\\[+\\]\\[RECORD\\] 2020: x \\| https://e.org\\"})
  .includes("ANSWER TO CHECK =====\nCANDIDATE: Z\n- [A][+][RECORD] 2020: x | https://e.org\n====="));
assert.ok(bundleAnswers([{kind: "race", text: "Mayor", answer: "- \\[A\\]\\[+\\] x"}]).endsWith("===\n- [A][+] x"));
// A math-mangled answer (e.g. a used corrected answer) is copied back as bracket tags.
{
  const mangled = "CANDIDATE: Z\n- $A$$+$$RECORD$ 2020: x | https://e.org";
  for (const out of [fillCheck(step8, s, {answer: mangled}), bundleAnswers([{kind: "race", text: "Mayor", answer: mangled}])]) {
    assert.ok(!/\$[^$\n]+\$\$/.test(out) && out.includes("- [A][+][RECORD] 2020: x"), out);
  }
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
assert.deepStrictEqual(b.skipped, [{line: "Something without columns", kind: "race"}]);
// A prose answer under the headings: every line comes back with its section, for editable rows.
assert.deepStrictEqual(parseBallot("**Races**\n1. **U.S. House**: A vs. B — Contested\n**Measures**\n- Library Levy: raises tax").skipped,
  [{line: "U.S. House: A vs. B — Contested", kind: "race"}, {line: "Library Levy: raises tax", kind: "measure"}]);
assert.ok(!JSON.stringify(b).includes("District 9"), "DISTRICTS are not kept");
// Unreadable lines that may hold an address are never offered as saved rows.
{
  const a = parseBallot("RACES\nThese are the races for 987 Zebra Lane, Faketown, ZZ 99999:\nYour polling place is 12 Oak St.\nRaces at 55 Elm, Faketown:\n1. U.S. House: A vs. B\nMEASURES\n- Library Levy: raises tax", "55 Elm, Faketown, ZZ");
  assert.deepStrictEqual(a.skipped.map(x => x.line), ["U.S. House: A vs. B", "Library Levy: raises tax"]);
  assert.strictEqual(a.addressLines.length, 3);
}
// Address check: real ballot lines pass; streets, ZIPs, PO boxes and the entered address are held back.
for (const ok of ["District 4 Court Judge: A", "Superior Court, Position 12345: X", "Proposition 50 Way Forward Act",
  "Appointed in 2019 to the Supreme Court", "Measure 12 | raises the levy", "Seat No. 12345 | A vs B",
  "Mayor | A vs B | https://vote.example.gov/2026/12345-ballot.pdf", "Judge of the 10th District Court of Appeals",
  "Judge, 2nd District Court of Appeals", "Court of Common Pleas, General Division", "5th Circuit Court Judge",
  "Justice of the Supreme Court, term commencing 1-1-2027"]) assert.ok(!mayHaveAddress(ok, "55 Elm, Faketown, ZZ"), ok);
for (const bad of ["987 Zebra Lane, Faketown, ZZ 99999", "Your polling place is 12 Oak St", "PO Box 12", "Races at 55 Elm, Faketown:",
  "Faketown, ZZ 99999", "77 Oak Ave Apt 4", "1600 Pennsylvania Avenue NW, Washington", "Vote at 12 Oak St.",
  "500 W 2nd St", "500 West 2nd Street, Austin", "1234 NE 5th Ave", "Ballot for 123 Main St Springfield", "Races for 12 Oak St:",
  "12 Oak St; precinct 4", "ballot at 12 Oak St (precinct 4)", "12 Main Street North", "11 Wall Street New York NY",
  "33 Maple Drive Anytown", "1 Infinite Loop Cupertino CA", "555 County Road 12", "100 Highway 1", "Springfield 62701",
  "350 Fifth Avenue", "12 N Main St #4", "12 Oak St | Mayor", "Mayor | lives at 12 Oak St", "12 Oak Court",
  "12 County Ct", "Vote at 12 County Ct", "123 Common Ct", "9 Family Ct", "4 Tax Court", "88 Claims Ct", "5 District Ct",
  "77 Appeals Ct, Faketown", "45 Supreme Ct", "12 Pleas Ct"]) assert.ok(mayHaveAddress(bad, "55 Elm, Faketown, ZZ"), bad);
// Markdown escapes from a Copy button ("\[", "\|", trailing "\") parse like the plain answer.
{
  const esc = ballot.split("\n").map(l => l.replace(/[|*#.\-_[\]]/g, "\\$&") + "\\").join("\n");
  assert.ok(esc.includes("City Council \\| Position 2"));
  assert.deepStrictEqual(parseBallot(esc), b);
}
// UNVERIFIED rows under RACES/MEASURES are notes, never items; an address-like one is held back.
{
  const u = parseBallot("RACES\n- UNVERIFIED: could not open PDF | https://e.org/a.pdf\n- Mayor | Z | UNCONTESTED | https://e.org/b\n"
    + "| Unverified | Sheriff | ? |\n- unverified could not confirm district for 12 Oak St\nMEASURES\n- UNVERIFIED | Measure 9 | https://e.org/m", "");
  assert.deepStrictEqual([u.races.length, u.measures.length], [1, 0]);
  assert.deepStrictEqual(u.unverified, ["UNVERIFIED: could not open PDF | https://e.org/a.pdf", "| Unverified | Sheriff | ? |", "UNVERIFIED | Measure 9 | https://e.org/m"]);
  assert.deepStrictEqual(u.addressLines, ["unverified could not confirm district for 12 Oak St"]);
  // Placeholder rows and the UNVERIFIED section are notes too; court names are kept as races.
  const ph = parseBallot("RACES\n- State Senator | district UNVERIFIED | UNVERIFIED | UNVERIFIED | source: https://e.org/s\n"
    + "- Judge of the 10th District Court of Appeals | Pat Q | UNCONTESTED | source: https://e.org/j\nMEASURES\n- UNVERIFIED | https://e.org/m2\n"
    + "UNVERIFIED\n- Sheriff race not found\n- precinct for 12 Oak St\n- None", "");
  assert.deepStrictEqual(ph.races.map(r => r.office), ["Judge of the 10th District Court of Appeals"]);
  assert.deepStrictEqual(ph.unverified, ["State Senator | district UNVERIFIED | UNVERIFIED | UNVERIFIED | source: https://e.org/s",
    "UNVERIFIED | https://e.org/m2", "Sheriff race not found"]);
  assert.deepStrictEqual([ph.addressLines, ph.noUrl, ph.measures], [["precinct for 12 Oak St"], [], []]);
  // Table rows with an address are held back too, not saved as items.
  const t = parseBallot("RACES\n- Mayor | lives at 12 Oak St | https://a.gov/1\n- Council | A vs B | https://a.gov/2");
  assert.deepStrictEqual([t.races.length, t.addressLines.length], [1, 1]);
}
// A row whose source is a title, not a link, is kept and listed in noUrl.
{
  const n = parseBallot("RACES\n- Mayor | Z | UNCONTESTED | source: Ohio Secretary of State\n- Clerk | Y | UNCONTESTED | source: https://e.org/c\nMEASURES\n- Issue 1 | Raises a levy");
  assert.deepStrictEqual([n.races.length, n.measures.length], [2, 1]);
  assert.deepStrictEqual(n.noUrl, ["Mayor | Z | UNCONTESTED | source: Ohio Secretary of State", "Issue 1 | Raises a levy"]);
  assert.deepStrictEqual(b.noUrl, []);
}
// The calculator profile carries gray topics only when there are some, and never the address.
{
  const cs = Object.assign(defaultState(), {mode: "values", address: "77 Example Rd", red: "bribery"});
  assert.ok(!hasGrayTopics(calcProfile(cs)) && !calcProfile(cs).includes("77 Example") && !calcProfile(cs).includes("bribery"));
  cs.gray = "taxes\n";
  assert.ok(hasGrayTopics(calcProfile(cs)) && calcProfile(cs).endsWith("Gray areas:\n- taxes"));
  assert.deepStrictEqual(Object.keys(parseWeights(calcProfile(cs)).weights), ["A", "B", "C"]);
}
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
// A corrected answer with no readable evidence never replaces one that had some.
{
  const orig = "CANDIDATE: Z\n- [A][+][RECORD] 2020: x | https://e.org";
  assert.strictEqual(usableCorrected("CANDIDATE: Z\n- A plus RECORD 2020: x", orig), false);
  assert.strictEqual(usableCorrected("CANDIDATE: Z\n- $A$$+$$RECORD$ 2020: x | https://e.org", orig), true);
  assert.strictEqual(usableCorrected("CANDIDATE: Z\n- prose", "CANDIDATE: Z\n- prose"), true);
}
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

// Test report URL: only allowed keys, encoded; the address and profile never leak even when passed in.
{
  const st = Object.assign(defaultState(), {address: "123 Main Street", stakes: "landlord", gray: "taxes"});
  st.axes[0].name = "Transit";
  const url = testReportUrl(Object.assign({}, st, {state: "New York", area: "", election_date: "2026-11-03",
    used_in: "Web kit", mode: "Neutral comparison", steps: "- Ballot found\n- 3 of 4 races researched", overall: "Worked with fixes",
    problems: "a&b=c", version: "v1.4.0"}));
  const u = new URL(url);
  assert.strictEqual(u.origin + u.pathname, "https://github.com/tperkowitz-tech/ballot-guide/issues/new");
  assert.deepStrictEqual([...u.searchParams.keys()], ["template", "state", "election_date", "used_in", "mode", "steps", "overall", "problems", "version"]);
  assert.ok([...u.searchParams.keys()].every(k => k === "template" || REPORT_KEYS.includes(k)));
  assert.strictEqual(u.searchParams.get("problems"), "a&b=c");
  assert.strictEqual(u.searchParams.get("steps"), "- Ballot found\n- 3 of 4 races researched");
  assert.ok(!/Main|landlord|Transit|taxes|address/i.test(decodeURIComponent(url)));
  assert.strictEqual(testReportUrl({}), "https://github.com/tperkowitz-tech/ballot-guide/issues/new?template=test-report.yml");
  // Dropdown options the page sends must match the issue form, or GitHub drops them.
  const form = require("fs").readFileSync(require("path").join(__dirname, "../.github/ISSUE_TEMPLATE/test-report.yml"), "utf8");
  const options = id => { const m = form.split("    id: " + id + "\n")[1].split("  - type:")[0];
    const inline = m.match(/options: \[(.*)\]/); return inline ? inline[1].split(", ") : [...m.matchAll(/^ {8}- "(.*)"$/gm)].map(x => x[1]); };
  assert.deepStrictEqual(options("state"), REPORT_STATES);
  assert.deepStrictEqual(options("overall"), REPORT_OVERALL);
  assert.ok(options("used_in").includes("Web kit"));
  assert.deepStrictEqual(options("mode").slice(0, 2), ["Neutral comparison", "Values match"]);
  assert.deepStrictEqual([...form.matchAll(/^    id: (.*)$/gm)].map(x => x[1]), REPORT_KEYS);
  console.log("kit_test: test report URL checks passed");
}

console.log("kit_test: all checks passed");

// v1.6.0 (Google AI Mode test). Place: in every copy that has the profile; the street only in
// Step 2 and its double-check.
{
  const md = require("fs").readFileSync(require("path").join(__dirname, "../ballot-guide/references/prompts.md"), "utf8");
  const real = [...md.matchAll(/^## Step (\d)[^\n]*\n[\s\S]*?```text\n([\s\S]*?)\n```/gm)].map(m => m[2]);
  const st = {...defaultState(), address: "77 Example Rd, Faketown, ZZ 99999", place: "Faketown, Ohio"};
  const ex = {race: "Mayor: A vs B", measure: "Issue 1", attach: "ANSWERS"};
  for (const i of [3, 4, 6, 7]) {
    const t = forChat(i, real[0], real[i], st, ex);
    assert.ok(!t.includes("77 Example Rd") && t.includes("Place: Faketown, Ohio"), "step " + i);
  }
  for (const k of [3, 4]) {
    const t = forChat(8, real[0], real[8], st, {checkStep: k, question: real[k], ...ex, answer: "CANDIDATE: Z"});
    assert.ok(!t.includes("77 Example Rd") && t.includes("Place: Faketown, Ohio"), "step 8 checking " + k);
  }
  assert.ok(forChat(2, real[0], real[2], st).includes("Address: 77 Example Rd, Faketown, ZZ 99999\nPlace: Faketown, Ohio"));
  // A street typed into the place field never leaves Step 2 (and the page saves only safePlace).
  for (const bad of ["12 Oak St, Faketown", "12 Broadway, New York", "12 Oak", "Apt 4B, Columbus", "Unit B, Columbus", "# B, Columbus", "Faketown, OH 99999"]) {
    assert.strictEqual(safePlace({place: bad}), "", bad);
    assert.ok(buildProfile({...st, place: bad}).includes("Place: not given"), bad);
  }
  // A street part without digits is caught through the address; a city-only address is not a street.
  assert.strictEqual(safePlace({place: "Rural Route, Faketown", address: "Rural Route, Faketown, OH"}), "");
  for (const [place, address] of [["Columbus, Ohio", "Columbus, Ohio"], ["Washington, DC", ""], ["Faketown, Ohio", st.address]]) assert.strictEqual(safePlace({place, address}), place);
  // State codes and place names that share a unit word's letters stay valid; "Suite 200" style units do not.
  for (const place of ["Miami, FL", "Unity, ME", "Ste. Genevieve, MO", "Box Elder County, Utah", "Florence, AL"]) assert.strictEqual(safePlace({place, address: ""}), place, place);
  for (const bad of ["Suite 200, Columbus", "Fl 3, Miami, FL", "Apt B, Miami"]) assert.strictEqual(safePlace({place: bad, address: ""}), "", bad);
  assert.strictEqual(placeFromAddress("123 Main St, Miami, FL 33101"), "Miami, FL");
  // Prefill: trailing "City, ST" or "City, State" only; never a street part or ZIP.
  assert.strictEqual(placeFromAddress("123 Main St, Springfield, IL 62701"), "Springfield, IL");
  assert.strictEqual(placeFromAddress("1 Example Ave NW, Washington, dc 20001-1234, USA"), "Washington, DC");
  assert.strictEqual(placeFromAddress("Columbus, ohio"), "Columbus, Ohio");
  assert.strictEqual(placeFromAddress("1 Example Ave, Washington, D.C."), "Washington, DC");
  assert.strictEqual(placeFromAddress("1 Example Ave, Apt 2, Springfield, I.L. 62701"), "Springfield, IL");
  for (const bad of ["", "123 Main St Springfield IL", "123 Main St, IL", "Springfield, Ill", "123 Main St, Spr", "123 Main St, Apt B, OH"]) assert.strictEqual(placeFromAddress(bad), "", bad);

  // Step 8 sends the question in short form: task, item, output format; no research instructions.
  const full = forChat(8, real[0], real[8], st, {checkStep: 3, question: real[3], race: "Mayor: A vs B", answer: "CANDIDATE: Z"});
  assert.ok(full.includes("TASK: Collect evidence for ONE race.") && full.includes("RACE: Mayor: A vs B") && full.includes("OUTPUT FORMAT:\nCANDIDATE: {{name, then (incumbent) if they hold this office now}}"));
  assert.ok(!full.includes("Research every candidate, including minor ones.") && full.includes("CORRECTED ANSWER:"));
  assert.ok(!full.includes("Use the same event id") && full.includes("- ...\nRED LINE CROSSED:"));
  // Values mode keeps the gray rule, so the checker knows gray marks a torn topic.
  const vfull = forChat(8, real[0], real[8], {...st, mode: "values"}, {checkStep: 3, question: real[3], race: "Mayor: A vs B", answer: "CANDIDATE: Z"});
  assert.ok(!vfull.includes("Use the same event id") && vfull.includes("- ...\nUse gray for topics the profile lists as torn/gray areas.\nRED LINE CROSSED:"));
  assert.ok(forChat(8, real[0], real[8], st, {checkStep: 4, question: real[4], measure: "Issue 1", answer: "a"}).includes("MEASURE: Issue 1\n(Short form"));
  const dc = forChat(8, real[0], real[8], st, {checkStep: 2, question: real[2], answer: "RACES"});
  assert.ok(dc.includes("Address: 77 Example Rd") && dc.includes("OUTPUT FORMAT:\nDISTRICTS"));
  const big = "CANDIDATE: Jane Doe | x\n" + Array.from({length: 20}, (_, i) => `- [Housing][0][RECORD] 2025-03-${10 + i}: Voted yes on zoning bill ${i}, final passage 7-2. | https://example.gov/minutes/${i}`).join("\n");
  assert.ok(forChat(8, real[0], real[8], st, {checkStep: 3, question: real[3], race: "Mayor: A vs B", answer: big}).length < 8000, "typical Step 8 fits 8,000");

  // Length note only past 8,000 characters.
  assert.strictEqual(longCopyNote("x".repeat(8000)), "");
  assert.strictEqual(longCopyNote("x".repeat(11600)), "This is 11,600 characters; some chats (such as Google AI Mode) cut off long text. If the chat's answer seems to ignore the end, use a chat that accepts longer text.");

  // "Needs the place" replies, without false positives on real answers.
  const {chatRefused} = require("./kit.js");
  for (const t of ["SPLIT NEEDED: no candidate names or city location are provided.", "Please provide the city and state for this race.",
    "To research this race, please provide the candidate list."]) assert.strictEqual(chatRefused(t), "needplace", t);
  // Step 0 rule 7: a plain SPLIT NEEDED means the task is too large, not that the place is missing.
  assert.strictEqual(chatRefused("SPLIT NEEDED:\n- Part 1: Mayor\n- Part 2: City Council"), "split");
  for (const t of ["CANDIDATE: X\n- [A][+][STATED] 2025: Asked voters to provide the city budget. | https://a.gov/1",
    "RACES\n- Mayor | A vs B | CONTESTED\nUNVERIFIED: which county runs the election"]) assert.strictEqual(chatRefused(t), "", t);

  // Google AI Mode's real ballot row: names kept, the Google search link dropped, the real source kept.
  const ai = parseBallot("RACES\n* U.S. House Delegate | At-Large | [Alex B. Doe, Jr.](https://www.google.com/search?q=alex+b.+doe,+jr.&kgmid=/g/11bzx61f7x) (Party A) vs Casey Roe | CONTESTED | source: https://www.thegreenpapers.com/G26/DC\n* \n"
    + "Would you like me to find your polling place?\n- Find polling place hours\n- Mayor | 12 Oak St | x");
  assert.deepStrictEqual(ai.races, [{office: "U.S. House Delegate", position: "At-Large", candidates: "Alex B. Doe, Jr. (Party A) vs Casey Roe", status: "CONTESTED", source: "https://www.thegreenpapers.com/G26/DC"}]);
  // The closing offer and the list under it are not rows, and not "may include an address" notes.
  assert.deepStrictEqual([ai.skipped, ai.addressLines, ai.noUrl], [[], [], []]);
  // A source link keeps its URL; a bare domain is still flagged as no web address.
  const src = parseBallot("MEASURES\n- Initiative 1 | Raises the wage [1, 2] | source: [dcboe.org](https://dcboe.org/m1)\n- Initiative 2 | Fee | source: dcboe.org\n[1] [dcboe.org](https://dcboe.org/m1)\n[2] https://dcboe.org/m2");
  assert.deepStrictEqual(src.measures.map(m => [m.summary, m.source]), [["Raises the wage", "https://dcboe.org/m1"], ["Fee", "dcboe.org"]]);
  assert.deepStrictEqual(src.noUrl, ["Initiative 2 | Fee | source: dcboe.org"]);
}
console.log("kit_test: v1.6.0 checks passed");

// v1.6.1: primary-list red flags (kept, flagged), write-ins off the race line, checker
// summary vs its lists, and SPLIT NEEDED parts.
{
  const {checkMismatch, splitInfo, splitFollowUp, addPart, chatRefused} = require("./kit.js");
  const bl = parseBallot("RACES\n- Governor | A (Party A) vs UNVERIFIED | CONTESTED | source: https://e.org/g\n"
    + "- Treasurer | B or C | CONTESTED | source: https://e.org/t\n- Auditor | D vs E | CONTESTED | source: https://e.org/Primary-Certified-Candidates.pdf\n"
    + "- Mayor | F vs G | CONTESTED | source: https://e.org/m\n- Clerk | Al Doe, Jr. vs H (write-in), I | CONTESTED | source: https://e.org/c");
  assert.deepStrictEqual(bl.races.map(r => r.candidates), ["A (Party A) vs UNVERIFIED", "B or C", "D vs E", "F vs G", "Al Doe, Jr. vs I"]);
  assert.deepStrictEqual(bl.suspect, ["Governor | A (Party A) vs UNVERIFIED | CONTESTED | source: https://e.org/g",
    "Treasurer | B or C | CONTESTED | source: https://e.org/t", "Auditor | D vs E | CONTESTED | source: https://e.org/Primary-Certified-Candidates.pdf"]);
  assert.deepStrictEqual(bl.writeIns, ["Clerk | Al Doe, Jr. vs H (write-in), I | CONTESTED | source: https://e.org/c"]);

  const cs = (sum, problems, removed) => `CHECK SUMMARY: ${sum}\nPROBLEMS:\n${problems}\nCORRECTED ANSWER:\nCANDIDATE: X\n${removed}`;
  assert.strictEqual(checkMismatch(cs("5 CONFIRMED, 1 WRONG, 1 NOT FOUND, 0 NO SOURCE", "- a: WRONG | b\n- c: NOT FOUND\n- d: TAG?", "REMOVED: c")), false);
  assert.strictEqual(checkMismatch(cs("5 CONFIRMED, 0 WRONG, 0 NOT FOUND, 0 NO SOURCE", "- none", "REMOVED: none")), false);
  assert.strictEqual(checkMismatch(cs("5 CONFIRMED, 0 WRONG, 0 NOT FOUND, 0 NO SOURCE", "- a: WRONG | b\n- c: NOT FOUND", "")), true);
  assert.strictEqual(checkMismatch(cs("5 CONFIRMED, 3 WRONG, 0 NOT FOUND, 0 NO SOURCE", "- a: WRONG | b", "")), true);
  assert.strictEqual(checkMismatch(cs("5 CONFIRMED, 0 WRONG, 0 NOT FOUND, 0 NO SOURCE", "- none", "REMOVED: the 2019 vote")), true);
  assert.strictEqual(checkMismatch("no summary here"), false);
  for (const none of ["REMOVED: (none)", "REMOVED: nothing removed", "REMOVED: -", "REMOVED: N/A", "REMOVED:", "REMOVED: none."]) {
    assert.strictEqual(checkMismatch(cs("5 CONFIRMED, 0 WRONG, 0 NOT FOUND, 0 NO SOURCE", "- none", none)), false, none);
  }

  const split = "SPLIT NEEDED:\n- Part 1: Candidate A\n- Part 2: Candidate B\n- Part 3: Candidate C";
  assert.deepStrictEqual(splitInfo(split), {total: 3, next: 1});
  assert.strictEqual(splitFollowUp(1), "Do part 1 only, in the same output format.");
  const one = addPart(split, 1, "CANDIDATE: A\n- [A][+][RECORD] 2025: x | https://e.org/1\n");
  assert.strictEqual(one, split + "\n\nPART 1 ANSWER:\nCANDIDATE: A\n- [A][+][RECORD] 2025: x | https://e.org/1");
  assert.deepStrictEqual(splitInfo(one), {total: 3, next: 2});
  assert.strictEqual(chatRefused(one), "");
  assert.strictEqual(countEvidence(one).recognized, 1);
  assert.deepStrictEqual(splitInfo("SPLIT NEEDED: too large"), {total: null, next: 1});
  // Only part lines before the first answer line count: two parts, part 1 answered in the same reply, so part 2 is next.
  assert.deepStrictEqual(splitInfo("SPLIT NEEDED:\n1. Candidate A\n2. Candidate B\nCANDIDATE: A | x\n- [A][+][RECORD] 2025: x | https://e.org/1\n- [A][+][STATED] 2025: y | https://e.org/2\n- note"),
    {total: 2, next: 2});
  assert.strictEqual(splitInfo("CANDIDATE: A"), null);
  console.log("kit_test: v1.6.1 checks passed");
}

// v1.7.0: the Step 1 scoring choice reaches the profile (Steps 5 and 7 read it) and the calculator,
// and never the neutral profile or the calculator's weights.
{
  const {scoringOf, scoringText} = require("./kit.js");
  const {calculate} = require("./calc.js");
  const st = {...defaultState(), mode: "values"};
  assert.strictEqual(scoringOf(st), "original");
  assert.ok(buildProfile(st).includes("\nScoring: Original (default)\n"));
  assert.ok(!buildProfile(defaultState()).includes("Scoring:"));
  assert.ok(!calcProfile(st).includes("Scoring"));
  assert.ok(buildProfile({...st, scoring: "evidence"}).includes("\nScoring: Evidence-based (research-informed; being tested)\n"));
  // Unknown saved values fall back to the default.
  assert.strictEqual(scoringOf({...st, scoring: "fancy"}), "original");
  assert.strictEqual(scoringOf({...st, scoring: "evidence"}), "evidence");
  // A saved v1.7 "improved" loads as Evidence-based.
  assert.strictEqual(scoringOf({...st, scoring: "improved"}), "evidence");
  // Custom starts equal to Original: same scores, so no starting value reads as a recommendation.
  assert.deepStrictEqual(calculate("A=3", "CANDIDATE: X\n- [A][-][RECORD][r] v | https://e.org/1\n- [A][+][FUNDER][person-Jo] g | https://e.org/2",
    scoringOf({...st, scoring: "custom"})).result.rows[0].score, 36);
  const custom = {...st, scoring: "custom", custom: {record: 3, questionnaire: 1, stated: 0, donors: 3, exclude_both_sides: false}};
  assert.strictEqual(scoringOf(custom), custom.custom);
  assert.strictEqual(scoringText(custom), "Custom: records 3, questionnaire answers 1, statements 0, donors and endorsements 3; money backing more than one candidate counted");
  // An all-zero (or emptied) custom choice says so instead of scoring with a silent default.
  const zero = {...custom, custom: {record: 0, questionnaire: 0, stated: 0, donors: 0, exclude_both_sides: true}};
  assert.ok(scoringText(zero).startsWith("Custom (weights not valid yet: every scoring weight is 0"), scoringText(zero));
  assert.strictEqual(calculate("A=3", "CANDIDATE: X\n- [A][+][RECORD] v | https://e.org/1", scoringOf(zero)).result, null);
  assert.ok(!parseWeights(buildProfile(custom)).warnings.length, "the scoring line never reads as a weight");
  // Step 3 asks for donor-name event ids; neutral mode gets the example in its [TOPIC][0] form.
  const md = require("fs").readFileSync(require("path").join(__dirname, "..", "ballot-guide", "references", "prompts.md"), "utf8");
  const step3 = [...md.matchAll(/^## Step (\d)[^\n]*\n[\s\S]*?```text\n([\s\S]*?)\n```/gm)].map(m => m[2])[3];
  assert.ok(fillStep(3, step3, st).includes("[B][-][FUNDER][pac-Example Realty PAC]"));
  assert.ok(fillStep(3, step3, defaultState()).includes("[Housing][0][FUNDER][pac-Example Realty PAC]"));
  assert.ok(fillStep(3, step3, defaultState()).includes("[Housing][0][FUNDER][against-pac-Example PAC]"));
  console.log("kit_test: v1.7.0 scoring checks passed");
}

// The Quick start preview (and so its Copy button) must carry the starter byte for byte.
{
  const fs = require("fs"), path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "ballot-guide", "references", "quickstart.txt"), "utf8");
  const page = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");
  const m = page.match(/<pre id="quick-text">([\s\S]*?)<\/pre>/);
  assert.ok(m, "Quick start preview missing from docs/index.html");
  assert.strictEqual(m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), src);
  console.log("kit_test: quick start checks passed");
}

// Quick start export: the starter's "export" answer read into items, then scored by calc.js.
{
  const {parseExport, parsePriorities, checkFlagged, splitForChat, calcProfile, defaultState, LONG_COPY} = require("./kit.js");
  const {calculate} = require("./calc.js");
  const exp = [
    "PRIORITIES: A = Open records (3); B = Careful budgets (2); C = Parks (1)",
    "=== ITEM 1: City Council, Position 2",
    "CANDIDATE: Jo Roe (incumbent) | council member",
    "- [A][+][RECORD] 2025-03-10: Voted yes on an open records ordinance, final passage 7-2. | https://example.org/r1",
    "- [B][+][RECORD] 2025-06-02: Voted yes on the city budget, final passage 6-3. | https://example.org/r2",
    "- [C][+][QUESTIONNAIRE] 2026: Answered yes to more park funding. | https://example.org/q1",
    "CANDIDATE: Sam Lee | business owner",
    "- [A][-][STATED] 2026: Website says records requests cost too much. | https://example.org/s1",
    "- [B][0][FUNDER] 2026: Top donors are local firms. | https://example.org/f1",
    "WITHDRAWN: Pat Doe | https://example.org/w1",
    "GAPS: no questionnaire found for Sam Lee",
    "=== ITEM 2: Measure 1, library levy",
    "MEASURE: Measure 1",
    "EVIDENCE:",
    "- [B][-][RECORD] 2026-08-01: Raises the levy rate by 10 cents per $1,000. | https://example.org/m1",
    "- [C][+][STATED] 2026: Supporters say it keeps branches open. | https://example.org/m2",
    "GAPS: none",
  ].join("\n");
  const p = parseExport(exp);
  assert.deepStrictEqual(p.priorities, [{letter: "A", name: "Open records", weight: 3}, {letter: "B", name: "Careful budgets", weight: 2}, {letter: "C", name: "Parks", weight: 1}]);
  assert.deepStrictEqual(p.items.map(i => [i.n, i.title, i.kind]), [[1, "City Council, Position 2", "race"], [2, "Measure 1, library levy", "measure"]]);
  assert.ok(p.items[0].answer.startsWith("CANDIDATE: Jo Roe (incumbent) | council member\n[A][+][RECORD] 2025-03-10"));
  assert.deepStrictEqual([p.addressLines, p.notes, p.problems], [[], [], []]);

  // Markdown-styled (bold headers, headings, bullets, fences) and escaped copies read the same.
  const styled = "Here is your export:\n```text\n**PRIORITIES:** A = Open records (3); B = Careful budgets (2); C = Parks (1)\n" +
    exp.split("\n").slice(1).map(l => l.startsWith("===") ? "### **" + l + "**" : l.startsWith("- ") ? "* " + l.slice(2) : "**" + l.replace(":", ":**")).join("\n") + "\n```";
  const escaped = exp.replace(/([\[\]|=])/g, "\\$1").split("\n").map(l => l + "\\").join("\n");
  for (const v of [styled, escaped]) {
    const q = parseExport(v);
    assert.deepStrictEqual(q.priorities, p.priorities, v);
    assert.deepStrictEqual(q.items, p.items, v);
  }
  // A plain "ITEM n:" header works too.
  assert.deepStrictEqual(parseExport("ITEM 4: Mayor\nCANDIDATE: A | x").items.map(i => [i.n, i.title]), [[4, "Mayor"]]);

  // Two pastes (one per "continue" chat) merge by number; the later item 2 replaces the earlier one.
  const second = "=== ITEM 2: Measure 1, library levy\nMEASURE: Measure 1\nEVIDENCE:\n- [C][+][RECORD] 2024: Branch hours rose after the last levy. | https://example.org/m3\n=== ITEM 3: Sheriff\nCANDIDATE: Al Poe | deputy\n- [A][+][QUESTIONNAIRE] 2026: Yes on body cameras. | https://example.org/q3";
  const merged = parseExport(exp + "\n\n" + second);
  assert.deepStrictEqual(merged.items.map(i => i.n), [1, 2, 3]);
  assert.ok(merged.items[1].answer.includes("m3") && !merged.items[1].answer.includes("m1"));
  assert.deepStrictEqual(merged.notes, ["Item 2 was pasted more than once; the later one is used."]);
  // A checker's reply pasted after the export: its summary and problem list are not item lines.
  const reply = "CHECK SUMMARY: 3 CONFIRMED, 1 WRONG, 0 NOT FOUND, 0 NO SOURCE\nPROBLEMS:\n- [B][-][RECORD] 2026-08-01: 10 cents: WRONG | 12 cents\nCORRECTED ANSWER:\n" + second.split("\n=== ITEM 3")[0] + "\nREMOVED: none\nAnything else?";
  const fixed = parseExport(exp + "\n" + reply);
  assert.strictEqual(fixed.items[1].answer, "MEASURE: Measure 1\nEVIDENCE:\n[C][+][RECORD] 2024: Branch hours rose after the last levy. | https://example.org/m3");
  assert.ok(!fixed.items[0].answer.includes("CHECK SUMMARY"));

  // PRIORITIES: weights clamped to 1-3, a missing weight defaults to 2, letters must run in order, at most 6.
  const pr = parsePriorities("A = Taxes (5); B = Schools; C = Parks (weight 0); E = Roads (2); F=a(1); G=b(1); H=c(1)");
  assert.deepStrictEqual(pr.priorities.map(x => [x.letter, x.name, x.weight]), [["A", "Taxes", 3], ["B", "Schools", 2], ["C", "Parks", 1], ["D", "Roads", 2], ["E", "a", 1], ["F", "b", 1]]);
  assert.strictEqual(pr.problems.length, 5, pr.problems.join("\n"));
  assert.ok(pr.problems.some(x => x.includes("found E where D belongs")) && pr.problems.some(x => x.startsWith("Only 6")));
  // One per line under the heading reads the same.
  assert.deepStrictEqual(parseExport("PRIORITIES:\nA = Open records (3)\nB = Careful budgets (2)\n=== ITEM 1: X").priorities.map(x => x.weight), [3, 2]);
  // No PRIORITIES: neutral, unless the evidence uses letters; letters outside PRIORITIES are a problem.
  const neutral = parseExport("=== ITEM 1: Mayor\nCANDIDATE: A | x\n- [Housing][0][RECORD] 2025: f | https://e.org/1");
  assert.deepStrictEqual([neutral.priorities, neutral.problems], [[], []]);
  assert.ok(/no PRIORITIES line/.test(parseExport(exp.split("\n").slice(1).join("\n")).problems[0]));
  assert.ok(/letter D, which PRIORITIES does not list \(A, B, C\)/.test(parseExport(exp.replace("[C][+][STATED]", "[D][+][STATED]")).problems[0]));
  assert.deepStrictEqual(parseExport(second, "", ["A", "B", "C"]).problems, []);

  // Address-like lines are held back (shown, never in an item), including in a header.
  const addr = parseExport(exp.replace("GAPS: none", "- [C][+][STATED] 2026: Rally at 100 Main St. | https://example.org/x\nGAPS: none") + "\n=== ITEM 9: Precinct at 12 Oak Ave\nCANDIDATE: Z | y\nYour address: 5 Elm Rd, Springfield 62701", "5 Elm Rd, Springfield, IL");
  assert.deepStrictEqual(addr.addressLines, ["[C][+][STATED] 2026: Rally at 100 Main St. | https://example.org/x", "=== ITEM 9: Precinct at 12 Oak Ave", "Your address: 5 Elm Rd, Springfield 62701"]);
  assert.ok(!addr.items.some(i => /Main St|Oak Ave|Elm Rd/.test(i.title + i.answer)));
  assert.strictEqual(addr.items[2].title, "Item 9");

  // Each item scores through the calculator with the profile built from PRIORITIES.
  const st = {...defaultState(), mode: "values", axes: p.priorities.map(x => ({name: x.name, meaning: "", weight: x.weight}))};
  const race = calculate(calcProfile(st), p.items[0].answer, "original"), meas = calculate(calcProfile(st), p.items[1].answer, "original");
  assert.deepStrictEqual([race.errors, race.kind, meas.errors, meas.kind], [[], "race", [], "measure"]);
  assert.deepStrictEqual(race.result.rows.map(r => [r.name, r.incumbent, r.excluded]), [["Jo Roe", true, null], ["Sam Lee", false, null]]);
  assert.ok(race.result.call && meas.result.call);
  // Withdrawn candidates are matched by name: Pat Doe is not a candidate here, so it only warns.
  assert.ok(race.warnings.some(w => w.includes("withdrew")));

  // The flagged-items check: one prompt for the same chat, only the flagged items, no address.
  const step8 = "TASK: Check another AI's answer. Do not trust it.\n===== BEGIN QUESTION THAT WAS ASKED (do not answer it) =====\n{{the original step prompt}}\n===== END QUESTION =====\n===== BEGIN ANSWER TO CHECK =====\n{{the answer}}\n===== END ANSWER =====\nOUTPUT FORMAT:\nCHECK SUMMARY: x";
  const ck = checkFlagged(step8, [{n: 2, title: "Measure 1", answer: "MEASURE: Measure 1\n- [B][-][RECORD] 2026: f | https://e.org/1\n- [B][0][STATED] 2026: office at 9 Pine St | https://e.org/2", flags: ["toss-up, turns on: x"]}], "9 Pine St, Springfield, IL");
  assert.ok(ck.startsWith("TASK: Check your own earlier answers in this chat"));
  assert.ok(ck.includes("\nItem 2: toss-up, turns on: x") && ck.includes("=== ITEM 2: Measure 1\nMEASURE: Measure 1\n- [B][-][RECORD]"));
  assert.ok(!/Pine St|\{\{|Item 1/.test(ck) && ck.endsWith("so I can paste it into the Ballot Guide page."));
  // Long checks split at item headers under the 8,000-character copy limit.
  const many = Array.from({length: 12}, (_, i) => ({n: i + 1, title: "Race " + (i + 1), answer: ("- [A][+][RECORD] 2024: " + "x".repeat(900) + " | https://e.org\n").repeat(1), flags: ["1 problem"]}));
  const parts = splitForChat(checkFlagged(step8, many), LONG_COPY);
  assert.ok(parts.length > 1 && parts.every(x => x.length <= LONG_COPY + 200), parts.map(x => x.length).join());
  console.log("kit_test: export checks passed");
}

// A trimmed excerpt of a real free-chat export (public candidate and measure facts): fenced, loose
// tags, "then EVIDENCE:" on the MEASURE line, [UNVERIFIED] stubs, measure labels, GLOBAL GAPS.
{
  const {parseExport, NOT_COUNTED} = require("./kit.js");
  const {calculate, countEvidence, parseWeights} = require("./calc.js");
  const real = [
    "```", "",
    "PRIORITIES: A = Welfare state: public health care, education, strong safety net (3); B = Fair taxes: progressive taxes (3); C = Lifestyle neutrality (2); D = Good government (2).",
    "", "=== ITEM 1: Washington Initiative IP26-645",
    "MEASURE: Initiative IP26-645, then EVIDENCE:",
    "- [B][some][YES] Repeals the scheduled 9.9% income tax on income above $1 million and prohibits state and local income taxes. | https://www.sos.wa.gov/sites/default/files/2026-07/ExStmt_IP26-645.pdf",
    "- [UNVERIFIED] Campaign committee finance totals and top donors. | https://www.pdc.wa.gov/political-disclosure-reporting-data",
    "GAPS: Full current campaign-finance committee breakdown and verified top donors.",
    "", "=== ITEM 4: U.S. Representative, Washington District 6",
    "CANDIDATE: Emily Randall (challenger for this seat in 2026; incumbent status not verified for the 2026 term) | U.S. Representative candidate",
    "- [UNVERIFIED][DONORS] FEC reported $1,195,246.70 in receipts for January 1, 2025–July 15, 2026; top three donors not verified. | https://www.fec.gov/data/candidate/H4WA06117/",
    "GAPS: Voting record, questionnaire, current issue statements, top donors, endorsements.",
    "", "CANDIDATE: Teresa Fox | U.S. Representative candidate",
    "- [D][some][STATED] Campaign describes fiscal restraint, public safety, naval readiness, rural healthcare access, Title IX, and term limits. | https://foxforwa.com/",
    "- [RECORD] Former county official. | https://example.gov/fox",
    "GAPS: Questionnaire, top donors, verified endorsements.",
    "", "=== ITEM 27: County Charter Amendment 52",
    "MEASURE: Amendment 52, then EVIDENCE:",
    "- [YES] Reduces the minimum number of council meetings to at least 45 per year. | https://example.gov/vp",
    "- [COST] Fiscal impact is indeterminate but expected to be minimal. | https://example.gov/fis",
    "- [FOR] Supporters say the change allows a more practical schedule. | https://example.gov/vp",
    "- [AGAINST] No statement against was submitted. | https://example.gov/vp",
    "- [FUNDERS-YES] Supporting committee identified; totals not verified. | https://example.gov/cr",
    "- [FUNDERS-NO] Opposing committee reported small totals. | https://example.gov/cr2",
    "- [UNVERIFIED][FUNDERS-NO] No opposing committee finance total verified. | https://example.gov/cr",
    "WITHDRAWN: No withdrawals were verified in the reviewed material.",
    "GAPS: Full charter language.",
    "", "GLOBAL GAPS: This is a working export of the research gathered so far.",
    "Several local candidates have not been researched to the same depth.", "```",
  ].join("\n");
  const v = parseExport(real);
  assert.deepStrictEqual(v.priorities.map(x => [x.letter, x.weight]), [["A", 3], ["B", 3], ["C", 2], ["D", 2]]);
  assert.strictEqual(v.priorities[0].name, "Welfare state: public health care, education, strong safety net");
  // No line has a usable +/- sign, so the export is read as a neutral comparison instead.
  assert.deepStrictEqual(v.items.map(i => [i.n, i.kind, i.gaps, i.notCounted]), [[1, "measure", 1, 0], [4, "race", 1, 0], [27, "measure", 1, 0]]);
  assert.strictEqual(v.unscored, true);
  assert.deepStrictEqual([v.problems, v.notes], [[], ["GLOBAL GAPS: This is a working export of the research gathered so far. Several local candidates have not been researched to the same depth."]]);
  assert.ok(v.items[0].answer.startsWith("MEASURE: Initiative IP26-645\n[B][0][RECORD] Repeals"));
  assert.ok(v.items[1].answer.includes("[D][0][STATED] Campaign describes"));
  // A partial values export scores what it can: lines without a letter and a +/-/0 sign stay
  // visible as GAPS, never errors.
  const partial = parseExport(real.replace("[YES] Reduces", "[B][+][YES] Reduces").replace("[COST] Fiscal", "[D][-][COST] Fiscal"));
  assert.strictEqual(partial.unscored, false);
  assert.deepStrictEqual(partial.items.map(i => [i.n, i.notCounted]), [[1, 1], [4, 2], [27, 4]]);
  assert.ok(partial.items[1].answer.includes(NOT_COUNTED + " [D][some][STATED] Campaign describes"));
  const prof = "A=3, B=3, C=2, D=2";
  for (const it of partial.items) assert.deepStrictEqual(calculate(prof, it.answer, "original").errors, [], it.answer);
  assert.deepStrictEqual(calculate(prof, partial.items[2].answer, "original").result.rows[0].items, 2);
  // Neutral: a line with only a KIND counts under the topic General; measure labels map to kinds.
  const n = parseExport(real.replace(/^PRIORITIES:.*$/m, "").replace(/\[[A-D]\]\[some\]/g, "[Taxes][0]"));
  const m = n.items[2].answer.split("\n");
  assert.deepStrictEqual(m.slice(0, 7), ["MEASURE: Amendment 52",
    "[General][0][RECORD] Reduces the minimum number of council meetings to at least 45 per year. | https://example.gov/vp",
    "[General][0][RECORD] Fiscal impact is indeterminate but expected to be minimal. | https://example.gov/fis",
    "[General][0][STATED] Supporters say the change allows a more practical schedule. | https://example.gov/vp",
    "[General][0][STATED] No statement against was submitted. | https://example.gov/vp",
    "[General][0][FUNDER] Supporting committee identified; totals not verified. | https://example.gov/cr",
    "[General][0][FUNDER][against-funders-no] Opposing committee reported small totals. | https://example.gov/cr2"]);
  assert.deepStrictEqual(n.items.map(it => countEvidence(it.answer)).map(c => [c.recognized, c.errors.length, c.warnings.length]), [[1, 0, 0], [2, 0, 0], [6, 0, 0]]);
  // In values mode the against- event reads as opposing money (both-sides rule skips it).
  assert.deepStrictEqual(calculate(prof, "MEASURE: M\n[A][-][FUNDERS-NO] x | https://e.org".replace("FUNDERS-NO", "FUNDER][against-funders-no"), "original").errors, []);
  assert.ok(!Object.keys(parseWeights(prof).weights).includes("General"));
  console.log("kit_test: real export checks passed");
}

// Retest 3 (trimmed real export): every sign 0 and "NEUTRAL" in place of most letters, so the
// values export cannot be scored and is read as a neutral comparison. "ITEM n of N" gives the total.
{
  const {parseExport} = require("./kit.js");
  const {countEvidence} = require("./calc.js");
  const r3 = [
    "```",
    "PRIORITIES: A = Welfare state (3); B = Fair taxes (3); C = Lifestyle neutrality (2); D = Good government (2)",
    "",
    "=== ITEM 1 of 35: Initiative IP26-645",
    "MEASURE: Initiative IP26-645",
    "- [B][0][STATED] undated: A YES vote repeals the scheduled 9.9% income tax on income above $1 million | https://www.sos.wa.gov/sites/default/files/2026-07/ExStmt_IP26-645.pdf",
    "- [NEUTRAL][0][STATED] undated: Official voters’ pamphlet contains measure information and arguments | https://www.sos.wa.gov/sites/default/files/2026-09/IP26-645%20VP%20page%209.17.pdf",
    "GAPS: Detailed attributed FOR and AGAINST arguments not preserved.",
    "",
    "=== ITEM 4 of 35: U.S. Representative, District 6",
    "CANDIDATE: Emily Randall | U.S. Representative candidate",
    "- [NEUTRAL][0][FUNDER] undated: FEC reports $1,195,246.70 in receipts for January 1, 2025–July 15, 2026 | https://www.fec.gov/data/candidate/H4WA06117/",
    "CANDIDATE: Teresa Fox | U.S. Representative candidate",
    "- [NEUTRAL][0][STATED] undated: Campaign identifies fiscal restraint, public safety and term limits as issues | https://foxforwa.com/",
    "",
    "=== ITEM 20 of 35: District Court, Position 5",
    "CANDIDATE: Candidate X | District Court candidate",
    "GAPS: Official ballot confirmation and candidate research were not preserved.",
    "```",
  ].join("\n");
  const p = parseExport(r3);
  assert.deepStrictEqual([p.unscored, p.total, p.priorities.length, p.problems], [true, 35, 4, []]);
  assert.deepStrictEqual(p.items.map(i => [i.n, i.notCounted, countEvidence(i.answer).recognized]), [[1, 0, 2], [4, 0, 2], [20, 0, 0]]);
  assert.ok(p.items[0].answer.includes("[General][0][STATED] undated: Official voters")); // NEUTRAL reads as a sign word, so the topic is General;
  // One signed line is enough to score; the rest stay flagged.
  const one = parseExport(r3.replace("[B][0][STATED]", "[B][+][STATED]"));
  assert.deepStrictEqual([one.unscored, one.items.map(i => i.notCounted)], [false, [1, 2, 0]]);
  // 90% or more of the tagged lines unusable also falls back, even with one signed line.
  const many = r3.replace("GAPS: Official", Array.from({length: 9}, (_, i) => `- [NEUTRAL][0][STATED] f${i} | https://e.org/${i}`).join("\n") + "\nGAPS: Official");
  assert.strictEqual(parseExport(many.replace("[B][0][STATED]", "[B][+][STATED]")).unscored, true);
  // Neutral exports and pastes without PRIORITIES are never "unscored".
  assert.strictEqual(parseExport(r3.replace(/^PRIORITIES:.*$/m, "")).unscored, false);
  console.log("kit_test: retest 3 export checks passed");
}

// Review fixes: no fallback without the paste's own PRIORITIES; checker list lines are not headers;
// an empty repeat never replaces an item with lines; item 0 is rejected.
{
  const {parseExport, checkFlagged, NOT_COUNTED} = require("./kit.js");
  const {calculate} = require("./calc.js");
  const first = parseExport("PRIORITIES: A = Open records (3); B = Budgets (2); C = Parks (1)\n=== ITEM 1: Mayor\nCANDIDATE: X | y\n- [A][+][RECORD] 2025: f | https://e.org/1\n=== ITEM 2: Clerk\nCANDIDATE: Y | z\n- [B][-][RECORD] 2025: g | https://e.org/2\n=== ITEM 4: Measure 1\nMEASURE: Measure 1\n- [C][+][RECORD] 2025: h | https://e.org/3");
  assert.strictEqual(first.unscored, false);
  // The reviewer's repro: a later paste of item 5 with only 0 signs and no PRIORITIES, read into the values page.
  const later = parseExport("=== ITEM 5: Sheriff\nCANDIDATE: Z | w\n- [A][0][STATED] 2026: says x | https://e.org/4\n- [NEUTRAL][0][STATED] 2026: says y | https://e.org/5", "", ["A", "B", "C"]);
  assert.deepStrictEqual([later.unscored, later.unscoredWhy, later.priorities, later.problems], [false, "", [], []]);
  assert.strictEqual(later.items[0].answer, `CANDIDATE: Z | w\n[A][0][STATED] 2026: says x | https://e.org/4\n${NOT_COUNTED} [NEUTRAL][0][STATED] 2026: says y | https://e.org/5`);
  assert.deepStrictEqual(calculate("A=3, B=2, C=1", later.items[0].answer, "original").errors, []);
  // Without a known profile (neutral page) the same paste reads as neutral.
  assert.ok(parseExport("=== ITEM 5: Sheriff\nCANDIDATE: Z | w\n- [NEUTRAL][0][STATED] 2026: says y | https://e.org/5").items[0].answer.includes("[General][0][STATED]"));
  // Why the fallback happened: no +/- tags at all, or too few.
  assert.strictEqual(parseExport("PRIORITIES: A = x (3)\n=== ITEM 1: M\nCANDIDATE: Z | w\n- [A][0][STATED] f | https://e.org/1").unscoredWhy, "none");
  assert.strictEqual(parseExport("PRIORITIES: A = x (3)\n=== ITEM 1: M\nCANDIDATE: Z | w\n- [A][+][STATED] f | https://e.org/1\n" + Array.from({length: 9}, (_, i) => `- [some][STATED] g${i} | https://e.org/${i + 2}`).join("\n")).unscoredWhy, "few");

  // A checker reply: "- ITEM 4: ..." and "ITEM 4: ..." inside PROBLEMS are not headers; the corrected block is.
  const exp = "=== ITEM 4: Measure 1\nMEASURE: Measure 1\n- [Parks][0][RECORD] 2025: h | https://e.org/3";
  const reply = "CHECK SUMMARY: 1 CONFIRMED, 1 WRONG\nPROBLEMS:\n- ITEM 4: Measure 1: WRONG | rate is 12 cents\nITEM 4: also check the date\nCORRECTED ANSWER:\nITEM 4: Measure 1\nMEASURE: Measure 1\n- [Parks][0][RECORD] 2025: h2 | https://e.org/3b\nREMOVED: none";
  const fixed = parseExport(exp + "\n" + reply);
  assert.deepStrictEqual(fixed.items.map(i => [i.n, i.answer]), [[4, "MEASURE: Measure 1\n[Parks][0][RECORD] 2025: h2 | https://e.org/3b"]]);
  // A bare repeat with no lines keeps the earlier block.
  const bare = parseExport(exp + "\n=== ITEM 4: Measure 1");
  assert.ok(bare.items[0].answer.includes("2025: h |"));
  assert.deepStrictEqual(bare.notes, ["Item 4 came back empty; the earlier one is kept."]); // not also "the later one is used"
  // The flagged-check list uses "Item n:", which never reads back as a header.
  const ck = checkFlagged("TASK: x\n{{the original step prompt}}\n{{the answer}}", [{n: 4, title: "Measure 1", answer: "MEASURE: Measure 1", flags: ["toss-up"]}]);
  assert.ok(ck.includes("\nItem 4: toss-up") && !ck.includes("- ITEM"));
  assert.deepStrictEqual(parseExport(ck).items.map(i => [i.n, i.answer.split("\n")[0]]), [[4, "MEASURE: Measure 1"]]);
  // Item 0 is rejected and reported.
  const zero = parseExport("=== ITEM 0: Nothing\nCANDIDATE: Q | r\n=== ITEM 1: Mayor\nCANDIDATE: X | y");
  assert.deepStrictEqual(zero.items.map(i => i.n), [1]);
  assert.ok(/not a valid item number/.test(zero.problems[0]));
  console.log("kit_test: review fix checks passed");
}
