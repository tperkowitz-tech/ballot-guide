// Pure text builders for the "Build your profile" form and the step Copy buttons. No DOM here,
// so tools/kit_test.js can check the exact text under Node. tools/build_kit.py inlines this file
// into docs/index.html, next to calc.js.
const NEUTRAL_LINE = "Neutral mode: do not collect values, score, rank, or recommend.";
const NEUTRAL_STEP7 = "Neutral mode: no scores, best matches or calls; use | Race | Choices | Key sourced differences |.";
// Neutral Steps 3/4 replace the + / - / 0 / gray legend: judging a sign without values marked
// good answers as problems. calc.js countEvidence reads this [TOPIC][0][KIND] form.
const NEUTRAL_EVIDENCE = "Neutral mode: write every evidence line as [TOPIC][0][KIND] where TOPIC is one short word such as Housing. Do not judge + or −.";
// Step 6 checks that only make sense with scores, gray areas, red lines or the calculator.
const SCORED_CHECKS = /^(6|7|8|11|12|14|15|17|18)\. .*\n/gm;
// Small or offline chats answer from memory when they cannot browse; make them say so instead.
const WEB_GATE = "First: if you cannot search the web or open web pages in this chat, and no source pages are pasted below, reply only with NO WEB ACCESS and stop. Searching the web counts as access. Do not guess or answer from memory. Use only the pages you open or the pages pasted here.";
const ADDRESS_WITHHELD = "Address: withheld (not needed for this step)";
const BALLOT_STEP = 2; // the only step that needs the street address
const DOUBLE_CHECK_STEP = 8;
// Browser: calc.js is inlined before this file and defines these. Node: load it.
const {normLine: lineNorm, cleanMd: mdPlain, countEvidence: evidenceCount} =
  typeof require === "function" ? require("./calc.js") : {normLine, cleanMd, countEvidence};

function defaultState() {
  return {
    mode: "neutral", address: "", date: "",
    axes: [1, 2, 3].map(() => ({name: "", meaning: "", weight: 2})),
    gray: "", red: "", stakes: "", viability: false,
    crowded: "all", minShare: "", minMoney: "", includeOffice: false, always: "",
    doubleCheck: true,
  };
}

function letters(n) {
  return Array.from({length: n}, (_, i) => String.fromCharCode(65 + i));
}

const lines = text => String(text || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
// Empty, non-numeric or negative inputs count as "not set" rather than as a zero threshold.
const amount = v => { const n = Number(v); return String(v).trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null; };

// The "A | name | meaning | weight n" lines, in the format calc.js parseWeights reads.
function axisLines(state) {
  const ls = letters(state.axes.length);
  return state.axes.map((a, i) =>
    `${ls[i]} | ${a.name.trim() || "(not filled)"} | ${a.meaning.trim() || "(not filled)"} | weight ${a.weight}`);
}

function focusRuleSentence(state) {
  const share = amount(state.minShare), money = amount(state.minMoney);
  const any = [];
  if (share !== null) any.push(`at least ${share}% of the vote in a certified primary or polling average`);
  if (money !== null) any.push(`at least $${money.toLocaleString("en-US")} in reported contributions`);
  if (state.includeOffice) any.push("holds or held elected office");
  const always = state.always.trim();
  const parts = [];
  if (any.length) parts.push("research candidates who meet any of these: " + any.join("; "));
  if (always) parts.push("always include " + always);
  return parts.join(", and ");
}

// The address identifies a person, so it is included only when asked for (the ballot lookup).
function buildProfile(state, withAddress) {
  const values = state.mode === "values";
  // Neutral mode has no values; the steps still say "VALUES PROFILE", so the title names it.
  const out = [values ? "VALUES PROFILE" : "YOUR ELECTION (the profile the steps call VALUES PROFILE)",
    withAddress ? `Address: ${state.address.trim() || "not given"}` : ADDRESS_WITHHELD,
    `Election date: ${state.date || "not given"}`,
    `Mode: ${values ? "Values match" : "Neutral comparison"}`];
  if (!values) out.push(NEUTRAL_LINE);
  if (values) {
    out.push("Value axes:", ...axisLines(state));
    for (const [label, text] of [["Gray areas:", state.gray], ["Red lines:", state.red], ["Personal stakes:", state.stakes]]) {
      const ls = lines(text);
      if (ls.length) out.push(label, ...ls.map(l => "- " + l));
    }
    out.push(`Viability: ${state.viability ? "show separately" : "do not show"}`);
  }
  // A focus choice with no thresholds filled in has no rule to apply, so it falls back to everyone.
  const rule = state.crowded === "focus" ? focusRuleSentence(state) : "";
  out.push("Crowded races (5+ candidates): " + (rule
    ? `focus rule: ${rule}; excluded candidates are listed with the rule they missed.`
    : "research every candidate"));
  return out.join("\n");
}

// The step text as pasted: the race or measure filled into its {{...}} line, plus the neutral
// edits (Steps 3/4 evidence form, Step 6 checks, Step 7 table). Function replacements keep "$"
// in user text from acting as a pattern. kit_test.js checks the edits against prompts.md.
function fillStep(stepIndex, stepText, state, extras) {
  const ex = extras || {}, neutral = state.mode !== "values";
  let text = stepText;
  if (stepIndex === 3 && ex.race && ex.race.trim()) text = text.replace(/^(RACE: )\{\{[^}]*\}\}/m, (_, p) => p + ex.race.trim());
  if (stepIndex === 4 && ex.measure && ex.measure.trim()) text = text.replace(/^(MEASURE: )\{\{[^}]*\}\}/m, (_, p) => p + ex.measure.trim());
  if (neutral && (stepIndex === 3 || stepIndex === 4)) {
    text = text.replace(/^For each item, choose the axis letter.*\n(?:(?:[-+0]|gray) = .*\n)+/m, NEUTRAL_EVIDENCE + "\n")
      .replace(/^For each fact, give an axis letter.*\n/m, NEUTRAL_EVIDENCE + "\n")
      .split("[{{axis}}][{{+ / - / 0 / gray}}]").join("[{{TOPIC}}][0]")
      .replace(" Use gray for topics the profile lists as torn/gray areas.", "");
  }
  if (neutral && stepIndex === 6) {
    text = text.replace(SCORED_CHECKS, "").replace(", and do they count as one item per value in the math?", "?")
      .replace("fix the outputs, run Step 5 again, then", "fix the outputs, then");
  }
  if (stepIndex === 7 && neutral) text += "\n\n" + NEUTRAL_STEP7;
  return text;
}

// A short message for the same chat when its answer was not in the step's format: the step's
// own OUTPUT FORMAT section (neutral edits applied), so it never drifts from prompts.md.
function fixFormat(stepIndex, stepText, state) {
  const fmt = fillStep(stepIndex, stepText, state).split(/^OUTPUT FORMAT[^\n]*\n/m)[1];
  if (!fmt) throw new Error(`Step ${stepIndex} has no OUTPUT FORMAT section`);
  return "Your last answer was not in the format I need. Rewrite it in exactly this format. Keep every fact and URL; add no other text.\n\n" + fmt.trim();
}

// Long Step 6/7 pastes get cut off by some chats. Split at "=== " item headers into parts of
// about max characters; the chat answers OK until the last part. ponytail: one item longer
// than max stays a single oversized part rather than being cut mid-answer.
function splitForChat(text, max) {
  const limit = max || 12000;
  if (text.length <= limit) return [text];
  const chunks = [];
  for (const block of text.split(/\n(?==== )/)) {
    if (chunks.length && chunks[chunks.length - 1].length + 1 + block.length <= limit) chunks[chunks.length - 1] += "\n" + block;
    else chunks.push(block);
  }
  const n = chunks.length;
  if (n === 1) return chunks;
  return chunks.map((c, i) => i < n - 1
    ? `Part ${i + 1} of ${n}. Reply only OK and wait for the rest.\n\n${c}`
    : `Part ${n} of ${n}.\n\n${c}\n\nNow do the task above using all parts.`);
}

// Step 8 text with the checked question and answer filled in. extras: {checkStep, question (the
// raw Step 2/3/4 text, filled here the same way the first chat got it), race/measure, answer}.
function fillCheck(stepText, state, ex) {
  let text = stepText;
  if (ex.question != null) {
    const q = fillStep(ex.checkStep, ex.question, state, ex);
    text = text.replace("{{the original step prompt}}", () => q);
  }
  if (ex.answer != null) text = text.replace("{{the answer}}", () => mdPlain(ex.answer).trim());
  return text;
}

// "Copy for chat": web gate, rules, profile, step, then any attached answers (extras.attach),
// so a fresh chat has everything it needs.
function forChat(stepIndex, rulesText, stepText, state, extras) {
  const ex = extras || {};
  let parts;
  if (stepIndex === 0) parts = [rulesText];
  else if (stepIndex === 1) parts = [buildProfile(state)];
  // Checking the ballot list is the ballot lookup again, so only that check gets the address.
  else if (stepIndex === DOUBLE_CHECK_STEP) parts = [rulesText, buildProfile(state, ex.checkStep === BALLOT_STEP), fillCheck(stepText, state, ex)];
  else parts = [rulesText, buildProfile(state, stepIndex === BALLOT_STEP), fillStep(stepIndex, stepText, state, ex)];
  if (ex.attach) parts.push(ex.attach);
  return [WEB_GATE, ...parts].join("\n\n");
}

// The checker's reply after its "CORRECTED ANSWER:" line, tolerating markdown bold and headings;
// null when there is none. A fenced answer is taken from inside its fence. The only other cut is a
// REMOVED: line, which the prompt places after the answer. Closing remarks are deliberately kept:
// guessing where chatter starts deleted real candidates and red lines, and the calculator ignores
// prose. GAPS: is not a cut point: Step 3/4 answers carry a GAPS: line inside each block.
function extractCorrected(text) {
  const ls = String(text || "").split(/\r?\n/);
  const i = ls.findIndex(l => /^[\s#>*_]*CORRECTED ANSWER\b/i.test(l));
  if (i < 0) return null;
  const first = ls[i].replace(/^[\s#>*_]*CORRECTED ANSWER\b[\s*_:]*/i, "").replace(/^(below|follows)\b[\s*_:.]*/i, "");
  let body = [first, ...ls.slice(i + 1)];
  const isFence = l => /^\s*```/.test(l);
  if (ls.slice(0, i).filter(isFence).length % 2) {
    // The heading sits inside an open fence (the whole reply was fenced): the answer runs to its close.
    const end = body.findIndex((l, j) => j > 0 && isFence(l));
    if (end >= 0 && body.slice(0, end).some(l => l.trim())) body = body.slice(0, end);
    else if (end >= 0) {
      // The fence closed right after the heading; the answer is in the next fenced block.
      const open = body.findIndex((l, j) => j > end && isFence(l));
      const close = open < 0 ? -1 : body.findIndex((l, j) => j > open && isFence(l));
      body = open < 0 ? [] : body.slice(open + 1, close < 0 ? body.length : close);
    }
  } else {
    const fence = body.findIndex(isFence);
    if (fence >= 0) {
      const end = body.findIndex((l, j) => j > fence && isFence(l));
      body = body.slice(fence + 1, end < 0 ? body.length : end);
    }
  }
  // The prompt puts REMOVED: after the answer, so it is the only safe cut. Other closing remarks
  // stay: the calculator ignores prose, and guessing where chatter starts deleted real answer lines.
  const cut = body.findIndex(l => /^[\s#>*_]*REMOVED[\s*_]*:/i.test(l));
  if (cut >= 0) body = body.slice(0, cut);
  while (body.length && !body[0].trim()) body.shift();
  while (body.length && !body[body.length - 1].trim()) body.pop();
  return body.length ? body.join("\n") : null;
}

// Whether a corrected answer is in a format the page can use: candidate or measure blocks, or a
// ballot list's RACES/MEASURES section. "No changes needed" and other prose is not, and neither
// is one whose evidence lines no longer parse when the original's did (original: the answer checked).
function usableCorrected(text, original) {
  const shaped = String(text || "").split(/\r?\n/).map(lineNorm)
    .some(l => /^(CANDIDATE|MEASURE):/i.test(l) || /^(RACES|MEASURES)\s*:?\s*$/i.test(l));
  return shaped && !(original && evidenceCount(original).recognized && !evidenceCount(text).recognized);
}

// Counts from the "CHECK SUMMARY:" line. Each label takes the number written right before it
// ("12 CONFIRMED") if no earlier label claimed that number, else the one right after it
// ("CONFIRMED: 12"), so both orders and mixed punctuation parse. Null when there are no counts.
function checkSummary(text) {
  const m = String(text || "").match(/CHECK SUMMARY[^\n]*(?:\n[^\n]*){0,4}/i);
  if (!m) return null;
  const seg = m[0].split(/PROBLEMS|CORRECTED ANSWER/i)[0];
  const keys = [["confirmed", /^CONFIRMED$/i], ["wrong", /^WRONG$/i], ["notFound", /^NOT/i], ["noSource", /^NO/i]];
  // A markdown table: label header row, then a row of numbers mapped by column (|---| rows skipped).
  const rows = seg.split("\n").map(cells).filter(c => c && !c.every(x => /^:?-*:?$/.test(x)));
  const hi = rows.findIndex(c => c.some(x => /CONFIRMED/i.test(x)));
  if (hi >= 0 && rows[hi + 1] && rows[hi + 1].every(x => /^\d+$/.test(x.replace(/\*\*/g, "")))) {
    const out = {confirmed: 0, wrong: 0, notFound: 0, noSource: 0};
    rows[hi].forEach((h, j) => {
      const k = keys.find(([, r]) => r.test(h.replace(/\*\*/g, "").trim()));
      if (k && rows[hi + 1][j] !== undefined) out[k[0]] = Number(rows[hi + 1][j].replace(/\*\*/g, ""));
    });
    return out;
  }
  const toks = [...seg.matchAll(/\d+|\b(?:CONFIRMED|WRONG|NOT[\s_-]*FOUND|NO[\s_-]*SOURCE)\b/gi)].map(t => t[0]);
  const used = new Set(), out = {confirmed: 0, wrong: 0, notFound: 0, noSource: 0};
  let any = false;
  toks.forEach((t, j) => {
    if (/^\d/.test(t)) return;
    const n = j > 0 && /^\d/.test(toks[j - 1]) && !used.has(j - 1) ? j - 1 : /^\d/.test(toks[j + 1] || "") ? j + 1 : -1;
    if (n < 0) return;
    used.add(n);
    out[keys.find(([, r]) => r.test(t))[0]] = Number(toks[n]);
    any = true;
  });
  return any ? out : null;
}

// "12 confirmed · 1 wrong · 2 not found"; zero counts other than confirmed are left out.
function checkLine(sum) {
  return [[sum.confirmed, "confirmed"], [sum.wrong, "wrong"], [sum.notFound, "not found"], [sum.noSource, "no source"]]
    .filter(([n], i) => i === 0 || n).map(([n, l]) => `${n} ${l}`).join(" · ");
}

// Splits a markdown or plain row into cells; a row without "|" is not a row.
function cells(line) {
  if (!line.includes("|")) return null;
  const c = line.split("|").map(s => s.trim());
  if (c[0] === "") c.shift();
  if (c.length && c[c.length - 1] === "") c.pop();
  return c;
}

// Reads the Step 2 answer into checklist rows. Only RACES and MEASURES are kept; DISTRICTS is
// dropped because it is tied to the address. Rows it cannot read are returned in `skipped` as
// {line, kind}, so the page can offer them as editable rows instead of dropping them. Unreadable
// lines that may hold an address go to `addressLines` instead: they are shown, never saved.
// Broad on purpose: a held-back line is shown to the user, never lost, while a missed address
// would be saved. Ballot numbering ("District 4", "Position 12345", "Proposition 50") is not a
// house number or ZIP; street words are never articles or prepositions (as in check_evidence.py).
// "Court" after an office word that follows an ordinal ("10th District Court") is a court; house
// numbers are cardinals, so "12 County Ct" stays an address.
// ponytail: cardinal "for 3 Circuit Court" still matches; add words to BALLOT_NO if real ballots trip it.
const BALLOT_NO = String.raw`(?<!\b(?:District|Dist|Position|Pos|Seat|Proposition|Prop|Measure|Question|Issue|Amendment|Initiative|Referendum|Ordinance|Resolution|Department|Dept|Division|Ward|Precinct|Circuit|Article|Section|Chapter|Bill|HB|SB|No|Number|Num)\.?\s+#?)`;
const STREET = new RegExp(BALLOT_NO + String.raw`\b\d{1,6}(?:st|nd|rd|th)?\s+(?:(?!(?:the|a|an|to|of|in|on|at|for|and|by|from)\s)[\w.'-]+\s+){0,4}?(?:St|Street|Ave|Avenue|Rd|Road|Ln|Lane|Blvd|Boulevard|Dr|Drive|Way|(?<!\d(?:st|nd|rd|th)\s+(?:[A-Za-z.'-]+\s+){0,3}(?:District|Circuit|Superior|Supreme|Appeals|Appellate|Municipal|County|Common|Pleas|Probate|Juvenile|Domestic|Claims|Tax|Family|Court)\s+)(?:Ct|Court)|Pl|Place|Ter|Terrace|Hwy|Highway|Pkwy|Parkway|Cir|Circle|Loop|Trl|Trail|Sq|Square|Route|Rte)\b`, "i");
const ZIP = new RegExp(BALLOT_NO + String.raw`\b\d{5}(?:-\d{4})?\b`);
function mayHaveAddress(line, address) {
  const a = String(address || "").trim().toLowerCase().split(",")[0].trim();
  line = line.replace(/https?:\/\/\S+/gi, " "); // source links are not addresses
  return STREET.test(line) || ZIP.test(line) || /\bP\.?\s*O\.?\s*Box\b/i.test(line)
    || /polling place|your address/i.test(line) || (a.length > 3 && line.toLowerCase().includes(a));
}
// `unverified`: rows the chat marked UNVERIFIED (never items); `noUrl`: rows kept whose source is
// not a web address. Both are lines for the page to show, not save.
function parseBallot(text, address = "") {
  const races = [], measures = [], skipped = [], addressLines = [], unverified = [], noUrl = [];
  let section = null, sawHeading = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = lineNorm(raw);
    const h = line.match(/^(DISTRICTS|RACES|MEASURES|UNVERIFIED)\s*:?\s*$/i);
    if (h) { section = h[1].toUpperCase(); sawHeading = true; continue; }
    // A checker's corrected list may append these; their rows are not ballot items.
    if (/^(GAPS|REMOVED|PROBLEMS|CHECK SUMMARY)\b/i.test(line)) { section = null; continue; }
    if (!line || /^\|[\s|:-]+\|?$/.test(line) || !section || section === "DISTRICTS") continue;
    const c = cells(line);
    if ((c && /^(office|name|measure)$/i.test(c[0])) || /^none\b/i.test(line)) continue; // table header, empty section
    // "UNVERIFIED: could not open PDF | ..." and the UNVERIFIED section are notes, not items.
    if (section === "UNVERIFIED" || /^UNVERIFIED\b/i.test(c ? c[0] : line)) {
      (mayHaveAddress(line, address) ? addressLines : unverified).push(line);
      continue;
    }
    if (mayHaveAddress(line, address)) { addressLines.push(line); continue; }
    if (!c || c.length < 2) {
      skipped.push({line, kind: section === "RACES" ? "race" : "measure"});
      continue;
    }
    const srcI = c.findIndex(x => /https?:\/\/|^source\s*:/i.test(x));
    const source = srcI < 0 ? "" : c[srcI].replace(/^source\s*:\s*/i, "");
    const stI = section === "RACES" ? c.findIndex(x => /^(UNCONTESTED|CONTESTED|CROWDED)\b/i.test(x)) : -1;
    const rest = c.filter((_, i) => i !== srcI && i !== stI), three = section === "RACES" && rest.length >= 3;
    // A row whose candidates (race) or name (measure) are only UNVERIFIED placeholders is a note.
    const who = section === "RACES" ? rest.slice(three ? 2 : 1) : rest.slice(0, 1);
    if (who.length && who.every(x => /^UNVERIFIED\b/i.test(x))) { unverified.push(line); continue; }
    if (!/https?:\/\//i.test(source)) noUrl.push(line);
    if (section === "RACES") {
      races.push({office: rest[0], position: three ? rest[1] : "", candidates: rest.slice(three ? 2 : 1).join(" | "),
        status: stI < 0 ? "" : c[stI].toUpperCase(), source});
    } else {
      measures.push({name: rest[0], summary: rest.slice(1).join(" | "), source});
    }
  }
  return {races, measures, skipped, addressLines, unverified, noUrl, sawHeading};
}

// The calculator's profile: the axis lines plus any gray (torn) topics, so calc.js knows a
// gray tag is allowed. No address, stakes or red lines.
function calcProfile(state) {
  const gray = lines(state.gray);
  // "=" and "weight" would read as an axis weight in parseWeights.
  return axisLines(state).concat(gray.length ? ["Gray areas:", ...gray.map(l => "- " + l.replace(/=/g, " ").replace(/\bweight\b/gi, "wt"))] : []).join("\n");
}

// The text that fills RACE: or MEASURE: in Steps 3 and 4.
function raceText(r) {
  return [r.office, r.position].filter(Boolean).join(", ") + (r.candidates ? ": " + r.candidates : "");
}
function measureText(m) {
  return m.name + (m.summary ? " (" + m.summary + ")" : "");
}

// Steps 6 and 7 need the whole ballot list and every Step 3/4 answer in one paste, each under
// its own header so the chat can tell them apart. items: {kind, text, note, answer, calc, check}.
function bundleAnswers(items) {
  const list = items.map(it => `- ${it.kind.toUpperCase()}: ${it.text}${it.note ? " | " + it.note : ""}`);
  const out = ["BALLOT LIST (from Step 2)", ...(list.length ? list : ["- (empty)"])];
  items.forEach((it, i) => {
    out.push("", `=== ${it.kind.toUpperCase()} ${i + 1} OF ${items.length}: ${it.text} ===`,
      mdPlain(it.answer).trim() || "(no answer pasted yet)");
    if (it.calc) out.push("CALCULATOR: " + it.calc);
    if (it.check) out.push("DOUBLE-CHECK: " + it.check);
  });
  return out.join("\n");
}

// Test report: these option lists must match .github/ISSUE_TEMPLATE/test-report.yml exactly
// (kit_test.js checks), or GitHub silently ignores the prefilled value.
const REPORT_STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana",
  "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah",
  "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "Other/territory"];
const REPORT_OVERALL = ["Worked well", "Worked with fixes", "Did not work"];
const REPORT_KEYS = ["state", "area", "election", "election_date", "used_in", "model", "mode", "steps", "overall", "problems", "version"];
const REPORT_BASE = "https://github.com/tperkowitz-tech/ballot-guide/issues/new?template=test-report.yml";

// Allow-list, not block-list: anything else handed in (an address, values, answers) never reaches the URL.
function testReportUrl(fields) {
  const q = REPORT_KEYS.map(k => [k, String((fields || {})[k] ?? "").trim()]).filter(([, v]) => v);
  return REPORT_BASE + q.map(([k, v]) => "&" + k + "=" + encodeURIComponent(v)).join("");
}

// A short reply that is the chat refusing or failing, not an answer: "noweb", "error" or "".
// Gemini, for one, answers election prompts with a generic error.
function chatRefused(text) {
  const t = String(text).trim();
  if (/NO WEB ACCESS/.test(t)) return "noweb";
  // A reply with a link or a format line is an answer, even if it quotes an error.
  if (/https?:\/\//.test(t) || /^\s*(?:CANDIDATE|MEASURE|RACES|MEASURES|DISTRICTS|CHECK SUMMARY|UNVERIFIED)\b|^\s*[-*]?\s*\[/im.test(t)) return "";
  if (t.length < 400 && /encounter(?:ed|ing) an error|something went wrong|try again later|could you try again|can[’']t help with (?:that|responses on elections)|unable to help with (?:that|elections)/i.test(t)) return "error";
  return "";
}

if (typeof module === "object" && module.exports) {
  module.exports = {WEB_GATE, ADDRESS_WITHHELD, DOUBLE_CHECK_STEP, NEUTRAL_EVIDENCE, defaultState, letters, axisLines, focusRuleSentence, buildProfile, fillStep, fixFormat, splitForChat, forChat,
    mayHaveAddress, parseBallot, calcProfile, raceText, measureText, bundleAnswers, fillCheck, extractCorrected, usableCorrected, checkSummary, checkLine,
    REPORT_STATES, REPORT_OVERALL, REPORT_KEYS, testReportUrl, chatRefused};
}
