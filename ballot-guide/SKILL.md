---
name: ballot-guide
description: Research US ballots, candidates' evidence (records first, then candidates' own questionnaire answers and statements, with donors and endorsements as limited signals), measures, and official election logistics with sources. Use for a full ballot guide, one race or measure, or an explainer. Neutral comparison is the default; values match is opt-in when the user asks, supplies values, and the host permits it.
---

# Ballot Guide

Find the exact ballot and build a sourced guide that puts deeds before campaign
promises. The voter makes the choice. Before starting, read `references/rules.md`
(the rules, for both modes) and `references/prompts.md` (the step prompts).

## Modes and scope

- **Neutral comparison (default):** no values profile, scores, rankings or calls.
  Use it when the user wants neutral research or the host does not permit matching.
- **Values match (opt-in):** only when the voter asks, supplies values and the host
  permits it. Follow the values-match workflow in `references/rules.md` and score
  with `scripts/score.py`. Never substitute your own politics.
- **Full ballot:** all applicable steps. **One race or measure:** only the relevant
  steps. **Explainer:** legal effects, fiscal facts and the strongest sourced
  arguments; no values interview. Answer pure logistics directly from the official
  election office.

## Workflow

1. Confirm jurisdiction, election date and type, and districts; prefer an official
   sample ballot. Use an address only for the official lookup, never in outputs.
2. Find the ballot (Step 2). Check local and state pamphlets, withdrawals, primary
   rules, and expected offices that are not on this ballot.
3. Research every candidate (Step 3) and every measure (Step 4), including minor and
   unopposed candidates. For races with 5 or more candidates, follow "Crowded and
   unopposed races" in the rules.
4. Neutral mode skips Steps 1 and 5 and has no scores or calls in Step 7. Values mode
   follows the rules' values-match workflow, "Scoring options" and "Crowded and
   unopposed races": offer Original (the default), Evidence-based and Custom, never
   call one recommended, pass the choice and incumbency to `scripts/score.py`, and
   name the option in the guide. Viability is separate from scoring and shown only on
   request; the voter owns tactical choices.
5. Verify (Step 6) against primary sources; worker reports are claims until checked.
   Optionally run Step 8 on each research answer with a different model or a fresh
   chat; recommended for close calls.
6. Build the local guide (Step 7), with source links, research dates, uncertainty,
   open items and "where to look yourself". Sharing needs explicit authorization.
   Afterwards you may offer the optional test report in Step 7; the user decides
   whether to submit it.
7. Recheck disputed facts. In values mode, re-run the calculator after the user
   changes signs or weights, and explain which scores moved.

Use whatever web, browser, PDF and script tools are available; do not assume a
vendor or connector. Delegate only when authorized, following
`references/delegation.md`, and validate every evidence file with
`scripts/check_evidence.py` before scoring.

## Files

- `references/rules.md`: research rules for both modes, and the values-match workflow.
- `references/prompts.md`: step prompts (Steps 0–8).
- `references/delegation.md`: optional research with sub-agents.
- `references/quickstart.txt`: the one-chat starter the web kit's Quick start offers.
- `scripts/score.py`: calculator; `python3 scripts/score.py --demo`.
- `scripts/check_evidence.py`: checks evidence JSON before scoring; `python3 scripts/check_evidence.py --demo`.
