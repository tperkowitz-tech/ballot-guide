# ballot-guide

Build a sourced guide to any US ballot with an AI assistant. It finds the exact ballot for an address, checks candidates' records and funders instead of campaign promises, fact-checks ballot measures, and links every claim to a source. It has no politics of its own. It gives a **neutral comparison** of every choice, or, if you want, **scores each choice against values you supply**.

## Choose your version

| You use | How |
|---|---|
| **Any AI chat** (Gemini, Copilot, Perplexity, ChatGPT, Claude, local models) | Open the web kit: https://tperkowitz-tech.github.io/ballot-guide/. A guided flow builds your profile, gives you each prompt to paste, reads the AI's answers back, scores them, and picks sources for you to spot-check. Plain-text version: [`PROMPT-KIT.md`](PROMPT-KIT.md). |
| **Claude apps** | Download `ballot-guide.skill` from the [latest release](https://github.com/tperkowitz-tech/ballot-guide/releases/latest) and upload it in the Skills section of Claude's settings. |
| **Claude Code** | Unzip the release `.skill` into `~/.claude/skills/`, or copy `ballot-guide/` from a clone into `~/.claude/skills/ballot-guide/`. |
| **Codex** | From a clone: `mkdir -p ~/.agents/skills && cp -R ballot-guide ~/.agents/skills/`, restart Codex, then ask `Use $ballot-guide to research my ballot.` ([Codex skills docs](https://learn.chatgpt.com/docs/build-skills)) |
| **Other Agent Skills hosts** | Install the shared `ballot-guide/` folder in the host's skills directory. |

One shared [`ballot-guide/`](ballot-guide/) folder contains one entrypoint and [shared rules](ballot-guide/references/rules.md) for the default neutral comparison and opt-in values workflow. The web kit starts in neutral mode. Each host's capabilities and rules apply.

In regular ChatGPT, use the web kit or paste `PROMPT-KIT.md` with web search enabled; the local `~/.agents/skills/` installation is for Codex and is not loaded automatically by ChatGPT.

## What it does

1. **Find the ballot:** districts, the official candidate list, uncontested races, and offices *not* on your ballot. The web kit sends your address only to this step.
2. **Research each race:** records first, then funders (FEC and state disclosure data), then statements. Every candidate, including unopposed ones. For races with 5+ candidates you may choose a focus rule that is not about party; excluded candidates are still listed.
3. **Fact-check each measure:** legal text, official fiscal note, what YES does and what NO means, the strongest argument on each side, funders.
4. **Verify:** re-open primary sources, especially for close calls.
5. **Build the guide:** summary, sourced evidence for each race, open items, and links to your official election office.

**Values match (optional):** you list 3 to 6 policy values with weights, topics you are mixed on, and optional red lines. Each choice then gets a fit score and a call. Unopposed candidates get "Vote for", "Your call" or "Consider leaving blank". Scores measure fit with your values, not who is likely to win; viability is shown separately only if you ask.

## About the scores

The score is a reproducible **summary of the evidence collected and how it was tagged**, not a measured percentage match. The arithmetic is fixed (`ballot-guide/scripts/score.py`, mirrored in the web calculator), but choosing and tagging evidence is a judgment, so every tag is shown with its source for you to challenge. Each of your priorities gets a position from distinct events (lines from one source count once unless given distinct event ids, and donors together count no more than one statement per priority), and priorities with no evidence count as unknown rather than disappearing. Every score shows its coverage (how much of your priorities the evidence reaches) and an evidence level (strong, moderate or thin). A call that one event could flip is a toss-up that says what it turns on, and a crossed deal-breaker takes a choice out of the call while still showing its score.

## Limits

- It supports your own research; it does not replace it.
- Funders are a weak signal. Many groups give to every likely winner.
- Dates, deadlines and places to vote come only from your official election office.

## Layout

- `ballot-guide/` — installable skill: entrypoint, shared rules, prompts, calculator, host metadata and license.
- `tools/` — kit generator, checks and release packaging.
- `docs/index.html` and `PROMPT-KIT.md` — generated web and chat kits.
- `dist/ballot-guide.skill` — generated archive with a top-level `ballot-guide/` folder.

## Maintainers

`ballot-guide/references/prompts.md` is the source for the step prompts. After editing it, `tools/page.template.html`, `tools/kit.js` or `tools/calc.js`, run `python3 tools/build_kit.py` to regenerate `docs/index.html` and `PROMPT-KIT.md`, then `node tools/calc_test.js`, `node tools/kit_test.js` and `python3 ballot-guide/scripts/score.py --demo`. Keep `ballot-guide/scripts/score.py` and `tools/calc.js` in step. Run `python3 tools/check.py` for freshness, tests and privacy checks, then `python3 tools/package.py` to build `dist/ballot-guide.skill`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
