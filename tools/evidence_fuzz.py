"""Parity fuzz: check_evidence.py against score.py on generated, often malformed, inputs.

Rules: an input the checker passes (no ERROR) must score without any exception, and an
input with ERRORs must either be rejected by score.py or fail only the checker's
deliberately stricter rules (STRICTER below).
"""
import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ballot-guide/scripts"))
from check_evidence import check  # noqa: E402
from score import score  # noqa: E402

# Checker ERRORs that score.py tolerates on purpose: unsourced or non-http rows, addresses,
# nameless options, page-shared rows that would silently collapse, wrong types in fields
# score.py never reads (or reads only when truthy), and an empty non-list "races" or
# "evidence" ("" or {}) that score.py iterates as nothing.
STRICTER = re.compile(r"\"races\" list|\"evidence\" must be a list|missing source|http\(s\) URL|street address|no name|"
                      r"would count once|(event|source|date|text) must be a string")
JUNK = [None, 0, 1, 2.5, True, False, "", "x", [], [1], {}, {"a": 1}, "gray", "+", "A", "Z",
        "record", "poll", "https://a.example/p", "ftp://a.example/p", "77 Oak Ave Apt 4"]
FIELDS = ("event", "axis", "sign", "kind", "source", "date", "text", "gray")


def evidence(rng, axes):
    ev = {"axis": rng.choice(list(axes) + ["Z"] * (rng.random() < 0.05)),
          "sign": rng.choice(["+", "-", "0", "gray"]),
          "kind": rng.choice(["record", "questionnaire", "stated", "funder", "endorsement"]),
          "source": rng.choice(["https://a.example/p", "https://A.example/p/", "https://b.example/q?x=1",
                                "https://en.wikipedia.org/wiki/X"]),
          "date": rng.choice(["2024", "2024-03-01", "March"]),
          "text": rng.choice(["Voted yes.", "Voted on HB 1 Main Street Act", "123 N Main St", "GOP mailer"])}
    if rng.random() < 0.6:
        ev["event"] = rng.choice(["v1", "v2", "v3", ""])
    if rng.random() < 0.1:
        ev["gray"] = True
    return ev


def doc(rng):
    axes = {a: rng.randint(1, 3) for a in "ABC"[:rng.randint(1, 3)]}
    races = [{"race": f"R{r}", "measure": rng.random() < 0.2,
              "options": [{"name": f"O{o}", "evidence": [evidence(rng, axes) for _ in range(rng.randint(0, 4))]}
                          for o in range(rng.randint(1, 3))]} for r in range(rng.randint(1, 2))]
    for race in races:  # mostly well-formed measures, so the pass branch gets exercised
        if race["measure"] and rng.random() < 0.8:
            del race["options"][1:]
    data = {"axes": axes, "races": races}
    for _ in range(rng.choice([0, 0, 1, 1, 2, 3])):
        mutate(rng, data)
    return json.loads(json.dumps(data))  # only JSON types, as a real file would hold


def mutate(rng, data):
    race = rng.choice(data["races"]) if isinstance(data.get("races"), list) and data["races"] else None
    opt = race["options"][0] if isinstance(race, dict) and isinstance(race.get("options"), list) \
        and race["options"] and isinstance(race["options"][0], dict) else None
    evs = opt.get("evidence") if opt else None
    ev = evs[0] if isinstance(evs, list) and evs and isinstance(evs[0], dict) else None
    where = rng.choice(["axes", "weight", "races", "race", "options", "option", "name", "evidence", "item", "field"] + ["field"] * 6)
    junk = rng.choice(JUNK)
    if where == "axes":
        data["axes"] = junk
    elif where == "weight" and isinstance(data["axes"], dict) and data["axes"]:
        data["axes"][next(iter(data["axes"]))] = junk
    elif where == "races":
        data["races"] = junk
    elif where == "race" and race is not None:
        data["races"][0] = junk
    elif where == "options" and isinstance(race, dict):
        race["options"] = junk
    elif where == "option" and opt is not None:
        race["options"][0] = junk
    elif where == "name" and opt is not None:
        opt["name"] = junk
    elif where == "evidence" and opt is not None:
        opt["evidence"] = junk
    elif where == "item" and isinstance(evs, list) and evs:
        evs[0] = junk
    elif where == "field" and ev is not None:
        f = rng.choice(FIELDS)
        if rng.random() < 0.2:
            ev.pop(f, None)
        else:
            ev[f] = junk


def main():
    rng = random.Random(1217)
    passed = rejected = stricter = 0
    for n in range(800):
        data = doc(rng)
        errors, _ = check(data)  # any exception here is itself a failure
        try:
            score(data)
            raised = None
        except Exception as e:  # noqa: BLE001 - any crash counts as score.py rejecting it
            raised = e
        if not errors:
            assert raised is None, f"case {n}: checker passed but score.py raised {raised!r}\n{json.dumps(data)}"
            passed += 1
        elif raised is not None:
            rejected += 1
        else:
            loose = [m for m in errors if not STRICTER.search(m)]
            assert not loose, f"case {n}: checker ERROR but score.py accepts it: {loose}\n{json.dumps(data)}"
            stricter += 1
    # Guard against a generator that stops exercising one branch.
    assert min(passed, rejected, stricter) >= 50, (passed, rejected, stricter)
    print(f"evidence_fuzz: 800 cases ok ({passed} pass, {rejected} rejected by both, {stricter} stricter-only)")


if __name__ == "__main__":
    main()
