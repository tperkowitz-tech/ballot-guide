"""Score ballot options against a user's weighted value axes (scoring model v2).

Input JSON:
  {"axes": {"A": 3, "B": 2, ...},          # axis letter -> integer weight 1-3
   "races": [{"race": str,
              "measure": optional bool,
              "options": [{"name": str,
                           "red_line": optional bool or str (what was crossed, may end " | URL"),
                           "evidence": [{"axis": "A",
                                         "sign": "+" | "-" | "0" | "gray",
                                         "kind": "record" | "stated" | "funder",
                                         "event": optional str,
                                         "source": optional URL,
                                         "date": optional str,
                                         "gray": optional bool,
                                         "text": optional str}]}]}]}

"0" is genuinely mixed evidence and counts; "gray" (or gray: true) marks a topic the
voter is torn on and is left out of the math. Rows sharing an event (explicit `event`,
else the same normalized source, else the same normalized text) count once per axis. Per
axis, all funder events together count as one entry (k = 1, sign = their mean), so donors
never outweigh one statement. A measure has exactly one option: the YES side. Mirrored exactly by tools/calc.js; tools/calc_test.js checks parity.

Usage: score.py [--demo | input.json]
"""
import json
import re
import sys

KIND = {"record": 3, "stated": 1, "funder": 1}
# Stated beats funder when they tie on weight: it is the candidate's own position.
RANK = {"record": 3, "stated": 2, "funder": 1}
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
                errs.append(f'{o.get("name")}: kind "{ev.get("kind")}" (use record, stated, funder)')
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
    num = {a: 0 for a in axes}
    den = {a: 0 for a in axes}
    funders = {a: [] for a in axes}
    for ev in events:
        for axis, kind, s in ev["entries"]:
            if kind == "funder":
                funders[axis].append(s)
                continue
            num[axis] += KIND[kind] * s
            den[axis] += KIND[kind]
    # All donors on an axis count as one entry (k = 1, mean sign), so a flood of them
    # never outweighs one statement.
    for a in sorted(axes):
        if funders[a]:
            num[a] += sum(funders[a]) / len(funders[a])
            den[a] += 1
    total = 0
    for a in sorted(axes):  # fixed order so floats match calc.js
        total += axes[a] * (num[a] / (den[a] + K0))
    return round(50 + 50 * total / sum(axes.values()))


def summarize(opt, axes):
    events, gray, warnings = collapse(opt)
    entries = [e for ev in events for e in ev["entries"]]
    cov = sum(axes[a] for a in {a for a, k, _ in entries if k != "funder"}) / sum(axes.values())
    records = sum(1 for ev in events if any(k == "record" for _, k, _ in ev["entries"]))
    record_axes = {a for a, k, _ in entries if k == "record"}
    level = ("none" if not events
             else "strong" if cov >= 0.75 and records >= 3 and len(record_axes) >= 2
             else "moderate" if cov >= 0.5 and records >= 2 else "thin")
    row = {"name": opt.get("name"), "score": fit(events, axes) if events else None,
           "evidence": level, "confidence": level, "coverage": round(cov * 100) / 100,
           "events": len(events), "records": records, "gray": gray,
           "excluded": excluded(opt.get("red_line"))}
    return row, events, cov, warnings


def excluded(red_line):
    if not red_line:
        return None
    return f"red line: {red_line.strip()}" if isinstance(red_line, str) and red_line.strip() else "red line"


def leader(scores):
    top = max(scores)
    return scores.index(top) if scores.count(top) == 1 else None


def decide(rows, events, covs, eligible, measure, axes):
    """Return (call, turns_on). Leave-one-out: a call that one event can flip is a toss-up."""
    if not eligible:
        return "All options crossed a red line", None
    if measure:
        s = rows[0]["score"]
        if s is None:
            return "Not enough evidence", None
        m = s - 50
        if m == 0:
            return "Toss-up", None
        for ev in events[0]:
            m2 = fit([e for e in events[0] if e is not ev], axes) - 50
            if m2 == 0 or (m2 > 0) != (m > 0):
                return f"Toss-up (turns on: {ev['label']})", ev["label"]
        side = "YES" if m > 0 else "NO"
        clear = abs(m) >= 10 and covs[0] >= 0.5 and rows[0]["evidence"] != "thin"
        return (side if clear else f"Lean {side}"), None
    if len(eligible) == 1:
        r = rows[eligible[0]]
        if r["score"] is None:
            return "Not enough evidence", None
        if r["evidence"] != "thin" and r["score"] >= 60:
            return f"Vote for {r['name']}", None
        if r["evidence"] != "thin" and r["score"] <= 40:
            return "Consider leaving blank or writing in", None
        return "Your call", None
    scores = [rows[i]["score"] for i in eligible]
    if None in scores:
        return "Not enough evidence", None
    lead = leader(scores)
    if lead is None:
        return "Toss-up", None
    for j, i in enumerate(eligible):
        for ev in events[i]:
            alt = scores.copy()
            alt[j] = fit([e for e in events[i] if e is not ev], axes)
            if leader(alt) != lead:
                return f"Toss-up (turns on: {ev['label']})", ev["label"]
    second = max(s for j, s in enumerate(scores) if j != lead)
    runner = next(j for j, s in enumerate(scores) if j != lead and s == second)
    name = rows[eligible[lead]]["name"]
    # Statements alone never make a clear call: the leader needs more than thin evidence.
    clear = (scores[lead] - second >= 10 and covs[eligible[lead]] >= 0.5
             and covs[eligible[runner]] >= 0.5 and rows[eligible[lead]]["evidence"] != "thin")
    return (name if clear else f"Lean {name}"), None


def score_race(race, axes):
    errs = validate(race, axes)
    if errs:
        raise ValueError("; ".join(errs))
    opts = race["options"]
    rows, events, covs, warnings = [], [], [], []
    for o in opts:
        row, evs, cov, warn = summarize(o, axes)
        rows.append(row), events.append(evs), covs.append(cov), warnings.extend(warn)
    eligible = [i for i, o in enumerate(opts) if not o.get("red_line")]
    measure = bool(race.get("measure"))
    call, turns_on = decide(rows, events, covs, eligible, measure, axes)
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
    # One statement on 1 of 4 equal axes: 50 + 50 * (1/4) / 4 = 53.125 -> 53, thin.
    r = one(eq4, [{"name": "X", "evidence": [ev("A", "+", "stated")]}])["options"][0]
    assert (r["score"], r["evidence"], r["coverage"]) == (53, "thin", 0.25), r
    # An opposing record plus a favorable funder: the funder moves the score <= 12.5.
    rec = one({"A": 3}, [{"name": "X", "evidence": [ev("A", "-", "record")]}])["options"][0]["score"]
    both = one({"A": 3}, [{"name": "X", "evidence": [ev("A", "-", "record"), ev("A", "+", "funder")]}])
    assert rec == 25 and both["options"][0]["score"] == 36, both
    # Funders on an axis count as one entry with their mean sign: eight == one.
    fund = lambda n, sign="+": [ev("A", sign, "funder", source=f"https://example.org/f{i}") for i in range(n)]
    solo = lambda evs: one({"A": 3}, [{"name": "X", "evidence": evs}])["options"][0]["score"]
    assert solo(fund(8)) == solo(fund(1)) == 62  # 50 + 50 * 1 / (1 + 3) = 62.5, half to even
    assert solo([ev("A", "-", "record")] + fund(8)) == 36  # (-3 + 1) / (3 + 1 + 3): moves 11 <= 12.5
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
    # Measures: YES only; clear, lean, toss-up.
    r = one({"A": 1, "B": 1}, [{"name": "YES", "evidence": x}], measure=True)
    assert r["call"] == "YES" and [o["name"] for o in r["options"]] == ["YES"], r
    assert one({"A": 1, "B": 1}, [{"name": "YES", "evidence": y}], measure=True)["call"] == "NO"
    assert one({"A": 1, "B": 3}, [{"name": "YES", "evidence": x[:3]}], measure=True)["call"] == "Lean YES"
    r = one({"A": 1}, [{"name": "YES", "evidence": [ev("A", "+", "stated", event="ad")]}], measure=True)
    assert r["call"] == "Toss-up (turns on: ad)", r
    assert one({"A": 1}, [{"name": "YES", "evidence": [ev("A", "0", "record")]}], measure=True)["call"] == "Toss-up"
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
