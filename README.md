# ballot-guide

A Claude skill that builds a personal voter guide for one US address, plus a [neutral Codex version](codex/ballot-guide/SKILL.md). The original Claude skill scores every race and ballot measure against **your own stated values**, using voting records, rulings, official acts and campaign funders, not campaign promises. Every claim links a source. Scores come from a fixed formula, so you can disagree with a specific line instead of the whole result.

The skill has no politics of its own. You supply the values; it supplies evidence and arithmetic.

## What it does

1. **Values profile:** 3 to 6 policy values with weights, topics where you are mixed, optional red lines.
2. **Find the ballot:** districts, the official candidate list, uncontested races, and what is *not* on your ballot.
3. **Research each race:** records first, then funders (FEC, state disclosure data), then statements. Every candidate, not only front-runners.
4. **Fact-check each measure:** legal text, official fiscal note, what YES does and what NO means, strongest arguments on each side, funders.
5. **Score** with `scripts/score.py` (formula below).
6. **Verify:** re-check primary sources, especially for close calls.
7. **Build the guide:** summary table, sourced evidence per race, open items, official election links.

## Scoring

Each evidence item is `+`, `0` (mixed or a gray area) or `-` on one of your values. Items are averaged within each kind (record, funder, statement), then the kinds are weighted 3 / 2 / 1:

```
score = 50 + 50 × Σ(kind weight × kind average) / Σ(kind weights present)
```

No evidence gives "Not enough evidence", not a free 50. A documented red-line violation caps a score at 20. Run `python3 scripts/score.py --demo` to see the input format and a self-check.

## Install

- **Codex:** use the separate version in [`codex/ballot-guide/`](codex/ballot-guide/). It researches the exact ballot, compares every candidate using sourced records, funding and statements, and explains measures neutrally. It does **not** collect political values profiles, calculate personal match scores, rank choices, or recommend votes. Install it with the commands below, then invoke `$ballot-guide`. See the [official Codex skill documentation](https://learn.chatgpt.com/docs/build-skills) for discovery and installation details.
- **Claude Code:** copy this folder to `~/.claude/skills/ballot-guide/`.
- **Claude apps:** download `ballot-guide.skill` from the latest release and upload it in the Skills section of Claude's settings.
- **Any AI model:** `references/prompts.md` holds eight self-contained step prompts. Paste Step 0 (rules) and your profile above each step. They are written for low-cost models.

The scoring workflow and formula above describe the original Claude skill. The Codex version is self-contained and does not use `scripts/score.py` or `references/prompts.md`.

### Codex installation

From a local clone of this repository:

```bash
mkdir -p "$HOME/.agents/skills"
if [ -e "$HOME/.agents/skills/ballot-guide" ]; then
  echo "ballot-guide already exists; review it before replacing it."
else
  cp -R codex/ballot-guide "$HOME/.agents/skills/ballot-guide"
fi
```

Example: `Use $ballot-guide to build a neutral, sourced guide to my ballot.`
If the new skill does not appear, restart Codex. Guides stay local by default; publication requires explicit authorization.

## Limits

- It supports your own research; it does not replace it. Each guide ends with "where to look yourself".
- Deciding whether an item is `+` or `-` is still a judgment. The guide shows every one so you can challenge it.
- Funders are a weak signal. Many groups give to every likely winner.
- Scores measure fit with your values, not who is likely to win. You can ask for viability to be shown beside each score; it never changes the score.
- Dates, deadlines and places to vote come only from your official election office.

## License

MIT. See [LICENSE](LICENSE).
