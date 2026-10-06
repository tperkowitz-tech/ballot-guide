"""Check tests, generated kit freshness, and publishable-file privacy."""
import re
import subprocess
from pathlib import Path
from frontmatter import validate

ROOT = Path(__file__).resolve().parent.parent


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


def generated():
    paths = [ROOT / "docs/index.html", ROOT / "PROMPT-KIT.md", ROOT / "docs/sample.html",
             *(ROOT / "docs/samples").glob("*.html")]
    return {p: p.read_bytes() for p in paths if p.exists()}


def main():
    validate(ROOT / "ballot-guide/SKILL.md")
    original = generated()
    try:
        run("python3", "tools/build_kit.py")
        run("python3", "tools/build_sample.py")
        after = generated()
        # Compare both sets so a missing, extra or changed page all count as stale.
        stale = sorted(str(p.relative_to(ROOT)) for p in original.keys() | after.keys() if original.get(p) != after.get(p))
    finally:
        for path in generated().keys() - original.keys():
            path.unlink()
        for path, content in original.items():
            if not path.exists() or path.read_bytes() != content:
                path.write_bytes(content)
    if stale:
        raise SystemExit("Stale generated files: " + ", ".join(stale))
    run("python3", "ballot-guide/scripts/score.py", "--demo")
    run("python3", "ballot-guide/scripts/check_evidence.py", "--demo")
    run("python3", "tools/build_sample.py", "--self-test")
    run("python3", "tools/evidence_fuzz.py")
    run("node", "tools/calc_test.js")
    run("node", "tools/kit_test.js")
    run("python3", "tools/tested_summary.py", "--check")
    patterns = [r"Perkowitz", r"Tacoma", r"Pierce County", r"1411", r"Nordic",
                r"fentanyl", r"rental property", r"perks\.media"]
    # The owner chose to publish a Tacoma sample ballot (public building address), so the place
    # names alone are allowed in that sample and the sample index; every other pattern still applies.
    place = {r"Tacoma", r"Pierce County"}
    place_ok = {ROOT / "tools/samples/tacoma.json", ROOT / "docs/samples/tacoma.html", ROOT / "docs/sample.html"}
    found = []
    for folder in ("ballot-guide", "docs", "tools", ".github"):
        for path in (ROOT / folder).rglob("*"):
            if path.is_file() and path != Path(__file__).resolve() and "__pycache__" not in path.parts:
                text = path.read_text(errors="replace").replace("tperkowitz-tech", "")
                if any(re.search(p, text, re.I) for p in patterns if not (path in place_ok and p in place)):
                    found.append(str(path.relative_to(ROOT)))
    for name in ("README.md", "CREDITS.md", "SCORING.md", "SECURITY.md", "PROMPT-KIT.md", "CONTRIBUTING.md", "TESTED.md", "LICENSE"):
        if any(re.search(p, (ROOT / name).read_text().replace("tperkowitz-tech", ""), re.I) for p in patterns):
            found.append(name)
    if found:
        raise SystemExit("Personal strings in publishable files: " + ", ".join(found))
    # The privacy policy promises the page loads nothing from other sites and sends nothing.
    # The browser enforces it through this exact Content-Security-Policy; the scan catches
    # absolute URLs that would be loaded rather than merely linked.
    csp = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
           "img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'")
    for path in [ROOT / "docs/index.html", ROOT / "docs/sample.html", *sorted((ROOT / "docs/samples").glob("*.html"))]:
        name, page = str(path.relative_to(ROOT)), path.read_text()
        problems = [] if f'http-equiv="Content-Security-Policy" content="{csp}"' in page else ["missing privacy CSP"]
        no_links = re.sub(r"<a\b[^>]*>", "", page, flags=re.I)
        problems += re.findall(r"\b(?:src|srcset|href|action|poster|data|ping)\s*=\s*[\"']?(?:https?:)?//[^\s\"'>]+", no_links, re.I)
        problems += re.findall(r"(?:@import|url\()\s*[\"']?(?:https?:)?//[^\s\"')]+", page, re.I)
        if problems:
            raise SystemExit(f"{name} breaks the privacy policy: " + ", ".join(problems))
    print("checks passed")


if __name__ == "__main__":
    main()
