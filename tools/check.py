"""Check tests, generated kit freshness, and publishable-file privacy."""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


def main():
    generated = [ROOT / "docs/index.html", ROOT / "PROMPT-KIT.md"]
    original = {path: path.read_bytes() for path in generated}
    try:
        run("python3", "tools/build_kit.py")
        stale = [str(p.relative_to(ROOT)) for p in generated if p.read_bytes() != original[p]]
    finally:
        for path, content in original.items():
            if path.read_bytes() != content:
                path.write_bytes(content)
    if stale:
        raise SystemExit("Stale generated files: " + ", ".join(stale))
    run("python3", "ballot-guide/scripts/score.py", "--demo")
    run("node", "tools/calc_test.js")
    run("node", "tools/kit_test.js")
    patterns = [r"Perkowitz", r"Tacoma", r"Pierce County", r"1411", r"Nordic",
                r"fentanyl", r"rental property", r"perks\.media"]
    found = []
    for folder in ("ballot-guide", "docs", "tools", ".github"):
        for path in (ROOT / folder).rglob("*"):
            if path.is_file() and path != Path(__file__).resolve() and "__pycache__" not in path.parts:
                text = path.read_text(errors="replace").replace("tperkowitz-tech", "")
                if any(re.search(p, text, re.I) for p in patterns):
                    found.append(str(path.relative_to(ROOT)))
    for name in ("README.md", "PROMPT-KIT.md", "CONTRIBUTING.md", "LICENSE"):
        if any(re.search(p, (ROOT / name).read_text().replace("tperkowitz-tech", ""), re.I) for p in patterns):
            found.append(name)
    if found:
        raise SystemExit("Personal strings in publishable files: " + ", ".join(found))
    print("checks passed")


if __name__ == "__main__":
    main()
