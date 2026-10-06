"""Build the sample guides: docs/samples/<slug>.html from tools/samples/<slug>.json, and
the index docs/sample.html linking them. A neutral comparison (Step 7, neutral mode), plus
illustrative scores for six example values profiles (tools/profiles.json).

Input shape (one file per place; the slug is the file name), as the researchers write it:
  {"place": str, "test_address_label": str, "election": str, "researched": "YYYY-MM-DD",
   "official_office" (or "election_office"): {"name": str, "url": "https://..."},
   "links": optional [{"label": str, "url": url}], "districts": optional [{"type", "name", "source"?}],
   "ballot": {"races": [{"office": str, "position"?: str, "candidates": "A | B" or [str],
                         "status": "CONTESTED" | "UNCONTESTED" | "RETENTION" | "UNVERIFIED" (or "contested": bool), "source": url}],
              "measures": [{"name": str, "summary": str, "source": url}], "unverified"?: [str]},
   "gray": [] (optional), "axes"?: derived from the evidence topics when absent,
   "races": [score.py races; every evidence sign "0"; optional per race "summary", "turns_on",
             "gaps"; per option "job"; per measure "yes_means" (or "yes_does"), "no_means", "fiscal",
             "for"/"against" as "text | URL" or {"text", "source"}],
   "gaps"?: [str]}
Evidence rows may also carry "lean": {"U"|"E"|"P": "+"|"-"|"0"} on the value tensions in
tools/profiles.json; each researched item is then scored by score.py for each example profile.

Inputs must pass check_evidence.py with no errors (warnings are printed); anything else
malformed stops the build. tools/check.py fails if a generated page is stale.

Usage: python3 tools/build_sample.py [--self-test]
"""
import datetime
import glob
import html
import json
import os
import re
import sys
from urllib.parse import urlsplit

from build_kit import ROOT, write

sys.path.insert(0, os.path.join(ROOT, "ballot-guide", "scripts"))
from check_evidence import check  # noqa: E402
from score import RANK, score_race  # noqa: E402

CSP = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
       "img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'")
KIND_LABEL = {"record": "RECORD", "questionnaire": "QUESTIONNAIRE", "stated": "STATED",
              "funder": "FUNDER", "endorsement": "ENDORSEMENT"}

STYLE = """
:root{
  --paper:#f5f7f6; --sheet:#ffffff; --ink:#18242f; --muted:#5a6872; --rule:#d5dde0;
  --pen:#1d55b3; --warn:#8a4b00; --warn-soft:#fbf0e1;
  --body:system-ui,-apple-system,"Segoe UI","Helvetica Neue",Arial,sans-serif;
  --mono:ui-monospace,"SFMono-Regular",Menlo,Consolas,"Liberation Mono",monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --paper:#11181e; --sheet:#18222a; --ink:#e3e9ec; --muted:#9aa8b1; --rule:#2c3a44; --pen:#7fa8ef; --warn:#f0b766; --warn-soft:#2e2414; color-scheme:dark}}
:root[data-theme="dark"]{
  --paper:#11181e; --sheet:#18222a; --ink:#e3e9ec; --muted:#9aa8b1; --rule:#2c3a44; --pen:#7fa8ef; --warn:#f0b766; --warn-soft:#2e2414; color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 var(--body);padding:24px 16px 56px;overflow-wrap:break-word}
.wrap{max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
h1,h2,h3,h4{margin:0;line-height:1.2;text-wrap:balance}
h1{font-size:clamp(1.7rem,6vw,2.4rem)}
h2{font-size:1.25rem;margin-top:8px}
h3{font-size:1rem}
p,ul{margin:0}
ul{padding-left:20px}
a{color:var(--pen)}
a:focus-visible{outline:2px solid var(--pen);outline-offset:2px}
.banner{background:var(--warn-soft);border-left:4px solid var(--warn);padding:12px 16px;display:flex;flex-direction:column;gap:6px}
.muted{color:var(--muted)}
section{display:flex;flex-direction:column;gap:8px}
.item{background:var(--sheet);border:1px solid var(--rule);border-radius:6px;padding:16px;display:flex;flex-direction:column;gap:8px}
.ev{font-size:.92rem;display:flex;flex-direction:column;gap:4px}
.tag{font-family:var(--mono);font-size:.85rem}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.9rem}
caption{text-align:left;font-weight:600;padding-bottom:6px}
th,td{border-bottom:1px solid var(--rule);padding:6px 8px 6px 0;text-align:left;vertical-align:top;min-width:4.5em}
footer{font-size:.92rem;display:flex;flex-direction:column;gap:6px}
"""


def e(text):
    return html.escape(str(text), quote=True)


def link(url, text=None):
    return f'<a href="{e(url)}">{e(text or urlsplit(url).hostname)}</a>'


def fail(where, msg):
    sys.exit(f"{where}: {msg}")


def need(where, obj, key, kind):
    value = obj.get(key) if isinstance(obj, dict) else None
    if not isinstance(value, kind) or (kind is str and not value.strip()):
        fail(where, f'"{key}" must be a {"non-empty string" if kind is str else kind.__name__}')
    return value


def need_url(where, obj, key):
    if not re.match(r"https?://", need(where, obj, key, str)) or not urlsplit(obj[key]).hostname:
        fail(where, f'"{key}" must be an http(s) URL')
    return obj[key]


def optional(where, obj, key, kind, default=None):
    # Researchers leave unused optional fields empty ("" or null); treat both as absent.
    return default if obj.get(key) in (None, "") else need(where, obj, key, kind)


def strings(where, obj, key):
    """An optional list of strings, or one string treated as a one-item list."""
    value = obj.get(key)
    value = [value] if isinstance(value, str) else ([] if value is None else value)
    if not isinstance(value, list) or not all(isinstance(v, str) and v.strip() for v in value):
        fail(where, f'"{key}" must be a string or a list of strings')
    return value


def argument(where, race, side):
    """"text | URL" or {"text", "source"} -> {"text", "source"}; the URL is required."""
    value = race.get(side)
    if value is None:
        return None
    if isinstance(value, str):
        if "|" not in value:
            fail(where, f'"{side}" must end with "| https://..." (its source)')
        text, _, url = value.rpartition("|")
        value = {"text": text.strip(), "source": url.strip()}
    need(where, value, "text", str), need_url(f"{where} {side}", value, "source")
    return value


def normalize(where, data):
    """Check the input strictly and return it in one shape for the renderer."""
    for key in ("place", "test_address_label", "election", "researched"):
        need(where, data, key, str)
    try:
        datetime.date.fromisoformat(data["researched"])
    except ValueError:
        fail(where, '"researched" must be a YYYY-MM-DD date')
    key = "election_office" if "election_office" in data else "official_office"
    office = need(where, data, key, dict)
    need(f"{where} {key}", office, "name", str), need_url(f"{where} {key}", office, "url")
    links = optional(where, data, "links", list, [])
    for i, ln in enumerate(links):
        need(f"{where} links #{i}", ln, "label", str), need_url(f"{where} links #{i}", ln, "url")
    districts = optional(where, data, "districts", list, [])
    for i, d in enumerate(districts):
        need(f"{where} districts #{i}", d, "type", str), need(f"{where} districts #{i}", d, "name", str)
        if d.get("source") is not None:
            need_url(f"{where} districts #{i}", d, "source")
    ballot = need(where, data, "ballot", dict)
    ballot_races = []
    for i, r in enumerate(need(f"{where} ballot", ballot, "races", list)):
        w = f"{where} ballot race #{i}"
        office_name = need(w, r, "office", str)
        position = optional(w, r, "position", str)
        cands = r.get("candidates")
        cands = [c.strip() for c in cands.split("|")] if isinstance(cands, str) else cands
        if not isinstance(cands, list) or not cands or not all(isinstance(c, str) and c.strip() for c in cands):
            fail(w, '"candidates" must be "A | B" or a list of names')
        status_label = {"CONTESTED": "Contested", "UNCONTESTED": "Uncontested", "RETENTION": "Retention (yes/no)",
                        "UNVERIFIED": "Not confirmed"}
        if isinstance(r.get("status"), str) and r["status"].upper() in status_label:
            status = status_label[r["status"].upper()]
        elif isinstance(r.get("contested"), bool):
            status = "Contested" if r["contested"] else "Uncontested"
        else:
            fail(w, '"status" must be CONTESTED, UNCONTESTED, RETENTION or UNVERIFIED')
        ballot_races.append({"office": f"{office_name}, {position}" if position else office_name,
                             "candidates": cands, "status": status, "source": need_url(w, r, "source")})
    measures = optional(f"{where} ballot", ballot, "measures", list, [])
    for i, m in enumerate(measures):
        w = f"{where} ballot measure #{i}"
        need(w, m, "name", str), need(w, m, "summary", str), need_url(w, m, "source")
    if data.get("gray", []) != []:
        fail(where, 'neutral samples need "gray": []')
    races = need(where, data, "races", list)
    topics = {ev["axis"]: 1 for r in races if isinstance(r, dict) for o in r.get("options") or [] if isinstance(o, dict)
              for ev in o.get("evidence") or [] if isinstance(ev, dict) and isinstance(ev.get("axis"), str) and ev["axis"]}
    axes = data.get("axes", topics)
    errors, warnings = check({"axes": axes, "races": races})
    if errors:
        fail(where, "check_evidence errors:\n  " + "\n  ".join(errors))
    for w in warnings:
        print(f"{where}: warning: {w}", file=sys.stderr)
    out_races = []
    for race in races:
        w = f"{where} {need(where, race, 'race', str)}"
        for opt in race["options"]:
            if any(ev.get("sign") != "0" for ev in opt.get("evidence", [])):
                fail(w, f'{opt["name"]}: neutral samples tag every line with sign "0"')
            for ev in opt.get("evidence", []):
                lean = ev.get("lean", {})
                if not isinstance(lean, dict) or not set(lean) <= set(TENSIONS) or not all(isinstance(v, str) and v in FLIP for v in lean.values()):
                    fail(w, f'{opt["name"]}: "lean" must map U, E or P to "+", "-" or "0" (found {lean!r})')
            optional(w, opt, "job", str)
        for key in ("summary", "turns_on", "gaps", "no_means", "fiscal"):
            optional(w, race, key, str)
        out_races.append({**race, "yes": strings(w, race, "yes_means" if "yes_means" in race else "yes_does"),
                          "for": argument(w, race, "for"), "against": argument(w, race, "against")})
    gaps = [f'{r["race"]}: {r["gaps"]}' for r in races if r.get("gaps")]
    gaps += strings(where, ballot, "unverified") + strings(where, data, "gaps")
    return {"place": data["place"], "test_address_label": data["test_address_label"], "election": data["election"],
            "researched": data["researched"], "office": office, "links": links, "districts": districts,
            "ballot_races": ballot_races, "measures": measures, "races": out_races, "gaps": gaps}


TENSIONS = ("U", "E", "P")
FLIP = {"+": "-", "-": "+", "0": "0"}


def load_profiles():
    where = "tools/profiles.json"
    try:
        with open(os.path.join(ROOT, "tools", "profiles.json"), encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as err:
        fail(where, str(err))
    need(where, data, "about", str)
    axes = need(where, data, "axes", dict)
    if sorted(axes) != sorted(TENSIONS):
        fail(where, f'"axes" must be exactly {", ".join(TENSIONS)}')
    for t in TENSIONS:
        for key in ("name", "plus", "minus"):
            need(f"{where} axes {t}", axes[t], key, str)
    for i, prof in enumerate(need(where, data, "profiles", list)):
        w = f"{where} profile #{i}"
        need(w, prof, "name", str), need(w, prof, "summary", str)
        pax = need(w, prof, "axes", dict)
        if not pax or not set(pax) <= set(TENSIONS) or not all(
                isinstance(v, list) and len(v) == 2 and v[0] in ("+", "-") and type(v[1]) is int and 1 <= v[1] <= 3
                for v in pax.values()):
            fail(w, '"axes" must map U, E or P to ["+" or "-", weight 1-3]')
    return data


def profile_race(race, prof):
    """score.py input for one profile: each row's lean on a profile axis becomes a row on that
    axis, flipped when the profile leans to the "-" pole; rows with no such lean are left out."""
    opts = [{"name": o["name"], "evidence": [
        {"axis": a, "sign": ev["lean"][a] if d == "+" else FLIP[ev["lean"][a]],
         **{k: ev[k] for k in ("kind", "event", "source", "date", "text") if k in ev}}
        for ev in o.get("evidence", []) for a, (d, _) in prof["axes"].items() if a in ev.get("lean", {})]}
        for o in race["options"]]
    return score_race({"race": race["race"], "measure": bool(race.get("measure")), "options": opts},
                      {a: w for a, (_, w) in prof["axes"].items()})


def profile_table(race, profiles):
    names = [o["name"] for o in race["options"]]
    head = "".join(f'<th scope="col">{e(n)}</th>' for n in names)
    rows = []
    for prof in profiles["profiles"]:
        res = profile_race(race, prof)
        cells = "".join("<td>no score</td>" if o["score"] is None else
                        f'<td>{o["score"]} ({o["low"]}-{o["high"]}), {e(o["evidence"])}</td>' for o in res["options"])
        note = "".join(f"<br><small>{e(w)}</small>" for w in res.get("warnings", []))
        rows.append(f'<tr><th scope="row">{e(prof["name"])}</th><td>{e(res["call"])}{note}</td>{cells}</tr>')
    return (f'<div class="scroll"><table><caption>Values match by profile: {e(race["race"])}</caption><thead><tr><th scope="col">Profile</th>'
            f'<th scope="col">Call</th>{head}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>'
            "<p class=\"muted\">How each example profile would score this, from the same evidence. "
            "Your own priorities may differ.</p>")


def self_test():
    ev = {"kind": "record", "event": "v1", "source": "https://example.org/v1", "date": "2025-01-01", "text": "Voted yes.",
          "sign": "0", "lean": {"U": "+"}}
    race = {"race": "R", "options": [{"name": "X", "evidence": [ev]}]}
    plus = {"name": "P", "axes": {"U": ["+", 2]}}
    minus = {"name": "M", "axes": {"U": ["-", 2]}}
    up, down = profile_race(race, plus)["options"][0], profile_race(race, minus)["options"][0]
    assert up["score"] > 50 > down["score"] and up["score"] - 50 == 50 - down["score"], (up, down)
    other = profile_race(race, {"name": "O", "axes": {"P": ["+", 3]}})
    assert other["call"] == "Not enough evidence" and other["options"][0]["score"] is None, other
    m = profile_race({"race": "M", "measure": True, "options": [{"name": "YES", "evidence": [{**ev, "lean": {"E": "0"}}]}]}, minus)
    assert m["call"] == "Not enough evidence", m  # no lean on the profile's axis: dropped
    zero = profile_race({"race": "Z", "options": [{"name": "X", "evidence": [{**ev, "lean": {"U": "0"}}]}]}, minus)
    assert zero["options"][0]["score"] == 50, zero  # a "0" lean is mixed evidence and counts
    assert "<caption>Values match by profile: R</caption>" in profile_table(race, {"profiles": [plus]})
    print("build_sample self-test OK")


def long_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d:%B} {d.day}, {d.year}"


def evidence_list(evidence):
    rows = sorted(evidence, key=lambda ev: -RANK[ev["kind"]])
    return '<ul class="ev">' + "".join(
        f'<li><span class="tag">[{e(ev["axis"])}] {KIND_LABEL[ev["kind"]]}</span>, {e(ev.get("date") or "date not given")}: '
        f'{e(ev.get("text") or "")} (source: {link(ev["source"])})</li>' for ev in rows) + "</ul>"


def page(title, body):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- Privacy: the browser blocks every connection to other sites. tools/check.py requires this exact policy. -->
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<title>{e(title)}</title>
<!-- Generated by tools/build_sample.py from tools/samples/. Do not edit by hand. -->
<style>{STYLE}</style>
</head>
<body>
<main class="wrap">
{body}
</main>
</body>
</html>
"""


def sample(data, profiles):
    office, races = data["office"], data["races"]
    out = [f'<div class="banner" role="note"><p><strong>Real ballot, researched with this tool on {e(long_date(data["researched"]))} '
           "using a public building's address.</strong> AI research can be wrong: open the sources. This is not an endorsement. "
           f'Get dates and places from your official election office ({link(office["url"], office["name"])}).</p>'
           f'<p>Address used: {e(data["test_address_label"])}.</p></div>',
           f'<header><p><a href="../sample.html">All sample guides</a></p><h1>{e(data["place"])} Ballot Guide</h1>'
           f'<p class="muted">{e(data["election"])}</p>'
           f"<p>{NEUTRAL_LINE}</p></header>"]
    if data["districts"]:
        out.append("<h2>Districts</h2><ul>" + "".join(
            f'<li>{e(d["type"])}: {e(d["name"])}' + (f' ({link(d["source"])})' if d.get("source") else "") + "</li>"
            for d in data["districts"]) + "</ul>")
    out.append("<h2>Method</h2><p>Each choice is shown side by side, with no scores. Records (what candidates did) "
               "come first, then questionnaire answers, then other statements, then donors and endorsements. Every line "
               "shows its kind, topic, date and source. After each comparison, a table shows how six example values "
               "profiles would score it from the same evidence; those scores are illustrations, not recommendations.</p>")
    rows = "".join(f'<tr><th scope="row">{e(r["office"])}</th><td>{e(", ".join(r["candidates"]))}</td>'
                   f'<td>{e(r["status"])}</td><td>{link(r["source"])}</td></tr>'
                   for r in data["ballot_races"])
    out.append('<h2>Full ballot</h2><div class="scroll"><table><caption>Races</caption><thead><tr><th scope="col">Office</th>'
               '<th scope="col">Candidates</th><th scope="col">Status</th><th scope="col">Source</th></tr></thead>'
               f"<tbody>{rows}</tbody></table></div>")
    if data["measures"]:
        rows = "".join(f'<tr><th scope="row">{e(m["name"])}</th><td>{e(m["summary"])}</td><td>{link(m["source"])}</td></tr>'
                       for m in data["measures"])
        out.append('<div class="scroll"><table><caption>Measures</caption><thead><tr><th scope="col">Measure</th>'
                   '<th scope="col">Summary</th><th scope="col">Source</th></tr></thead>'
                   f"<tbody>{rows}</tbody></table></div>")
    out.append(f"<h2>Researched items</h2><p>{len(races)} of {len(data['ballot_races']) + len(data['measures'])} ballot items "
               "were researched for this sample.</p>")
    for r in races:
        body = [f'<section class="item" aria-label="{e(r["race"])}"><h3>{e(r["race"])}</h3>']
        if r.get("summary"):
            body.append(f'<p>{e(r["summary"])}</p>')
        if r.get("measure"):
            if r["yes"]:
                body.append("<p><strong>What YES does:</strong></p><ul>" + "".join(f"<li>{e(p)}</li>" for p in r["yes"]) + "</ul>")
            if r.get("no_means"):
                body.append(f'<p><strong>What NO means:</strong> {e(r["no_means"])}</p>')
            if r.get("fiscal"):
                body.append(f'<p><strong>Cost estimate:</strong> {e(r["fiscal"])}</p>')
            for side, label in (("for", "YES"), ("against", "NO")):
                if r[side]:
                    body.append(f'<p><strong>Strongest argument for {label}:</strong> {e(r[side]["text"])} '
                                f'({link(r[side]["source"])})</p>')
            body.append(evidence_list(r["options"][0].get("evidence", [])))
        else:
            for o in r["options"]:
                job = f'<p class="muted">{e(o["job"])}</p>' if o.get("job") else ""
                body += [f'<h4>{e(o["name"])}</h4>{job}', evidence_list(o.get("evidence", []))]
        if r.get("turns_on"):
            body.append(f'<p><strong>What to check:</strong> {e(r["turns_on"])}</p>')
        # Items nobody tagged on the value tensions would show only "Not enough evidence" rows.
        if any(ev.get("lean") for o in r["options"] for ev in o.get("evidence", [])):
            body.append(profile_table(r, profiles))
        out.append("".join(body) + "</section>")
    if data["gaps"]:
        out.append("<h2>Open items</h2><ul>" + "".join(f"<li>{e(g)}</li>" for g in data["gaps"]) + "</ul>")
    links = [link(office["url"], office["name"])] + [link(ln["url"], ln["label"]) for ln in data["links"]]
    out.append("<footer><h2>When and where to vote</h2><p>Get the dates to vote and where to return your ballot from your "
               f"official election office.</p><p>{' · '.join(links)}</p><p>This comparison is not an endorsement.</p></footer>")
    return page(f"{data['place']} sample ballot guide", "\n".join(out))


NEUTRAL_LINE = "The tool is neutral by default; the profile table shows how values match works."
MFQ = "https://moralfoundations.org/questionnaires/"


def profiles_section(profiles):
    axes = profiles["axes"]
    tensions = "".join(f'<li><strong>{t} · {e(axes[t]["name"])}</strong><ul><li>+ {e(axes[t]["plus"])}</li>'
                       f'<li>- {e(axes[t]["minus"])}</li></ul></li>' for t in TENSIONS)
    pole = lambda t, d: axes[t]["plus" if d == "+" else "minus"].split(":")[0]
    rows = "".join(f'<tr><th scope="row">{e(p["name"])}</th><td>{e(p["summary"])}</td>' + "".join(
        f'<td>{e(pole(t, p["axes"][t][0]))}, weight {p["axes"][t][1]}</td>' if t in p["axes"] else "<td>not weighed</td>"
        for t in TENSIONS) + "</tr>" for p in profiles["profiles"])
    heads = "".join(f'<th scope="col">{t} · {e(axes[t]["name"])}</th>' for t in TENSIONS)
    return (f'<section aria-labelledby="profiles-h"><h2 id="profiles-h">Values profiles</h2><p>{e(profiles["about"])}</p>'
            f"<p>The three value tensions:</p><ul>{tensions}</ul>"
            '<div class="scroll"><table><caption>Example profiles: direction and weight (1-3) on each tension</caption>'
            f'<thead><tr><th scope="col">Profile</th><th scope="col">Summary</th>{heads}</tr></thead><tbody>{rows}</tbody></table></div>'
            "<p>These profiles are illustrative groupings by moral priorities, not parties. To check your own values, try the "
            f'<a href="{MFQ}" target="_blank" rel="noopener noreferrer">Moral Foundations questionnaires</a>.</p></section>')


def index(samples, profiles):
    items = "".join(f'<li><a href="samples/{slug}.html">{e(d["place"])}</a>: {e(d["election"])}, researched '
                    f'{e(long_date(d["researched"]))}</li>' for slug, d in samples) or "<li>No samples yet.</li>"
    return page("Sample ballot guides", f"""<header><p><a href="./">Build your own guide</a></p>
<h1>Sample ballot guides</h1>
<p>Real ballots, researched with this tool using a public building's address. Each has a neutral side-by-side comparison, plus
illustrative scores for six example values profiles.
AI research can be wrong: open the sources. These are not endorsements.</p>
<p>{NEUTRAL_LINE}</p></header>
<ul>{items}</ul>
{profiles_section(profiles)}""")


def main():
    profiles = load_profiles()
    if sys.argv[1:] == ["--self-test"]:
        return self_test()
    samples = []
    for path in sorted(glob.glob(os.path.join(ROOT, "tools", "samples", "*.json"))):
        slug = os.path.basename(path)[:-5]
        where = f"tools/samples/{slug}.json"
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", slug):
            fail(where, "file name must be a lowercase slug like san-francisco")
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as err:
            fail(where, f"not valid JSON: {err}")
        if not isinstance(data, dict):
            fail(where, "expected a JSON object")
        samples.append((slug, normalize(where, data)))
    for slug, data in samples:
        write(f"docs/samples/{slug}.html", sample(data, profiles))
    # A page whose input was removed would otherwise stay published.
    keep = {f"{slug}.html" for slug, _ in samples}
    for old in glob.glob(os.path.join(ROOT, "docs", "samples", "*.html")):
        if os.path.basename(old) not in keep:
            os.remove(old)
    write("docs/sample.html", index(samples, profiles))
    print(f"wrote docs/sample.html and {len(samples)} sample page(s)")


if __name__ == "__main__":
    main()
