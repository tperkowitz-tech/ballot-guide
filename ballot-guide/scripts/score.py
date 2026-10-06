"""Score ballot options against a user's weighted value axes (scoring model v2.1).

Input JSON:
  {"axes": {"A": 3, "B": 2, ...},          # axis letter -> integer weight 1-3
   "races": [{"race": str,
              "measure": optional bool,
              "options": [{"name": str,
                           "red_line": optional bool or str (what was crossed, may end " | URL"),
                           "evidence": [{"axis": "A",
                                         "sign": "+" | "-" | "0" | "gray",
                                         "kind": "record" | "questionnaire" | "stated"
                                                 | "funder" | "endorsement",
                                         "event": optional str,
                                         "source": optional URL,
                                         "date": optional str,
                                         "gray": optional bool,
                                         "text": optional str}]}]}]}

"0" is genuinely mixed evidence and counts; "gray" (or gray: true) marks a topic the
voter is torn on and is left out of the math. Rows sharing an event (explicit `event`,
else the same normalized source, else the same normalized text) count once per axis. Per
axis, all funder and endorsement events together count as one entry (k = 1, sign = their
mean), so donors and endorsers never outweigh one statement, and all questionnaire answers
together count as one entry (k = 2 for one answer, 3 for more, sign = their mean), so
answers never outweigh one record. The score averages only the axes that have evidence;
the low/high range treats axes without the candidate's own evidence as unknown and shows
how far they could move it, so having no record never reads as a neutral 50. A measure has exactly one
option: the YES side. Mirrored exactly by tools/calc.js; tools/calc_test.js checks parity.

Usage: score.py [--demo | input.json]
"""
import json
import re
import sys

KIND = {"record": 3, "questionnaire": 2, "stated": 1, "funder": 1, "endorsement": 1}
# Breaks ties within one event: the candidate's own words beat what others give or say.
RANK = {"record": 5, "questionnaire": 4, "stated": 3, "endorsement": 2, "funder": 1}
AGGREGATE = ("funder", "endorsement")  # pooled to one entry per axis
SOLO = ("record", "stated")  # counted per event; questionnaire answers pool per axis
OWN = ("record", "questionnaire", "stated")  # the candidate's own evidence; counts toward coverage
SIGN = {"+": 1, "0": 0, "-": -1}
K0 = 3  # neutral prior worth one record, so one item cannot pin an axis at 100


def is_gray(ev):
    return ev.get("sign") == "gray" or ev.get("gray") is True


def norm_source(url):
    """Same page, same key: lowercase scheme/host, drop query and fragment, strip trailing /."""
    url = url.strip().split("#")[0].split("?")[0]
    m = re.match(r"([A-Za-z][A-Za-z0-9+.-]*://[^/]*)(.*)", url, re.S)
    if m:
        url = m.group(1).lower() + m.group(2)
    return url.rstrip("/")


def norm_text(text):
    """Lowercase, collapse whitespace, drop leading [..] tags and a leading date."""
    text = re.sub(r"\s+", " ", text.lower()).strip()
    text = re.sub(r"^(\[[^\]]*\]\s*)+", "", text)
    return re.sub(r"^[0-9]{4}(-[0-9]{2}-[0-9]{2})?\s*:?\s*", "", text)


def event_key(ev, i):
    if ev.get("event"):
        return "e:" + ev["event"]
    src = norm_source(ev["source"]) if ev.get("source") else ""
    if src:
        return "s:" + src
    txt = norm_text(ev["text"]) if ev.get("text") else ""
    return "t:" + txt if txt else f"\0{i}"


def validate(race, axes):
    errs = [] if axes else ["profile has no value axes"]
    errs += [f"weight for {a} must be an integer 1-3 (found {w})"
             for a, w in axes.items() if type(w) is not int or not 1 <= w <= 3]
    opts = race.get("options") or []
    if not opts:
        errs.append("race has no options")
    elif race.get("measure") and len(opts) != 1:
        errs.append(f"a measure must have exactly one option, the YES side (found {len(opts)})")
    for o in opts:
        for ev in o.get("evidence", []):
            if ev.get("axis") not in axes:
                errs.append(f'{o.get("name")}: axis "{ev.get("axis")}" not in profile ({", ".join(sorted(axes))})')
            if ev.get("sign") not in SIGN and ev.get("sign") != "gray":
                errs.append(f'{o.get("name")}: sign "{ev.get("sign")}" (use + - 0 gray)')
            if ev.get("kind") not in KIND:
                errs.append(f'{o.get("name")}: kind "{ev.get("kind")}" (use record, questionnaire, stated, funder, endorsement)')
    return errs


def collapse(opt):
    """Split out gray rows; collapse rows of one event to one entry per axis."""
    name, gray, groups, warnings = opt.get("name"), [], {}, []
    for i, ev in enumerate(opt.get("evidence", [])):
        if is_gray(ev):
            gray.append(ev)
            continue
        key = event_key(ev, i)
        if key not in groups:
            groups[key] = {"label": ev.get("event") or ev.get("text") or ev.get("source") or f"{name} item {i + 1}",
                           "rows": []}
            if not ev.get("event") and not ev.get("source"):
                warnings.append(f"{name}: No source: duplicates of this line cannot be detected ({groups[key]['label']}).")
        groups[key]["rows"].append(ev)
    events = []
    for g in groups.values():
        entries = []
        for axis in dict.fromkeys(r["axis"] for r in g["rows"]):
            rows = [r for r in g["rows"] if r["axis"] == axis]
            kind = max((r["kind"] for r in rows), key=RANK.get)
            signs = {r["sign"] for r in rows if r["kind"] == kind}
            if len(signs) > 1:
                warnings.append(f"{name}: conflicting tags for one event ({g['label']}) on axis {axis}; using 0.")
            entries.append((axis, kind, SIGN[signs.pop()] if len(signs) == 1 else 0))
        events.append({"label": g["label"], "entries": entries})
    return events, gray, warnings


def fit(events, axes):
    """Return (score, low, high), or (None, None, None) when no axis has any evidence."""
    num = {a: 0 for a in axes}
    den = {a: 0 for a in axes}
    pooled = {a: [] for a in axes}
    quest = {a: [] for a in axes}
    for ev in events:
        for axis, kind, s in ev["entries"]:
            if kind in AGGREGATE:
                pooled[axis].append(s)
            elif kind == "questionnaire":
                quest[axis].append(s)
            else:
                num[axis] += KIND[kind] * s
                den[axis] += KIND[kind]
    for a in sorted(axes):
        # All answers on an axis are one entry worth at most one record (k = 3), so a
        # stack of answers never outweighs what the candidate did.
        if quest[a]:
            k = min(KIND["questionnaire"] * len(quest[a]), KIND["record"])
            num[a] += k * (sum(quest[a]) / len(quest[a]))
            den[a] += k
        # All donors and endorsers on an axis count as one entry (k = 1, mean sign), so a
        # flood of them never outweighs one statement.
        if pooled[a]:
            num[a] += sum(pooled[a]) / len(pooled[a])
            den[a] += 1
    known = {a for ev in events for a, _, _ in ev["entries"]}
    if not known:
        return None, None, None
    own = {a for ev in events for a, k, _ in ev["entries"] if k in OWN}
    total = total_own = 0
    for a in sorted(axes):  # fixed order so floats match calc.js; unknown axes add 0
        t = axes[a] * (num[a] / (den[a] + K0))
        total += t
        if a in own:
            total_own += t
    w_all = sum(axes.values())
    w_known = sum(axes[a] for a in known)
    unknown = w_all - sum(axes[a] for a in own)
    # Axes without the candidate's own evidence could sit anywhere from -1 to +1; donors
    # and endorsers alone do not pin one down. Their pooled signal stays in the score, which
    # therefore always falls inside the range.
    return (round(50 + 50 * total / w_known), round(50 + 50 * (total_own - unknown) / w_all),
            round(50 + 50 * (total_own + unknown) / w_all))


def steps(events):
    """Leave-one-out steps as (label, remaining events): each record/stated event alone,
    then per axis all questionnaire answers together and all donors/endorsers together,
    matching how fit() pools them."""
    def drop(gone):
        return [{"label": e["label"], "entries": [x for x in e["entries"] if not gone(e, x)]} for e in events]
    out = [(ev["label"], drop(lambda e, x, ev=ev: e is ev and x[1] in SOLO))
           for ev in events if any(k in SOLO for _, k, _ in ev["entries"])]
    for a in sorted({x[0] for e in events for x in e["entries"]}):
        for kinds, what in ((("questionnaire",), "questionnaire answers"), (AGGREGATE, "donors and endorsements")):
            if any(x[0] == a and x[1] in kinds for e in events for x in e["entries"]):
                out.append((f"{what} on {a}", drop(lambda e, x, a=a, kinds=kinds: x[0] == a and x[1] in kinds)))
    return out


def summarize(opt, axes):
    events, gray, warnings = collapse(opt)
    entries = [e for ev in events for e in ev["entries"]]
    covered = sum(axes[a] for a in {a for a, k, _ in entries if k in OWN})
    cov = covered / sum(axes.values())
    records = sum(1 for ev in events if any(k == "record" for _, k, _ in ev["entries"]))
    # Answers pool per axis in the score, so they count once per axis here too.
    quest = len({a for a, k, _ in entries if k == "questionnaire"})
    firm = records + quest
    firm_axes = {a for a, k, _ in entries if k in ("record", "questionnaire")}
    level = ("none" if not events
             else "strong" if cov >= 0.75 and firm >= 3 and records >= 1 and len(firm_axes) >= 2
             else "moderate" if cov >= 0.5 and firm >= 2 else "thin")
    score, low, high = fit(events, axes)
    row = {"name": opt.get("name"), "score": score, "low": low, "high": high,
           "evidence": level, "confidence": level, "coverage": round(cov * 100) / 100,
           "events": len(events), "records": records, "questionnaires": quest, "gray": gray,
           "excluded": excluded(opt.get("red_line"))}
    return row, events, covered, warnings


def excluded(red_line):
    if not red_line:
        return None
    return f"red line: {red_line.strip()}" if isinstance(red_line, str) and red_line.strip() else "red line"


def leader(scores):
    top = max(scores)
    return scores.index(top) if scores.count(top) == 1 else None


def decide(rows, events, covered, eligible, measure, axes):
    """Return (call, turns_on). Leave-one-out: a call that one event can flip is a toss-up."""
    w_all = sum(axes.values())
    half = [2 * c >= w_all for c in covered]  # coverage >= 0.5, in exact integers
    if not eligible:
        return "All options crossed a red line", None
    if measure:
        s = rows[0]["score"]
        if s is None:
            return "Not enough evidence", None
        m = s - 50
        if m == 0:
            return "Toss-up", None
        for label, rest in steps(events[0]):
            s2 = fit(rest, axes)[0]
            # None: the whole score rests on this one step.
            if s2 is None or s2 == 50 or (s2 > 50) != (m > 0):
                return f"Toss-up (turns on: {label})", label
        side = "YES" if m > 0 else "NO"
        # As in contested races, a firm call needs at least one record, not words alone.
        clear = abs(m) >= 10 and half[0] and rows[0]["evidence"] != "thin" and rows[0]["records"] >= 1
        return (side if clear else f"Lean {side}"), None
    if len(eligible) == 1:
        i = eligible[0]
        r = rows[i]
        if r["score"] is None:
            return "Not enough evidence", None
        # A firm call needs at least one record, as in contested races.
        firm = half[i] and r["evidence"] != "thin" and r["records"] >= 1
        if r["score"] >= 60 and firm:
            return f"Vote for {r['name']}", None
        if r["score"] <= 40 and firm:
            return "Consider leaving blank or writing in", None
        return "Your call", None
    scores = [rows[i]["score"] for i in eligible]
    if None in scores:
        return "Not enough evidence", None
    lead = leader(scores)
    if lead is None:
        return "Toss-up", None
    for j, i in enumerate(eligible):
        for label, rest in steps(events[i]):
            alt = scores.copy()
            alt[j] = fit(rest, axes)[0]
            # None: that option's whole score rests on this one step. That flips the call
            # only for the leader; a runner-up left with nothing cannot overtake it.
            if alt[j] is None:
                if j == lead:
                    return f"Toss-up (turns on: {label})", label
                continue
            if leader(alt) != lead:
                return f"Toss-up (turns on: {label})", label
    second = max(s for j, s in enumerate(scores) if j != lead)
    runner = next(j for j, s in enumerate(scores) if j != lead and s == second)
    li, ri = eligible[lead], eligible[runner]
    name = rows[li]["name"]
    # A full record against one statement is not a fair fight: coverage gap >= 0.4 caps it at Lean.
    if 5 * abs(covered[li] - covered[ri]) >= 2 * w_all:
        return f"Lean {name} (uneven evidence)", None
    # The candidate's own words alone never make a clear call: the leader needs more than
    # thin evidence and at least one record.
    clear = (scores[lead] - second >= 10 and half[li] and half[ri] and rows[li]["evidence"] != "thin"
             and rows[li]["records"] >= 1)
    return (name if clear else f"Lean {name}"), None


def score_race(race, axes):
    errs = validate(race, axes)
    if errs:
        raise ValueError("; ".join(errs))
    opts = race["options"]
    rows, events, covered, warnings = [], [], [], []
    for o in opts:
        row, evs, cov, warn = summarize(o, axes)
        rows.append(row), events.append(evs), covered.append(cov), warnings.extend(warn)
    eligible = [i for i, o in enumerate(opts) if not o.get("red_line")]
    measure = bool(race.get("measure"))
    call, turns_on = decide(rows, events, covered, eligible, measure, axes)
    return {"race": race.get("race"), "call": call, "turns_on": turns_on,
            "options": rows, "warnings": warnings}


def score(data):
    out = []
    for race in data["races"]:
        try:
            out.append(score_race(race, data["axes"]))
        except ValueError as e:
            raise ValueError(f"{race.get('race')}: {e}") from e
    return out


def demo():
    one = lambda axes, opts, measure=False: score_race({"race": "R", "measure": measure, "options": opts}, axes)
    ev = lambda axis, sign, kind, **kw: {"axis": axis, "sign": sign, "kind": kind, **kw}
    eq4 = {"A": 2, "B": 2, "C": 2, "D": 2}
    # Same fact as 4 rows (same source and date) counts as 1 row.
    fact = ev("A", "+", "record", source="https://example.org/v", date="2025-01-02")
    assert one(eq4, [{"name": "X", "evidence": [fact] * 4}])["options"] == \
        one(eq4, [{"name": "X", "evidence": [fact]}])["options"]
    # Same URL, no date or event (scheme/host case, query, fragment, trailing / ignored) == 1 row.
    urls = ["https://example.org/v", "HTTPS://Example.ORG/v/", "https://example.org/v?utm=1", "https://example.org/v#x"]
    assert one(eq4, [{"name": "X", "evidence": [ev("A", "+", "record", source=u) for u in urls]}])["options"] == \
        one(eq4, [{"name": "X", "evidence": [ev("A", "+", "record", source=urls[0])]}])["options"]
    # Same text, no source == 1 row, with a no-source warning; tags, date and spacing ignored.
    texts = ["voted for HB 1", "[A][+][RECORD] voted for  HB 1", "2025-01-02: Voted for HB 1", "2025: voted for hb 1"]
    r = one(eq4, [{"name": "X", "evidence": [ev("A", "+", "record", text=t) for t in texts]}])
    assert r["options"] == one(eq4, [{"name": "X", "evidence": [ev("A", "+", "record", text=texts[0])]}])["options"]
    assert r["warnings"] == ["X: No source: duplicates of this line cannot be detected (voted for HB 1)."], r
    # Distinct event ids on one URL count separately.
    assert one(eq4, [{"name": "X", "evidence": [ev("A", "+", "record", source=urls[0], event=e) for e in "ab"]}])["options"][0]["events"] == 2
    # One statement on 1 of 4 equal axes: known axis only, 50 + 50 * (1/4) = 62.5 -> 62, thin;
    # range 50 + 50 * (0.5 -/+ 6) / 8 = 15.625 / 90.625 -> 16 / 91.
    r = one(eq4, [{"name": "X", "evidence": [ev("A", "+", "stated")]}])["options"][0]
    assert (r["score"], r["low"], r["high"], r["evidence"], r["coverage"]) == (62, 16, 91, "thin", 0.25), r
    # One record on 1 of 4 equal axes: p = 3/6, score 75; range 50 + 50 * (1 -/+ 6) / 8 -> 19 / 94.
    r = one(eq4, [{"name": "X", "evidence": [ev("A", "+", "record")]}])["options"][0]
    assert (r["score"], r["low"], r["high"]) == (75, 19, 94), r
    # No events: no score and no range, never 50.
    r = one(eq4, [{"name": "X", "evidence": []}])
    assert (r["call"], r["options"][0]["score"], r["options"][0]["low"], r["options"][0]["high"]) == \
        ("Not enough evidence", None, None, None), r
    # A questionnaire answer counts 2: p = 2/5 -> 70. Answers on one axis pool to one entry
    # (k = 3 for two or more, like one record: 3/6 -> 75) and one item for the level.
    q = lambda axis, i, sign="+": ev(axis, sign, "questionnaire", event=f"q{axis}{i}")
    r = one({"A": 1}, [{"name": "X", "evidence": [q("A", 0)]}])["options"][0]
    assert (r["score"], r["questionnaires"]) == (70, 1), r
    r = one({"A": 1}, [{"name": "X", "evidence": [q("A", i) for i in range(5)]}])["options"][0]
    assert (r["score"], r["questionnaires"], r["evidence"]) == (75, 1, "thin"), r
    r = one({"A": 1, "B": 1}, [{"name": "X", "evidence": [q("A", 0), q("A", 1), q("B", 0)]}])["options"][0]
    assert r["evidence"] == "moderate", r
    r = one({"A": 1, "B": 1}, [{"name": "X", "evidence": [q("A", 0), q("A", 1), ev("B", "+", "record")]}])["options"][0]
    assert r["evidence"] == "moderate", r
    # Ten favorable answers per axis against three opposing votes per axis weigh no more than
    # one favorable record, and never give "Vote for".
    opp = [ev(a, "-", "record", event=f"v{a}{i}") for a in "ABCD" for i in range(3)]
    qs = [q(a, i) for a in "ABCD" for i in range(10)]
    r = one(eq4, [{"name": "X", "evidence": opp + qs}])
    rec = one(eq4, [{"name": "X", "evidence": opp + [ev(a, "+", "record", event=f"r{a}") for a in "ABCD"]}])
    assert r["options"][0]["score"] <= rec["options"][0]["score"] and not r["call"].startswith("Vote for"), r
    # Answers only, on all four axes: at most moderate, and no firm call over a fully
    # documented mixed incumbent.
    inc = [ev(a, sg, "record", event=a + sg) for a in "ABCD" for sg in "+-0"]
    r = one(eq4, [{"name": "Inc", "evidence": inc}, {"name": "Q", "evidence": [q(a, i) for a in "ABCD" for i in range(3)]}])
    assert (r["options"][1]["evidence"], r["call"]) == ("moderate", "Lean Q"), r
    # Range: only the candidate's own evidence makes an axis known; an endorsement-only axis
    # still moves the score, which stays inside the range.
    r = one(eq4, [{"name": "X", "evidence": [ev("A", "+", "record")] + [ev(a, "+", "endorsement") for a in "BCD"]}])["options"][0]
    assert r["low"] < r["score"] < r["high"] and (r["low"], r["high"]) == (19, 94), r
    # An endorsement-only axis is known (scored) but not covered.
    r = one(eq4, [{"name": "X", "evidence": [ev("A", "+", "record"), ev("B", "+", "endorsement")]}])["options"][0]
    assert (r["coverage"], r["score"]) == (0.25, 69), r  # (2 * 0.5 + 2 * 0.25) / 4 -> 68.75
    # An opposing record plus a favorable funder: the funder moves the score <= 12.5.
    rec = one({"A": 3}, [{"name": "X", "evidence": [ev("A", "-", "record")]}])["options"][0]["score"]
    both = one({"A": 3}, [{"name": "X", "evidence": [ev("A", "-", "record"), ev("A", "+", "funder")]}])
    assert rec == 25 and both["options"][0]["score"] == 36, both
    # Funders on an axis count as one entry with their mean sign: eight == one.
    fund = lambda n, sign="+": [ev("A", sign, "funder", source=f"https://example.org/f{i}") for i in range(n)]
    solo = lambda evs: one({"A": 3}, [{"name": "X", "evidence": evs}])["options"][0]["score"]
    assert solo(fund(8)) == solo(fund(1)) == 62  # 50 + 50 * 1 / (1 + 3) = 62.5, half to even
    assert solo([ev("A", "-", "record")] + fund(8)) == 36  # (-3 + 1) / (3 + 1 + 3): moves 11 <= 12.5
    # Eight endorsements plus eight funders on one axis are still one pooled entry.
    endorse = lambda n, sign="+": [ev("A", sign, "endorsement", source=f"https://example.org/e{i}") for i in range(n)]
    assert solo(endorse(8) + fund(8)) == solo(fund(1)) == 62
    assert solo([ev("A", "-", "record")] + endorse(8) + fund(8, "-")) == 29  # (-3 + 0) / (3 + 1 + 3)
    # A gray row leaves the score unchanged and is listed.
    g = ev("B", "gray", "record", text="torn topic")
    base = one(eq4, [{"name": "X", "evidence": [ev("A", "+", "record")]}])["options"][0]
    gr = one(eq4, [{"name": "X", "evidence": [ev("A", "+", "record"), g, ev("C", "gray", "stated")]}])["options"][0]
    assert gr["score"] == base["score"] and gr["gray"] == [g, ev("C", "gray", "stated")]
    flagged = ev("B", "+", "record", gray=True)  # the flag form works too
    assert one(eq4, [{"name": "X", "evidence": [ev("A", "+", "record"), flagged]}])["options"][0]["score"] == base["score"]
    # Four copies of one record cannot give "strong".
    r = one({"A": 1}, [{"name": "X", "evidence": [ev("A", "+", "record", event="hb1")] * 4}])["options"][0]
    assert (r["events"], r["records"], r["evidence"]) == (1, 1, "thin"), r
    # Validation: empty options, bad weight, unknown sign, a measure with two options.
    for bad_axes, opts, measure in [({"A": 1}, [], False), ({"A": 9}, [{"name": "X", "evidence": []}], False),
                                    ({"A": 1}, [{"name": "X", "evidence": [ev("A", "?", "record")]}], False),
                                    ({"A": 1}, [{"name": "YES", "evidence": []}, {"name": "NO", "evidence": []}], True)]:
        try:
            one(bad_axes, opts, measure)
            raise AssertionError("expected ValueError")
        except ValueError:
            pass
    # Conflicting same-kind tags on one event: warning, sign 0.
    r = one({"A": 1}, [{"name": "X", "evidence": [ev("A", "+", "record", event="e"), ev("A", "-", "record", event="e")]}])
    assert r["options"][0]["score"] == 50 and "conflicting tags" in r["warnings"][0], r
    # Red-lined leader is excluded; the other option is called as unopposed.
    strong = [ev("A", "+", "record", event="a1"), ev("A", "+", "record", event="a2"), ev("B", "+", "record", event="b1")]
    r = one({"A": 2, "B": 1}, [{"name": "X", "red_line": True, "evidence": strong + [ev("B", "+", "record", event="b2")]},
                               {"name": "Y", "evidence": strong}])
    assert r["call"] == "Vote for Y" and r["options"][0]["excluded"] == "red line" and r["options"][0]["score"] is not None, r
    r = one({"A": 1}, [{"name": "X", "red_line": " convicted | https://example.org/c ", "evidence": []}])
    assert r["options"][0]["excluded"] == "red line: convicted | https://example.org/c", r
    r = one({"A": 1}, [{"name": "X", "red_line": True, "evidence": []}])
    assert r["call"] == "All options crossed a red line"
    # One event decides the leader -> toss-up naming it.
    r = one({"A": 1}, [{"name": "X", "evidence": [ev("A", "+", "record", text="voted for HB 1")]},
                       {"name": "Y", "evidence": [ev("A", "0", "record")]}])
    assert (r["call"], r["turns_on"]) == ("Toss-up (turns on: voted for HB 1)", "voted for HB 1"), r
    # Robust lead with coverage on both sides -> clear call; thin coverage -> lean.
    x = [ev(a, "+", "record", event=a + str(i)) for a in "AB" for i in range(3)]
    y = [ev(a, "-", "record", event=a + str(i)) for a in "AB" for i in range(3)]
    assert one({"A": 1, "B": 1}, [{"name": "X", "evidence": x}, {"name": "Y", "evidence": y}])["call"] == "X"
    assert one({"A": 1, "B": 1, "C": 3, "D": 3}, [{"name": "X", "evidence": x}, {"name": "Y", "evidence": y}])["call"] == "Lean X"
    # Uneven evidence: a robust, non-thin lead is capped at Lean when coverage differs by >= 0.4.
    full = x + [ev(a, "+", "stated", event=a + "s") for a in "CD"]
    r = one({"A": 1, "B": 1, "C": 1, "D": 1}, [{"name": "X", "evidence": full}, {"name": "Y", "evidence": y}])
    assert (r["call"], r["options"][0]["evidence"], r["options"][1]["coverage"]) == ("Lean X (uneven evidence)", "strong", 0.5), r
    # Mixed full incumbent vs a newcomer with one statement: the newcomer leads and its score
    # rests on one event (toss-up); with three statements on one axis it is uneven. Never a
    # firm newcomer win.
    jx = lambda n, sign="+", inc=inc: [{"name": "Inc", "evidence": inc},
                                       {"name": "New", "evidence": [ev("A", sign, "stated", event=f"n{i}") for i in range(n)]}]
    r = one(eq4, jx(1))
    assert (r["call"], r["options"][0]["score"], r["options"][0]["evidence"], r["options"][1]["score"]) == \
        ("Toss-up (turns on: n0)", 50, "strong", 62), r
    assert one(eq4, jx(3))["call"] == "Lean New (uneven evidence)"
    # A runner-up left with no evidence by one removal cannot overtake: no toss-up from that.
    good = [ev(a, "+", "record", event=f"{a}{i}") for a in "ABCD" for i in range(4)]
    assert one(eq4, jx(1, "-", good))["call"] == "Lean Inc (uneven evidence)"
    # When the one-statement newcomer leads, its whole score is that statement: toss-up.
    bad = [ev(a, "-", "record", event=f"{a}{i}") for a in "ABCD" for i in range(4)]
    assert one(eq4, jx(1, "-", bad))["call"] == "Toss-up (turns on: n0)"
    # A pooled step is removed whole and named by axis.
    r = one({"A": 1}, [{"name": "X", "evidence": [q("A", 0), q("A", 1)]}, {"name": "Y", "evidence": [ev("A", "0", "record")]}])
    assert r["turns_on"] == "questionnaire answers on A", r
    r = one({"A": 1}, [{"name": "X", "evidence": [ev("A", "+", "funder", event="f"), ev("A", "+", "endorsement", event="e")]},
                       {"name": "Y", "evidence": [ev("A", "0", "record")]}])
    assert r["turns_on"] == "donors and endorsements on A", r
    # Statements only: big robust gap and full coverage, but thin evidence -> lean.
    sx = [ev("A", "+", "stated", event=f"s{i}") for i in range(3)]
    sy = [ev("A", "-", "stated", event=f"s{i}") for i in range(3)]
    r = one({"A": 1}, [{"name": "X", "evidence": sx}, {"name": "Y", "evidence": sy}])
    assert (r["call"], r["options"][0]["score"], r["options"][0]["evidence"]) == ("Lean X", 75, "thin"), r
    assert one({"A": 1}, [{"name": "YES", "evidence": sx}], measure=True)["call"] == "Lean YES"
    assert one({"A": 1}, [{"name": "YES", "evidence": sy}], measure=True)["call"] == "Lean NO"
    # Unopposed: 100-ish on thin evidence is still "Your call"; no evidence -> not enough.
    assert one({"A": 1}, [{"name": "Z", "evidence": [ev("A", "+", "record")]}])["call"] == "Your call"
    assert one({"A": 1}, [{"name": "Z", "evidence": x[:3]}])["call"] == "Vote for Z"
    assert one({"A": 1}, [{"name": "Z", "evidence": y[:3]}])["call"] == "Consider leaving blank or writing in"
    assert one({"A": 1}, [{"name": "Z", "evidence": []}])["call"] == "Not enough evidence"
    # Questionnaire-only unopposed candidate: 70 and moderate, but no record -> "Your call".
    r = one({"A": 2, "B": 2}, [{"name": "Z", "evidence": [q("A", 0), q("B", 0)]}])
    assert (r["call"], r["options"][0]["score"], r["options"][0]["evidence"]) == ("Your call", 70, "moderate"), r
    # Measures: YES only; clear, lean, toss-up.
    r = one({"A": 1, "B": 1}, [{"name": "YES", "evidence": x}], measure=True)
    assert r["call"] == "YES" and [o["name"] for o in r["options"]] == ["YES"], r
    assert one({"A": 1, "B": 1}, [{"name": "YES", "evidence": y}], measure=True)["call"] == "NO"
    assert one({"A": 1, "B": 3}, [{"name": "YES", "evidence": x[:3]}], measure=True)["call"] == "Lean YES"
    r = one({"A": 1}, [{"name": "YES", "evidence": [ev("A", "+", "stated", event="ad")]}], measure=True)
    assert r["call"] == "Toss-up (turns on: ad)", r
    assert one({"A": 1}, [{"name": "YES", "evidence": [ev("A", "0", "record")]}], measure=True)["call"] == "Toss-up"
    # Measure with only questionnaire or stated evidence: no record -> Lean, never firm.
    r = one({"A": 2, "B": 2}, [{"name": "YES", "evidence": [q("A", 0), q("B", 0)]}], measure=True)
    assert (r["call"], r["options"][0]["evidence"]) == ("Lean YES", "moderate"), r
    st = [ev(a, "-", "stated", event=f"s{a}{i}") for a in "AB" for i in range(3)]
    assert one({"A": 1, "B": 1}, [{"name": "YES", "evidence": st}], measure=True)["call"] == "Lean NO"
    print(json.dumps(one({"A": 3, "B": 2}, [{"name": "X", "evidence": x}, {"name": "Y", "evidence": y[:2]}]), indent=2))
    print("self-check OK")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] == "--demo":
        demo()
    else:
        with open(sys.argv[1]) as f:
            try:
                print(json.dumps(score(json.load(f)), indent=2))
            except ValueError as e:
                sys.exit(f"Bad input: {e}")
