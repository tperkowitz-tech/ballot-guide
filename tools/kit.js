// Pure text builders for the "Build your profile" form and the step Copy buttons. No DOM here,
// so tools/kit_test.js can check the exact text under Node. tools/build_kit.py inlines this file
// into docs/index.html, next to calc.js.
const NEUTRAL_LINE = "Neutral mode: do not collect values, score, rank, or recommend.";
const NEUTRAL_STEP7 = "Neutral mode: no scores, best matches or calls; use | Race | Choices | Key sourced differences |.";

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

function buildProfile(state) {
  const values = state.mode === "values";
  const out = ["VALUES PROFILE",
    `Address: ${state.address.trim() || "not given"}`,
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

// "Copy for chat": rules, then profile, then the step, so a fresh chat has everything it needs.
function forChat(stepIndex, rulesText, stepText, state, extras) {
  if (stepIndex === 0) return rulesText;
  if (stepIndex === 1) return buildProfile(state);
  return [rulesText, buildProfile(state), fillStep(stepIndex, stepText, state, extras)].join("\n\n");
}

if (typeof module === "object" && module.exports) {
  module.exports = {defaultState, letters, axisLines, focusRuleSentence, buildProfile, fillStep, forChat};
}
