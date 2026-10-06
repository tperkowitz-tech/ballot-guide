"""Regenerate the "Areas tested" table in TESTED.md from its report log.

The summary sits between the two markers below and is derived from the log table, so it
can never disagree with the log. tools/check.py runs this with --check and fails when the
summary is stale.

Usage: python3 tools/tested_summary.py [--check]
"""
import os
import sys
import tempfile
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "TESTED.md")
START, END = "<!-- summary:start -->", "<!-- summary:end -->"
LOG_HEADER = "| Date | State | Area | Election | Used in | Mode | Result | Notes | Version |"


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def log_rows(text):
    lines = text.splitlines()
    if lines.count(LOG_HEADER) != 1:
        sys.exit(f"TESTED.md: expected the log header exactly once: {LOG_HEADER}")
    i = lines.index(LOG_HEADER) + 2  # skip the |---| rule
    rows = []
    for line in lines[i:]:
        if not line.startswith("|"):
            break
        row = dict(zip(cells(LOG_HEADER), cells(line)))
        if len(cells(line)) != 9 or not row["State"]:
            sys.exit(f"TESTED.md: cannot read log row: {line}")
        rows.append(row)
    return rows


def summary(rows):
    out = [START, "| State | Reports | Used in | Last tested | Results |", "|---|---|---|---|---|"]
    for state in sorted({r["State"] for r in rows}):
        mine = [r for r in rows if r["State"] == state]
        used = ", ".join(sorted({r["Used in"] for r in mine}))
        results = ", ".join(f"{n} {res}" for res, n in sorted(Counter(r["Result"] for r in mine).items()))
        out.append(f"| {state} | {len(mine)} | {used} | {max(r['Date'] for r in mine)} | {results} |")
    if not rows:
        out.append("| (none yet) | 0 | | | |")
    return "\n".join(out + [END])


def rebuild(text):
    if text.count(START) != 1 or text.count(END) != 1:
        sys.exit(f"TESTED.md: expected one {START} and one {END}")
    head, rest = text.split(START)
    return head + summary(log_rows(text)) + rest.split(END, 1)[1]


def main(argv):
    with open(PATH, encoding="utf-8") as f:
        text = f.read()
    new = rebuild(text)
    if "--check" in argv:
        if new != text:
            sys.exit("TESTED.md summary is stale; run python3 tools/tested_summary.py")
        return
    if new != text:
        # Temp file then rename, so a failed run never leaves a half-written TESTED.md.
        fd, tmp = tempfile.mkstemp(dir=ROOT)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(new)
        os.chmod(tmp, 0o644)
        os.replace(tmp, PATH)
    print("TESTED.md summary up to date")


if __name__ == "__main__":
    main(sys.argv[1:])
