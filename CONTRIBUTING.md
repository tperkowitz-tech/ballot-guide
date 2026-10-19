# Contributing

A short guide for maintainers. Run `python3 tools/check.py` before every pull request; it must print `checks passed`. CI runs the same command.

## Where things live

Edit the source, then rebuild. Never edit a generated file by hand: `tools/check.py` fails when one is stale.

| Source | What it is | Generated from it |
|---|---|---|
| `ballot-guide/SKILL.md` | The skill's entry point | `dist/ballot-guide.skill` and an identical `dist/ballot-guide.zip` (with the rest of `ballot-guide/`, via `tools/package.py`) |
| `ballot-guide/references/rules.md` | Research and values-match rules the skill follows | (skill only) |
| `ballot-guide/references/prompts.md` | Steps 0–8, the prompts every version uses | `docs/index.html`, `PROMPT-KIT.md` (via `tools/build_kit.py`) |
| `ballot-guide/references/quickstart.txt` | The Quick start starter, tuned in live tests | `docs/index.html`, `PROMPT-KIT.md` |
| `ballot-guide/references/delegation.md` | Optional research with sub-agents | (skill only) |
| `ballot-guide/scripts/score.py` | Python calculator | (used by the skill and `tools/build_sample.py`) |
| `ballot-guide/scripts/check_evidence.py` | Checks research JSON before scoring | (used by the skill and `tools/build_sample.py`) |
| `tools/page.template.html`, `tools/kit.js`, `tools/calc.js` | Web kit page, its text helpers, browser calculator | `docs/index.html` |
| `tools/build_kit.py` (the `HOW_*` text) | "How to use" text for the page and the prompt kit | `docs/index.html`, `PROMPT-KIT.md` |
| `tools/samples/<slug>.json`, `tools/profiles.json` | Sample research and example values profiles | `docs/samples/<slug>.html`, `docs/sample.html` (via `tools/build_sample.py`) |
| `TESTED.md` report log | Test reports | The "Areas tested" table (via `tools/tested_summary.py`) |
| `VERSION` | Kit version | The web kit's test-report link |

Published links (release notes, social posts) use these anchors, so don't rename them: the README heading "Install the skill" (`#install-the-skill`), the web kit's `id="quick-start"`, `id="privacy"` and `id="step-kit"`, and PROMPT-KIT's "Quick start (one chat)" heading (`#quick-start-one-chat`, set in `tools/build_kit.py`).

Each fact has one home. Scoring details: `SCORING.md`. Which chats worked: `TESTED.md`. Web kit privacy: the page's Privacy section. Install steps: `README.md`. Link to these instead of repeating them.

## Change a prompt

1. Edit `ballot-guide/references/prompts.md`. Keep each step's heading, italic "when" line and `text` block shape: `tools/build_kit.py` parses them.
2. Some prompt wording is load-bearing. `tools/kit.js` rewrites parts of Steps 3, 4, 6 and 7 for neutral mode, the parsers read tokens such as `UNCONTESTED`, `CONTESTED` and `[A][+][RECORD]`, and `tools/kit_test.js` asserts on some exact text.
3. If the change affects scoring, update `score.py` and `calc.js` together, then `SCORING.md`. `node tools/calc_test.js` fuzzes both calculators for parity under every scoring option.
4. Change `quickstart.txt` only after testing it in a live free chat.
5. Run `python3 tools/build_kit.py`, then `python3 tools/check.py`.

## Add a sample

1. Add `tools/samples/<slug>.json` (lowercase, hyphens). The input shape is documented at the top of `tools/build_sample.py`. Use a public building address, never a home address.
2. It must pass `ballot-guide/scripts/check_evidence.py` with no errors.
3. Run `python3 tools/build_sample.py`, then `python3 tools/check.py`.

## Add a test report

Reports arrive as issues labeled `tested`. Copy only the coarse fields into the `TESTED.md` log: date, state, area (or "(withheld)"; drop it if smaller than a city), election, tool, mode, result, a short note, version. Never copy names, addresses, political views or votes. Then run `python3 tools/tested_summary.py`.

## Release

1. Bump `VERSION` and run `python3 tools/build_kit.py`.
2. Run `python3 tools/check.py` and `python3 tools/package.py`. Inspect `dist/ballot-guide.zip`; `ballot-guide/SKILL.md` must be at its top level. `dist/ballot-guide.skill` holds the same bytes.
3. After review passes and the PR is merged, check out merged `main`, rebuild the archive, and publish the release (for example `v2.1.0`) on that commit with both `dist/ballot-guide.zip` and `dist/ballot-guide.skill` attached. The README's install commands download `ballot-guide.zip` from the latest release, so it must be there. Mention both downloads in the release notes. Publish only when the owner authorizes it. `dist/` is ignored by Git.

## Review and fact-check

- Every change gets an independent review before it merges or publishes.
- Every factual claim in the prompts, rules and docs needs a source. Research claims go in `CREDITS.md` with a DOI or link; don't overstate what a study found.
- Keep examples fictional and balanced: use paired, contrasting example voters, never a contributor's address, views or personal stakes.
- Before committing, check `git var GIT_AUTHOR_IDENT` and `git var GIT_COMMITTER_IDENT`. Use your GitHub noreply email; keep personal email and hostnames out of commits. `tools/check.py` also scans publishable files for personal strings.
