# Contributing

The installable skill lives in `ballot-guide/`. Edit its entrypoint in
`ballot-guide/SKILL.md`, shared step prompts in `ballot-guide/references/prompts.md`,
and shared research rules in `ballot-guide/references/rules.md`.
Keep examples fictional; include neutral and paired contrasting examples rather
than a contributor's address, political views, or personal stakes.

The Python calculator is `ballot-guide/scripts/score.py`; the browser calculator
is `tools/calc.js`. Keep their behavior in lockstep and run both calculator tests.
The folder merge changes no scoring logic.

Regenerate and check the web/chat kit before opening a pull request:

```bash
python3 tools/build_kit.py
python3 tools/check.py
python3 tools/package.py
```

`tools/page.template.html` and `tools/kit.js` supply the web interface.
Do not edit generated `docs/index.html` or `PROMPT-KIT.md` directly.
The deterministic archive is `dist/ballot-guide.skill`, with top-level `ballot-guide/SKILL.md`.
Inspect the archive before attaching it to an explicitly authorized release.
After checks pass and the PR is merged, check out merged `main`, rebuild the
archive, and publish the authorized release (for example `v1.2.0`) targeting that
commit, with `dist/ballot-guide.skill` attached.
Generated archives and `dist/` are ignored by Git.

Before committing, check `git var GIT_AUTHOR_IDENT` and
`git var GIT_COMMITTER_IDENT`. Use your GitHub noreply email; keep personal email
and hostnames out of commits. Independent review must pass before publishing.
