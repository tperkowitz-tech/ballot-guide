"""Build a deterministic Claude upload archive from the unified skill folder."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "ballot-guide"
OUTPUT = ROOT / "dist" / "ballot-guide.skill"


def main():
    files = sorted(p for p in SOURCE.rglob("*") if p.is_file()
                   and not any(part.startswith(".") or part == "__pycache__"
                               for part in p.relative_to(SOURCE).parts)
                   and p.suffix not in {".pyc", ".pyo"})
    if not (SOURCE / "SKILL.md").is_file():
        raise SystemExit("Missing ballot-guide/SKILL.md")
    OUTPUT.parent.mkdir(exist_ok=True)
    with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as archive:
        for path in files:
            entry = ZipInfo("ballot-guide/" + path.relative_to(SOURCE).as_posix(), (1980, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, path.read_bytes())
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(files)} files)")


if __name__ == "__main__":
    main()
