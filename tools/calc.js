// Pure parse + score for the Ballot Guide score calculator. Mirrors ballot-guide/scripts/score.py
// exactly (same formula, same rounding, same calls); tools/calc_test.js fuzzes the two for parity.
// tools/build_kit.py inlines this file into docs/index.html.
const KIND = {record: 3, questionnaire: 2, stated: 1, funder: 1, endorsement: 1};
// Breaks ties within one event: the candidate's own words beat what others give or say.
const RANK = {record: 5, questionnaire: 4, stated: 3, endorsement: 2, funder: 1};
const AGGREGATE = ["funder", "endorsement"]; // pooled to one entry per axis
const SOLO = ["record", "stated"]; // counted per event; questionnaire answers pool per axis
const OWN = ["record", "questionnaire", "stated"]; // the candidate's own evidence; counts toward coverage
const SIGN = {"+": 1, "0": 0, "-": -1};
const K0 = 3; // neutral prior worth one record, so one item cannot pin an axis at 100
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// Kind names as written in evidence lines, including the short forms Q and E; null if not a kind.
const KIND_ALIAS = {q: "questionnaire", e: "endorsement"};
const kindOf = s => { const k = s.trim().toLowerCase(); return has(KIND, k) ? k : has(KIND_ALIAS, k) ? KIND_ALIAS[k] : null; };

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
// Strip that dressing so a line reads the same however the chat styled it. Copy buttons that
// give Markdown source escape punctuation ("\[A\]", "\|") and end lines with "\"; undo that first.
// ChatGPT renders a pasted "\[A\]" as math, and its Copy button then gives "$A$$+$$RECORD$";
// those tags at a line start (after any bullet) read as "[A][+][RECORD]". kit.js runs cleanMd on
// stored answers before copying them, so neither form is pasted back into a chat.
// Google AI Mode's Copy gives names as "[name](https://www.google.com/search?...)" and sources as
// "[site](url)" with "[1, 2]" footnote markers and a trailing "[n] [site](url)" list; mdLink keeps
// the words, except a site-like label on a real link becomes its URL so the source stays readable.
// Not "words (url)": in a ballot row the first cell with a URL is the source, so a linked
// candidate name would become the row's source.
const SEARCH_LINK = /^https?:\/\/(?:www\.)?google\.[a-z.]+\/search\b/i;
// ponytail: site-like = a URL, a dotted domain, a citation number or a known source name; any
// other source label becomes text and gets the "no web address" warning. Add names as they show up.
const SITE_LABEL = /^(?:https?:\/\/\S+|[\w-]+(?:\.[\w-]+)+(?:\/\S*)?|\d+|ballotpedia|vote411|fec|opensecrets|votesmart|vote smart|wikipedia)$/i;
const mdLink = (all, label, url) => !SEARCH_LINK.test(url) && SITE_LABEL.test(label.trim()) ? url : label;
// A footnote marker: "[1]" or "[1, 2]" right after sentence-ending punctuation, or at the end of a
// line or table cell. Elsewhere ("Amendment [1] to", "Rule 12[1] says") the number is kept.
const FOOTNOTE = String.raw`\[\d+(?:\s*,\s*\d+)*\]`;
function cleanMd(text) {
  return String(text).replace(/\\([^\sA-Za-z0-9])/g, "$1").replace(/[^\S\r\n]*\\+[^\S\r\n]*$/gm, "")
    .replace(/^([^\S\r\n]*(?:(?:[-*•_]|\d+[.)])[^\S\r\n]*)*)((?:\$[^$\r\n]+\$){2,})/gm, (all, pre, run) => {
      // Only tag-like runs: a letter or topic first ("$5$$10$ fee" stays), and a kind or a sign.
      const t = run.slice(1, -1).split("$$");
      return /^\s*[A-Za-z]/.test(t[0]) && t.some(x => kindOf(x) || validSign(normSign(x))) ? pre + t.map(x => `[${x}]`).join("") : all;
    })
    // Footnote list lines: "[1] [site](url)" or "[1] https://...".
    .replace(/^[^\S\r\n]*\[\d+\][^\S\r\n]*(?:\[[^\]\r\n]*\]\([^\r\n]*\)|https?:\/\/\S+)[^\S\r\n]*$/gm, "")
    .replace(/\[([^\]\r\n]*)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)/g, mdLink)
    // A tag after another tag ("[Housing][0]") is evidence, never a footnote; "([1])" goes whole.
    .replace(new RegExp(String.raw`(?<=[.!?]["”')]?)[^\S\r\n]*\(?${FOOTNOTE}\)?|(?<!\])[^\S\r\n]*\(?${FOOTNOTE}\)?(?=[^\S\r\n]*(?:\||$))`, "gm"), "")
    .replace(/^[^\S\r\n]*[-*•][^\S\r\n]*$/gm, ""); // empty bullets
}
function normLine(raw) {
  return cleanMd(raw)
    .replace(/\*\*|__|`/g, "").trim()
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
const LOOKS_LIKE_EVIDENCE = /\b(RECORD|QUESTIONNAIRE|STATED|FUNDER|ENDORSEMENT)\b|\[\s*[A-Za-z]\s*\]/;
const TABLE_RULE = /^\|[\s|:-]+\|?$/;
// "[A][+][RECORD] 2024: UNVERIFIED ..." is a placeholder the prompt asks for, not a fact.
const UNCONFIRMED = /^(?:\d{4}(?:-\d{2}-\d{2})?\s*:?\s*)?UNVERIFIED\b/i;
// A chatbot's closing offer ("Would you like me to…", "Let me know if…"); it and any list under it are not part of the answer.
const CLOSING_OFFER = /^(?:would you like|do you want|want me to|shall i|should i|let me know|if you(?:['’]d| would)? like|i can also|i could also)\b/i;
const NEUTRAL_ANSWER = "This answer was written for a neutral comparison. Copy the question again (it now asks for your priorities' letters) and paste the new answer.";
const GAPS_END = /^(RED LINE CROSSED|EVIDENCE:|WHAT YES DOES|WHAT NO MEANS|STRONGEST ARGUMENTS|CLAIMS CHECKED|CANDIDATE:|MEASURE:)/i;

// Reads one Step 3 (race) or Step 4 (measure) output. Invalid evidence lines are reported
// with their text and left out of the math instead of stopping the whole calculation.
// neutral: nothing is scored, so any topic word is an axis and the sign may be left out
// ("[Housing][0][RECORD]" or "[Housing][RECORD]"); values mode (the default) is unchanged.
function parseResearch(text, weights, neutral) {
  const form = neutral ? "[TOPIC][0][RECORD]" : "[A][+][RECORD]";
  const options = [], errors = [], warnings = [];
  // Values mode: an answer whose every axis is a topic word ("Housing", not "AA", "Axis A" or
  // "A1", which are mistyped letters) was written for neutral mode; one message replaces the
  // per-line errors on its topic lines.
  const axisErrs = new Set();
  let otherAxes = 0, topicAxes = 0;
  const isTopic = a => (a.match(/[A-Za-z]/g) || []).length >= 3 && !/\b[A-Za-z]\b|\d/.test(a);
  let kind = null, name = "", cur = null, section = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = normLine(raw);
    let m;
    // The checker's REMOVED/PROBLEMS/summary sections list facts that were NOT confirmed, often in
    // evidence form; scoring them would count removed facts. Skip until the next CANDIDATE:/MEASURE:.
    if (/^(REMOVED|PROBLEMS|CHECK SUMMARY)\s*(:|$)/i.test(line) || CLOSING_OFFER.test(line)) { section = "stopped"; cur = null; continue; }
    if (section === "stopped" && !/^(CANDIDATE|MEASURE):/i.test(line)) continue;
    // Step 3 asks the chat to name, not research, a candidate missing from the race line.
    if (/^NEW CANDIDATE\s*:/i.test(line)) {
      warnings.push(`The chat found a candidate not on your ballot list. Check your official ballot, then edit the race line if needed: ${line}`);
      continue;
    }
    // GAPS sits inside an option (before RED LINE or EVIDENCE: is common), so it only pauses
    // evidence until the option's next structural line; its items are unconfirmed, never scored.
    if (/^GAPS\s*(:|$)/i.test(line)) { section = "gaps"; continue; }
    if (section === "gaps" && !GAPS_END.test(line)) {
      const ev = evidenceParts(line);
      if ((ev && (!line.startsWith("|") || kindOf(ev.kind))) || LOOKS_LIKE_EVIDENCE.test(line)) {
        warnings.push(`Evidence line under GAPS ignored: ${line}`);
      }
      continue;
    }
    section = null;
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
    if (!line || TABLE_RULE.test(line) || /^RED LINE CROSSED:/i.test(line)) continue;
    if (cur) cur.lines = (cur.lines || 0) + 1;
    let ev = evidenceParts(line);
    const isTable = line.startsWith("|");
    if (neutral && !isTable && (!ev || !kindOf(ev.kind))) {
      const two = line.match(/^\[\s*([^\]]*?)\s*\]\s*\[\s*([^\]]*?)\s*\]/);
      if (two && kindOf(two[2])) ev = {axis: two[1], sign: "0", kind: two[2], event: "", rest: line.slice(two[0].length).trim()};
    }
    // A table row whose kind cell is not a kind (a header row, or a claims table) is not evidence.
    if (!ev || (isTable && !kindOf(ev.kind))) {
      // A table row with a one-letter axis or a readable sign was meant as evidence: warn, never drop silently.
      const meant = isTable && ev && (/^[A-Za-z]$/.test(ev.axis) || validSign(normSign(ev.sign)));
      if (/^\[\s*[A-Za-z]\s*\]/.test(line)) otherAxes++; // a mistyped values line: not a neutral answer
      if (meant || LOOKS_LIKE_EVIDENCE.test(line) || (!isTable && line.startsWith("["))) {
        errors.push({line, msg: `Could not read this evidence line (expected the form ${form}); skipped.`});
      }
      continue;
    }
    const topic = isTopic(ev.axis);
    if (topic) topicAxes++; else otherAxes++;
    if (UNCONFIRMED.test(ev.rest)) {
      warnings.push(`Not confirmed by the chat; not counted: ${line}`);
      if (cur) cur.lines--;
      continue;
    }
    const axis = ev.axis.toUpperCase(), sign = neutral ? "0" : normSign(ev.sign), k = kindOf(ev.kind);
    const bad = [];
    if (neutral ? !axis : !has(weights, axis)) bad.push(neutral ? "no topic in the first [ ]" : `axis "${ev.axis}" is not in your weights (${Object.keys(weights).sort().join(", ") || "none"})`);
    if (!validSign(sign)) bad.push(`sign "${ev.sign}" (use + 0 - gray)`);
    if (!k) bad.push(`kind "${ev.kind}" (use RECORD, QUESTIONNAIRE, STATED, FUNDER or ENDORSEMENT)`);
    if (!cur) bad.push("no CANDIDATE: or MEASURE: line above it");
    if (bad.length) {
      const e = {line, msg: "Skipped: " + bad.join("; ") + "."};
      if (!neutral && topic) axisErrs.add(e);
      errors.push(e);
      continue;
    }
    const row = {axis, sign, kind: k, ...sourceAndDate(ev.rest), text: ev.rest};
    if (ev.event) row.event = ev.event;
    // Chats often give a citation title instead of the link; the line still counts.
    if (!row.source) { delete row.source; warnings.push(`No web address for the source; ask the chat for the full link: ${line}`); }
    if (!row.date) delete row.date;
    cur.evidence.push(row);
  }
  const wasNeutral = !neutral && topicAxes > 0 && !otherAxes;
  if (wasNeutral) {
    errors.splice(0, errors.length, ...errors.filter(e => !axisErrs.has(e)));
    errors.push({line: "", msg: NEUTRAL_ANSWER});
  }
  // An option with text under it but no usable evidence is almost always a format problem.
  for (const o of options) {
    if (o.lines && !o.evidence.length && !wasNeutral) {
      errors.push({line: "", msg: `No evidence lines recognized for ${kind === "measure" ? name || "the measure" : o.name}; check the format.`});
    }
    delete o.lines;
  }
  return {kind, name, options, errors, warnings};
}

// Neutral mode has no weights; count what parses (any topic, no sign needed), so the page can
// still say how many evidence lines were read and how many need a look.
function countEvidence(text) {
  const p = parseResearch(text, {}, true);
  if (!p.options.length) p.errors.push({line: "", msg: "No CANDIDATE: or MEASURE: line found."});
  // Warnings (no link, new candidate, ignored GAPS evidence) are shown as "to check" and do not
  // block the item; errors do.
  return {recognized: p.options.reduce((t, o) => t + o.evidence.length, 0), errors: p.errors, warnings: p.warnings.map(msg => ({line: "", msg}))};
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
      if (!has(KIND, ev.kind)) errs.push(`${o.name}: kind "${ev.kind}" (use record, questionnaire, stated, funder, endorsement)`);
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

// Returns {score, low, high, total, W}; all null when no axis has any evidence. total and W
// (the weight of axes with evidence) feed the page's "Show the math".
function fitParts(events, weights) {
  const num = {}, den = {}, pooled = {}, quest = {};
  for (const a of Object.keys(weights)) { num[a] = 0; den[a] = 0; pooled[a] = []; quest[a] = []; }
  for (const ev of events) {
    for (const [axis, kind, s] of ev.entries) {
      if (AGGREGATE.includes(kind)) pooled[axis].push(s);
      else if (kind === "questionnaire") quest[axis].push(s);
      else { num[axis] += KIND[kind] * s; den[axis] += KIND[kind]; }
    }
  }
  const mean = f => f.reduce((t, s) => t + s, 0) / f.length;
  for (const a of Object.keys(weights).sort()) {
    // All answers on an axis are one entry worth at most one record (k = 3), as in score.py.
    if (quest[a].length) {
      const k = Math.min(KIND.questionnaire * quest[a].length, KIND.record);
      num[a] += k * mean(quest[a]); den[a] += k;
    }
    // All donors and endorsers on an axis count as one entry (k = 1, mean sign), as in score.py.
    if (pooled[a].length) { num[a] += mean(pooled[a]); den[a] += 1; }
  }
  const known = new Set(events.flatMap(ev => ev.entries.map(e => e[0])));
  if (!known.size) return {score: null, low: null, high: null, total: 0, W: 0};
  const own = new Set(events.flatMap(ev => ev.entries.filter(e => OWN.includes(e[1])).map(e => e[0])));
  let total = 0, totalOwn = 0, wAll = 0, wKnown = 0, wOwn = 0;
  for (const a of Object.keys(weights).sort()) { // same order as score.py
    const t = weights[a] * (num[a] / (den[a] + K0));
    total += t;
    if (own.has(a)) totalOwn += t;
  }
  for (const a of Object.keys(weights)) wAll += weights[a];
  for (const a of known) wKnown += weights[a];
  for (const a of own) wOwn += weights[a];
  const unknown = wAll - wOwn;
  // Axes without the candidate's own evidence could sit anywhere from -1 to +1; donors and
  // endorsers alone do not pin one down. Their pooled signal stays in the score, inside the range.
  return {score: pyRound(50 + 50 * total / wKnown), low: pyRound(50 + 50 * (totalOwn - unknown) / wAll),
    high: pyRound(50 + 50 * (totalOwn + unknown) / wAll), total, W: wKnown};
}
const fit = (events, weights) => fitParts(events, weights).score;

// Leave-one-out steps as [label, remaining events], same order as score.py steps(): each
// record/stated event alone, then per axis all questionnaire answers and all donors/endorsers.
function steps(events) {
  const drop = gone => events.map(e => ({label: e.label, entries: e.entries.filter(x => !gone(e, x))}));
  const out = events.filter(ev => ev.entries.some(x => SOLO.includes(x[1])))
    .map(ev => [ev.label, drop((e, x) => e === ev && SOLO.includes(x[1]))]);
  for (const a of [...new Set(events.flatMap(e => e.entries.map(x => x[0])))].sort()) {
    for (const [kinds, what] of [[["questionnaire"], "questionnaire answers"], [AGGREGATE, "donors and endorsements"]]) {
      if (events.some(e => e.entries.some(x => x[0] === a && kinds.includes(x[1])))) {
        out.push([`${what} on ${a}`, drop((e, x) => x[0] === a && kinds.includes(x[1]))]);
      }
    }
  }
  return out;
}

// grayTopics: the profile lists topics the voter is torn on. Without any, a gray tag cannot
// mean "torn", so those rows are dropped from the list too, with a warning (as in score.py).
function summarize(opt, weights, grayTopics) {
  const c = collapse(opt), {events, warnings} = c;
  let gray = c.gray;
  if (gray.length && !grayTopics) {
    warnings.push(`${opt.name}: tagged gray, but you listed no topics you are torn on (${gray.length} not counted).`);
    gray = [];
  }
  const entries = events.flatMap(ev => ev.entries);
  let covered = 0, W = 0;
  for (const a of new Set(entries.filter(e => OWN.includes(e[1])).map(e => e[0]))) covered += weights[a];
  for (const a of Object.keys(weights)) W += weights[a];
  const cov = covered / W;
  const count = kinds => events.filter(ev => ev.entries.some(e => kinds.includes(e[1]))).length;
  // Answers pool per axis in the score, so they count once per axis here too.
  const records = count(["record"]), questionnaires = new Set(entries.filter(e => e[1] === "questionnaire").map(e => e[0])).size;
  const firm = records + questionnaires;
  const firmAxes = new Set(entries.filter(e => e[1] === "record" || e[1] === "questionnaire").map(e => e[0])).size;
  const level = !events.length ? "none"
    : cov >= 0.75 && firm >= 3 && records >= 1 && firmAxes >= 2 ? "strong"
    : cov >= 0.5 && firm >= 2 ? "moderate" : "thin";
  const parts = fitParts(events, weights);
  const row = {name: opt.name, score: parts.score, low: parts.low, high: parts.high, evidence: level, confidence: level,
    coverage: pyRound(cov * 100) / 100, events: events.length, records, questionnaires, gray,
    excluded: !opt.red_line ? null : typeof opt.red_line === "string" && opt.red_line.trim() ? `red line: ${opt.red_line.trim()}` : "red line",
    // Older page fields: num/den give "Score = round(50 + 50 × num / den)".
    red_line: !!opt.red_line, items: (opt.evidence || []).length, kinds: [], num: parts.total, den: parts.W, uncapped: parts.score};
  return {row, events, covered, warnings};
}

function leaderOf(scores) {
  const top = Math.max(...scores);
  return scores.filter(s => s === top).length === 1 ? scores.indexOf(top) : null;
}

// Returns [call, turns_on]. Leave-one-out: a call that one event can flip is a toss-up.
function decide(rows, events, covered, eligible, measure, weights) {
  const tossUp = label => [`Toss-up (turns on: ${label})`, label];
  let wAll = 0;
  for (const a of Object.keys(weights)) wAll += weights[a];
  const half = covered.map(c => 2 * c >= wAll); // coverage >= 0.5, in exact integers
  if (!eligible.length) return ["All options crossed a red line", null];
  if (measure) {
    const s = rows[0].score;
    if (s === null) return ["Not enough evidence", null];
    const m = s - 50;
    if (m === 0) return ["Toss-up", null];
    for (const [label, rest] of steps(events[0])) {
      const s2 = fit(rest, weights);
      // null: the whole score rests on this one step.
      if (s2 === null || s2 === 50 || (s2 > 50) !== (m > 0)) return tossUp(label);
    }
    const side = m > 0 ? "YES" : "NO";
    // As in contested races, a firm call needs at least one record, not words alone.
    const clear = Math.abs(m) >= 10 && half[0] && rows[0].evidence !== "thin" && rows[0].records >= 1;
    return [clear ? side : `Lean ${side}`, null];
  }
  if (eligible.length === 1) {
    const i = eligible[0], r = rows[i];
    if (r.score === null) return ["Not enough evidence", null];
    // A firm call needs at least one record, as in contested races.
    const firm = half[i] && r.evidence !== "thin" && r.records >= 1;
    if (r.score >= 60 && firm) return [`Vote for ${r.name}`, null];
    if (r.score <= 40 && firm) return ["Consider leaving blank or writing in", null];
    return ["Your call", null];
  }
  const scores = eligible.map(i => rows[i].score);
  if (scores.includes(null)) return ["Not enough evidence", null];
  const lead = leaderOf(scores);
  if (lead === null) return ["Toss-up", null];
  for (let j = 0; j < eligible.length; j++) {
    for (const [label, rest] of steps(events[eligible[j]])) {
      const alt = scores.slice();
      alt[j] = fit(rest, weights);
      // null: that option's whole score rests on this one step. That flips the call only for
      // the leader; a runner-up left with nothing cannot overtake it.
      if (alt[j] === null) { if (j === lead) return tossUp(label); continue; }
      if (leaderOf(alt) !== lead) return tossUp(label);
    }
  }
  const second = Math.max(...scores.filter((s, j) => j !== lead));
  const runner = scores.findIndex((s, j) => j !== lead && s === second);
  const li = eligible[lead], ri = eligible[runner], name = rows[li].name;
  // A full record against one statement is not a fair fight: coverage gap >= 0.4 caps it at Lean.
  if (5 * Math.abs(covered[li] - covered[ri]) >= 2 * wAll) return [`Lean ${name} (uneven evidence)`, null];
  // The candidate's own words alone never make a clear call: the leader needs more than thin
  // evidence and at least one record.
  const clear = scores[lead] - second >= 10 && half[li] && half[ri] && rows[li].evidence !== "thin" && rows[li].records >= 1;
  return [clear ? name : `Lean ${name}`, null];
}

// Returns {call, turns_on, rows, warnings, errors}; errors means nothing was scored.
function scoreRace(options, weights, isMeasure, grayTopics) {
  const errors = validateRace(options, weights, isMeasure);
  if (errors.length) return {call: null, turns_on: null, rows: [], warnings: [], errors};
  const rows = [], events = [], covered = [], warnings = [];
  for (const o of options) {
    const s = summarize(o, weights, grayTopics);
    rows.push(s.row); events.push(s.events); covered.push(s.covered); warnings.push(...s.warnings);
  }
  const eligible = options.map((o, i) => i).filter(i => !options[i].red_line);
  const [call, turns_on] = decide(rows, events, covered, eligible, !!isMeasure, weights);
  return {call, turns_on, rows, warnings, errors};
}

// Whether the profile lists a topic the voter is torn on: text after "Gray areas:" or a
// "- topic" line under it. Template placeholders, "none" and the Step 1 EXAMPLES do not count.
function hasGrayTopics(text) {
  const real = t => t.trim() && !t.includes("{{") && !/^(none|n\/a)\.?$/i.test(t.trim());
  let under = false;
  for (const line of String(text).split(/\r?\n/).map(l => l.trim())) {
    if (!line) continue;
    if (/^EXAMPLES\b/i.test(line)) break;
    const m = line.match(/^gray areas?\b[^:]*:?(.*)$/i);
    if (m) { if (real(m[1])) return true; under = true; continue; }
    if (under && /^[-*•]/.test(line)) { if (real(line.replace(/^[-*•]\s*/, ""))) return true; continue; }
    under = false;
  }
  return false;
}

function calculate(weightsText, researchText) {
  const {weights, warnings} = parseWeights(weightsText);
  if (!Object.keys(weights).length) {
    return {warnings, errors: [{line: "", msg: "No value weights found. Paste your Step 1 profile or type A=3, B=2."}], result: null};
  }
  const p = parseResearch(researchText, weights);
  if (!p.options.length) {
    p.errors.push({line: "", msg: "No CANDIDATE: or MEASURE: line found. Paste one Step 3 or Step 4 output."});
    return {warnings: warnings.concat(p.warnings), errors: p.errors, result: null};
  }
  const res = scoreRace(p.options, weights, p.kind === "measure", hasGrayTopics(weightsText));
  const errors = p.errors.concat(res.errors.map(msg => ({line: "", msg})));
  return {warnings: warnings.concat(p.warnings, res.warnings), errors, kind: p.kind, name: p.name, weights, result: res.errors.length ? null : res};
}

if (typeof module === "object" && module.exports) {
  module.exports = {pyRound, cleanMd, normLine, CLOSING_OFFER, parseWeights, parseResearch, countEvidence, scoreRace, hasGrayTopics, calculate};
}
