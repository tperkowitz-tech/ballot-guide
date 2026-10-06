# Contributing

The installable skill lives in `ballot-guide/`. Edit its entrypoint in
`ballot-guide/SKILL.md`, shared step prompts in `ballot-guide/references/prompts.md`,
and shared research rules in `ballot-guide/references/rules.md`.
Keep examples fictional; include neutral and paired contrasting examples rather
than a contributor's address, political views, or personal stakes.

The optional double-check (Step 8) has a second AI chat check each answer against
its sources. It is recommended, not required.

The Python calculator is `ballot-guide/scripts/score.py`; the browser calculator
is `tools/calc.js`. Keep their behavior in lockstep and run both calculator tests.
`node tools/calc_test.js` includes a parity fuzz that runs 4000 random races (all five
evidence kinds, ranges and calls, including uneven evidence) through both calculators
and fails on any mismatch.

`ballot-guide/scripts/check_evidence.py` checks research JSON before scoring
(see `ballot-guide/references/delegation.md`); `tools/check.py` runs its
`--demo` self-test.

Regenerate and check the web/chat kit before opening a pull request:

```bash
python3 tools/build_kit.py
python3 tools/check.py
python3 tools/package.py
```

`tools/page.template.html` and `tools/kit.js` supply the web interface.
Do not edit generated `docs/index.html` or `PROMPT-KIT.md` directly.
The public README stays voter-first; scoring details belong in `SCORING.md`,
which must match `score.py` and `calc.js`. The README screenshot is `docs/img/web-kit.jpg`.
The deterministic archive is `dist/ballot-guide.skill`, with top-level `ballot-guide/SKILL.md`.
Inspect the archive before attaching it to an explicitly authorized release.
After checks pass and the PR is merged, check out merged `main`, rebuild the
archive, and publish the authorized release (for example `v1.2.0`) targeting that
commit, with `dist/ballot-guide.skill` attached.
Generated archives and `dist/` are ignored by Git.

Test reports arrive as issues labeled `tested` (form: `.github/ISSUE_TEMPLATE/test-report.yml`).
To add one to `TESTED.md`, copy only the coarse fields (date, state, area if given or
"(withheld)", election, tool, mode, result, a short note, version). Never copy names,
addresses, political views, votes or other personal details; drop the area if it is
smaller than a city. Then run `python3 tools/tested_summary.py` to refresh the "Areas tested"
table (`tools/check.py` fails if it is stale). The kit version lives in `VERSION`; `tools/build_kit.py` puts it in
the web kit's test-report link, so bump it with each release and rebuild.

Before committing, check `git var GIT_AUTHOR_IDENT` and
`git var GIT_COMMITTER_IDENT`. Use your GitHub noreply email; keep personal email
and hostnames out of commits. Independent review must pass before publishing.
