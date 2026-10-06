// Pure text builders for the "Build your profile" form and the step Copy buttons. No DOM here,
// so tools/kit_test.js can check the exact text under Node. tools/build_kit.py inlines this file
// into docs/index.html, next to calc.js.
const NEUTRAL_LINE = "Neutral mode: do not collect values, score, rank, or recommend.";
const NEUTRAL_STEP7 = "Neutral mode: no scores, best matches or calls; use | Race | Choices | Key sourced differences |.";
// Small or offline chats answer from memory when they cannot browse; make them say so instead.
const WEB_GATE = "First: if you cannot open web pages in this chat, and no source pages are pasted below, reply only with NO WEB ACCESS and stop. Do not guess or answer from memory. Use only the pages you open or the pages pasted here.";
const ADDRESS_WITHHELD = "Address: withheld (not needed for this step)";
const BALLOT_STEP = 2; // the only step that needs the street address
// Browser: calc.js is inlined before this file and defines normLine. Node: load it.
const lineNorm = typeof require === "function" ? require("./calc.js").normLine : normLine;

function defaultState() {
  return {
    mode: "neutral", address: "", date: "",
    axes: [1, 2, 3].map(() => ({name: "", meaning: "", weight: 2})),
    gray: "", red: "", stakes: "", viability: false,
    crowded: "all", minShare: "", minMoney: "", includeOffice: false, always: "",
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
  const out = ["VALUES PROFILE",
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
// output table for Step 7. Function replacements keep "$" in user text from acting as a pattern.
function fillStep(stepIndex, stepText, state, extras) {
  const ex = extras || {};
  let text = stepText;
  if (stepIndex === 3 && ex.race && ex.race.trim()) text = text.replace(/^(RACE: )\{\{[^}]*\}\}/m, (_, p) => p + ex.race.trim());
  if (stepIndex === 4 && ex.measure && ex.measure.trim()) text = text.replace(/^(MEASURE: )\{\{[^}]*\}\}/m, (_, p) => p + ex.measure.trim());
  if (stepIndex === 7 && state.mode !== "values") text += "\n\n" + NEUTRAL_STEP7;
  return text;
}

// "Copy for chat": web gate, rules, profile, step, then any attached answers (extras.attach),
// so a fresh chat has everything it needs.
function forChat(stepIndex, rulesText, stepText, state, extras) {
  const ex = extras || {};
  let parts;
  if (stepIndex === 0) parts = [rulesText];
  else if (stepIndex === 1) parts = [buildProfile(state)];
  else parts = [rulesText, buildProfile(state, stepIndex === BALLOT_STEP), fillStep(stepIndex, stepText, state, ex)];
  if (ex.attach) parts.push(ex.attach);
  return [WEB_GATE, ...parts].join("\n\n");
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
// dropped because it is tied to the address. Rows it cannot read are returned in `skipped`.
function parseBallot(text) {
  const races = [], measures = [], skipped = [];
  let section = null, sawHeading = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = lineNorm(raw);
    const h = line.match(/^(DISTRICTS|RACES|MEASURES|UNVERIFIED)\s*:?\s*$/i);
    if (h) { section = h[1].toUpperCase(); sawHeading = true; continue; }
    if (!line || /^\|[\s|:-]+\|?$/.test(line) || (section !== "RACES" && section !== "MEASURES")) continue;
    const c = cells(line);
    if ((c && /^(office|name|measure)$/i.test(c[0])) || /^none\b/i.test(line)) continue; // table header, empty section
    if (!c || c.length < 2) { skipped.push(line); continue; }
    const srcI = c.findIndex(x => /https?:\/\/|^source\s*:/i.test(x));
    const source = srcI < 0 ? "" : c[srcI].replace(/^source\s*:\s*/i, "");
    if (section === "RACES") {
      const stI = c.findIndex(x => /^(UNCONTESTED|CONTESTED|CROWDED)\b/i.test(x));
      const rest = c.filter((_, i) => i !== srcI && i !== stI);
      const three = rest.length >= 3;
      races.push({office: rest[0], position: three ? rest[1] : "", candidates: rest.slice(three ? 2 : 1).join(" | "),
        status: stI < 0 ? "" : c[stI].toUpperCase(), source});
    } else {
      const rest = c.filter((_, i) => i !== srcI);
      measures.push({name: rest[0], summary: rest.slice(1).join(" | "), source});
    }
  }
  return {races, measures, skipped, sawHeading};
}

// The text that fills RACE: or MEASURE: in Steps 3 and 4.
function raceText(r) {
  return [r.office, r.position].filter(Boolean).join(", ") + (r.candidates ? ": " + r.candidates : "");
}
function measureText(m) {
  return m.name + (m.summary ? " (" + m.summary + ")" : "");
}

// Steps 6 and 7 need the whole ballot list and every Step 3/4 answer in one paste, each under
// its own header so the chat can tell them apart. items: {kind, text, note, answer, calc}.
function bundleAnswers(items) {
  const list = items.map(it => `- ${it.kind.toUpperCase()}: ${it.text}${it.note ? " | " + it.note : ""}`);
  const out = ["BALLOT LIST (from Step 2)", ...(list.length ? list : ["- (empty)"])];
  items.forEach((it, i) => {
    out.push("", `=== ${it.kind.toUpperCase()} ${i + 1} OF ${items.length}: ${it.text} ===`,
      it.answer.trim() || "(no answer pasted yet)");
    if (it.calc) out.push("CALCULATOR: " + it.calc);
  });
  return out.join("\n");
}

if (typeof module === "object" && module.exports) {
  module.exports = {WEB_GATE, ADDRESS_WITHHELD, defaultState, letters, axisLines, focusRuleSentence, buildProfile, fillStep, forChat,
    parseBallot, raceText, measureText, bundleAnswers};
}
