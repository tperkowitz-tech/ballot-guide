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
  assert.ok(full.includes("TASK: Collect evidence for ONE race.") && full.includes("RACE: Mayor: A vs B") && full.includes("OUTPUT FORMAT:\nCANDIDATE: {{name}}"));
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
