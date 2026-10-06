// Pure parse + score for the Ballot Guide score calculator. Mirrors scripts/score.py (ballot-guide/scripts/score.py after the folder move)
// exactly (same formula, same rounding, same calls). tools/build_kit.py inlines this
// file into docs/index.html; tools/calc_test.js tests it under Node.
const KIND = {record: 3, funder: 2, stated: 1};
const SIGN = {"+": 1, "0": 0, "-": -1};
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Python's round() is half-to-even; Math.round rounds 12.5 up to 13, score.py gives 12.
function pyRound(x) {
  const f = Math.floor(x), d = x - f;
  if (d !== 0.5) return d < 0.5 ? f : f + 1;
  return f % 2 === 0 ? f : f + 1;
}

// Accepts Step 1 profile lines ("A | Name | meaning | weight 3") or short form ("A=3, B=2").
// Other lines are ignored so the whole pasted profile works. First weight for a letter wins,
// because the Step 1 template's EXAMPLES section comes after the voter's own axes.
function parseWeights(text) {
  const weights = {}, warnings = [];
  const set = (letter, w) => {
    const L = letter.toUpperCase();
    if (has(weights, L)) {
      if (weights[L] !== w) warnings.push(`Axis ${L} is listed more than once; using the first weight (${weights[L]}).`);
      return;
    }
    weights[L] = w;
  };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z])\b.*?\bweight\s*([1-3])\b/i);
    if (m) { set(m[1], Number(m[2])); continue; }
    for (const s of line.matchAll(/\b([A-Za-z])\s*=\s*(\d+)\b/g)) {
      const w = Number(s[2]);
      if (w >= 1 && w <= 3) set(s[1], w);
      else warnings.push(`Weight for ${s[1].toUpperCase()} must be 1, 2 or 3 (found ${s[2]}); ignored.`);
    }
  }
  return {weights, warnings};
}

// Chats reformat the requested plain text: bold, bullets, numbered lists, headings, tables.
// Strip that dressing so a line reads the same however the chat styled it.
function normLine(raw) {
  return String(raw).replace(/\*\*|__|`/g, "").trim()
    .replace(/^#+\s*/, "")
    .replace(/^(?:[-*•]\s*|\d+[.)]\s+)+/, "")
    .trim();
}

// Sign words some chats write instead of symbols.
const SIGN_WORD = {"+": "+", "plus": "+", "positive": "+", "supports": "+",
  "-": "-", "−": "-", "–": "-", "minus": "-", "negative": "-", "opposes": "-",
  "0": "0", "mixed": "0", "neutral": "0"};
const normSign = s => { const t = s.trim().toLowerCase(); return has(SIGN_WORD, t) ? SIGN_WORD[t] : s.trim(); };

// Pulls axis, sign and kind from "[A][+][RECORD] ..." or a table row "| A | + | RECORD | ... |".
// Returns null when the line is not in either shape.
function evidenceParts(line) {
  if (line.startsWith("|")) {
    const cells = line.split("|").slice(1).map(c => c.trim());
    if (cells.length && cells[cells.length - 1] === "") cells.pop();
    if (cells.length < 3) return null;
    return {axis: cells[0].replace(/^\[|\]$/g, "").trim(), sign: cells[1].replace(/^\[|\]$/g, ""), kind: cells[2].replace(/^\[|\]$/g, "").trim()};
  }
  const m = line.match(/^\[\s*([^\]]*?)\s*\]\s*\[\s*([^\]]*?)\s*\]\s*\[\s*([^\]]*?)\s*\]/);
  return m ? {axis: m[1], sign: m[2], kind: m[3]} : null;
}

// A line that looks like it meant to be evidence; used so nothing is dropped without a warning.
const LOOKS_LIKE_EVIDENCE = /\b(RECORD|FUNDER|STATED)\b|\[\s*[A-Za-z]\s*\]/;
const TABLE_RULE = /^\|[\s|:-]+\|?$/;

// Reads one Step 3 (race) or Step 4 (measure) output. Invalid evidence lines are reported
// with their text and left out of the math instead of stopping the whole calculation.
function parseResearch(text, weights) {
  const options = [], errors = [];
  let kind = null, name = "", cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = normLine(raw);
    let m;
    if ((m = line.match(/^CANDIDATE:\s*([^|]*)/i))) {
      if (kind === "measure") { errors.push({line, msg: "Paste one race or one measure at a time, not both."}); cur = null; continue; }
      kind = "race";
      cur = {name: m[1].trim() || `Candidate ${options.length + 1}`, red_line: false, evidence: []};
      options.push(cur);
      continue;
    }
    if ((m = line.match(/^MEASURE:\s*(.*)$/i))) {
      if (kind) { errors.push({line, msg: "Paste one race or one measure at a time."}); cur = null; continue; }
      kind = "measure"; name = m[1].trim();
      cur = {name: "YES", red_line: false, evidence: []};
      options.push(cur);
      continue;
    }
    if (/^RED LINE CROSSED:\s*yes/i.test(line)) { if (cur) cur.red_line = true; continue; }
    if (!line || TABLE_RULE.test(line) || /^(RED LINE CROSSED|GAPS):/i.test(line)) continue;
    if (cur) cur.lines = (cur.lines || 0) + 1;
    const ev = evidenceParts(line);
    const isTable = line.startsWith("|");
    // A table row whose kind cell is not a kind (a header row, or a claims table) is not evidence.
    if (!ev || (isTable && !has(KIND, ev.kind.toLowerCase()))) {
      // A table row with a one-letter axis or a readable sign was meant as evidence: warn, never drop silently.
      const meant = isTable && ev && (/^[A-Za-z]$/.test(ev.axis) || has(SIGN, normSign(ev.sign)));
      if (meant || LOOKS_LIKE_EVIDENCE.test(line) || (!isTable && line.startsWith("["))) {
        errors.push({line, msg: "Could not read this evidence line (expected the form [A][+][RECORD]); skipped."});
      }
      continue;
    }
    const axis = ev.axis.toUpperCase(), sign = normSign(ev.sign), k = ev.kind.toLowerCase();
    const bad = [];
    if (!has(weights, axis)) bad.push(`axis "${ev.axis}" is not in your weights (${Object.keys(weights).sort().join(", ") || "none"})`);
    if (!has(SIGN, sign)) bad.push(`sign "${ev.sign}" (use + 0 -)`);
    if (!has(KIND, k)) bad.push(`kind "${ev.kind}" (use RECORD, FUNDER or STATED)`);
    if (!cur) bad.push("no CANDIDATE: or MEASURE: line above it");
    if (bad.length) { errors.push({line, msg: "Skipped: " + bad.join("; ") + "."}); continue; }
    cur.evidence.push({axis, sign, kind: k});
  }
  // An option with text under it but no usable evidence is almost always a format problem.
  for (const o of options) {
    if (o.lines && !o.evidence.length) {
      errors.push({line: "", msg: `No evidence lines recognized for ${kind === "measure" ? name || "the measure" : o.name}; check the format.`});
    }
    delete o.lines;
  }
  return {kind, name, options, errors};
}

// Neutral mode has no weights; count what parses with every letter allowed, so the page can
// still say how many evidence lines were read and how many need a look.
function countEvidence(text) {
  const any = {};
  for (let i = 0; i < 26; i++) any[String.fromCharCode(65 + i)] = 1;
  const p = parseResearch(text, any);
  if (!p.options.length) p.errors.push({line: "", msg: "No CANDIDATE: or MEASURE: line found."});
  return {recognized: p.options.reduce((t, o) => t + o.evidence.length, 0), errors: p.errors};
}

// Average within each kind first, so many weak items cannot outweigh a few records.
function scoreOption(opt, weights) {
  let num = 0, den = 0;
  const kinds = [];
  for (const [kind, k] of Object.entries(KIND)) {
    const items = opt.evidence.filter(e => e.kind === kind);
    const a = items.reduce((t, e) => t + weights[e.axis], 0);
    if (a) {
      const sa = items.reduce((t, e) => t + SIGN[e.sign] * weights[e.axis], 0);
      num += k * sa / a; // same operation order as score.py so the floats match
      den += k;
      kinds.push({kind, k, sa, a, n: items.length});
    }
  }
  const records = opt.evidence.filter(e => e.kind === "record").length;
  if (den === 0) return {score: null, confidence: "none", records, kinds, num, den, uncapped: null};
  const uncapped = pyRound(50 + 50 * num / den);
  const score = opt.red_line ? Math.min(uncapped, 20) : uncapped;
  const confidence = records >= 4 ? "high" : records >= 2 ? "medium" : "low";
  return {score, confidence, records, kinds, num, den, uncapped};
}

// Unopposed candidate: judge the score on its own (same cutoffs as score.py).
function soloCall(r) {
  if (r.score === null) return "Not enough evidence";
  return r.score >= 60 ? `Vote for ${r.name}` : r.score >= 41 ? "Your call" : "Consider leaving blank or writing in";
}

function scoreRace(options, weights, isMeasure) {
  let rows = options.map(o => ({name: o.name, red_line: o.red_line, items: o.evidence.length, ...scoreOption(o, weights)}));
  if (isMeasure && rows.length === 1) {
    const y = rows[0];
    rows = [{...y, name: "YES"}, {...y, name: "NO", score: y.score === null ? null : 100 - y.score}];
  }
  if (rows.length > 1 && rows.some(r => r.score === null)) return {call: "Not enough evidence", rows};
  if (rows.length === 1) return {call: soloCall(rows[0]), rows}; // unopposed: vote or leave blank
  rows.sort((p, q) => q.score - p.score); // stable, like Python's sort(reverse=True)
  const gap = rows.length > 1 ? rows[0].score - rows[1].score : 100;
  const top = rows[0].name;
  return {call: gap >= 15 ? top : gap >= 6 ? `Lean ${top}` : "Toss-up", rows};
}

function calculate(weightsText, researchText) {
  const {weights, warnings} = parseWeights(weightsText);
  if (!Object.keys(weights).length) {
    return {warnings, errors: [{line: "", msg: "No value weights found. Paste your Step 1 profile or type A=3, B=2."}], result: null};
  }
  const p = parseResearch(researchText, weights);
  if (!p.options.length) {
    p.errors.push({line: "", msg: "No CANDIDATE: or MEASURE: line found. Paste one Step 3 or Step 4 output."});
    return {warnings, errors: p.errors, result: null};
  }
  return {warnings, errors: p.errors, kind: p.kind, name: p.name, weights, result: scoreRace(p.options, weights, p.kind === "measure")};
}

if (typeof module === "object" && module.exports) {
  module.exports = {pyRound, normLine, parseWeights, parseResearch, countEvidence, scoreOption, scoreRace, calculate};
}
