"""Score ballot options against a user's weighted value axes.

Input JSON:
  {"axes": {"A": 3, "B": 2, ...},          # axis letter -> weight 1-3
   "races": [{"race": str,
              "measure": optional bool,
              "options": [{"name": str,
                           "red_line": optional bool,
                           "evidence": [{"axis": "A",
                                         "sign": "+" | "0" | "-",
                                         "kind": "record" | "funder" | "stated"}]}]}]}

Gray-area topics use sign "0". For a measure, the single option is the YES side.

Usage: score.py [--demo | input.json]
"""
import json
import sys

KIND = {"record": 3, "funder": 2, "stated": 1}
SIGN = {"+": 1, "0": 0, "-": -1}


def check(ev, axes, where):
    bad = [f"axis {ev.get('axis')!r} (profile has {sorted(axes)})" if ev.get("axis") not in axes else "",
           f"sign {ev.get('sign')!r} (use + 0 -)" if ev.get("sign") not in SIGN else "",
           f"kind {ev.get('kind')!r} (use {sorted(KIND)})" if ev.get("kind") not in KIND else ""]
    bad = [b for b in bad if b]
    if bad:
        sys.exit(f"Bad evidence in {where}: {'; '.join(bad)}")


def score_option(opt, axes, where):
    evs = opt.get("evidence", [])
    for ev in evs:
        check(ev, axes, where)
    # Average within each kind first, so piling on many funder (or stated) items
    # cannot outweigh a few records. Then weight kinds record 3 / funder 2 / stated 1.
    num = den = 0
    for kind, k in KIND.items():
        items = [ev for ev in evs if ev["kind"] == kind]
        a = sum(axes[ev["axis"]] for ev in items)
        if a:
            num += k * sum(SIGN[ev["sign"]] * axes[ev["axis"]] for ev in items) / a
            den += k
    if den == 0:
        return None, "none"  # no evidence: do not pretend a neutral 50
    s = round(50 + 50 * num / den)
    if opt.get("red_line"):
        s = min(s, 20)
    records = sum(1 for ev in evs if ev["kind"] == "record")
    conf = "high" if records >= 4 else "medium" if records >= 2 else "low"
    return s, conf


def score(data):
    out = []
    for race in data["races"]:
        opts = [(o["name"], *score_option(o, data["axes"], f"{race['race']} / {o['name']}"))
                for o in race["options"]]
        if race.get("measure") and len(opts) == 1:
            _, s, c = opts[0]
            opts = [("YES", s, c), ("NO", None if s is None else 100 - s, c)]
        if any(s is None for _, s, _ in opts) and len(opts) > 1:
            out.append({"race": race["race"], "call": "Not enough evidence",
                        "options": [{"name": n, "score": s, "confidence": c} for n, s, c in opts]})
            continue
        if len(opts) == 1:  # unopposed: vote or leave blank, judged on its own score
            n, s, c = opts[0]
            call = ("Not enough evidence" if s is None else f"Vote for {n}" if s >= 60
                    else "Your call" if s >= 41 else "Consider leaving blank or writing in")
            out.append({"race": race["race"], "call": call,
                        "options": [{"name": n, "score": s, "confidence": c}]})
            continue
        opts.sort(key=lambda o: o[1], reverse=True)
        gap = opts[0][1] - opts[1][1] if len(opts) > 1 else 100
        top = opts[0][0]
        call = top if gap >= 15 else f"Lean {top}" if gap >= 6 else "Toss-up"
        out.append({"race": race["race"], "call": call,
                    "options": [{"name": n, "score": s, "confidence": c} for n, s, c in opts]})
    return out


def demo():
    data = {"axes": {"A": 3, "B": 2}, "races": [
        {"race": "Seat", "options": [
            {"name": "X", "evidence": [{"axis": "A", "sign": "+", "kind": "record"},
                                       {"axis": "B", "sign": "-", "kind": "funder"}]},
            {"name": "Y", "red_line": True,
             "evidence": [{"axis": "A", "sign": "+", "kind": "record"}]}]},
        {"race": "Prop 1", "measure": True, "options": [
            {"name": "YES", "evidence": [{"axis": "B", "sign": "0", "kind": "stated"}]}]}]}
    result = score(data)
    assert result[0]["options"][0] == {"name": "X", "score": 60, "confidence": "low"}  # (3*1 + 2*-1)/5
    assert result[0]["options"][1]["score"] == 20 and result[0]["call"] == "X"
    assert result[1]["call"] == "Toss-up" and result[1]["options"][0]["score"] == 50
    # Eight hostile funders must not erase two good records; no evidence must not score 50.
    flood = {"axes": {"A": 3}, "races": [{"race": "F", "options": [
        {"name": "P", "evidence": [{"axis": "A", "sign": "+", "kind": "record"}] * 2
                                  + [{"axis": "A", "sign": "-", "kind": "funder"}] * 8},
        {"name": "Q", "evidence": []}]}]}
    r = score(flood)[0]
    assert r["options"][0]["score"] == 60 and r["call"] == "Not enough evidence", r
    # Unopposed candidates get an absolute call.
    solo = lambda ev: score({"axes": {"A": 1}, "races": [{"race": "U", "options": [
        {"name": "Z", "evidence": ev}]}]})[0]["call"]
    assert solo([{"axis": "A", "sign": "+", "kind": "record"}]) == "Vote for Z"
    assert solo([{"axis": "A", "sign": "0", "kind": "record"}]) == "Your call"
    assert solo([{"axis": "A", "sign": "-", "kind": "record"}]) == "Consider leaving blank or writing in"
    assert solo([]) == "Not enough evidence"
    print(json.dumps(result, indent=2))
    print("self-check OK")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] == "--demo":
        demo()
    else:
        with open(sys.argv[1]) as f:
            print(json.dumps(score(json.load(f)), indent=2))
