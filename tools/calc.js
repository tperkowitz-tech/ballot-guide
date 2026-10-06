// Pure parse + score for the Ballot Guide score calculator. Mirrors ballot-guide/scripts/score.py
// exactly (same formula, same rounding, same calls); tools/calc_test.js fuzzes the two for parity.
// tools/build_kit.py inlines this file into docs/index.html.
const KIND = {record: 3, stated: 1, funder: 1};
// Stated beats funder when they tie on weight: it is the candidate's own position.
const RANK = {record: 3, stated: 2, funder: 1};
const SIGN = {"+": 1, "0": 0, "-": -1};
const K0 = 3; // neutral prior worth one record, so one item cannot pin an axis at 100
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
  "0": "0", "mixed": "0", "neutral": "0",
  "gray": "gray", "grey": "gray", "g": "gray", "torn": "gray"};
const validSign = s => has(SIGN, s) || s === "gray";
const normSign = s => { const t = s.trim().toLowerCase(); return has(SIGN_WORD, t) ? SIGN_WORD[t] : s.trim(); };

// Pulls axis, sign, kind, optional event and the remaining text from
// "[A][+][RECORD][hb1217] ..." or a table row "| A | + | RECORD | ... |" (tables have no event).
// Returns null when the line is not in either shape.
function evidenceParts(line) {
  if (line.startsWith("|")) {
    const cells = line.split("|").slice(1).map(c => c.trim());
    if (cells.length && cells[cells.length - 1] === "") cells.pop();
    if (cells.length < 3) return null;
    return {axis: cells[0].replace(/^\[|\]$/g, "").trim(), sign: cells[1].replace(/^\[|\]$/g, ""), kind: cells[2].replace(/^\[|\]$/g, "").trim(), rest: cells.slice(3).join(" | ")};
  }
  const m = line.match(/^\[\s*([^\]]*?)\s*\]\s*\[\s*([^\]]*?)\s*\]\s*\[\s*([^\]]*?)\s*\](?:\s*\[\s*([^\]]*?)\s*\])?/);
  return m ? {axis: m[1], sign: m[2], kind: m[3], event: m[4] || "", rest: line.slice(m[0].length).trim()} : null;
}

// Source = first http(s) URL; date = first YYYY-MM-DD or YYYY before the "date: fact" colon.
// URLs are removed before looking for the colon so "https:" is never mistaken for it.
function sourceAndDate(rest) {
  const url = rest.match(/https?:\/\/[^\s|<>)\]]+/);
  const bare = rest.replace(/https?:\/\/\S+/g, ""), colon = bare.indexOf(":");
  const date = colon < 0 ? null : bare.slice(0, colon).match(/\b(\d{4}-\d{2}-\d{2}|\d{4})\b/);
  return {source: url ? url[0] : "", date: date ? date[1] : ""};
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
    // "RED LINE CROSSED: yes: <what> | <URL>" keeps what was crossed: "<what> | <URL>", or true.
    if ((m = line.match(/^RED LINE CROSSED:\s*yes\b(.*)$/i))) {
      if (cur) {
        const url = m[1].match(/https?:\/\/[^\s|<>)\]]+/);
        const what = m[1].replace(/https?:\/\/\S+/g, "").replace(/^[\s:|,.-]+|[\s|]+$/g, "");
        cur.red_line = [what, url ? url[0] : ""].filter(Boolean).join(" | ") || true;
      }
      continue;
    }
    if (!line || TABLE_RULE.test(line) || /^(RED LINE CROSSED|GAPS):/i.test(line)) continue;
    if (cur) cur.lines = (cur.lines || 0) + 1;
    const ev = evidenceParts(line);
    const isTable = line.startsWith("|");
    // A table row whose kind cell is not a kind (a header row, or a claims table) is not evidence.
    if (!ev || (isTable && !has(KIND, ev.kind.toLowerCase()))) {
      // A table row with a one-letter axis or a readable sign was meant as evidence: warn, never drop silently.
      const meant = isTable && ev && (/^[A-Za-z]$/.test(ev.axis) || validSign(normSign(ev.sign)));
      if (meant || LOOKS_LIKE_EVIDENCE.test(line) || (!isTable && line.startsWith("["))) {
        errors.push({line, msg: "Could not read this evidence line (expected the form [A][+][RECORD]); skipped."});
      }
      continue;
    }
    const axis = ev.axis.toUpperCase(), sign = normSign(ev.sign), k = ev.kind.toLowerCase();
    const bad = [];
    if (!has(weights, axis)) bad.push(`axis "${ev.axis}" is not in your weights (${Object.keys(weights).sort().join(", ") || "none"})`);
    if (!validSign(sign)) bad.push(`sign "${ev.sign}" (use + 0 - gray)`);
    if (!has(KIND, k)) bad.push(`kind "${ev.kind}" (use RECORD, FUNDER or STATED)`);
    if (!cur) bad.push("no CANDIDATE: or MEASURE: line above it");
    if (bad.length) { errors.push({line, msg: "Skipped: " + bad.join("; ") + "."}); continue; }
    const row = {axis, sign, kind: k, ...sourceAndDate(ev.rest), text: ev.rest};
    if (ev.event) row.event = ev.event;
    if (!row.source) delete row.source;
    if (!row.date) delete row.date;
    cur.evidence.push(row);
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

const isGray = ev => ev.sign === "gray" || ev.gray === true;

// Same page, same key: lowercase scheme/host, drop query and fragment, strip trailing /.
function normSource(url) {
  url = url.trim().split("#")[0].split("?")[0];
  const m = url.match(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*)(.*)$/s);
  if (m) url = m[1].toLowerCase() + m[2];
  return url.replace(/\/+$/, "");
}
// Lowercase, collapse whitespace, drop leading [..] tags and a leading date.
function normText(text) {
  text = text.toLowerCase().replace(/\s+/g, " ").trim();
  text = text.replace(/^(\[[^\]]*\]\s*)+/, "");
  return text.replace(/^[0-9]{4}(-[0-9]{2}-[0-9]{2})?\s*:?\s*/, "");
}
// Same as score.py event_key(): explicit event, else source, else row text, else unique.
function eventKey(ev, i) {
  if (ev.event) return "e:" + ev.event;
  const src = ev.source ? normSource(ev.source) : "";
  if (src) return "s:" + src;
  const txt = ev.text ? normText(ev.text) : "";
  return txt ? "t:" + txt : `\0${i}`;
}

// Same checks and messages as score.py validate().
function validateRace(options, weights, isMeasure) {
  const axes = Object.keys(weights);
  const errs = axes.length ? [] : ["profile has no value axes"];
  for (const a of axes) {
    const w = weights[a];
    if (!Number.isInteger(w) || w < 1 || w > 3) errs.push(`weight for ${a} must be an integer 1-3 (found ${w})`);
  }
  if (!options || !options.length) errs.push("race has no options");
  else if (isMeasure && options.length !== 1) errs.push(`a measure must have exactly one option, the YES side (found ${options.length})`);
  for (const o of options || []) {
    for (const ev of o.evidence || []) {
      if (!has(weights, ev.axis)) errs.push(`${o.name}: axis "${ev.axis}" not in profile (${axes.slice().sort().join(", ")})`);
      if (!validSign(ev.sign)) errs.push(`${o.name}: sign "${ev.sign}" (use + - 0 gray)`);
      if (!has(KIND, ev.kind)) errs.push(`${o.name}: kind "${ev.kind}" (use record, stated, funder)`);
    }
  }
  return errs;
}

// Split out gray rows; collapse rows of one event (see eventKey) to one entry per axis,
// keeping the strongest kind.
function collapse(opt) {
  const gray = [], groups = new Map(), warnings = [];
  (opt.evidence || []).forEach((ev, i) => {
    if (isGray(ev)) { gray.push(ev); return; }
    const key = eventKey(ev, i);
    if (!groups.has(key)) {
      const label = ev.event || ev.text || ev.source || `${opt.name} item ${i + 1}`;
      groups.set(key, {label, rows: []});
      if (!ev.event && !ev.source) warnings.push(`${opt.name}: No source: duplicates of this line cannot be detected (${label}).`);
    }
    groups.get(key).rows.push(ev);
  });
  const events = [];
  for (const g of groups.values()) {
    const entries = [];
    for (const axis of new Set(g.rows.map(r => r.axis))) {
      const rows = g.rows.filter(r => r.axis === axis);
      const kind = rows.reduce((best, r) => RANK[r.kind] > RANK[best] ? r.kind : best, rows[0].kind);
      const signs = new Set(rows.filter(r => r.kind === kind).map(r => r.sign));
      if (signs.size > 1) warnings.push(`${opt.name}: conflicting tags for one event (${g.label}) on axis ${axis}; using 0.`);
      entries.push([axis, kind, signs.size === 1 ? SIGN[[...signs][0]] : 0]);
    }
    events.push({label: g.label, entries});
  }
  return {events, gray, warnings};
}

// Returns {score, total, W}; total and W feed the page's "Show the math".
function fitParts(events, weights) {
  const num = {}, den = {}, funders = {};
  for (const a of Object.keys(weights)) { num[a] = 0; den[a] = 0; funders[a] = []; }
  for (const ev of events) {
    for (const [axis, kind, s] of ev.entries) {
      if (kind === "funder") { funders[axis].push(s); continue; }
      num[axis] += KIND[kind] * s; den[axis] += KIND[kind];
    }
  }
  // All donors on an axis count as one entry (k = 1, mean sign), as in score.py.
  for (const a of Object.keys(weights).sort()) {
    const f = funders[a];
    if (f.length) { num[a] += f.reduce((t, s) => t + s, 0) / f.length; den[a] += 1; }
  }
  let total = 0, W = 0;
  for (const a of Object.keys(weights).sort()) total += weights[a] * (num[a] / (den[a] + K0)); // same order as score.py
  for (const a of Object.keys(weights)) W += weights[a];
  return {score: pyRound(50 + 50 * total / W), total, W};
}
const fit = (events, weights) => fitParts(events, weights).score;

function summarize(opt, weights) {
  const {events, gray, warnings} = collapse(opt);
  const entries = events.flatMap(ev => ev.entries);
  let covered = 0, W = 0;
  for (const a of new Set(entries.filter(e => e[1] !== "funder").map(e => e[0]))) covered += weights[a];
  for (const a of Object.keys(weights)) W += weights[a];
  const cov = covered / W;
  const records = events.filter(ev => ev.entries.some(e => e[1] === "record")).length;
  const recordAxes = new Set(entries.filter(e => e[1] === "record").map(e => e[0])).size;
  const level = !events.length ? "none"
    : cov >= 0.75 && records >= 3 && recordAxes >= 2 ? "strong"
    : cov >= 0.5 && records >= 2 ? "moderate" : "thin";
  const parts = events.length ? fitParts(events, weights) : {score: null, total: 0, W};
  const row = {name: opt.name, score: parts.score, evidence: level, confidence: level,
    coverage: pyRound(cov * 100) / 100, events: events.length, records, gray,
    excluded: !opt.red_line ? null : typeof opt.red_line === "string" && opt.red_line.trim() ? `red line: ${opt.red_line.trim()}` : "red line",
    // Older page fields: num/den give "Score = round(50 + 50 × num / den)".
    red_line: !!opt.red_line, items: (opt.evidence || []).length, kinds: [], num: parts.total, den: parts.W, uncapped: parts.score};
  return {row, events, cov, warnings};
}

function leaderOf(scores) {
  const top = Math.max(...scores);
  return scores.filter(s => s === top).length === 1 ? scores.indexOf(top) : null;
}

// Returns [call, turns_on]. Leave-one-out: a call that one event can flip is a toss-up.
function decide(rows, events, covs, eligible, measure, weights) {
  const tossUp = ev => [`Toss-up (turns on: ${ev.label})`, ev.label];
  if (!eligible.length) return ["All options crossed a red line", null];
  if (measure) {
    const s = rows[0].score;
    if (s === null) return ["Not enough evidence", null];
    const m = s - 50;
    if (m === 0) return ["Toss-up", null];
    for (const ev of events[0]) {
      const m2 = fit(events[0].filter(e => e !== ev), weights) - 50;
      if (m2 === 0 || (m2 > 0) !== (m > 0)) return tossUp(ev);
    }
    const side = m > 0 ? "YES" : "NO";
    return [Math.abs(m) >= 10 && covs[0] >= 0.5 && rows[0].evidence !== "thin" ? side : `Lean ${side}`, null];
  }
  if (eligible.length === 1) {
    const r = rows[eligible[0]];
    if (r.score === null) return ["Not enough evidence", null];
    if (r.evidence !== "thin" && r.score >= 60) return [`Vote for ${r.name}`, null];
    if (r.evidence !== "thin" && r.score <= 40) return ["Consider leaving blank or writing in", null];
    return ["Your call", null];
  }
  const scores = eligible.map(i => rows[i].score);
  if (scores.includes(null)) return ["Not enough evidence", null];
  const lead = leaderOf(scores);
  if (lead === null) return ["Toss-up", null];
  for (let j = 0; j < eligible.length; j++) {
    for (const ev of events[eligible[j]]) {
      const alt = scores.slice();
      alt[j] = fit(events[eligible[j]].filter(e => e !== ev), weights);
      if (leaderOf(alt) !== lead) return tossUp(ev);
    }
  }
  const second = Math.max(...scores.filter((s, j) => j !== lead));
  const runner = scores.findIndex((s, j) => j !== lead && s === second);
  const name = rows[eligible[lead]].name;
  // Statements alone never make a clear call: the leader needs more than thin evidence.
  const clear = scores[lead] - second >= 10 && covs[eligible[lead]] >= 0.5 && covs[eligible[runner]] >= 0.5
    && rows[eligible[lead]].evidence !== "thin";
  return [clear ? name : `Lean ${name}`, null];
}

// Returns {call, turns_on, rows, warnings, errors}; errors means nothing was scored.
function scoreRace(options, weights, isMeasure) {
  const errors = validateRace(options, weights, isMeasure);
  if (errors.length) return {call: null, turns_on: null, rows: [], warnings: [], errors};
  const rows = [], events = [], covs = [], warnings = [];
  for (const o of options) {
    const s = summarize(o, weights);
    rows.push(s.row); events.push(s.events); covs.push(s.cov); warnings.push(...s.warnings);
  }
  const eligible = options.map((o, i) => i).filter(i => !options[i].red_line);
  const [call, turns_on] = decide(rows, events, covs, eligible, !!isMeasure, weights);
  return {call, turns_on, rows, warnings, errors};
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
  const res = scoreRace(p.options, weights, p.kind === "measure");
  const errors = p.errors.concat(res.errors.map(msg => ({line: "", msg})));
  return {warnings: warnings.concat(res.warnings), errors, kind: p.kind, name: p.name, weights, result: res.errors.length ? null : res};
}

if (typeof module === "object" && module.exports) {
  module.exports = {pyRound, normLine, parseWeights, parseResearch, countEvidence, scoreRace, calculate};
}
