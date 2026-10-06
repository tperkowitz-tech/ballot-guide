"""Check research evidence JSON before scoring it with score.py.

Accepts a full score.py input ({"axes": ..., "races": [...]}) or a bare {"races": [...]}
from one worker. ERRORs would make the score wrong or leak private data; WARNs need a
human look but may be fine. Exit 0 when there are no ERRORs (or no WARNs either, with
--strict), else 1.

Usage: check_evidence.py [--strict] file.json [more.json] | --demo
"""
import json
import re
import sys
from urllib.parse import urlsplit

from score import KIND, collapse, is_gray, norm_source

SIGNS = ("+", "-", "0", "gray")
FIELDS = ("event", "axis", "sign", "kind", "source", "date", "text")
DATE = re.compile(r"^\d{4}(-\d{2}-\d{2})?$")
# Two tiers: a street plus a ZIP, unit or "City, ST 12345" is almost surely an address
# (ERROR); a bare "123 Main St" may be one, or a bill or project name (WARN).
STREET = (r"\b\d{1,6}\s+(?:(?:N|S|E|W|NE|NW|SE|SW)\.?\s+)?(?:[A-Za-z][\w.'-]*\s+){1,4}?"
          r"(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Way|Ln|Lane|Ct|Court|Pl|Place"
          r"|Ter|Terrace|Pkwy|Hwy)\b\.?")
STRONG_ADDRESS = re.compile(STREET + r"(?:,?\s*(?:(?:Apt|Unit|Suite|Ste)\b\.?\s*|#\s*)\w+"
                            r"|,?\s+\d{5}(?:-\d{4})?\b|,\s*[A-Za-z .'-]+,\s*[A-Za-z]{2}\.?\s+\d{5}(?:-\d{4})?\b)", re.I)
WEAK_ADDRESS = re.compile(STREET + r"(?!\s+(?:Act|Project|Bill|Program|Plan|Corridor|repaving|levy)\b)", re.I)
# Party evidence is banned from scoring, but a regex cannot tell a ban-worthy item from a
# record that merely mentions a party, so these are WARNs for the coordinator to judge.
PARTY = re.compile(r"\b(Democratic Party|Republican Party|Libertarian Party|Green Party|GOP|DNC|RNC|"
                   r"State Democrats|State Republicans|LD Democrats|LD Republicans|Democratic Committee|"
                   r"Republican Committee|Democratic-Farmer-Labor|(?:Democratic|Republican|party|State) Central Committee|"
                   r"party endorsement|party platform)\b", re.I)
PARTY_HOST = re.compile(r"democrat|republican|gop|libertarian|greenparty|dems\b", re.I)
WIKI_HOST = re.compile(r"(^|\.)wikipedia\.org$|\.wiki$|(^|\.)wiki\.")


def flag_address(where, values, errors, warnings):
    texts = [v for v in values if isinstance(v, str)]
    if any(STRONG_ADDRESS.search(v) for v in texts):
        errors.append(f"{where}: street address; remove it")
    elif any(WEAK_ADDRESS.search(v) for v in texts):
        warnings.append(f"{where}: possible street address; remove it if it is one")


def check(data):
    """Return (errors, warnings), each a list of "<where>: <message>" strings."""
    errors, warnings = [], []
    if not isinstance(data, dict) or not isinstance(data.get("races"), list):
        return ['file: expected an object with a "races" list'], []
    axes = data.get("axes")
    if axes is None:
        warnings.append('file: no "axes"; axis letters not checked')
    elif not isinstance(axes, dict) or not axes:
        errors.append('file: "axes" must be a non-empty object of axis -> weight')
        axes = None
    else:
        errors += [f"file: weight for {a} must be an integer 1-3 (found {w!r})"
                   for a, w in axes.items() if type(w) is not int or not 1 <= w <= 3]
    for r, race in enumerate(data["races"]):
        if not isinstance(race, dict):
            errors.append(f"race #{r}: not an object")
            continue
        rname = race.get("race") or f"race #{r}"
        opts = race.get("options")
        if not isinstance(opts, list) or not opts:
            errors.append(f"{rname}: no options")
            continue
        if race.get("measure") and len(opts) != 1:
            errors.append(f"{rname}: a measure must have exactly one option, the YES side (found {len(opts)})")
        flag_address(rname, (race.get("race"), race.get("red_line")), errors, warnings)
        for o, opt in enumerate(opts):
            if not isinstance(opt, dict):
                errors.append(f"{rname} / option #{o}: not an object")
                continue
            if not opt.get("name"):
                errors.append(f"{rname} / option #{o}: option has no name")
            oname = opt.get("name") or f"option #{o}"
            e, w = check_option(opt, axes, f"{rname} / {oname}")
            errors += e
            warnings += w
    return errors, warnings


def check_option(opt, axes, where):
    errors, warnings = [], []
    flag_address(where, (opt.get("name"), opt.get("red_line")), errors, warnings)
    evidence = opt.get("evidence", [])
    if not isinstance(evidence, list):
        return errors + [f'{where}: "evidence" must be a list'], warnings
    by_source, valid = {}, []
    for i, ev in enumerate(evidence):
        if not isinstance(ev, dict):
            errors.append(f"{where} / #{i}: evidence item is not an object")
            continue
        event = ev.get("event")
        at = f"{where} / {event if isinstance(event, str) and event else '#' + str(i)}"
        # Any other JSON type crashes score.py (unhashable axis, "e:" + 5) or slips past
        # the checks below, so the item is reported and not checked further.
        wrong = [f for f in FIELDS if ev.get(f) is not None and not isinstance(ev[f], str)]
        if wrong:
            errors += [f"{at}: {f} must be a string (found {type(ev[f]).__name__})" for f in wrong]
            continue
        n = len(errors)
        axis = ev.get("axis")
        if axes is not None and axis not in axes:
            errors.append(f'{at}: axis "{axis}" not in axes ({", ".join(sorted(axes))})')
        elif not axis:
            errors.append(f"{at}: missing axis")
        if ev.get("sign") not in SIGNS:
            errors.append(f'{at}: sign "{ev.get("sign")}" (use + - 0 gray)')
        if ev.get("kind") not in KIND:
            errors.append(f'{at}: kind "{ev.get("kind")}" (use {", ".join(KIND)})')
        src = (ev.get("source") or "").strip()
        host = ""
        if not src:
            errors.append(f"{at}: missing source")
        elif not re.match(r"https?://", src, re.I):
            errors.append(f"{at}: source must be an http(s) URL")
        else:
            host = (urlsplit(src).hostname or "").lower()
            # score.py merges no-event rows from one page into one event per axis.
            if not event and not is_gray(ev):
                by_source.setdefault((norm_source(src), axis), []).append(ev)
        if WIKI_HOST.search(host):
            warnings.append(f"{at}: wiki source; use it only as a lead and cite the primary source")
        if ev.get("kind") == "questionnaire" and PARTY_HOST.search(host):
            warnings.append(f"{at}: questionnaire on what looks like a party site; keep only the candidate's own answers")
        text = ev.get("text") or ""
        if PARTY.search(text) or PARTY.search(src):
            warnings.append(f"{at}: mentions a party organization; party evidence is never scored, review it")
        if len(text.split()) > 40:
            warnings.append(f"{at}: text is {len(text.split())} words; keep it to 40 or fewer")
        if not DATE.match(ev.get("date") or ""):
            warnings.append(f"{at}: date missing or not YYYY / YYYY-MM-DD")
        flag_address(at, ev.values(), errors, warnings)
        if not event:
            warnings.append(f"{at}: no event id")
        if len(errors) == n:
            valid.append(ev)
    for (src, axis), rows in by_source.items():
        if len(rows) > 1:
            errors.append(f"{where}: {len(rows)} items on axis {axis} share {src} without event ids; they would count once")
    # Reuse score.py's own grouping so this warns exactly when the score falls back to 0.
    warnings += [w for w in collapse({"name": where, "evidence": valid})[2] if "conflicting tags" in w]
    return errors, warnings


def demo():
    ok = {"axis": "A", "sign": "+", "kind": "record", "event": "v1", "date": "2024-03-01",
          "source": "https://leg.example.gov/vote/1", "text": "Voted yes on final passage."}
    base = lambda evs, **race: {"axes": {"A": 3}, "races": [{"race": "R", **race,
                                "options": [{"name": "X", "evidence": evs}]}]}
    e, w = check(base([ok]))
    assert e == [] and w == [], (e, w)
    e, w = check({"races": base([ok])["races"]})
    assert e == [] and len(w) == 1 and "no \"axes\"" in w[0], w
    bad = lambda **kw: check(base([{**ok, **kw}]))[0]
    assert "axis" in bad(axis="Z")[0]
    assert "sign" in bad(sign="yes")[0]
    assert "kind" in bad(kind="poll")[0]
    assert "missing source" in bad(source="")[0]
    assert "http" in bad(source="ftp://x.example/a")[0]
    assert check(base([ok], measure=True))[0] == []
    e, _ = check({"axes": {"A": 3}, "races": [{"race": "M", "measure": True, "options": [
        {"name": "YES", "evidence": []}, {"name": "NO", "evidence": []}]}]})
    assert "exactly one option" in e[0], e
    e, _ = check({"axes": {"A": 3}, "races": [{"race": "R", "options": [{"evidence": []}]}]})
    assert "no name" in e[0], e
    e, _ = check({"axes": {"A": 4}, "races": []})
    assert "integer 1-3" in e[0], e
    # Wrong JSON types are ERRORs, never a traceback.
    for f in ("event", "axis", "sign", "kind", "source", "date", "text"):
        for junk in (5, ["A"], {"a": 1}, True):
            e, _ = check(base([{**ok, f: junk}]))
            at = "#0" if f == "event" else "v1"
            assert e == [f"R / X / {at}: {f} must be a string (found {type(junk).__name__})"], (f, junk, e)
    # Same page, no event ids, same axis: they would collapse, so ERROR. Different axes, an
    # event id on one, or a gray row: no error.
    two = lambda a, b: check({"axes": {"A": 3, "B": 1}, "races": [{"race": "R", "options": [
        {"name": "X", "evidence": [{**ok, **a}, {**ok, "text": "Sponsored it.", **b}]}]}]})[0]
    assert any("share" in m for m in two({"event": None}, {"event": None})), two({"event": None}, {"event": None})
    assert two({"event": None}, {"event": None, "axis": "B"}) == []
    assert two({"event": None}, {"event": "v2"}) == []
    assert two({"event": None}, {"event": None, "sign": "gray"}) == []
    assert two({"event": None}, {"event": None, "gray": True}) == []
    assert check(base([ok, {**ok, "event": "v2"}]))[0] == []
    # Conflicting signs in one event: WARN (score.py uses 0), only among the top-ranked kind,
    # never counting gray rows.
    e, w = check(base([ok, {**ok, "sign": "-"}]))
    assert e == [] and any("conflicting" in m for m in w), (e, w)
    assert not any("conflicting" in m for m in check(base([ok, {**ok, "sign": "-", "kind": "stated"}]))[1])
    assert not any("conflicting" in m for m in check(base([ok, {**ok, "sign": "gray"}]))[1])
    assert not any("conflicting" in m for m in check(base([ok, {**ok, "sign": "-", "gray": True}]))[1])
    # Addresses: ZIP, unit or full "City, ST 12345" -> ERROR; bare street -> WARN; bill names -> nothing.
    flags = lambda s: (check(base([{**ok, "text": s}])), s)
    for s in ("Voted on HB 1217 Main Street Act", "Sponsored SB 5 Open Road Act"):
        assert flags(s)[0] == ([], []), flags(s)
    for s in ("123 N Main St", "456 Elm Boulevard", "12 Martin Luther King Jr Way"):
        (e, w), _ = flags(s)
        assert e == [] and len(w) == 1 and "address" in w[0], (s, e, w)
    for s in ("123 Main St, Springfield, IL 62701", "77 Oak Ave Apt 4"):
        (e, _), _ = flags(s)
        assert len(e) == 1 and "street address" in e[0], (s, e)
    _, w = check(base([{**ok, "event": None}]))
    assert w == ["R / X / #0: no event id"], w
    warn = lambda **kw: check(base([{**ok, **kw}]))[1]
    assert "wiki" in warn(source="https://en.wikipedia.org/wiki/X")[0]
    assert "party" in warn(text="Endorsed by the County Republican Party.")[0]
    for s in ("Backed by the State Democrats", "DNC ad buy", "RNC mailer", "County Republican Committee",
              "Democratic Committee slate", "Minnesota Democratic-Farmer-Labor Party", "State Central Committee"):
        assert any("party" in m for m in warn(text=s)), s
    assert not any("party" in m for m in warn(text="Chaired the budget Central Committee"))
    assert any("wiki" in m for m in warn(source="https://example.wiki/X"))
    assert any("wiki" in m for m in warn(source="https://wiki.example.org/X"))
    assert not any("wiki" in m for m in warn(source="https://www.wikihow.com/X"))
    assert "party" in warn(kind="questionnaire", source="https://exampledems.org/q")[0]
    assert "words" in warn(text="word " * 41)[0]
    assert "date" in warn(date="March 2024")[0]
    assert check(["not", "an", "object"])[0]
    print("self-check OK")


def main(argv):
    if argv == ["--demo"]:
        return demo()
    strict = "--strict" in argv
    files = [a for a in argv if a != "--strict"]
    if not files:
        sys.exit(__doc__.strip().splitlines()[-1])
    failed = False
    for path in files:
        try:
            with open(path) as f:
                errors, warnings = check(json.load(f))
        except (OSError, ValueError) as e:
            errors, warnings = [f"file: cannot read JSON ({e})"], []
        for m in errors:
            print(f"ERROR {m}")
        for m in warnings:
            print(f"WARN {m}")
        print(f"{path}: {len(errors)} errors, {len(warnings)} warnings")
        failed |= bool(errors) or (strict and bool(warnings))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
