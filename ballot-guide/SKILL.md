---
name: ballot-guide
description: Research US ballots, candidates' evidence (records first, then candidates' own questionnaire answers and statements, with donors and endorsements as limited signals), measures, and official election logistics with sources. Use for a full ballot guide, one race or measure, or an explainer. Neutral comparisons are the default; the existing values-match workflow is opt-in when requested with supplied values and permitted by the host.
---

# Ballot Guide

Find the exact ballot and build a sourced guide, emphasizing deeds rather than
campaign promises. The voter makes the choice. Read `references/rules.md` and
`references/prompts.md` before starting; the rules govern both modes.

## Modes and scope

- **Neutral comparison (default):** no values profile, scores, rankings or calls.
  Use this when the user wants neutral research or the host does not permit matching.
- **Values match (opt-in):** only when the voter asks, supplies values and the host
  permits it. Follow the existing values workflow in `references/rules.md` and
  use `scripts/score.py`; never substitute your own politics.
- **Full ballot:** all applicable steps. **One race or measure:** only the relevant
  steps. **Explainer:** legal effects, fiscal facts and strongest sourced arguments;
  no values interview. Answer pure logistics directly from the official election office.

## Workflow

1. Confirm jurisdiction, election date/type and districts; prefer an official sample
   ballot. Use an address only for the official lookup, never in outputs.
2. Find the ballot (Step 2), checking local and state pamphlets, withdrawals,
   primary rules and expected offices absent from this election.
3. Research every candidate (Step 3) and every measure (Step 4), including minor and
   uncontested candidates. For 5+ candidates, research all by default; an optional
   voter-selected non-party focus rule must list everyone excluded and why.
4. Neutral mode skips Steps 1 and 5, and has no scores or calls in Step 7.
   Values mode uses the profile, scoring and call instructions in the rules: one
   position per value from distinct events (record 3, stated 1; questionnaire
   answers pooled to one worth 2, or 3 for two or more; donors and endorsements pooled
   to one worth 1), a score over values with evidence plus a range for the values
   without the candidate's own evidence, coverage and an evidence level beside every score,
   gray items left out, red-lined options excluded from the call, toss-ups that name
   the event they turn on, and "(uneven evidence)" when coverage differs by 0.4+.
   Never use party label, platform or party endorsements as evidence or a baseline.
   Unopposed: 60+ "Vote for" and 40 or less "Consider leaving blank or writing in"
   need coverage 0.5+, better than thin evidence and at least one record; otherwise
   "Your call"; no evidence "Not enough evidence". A clear contested winner or a
   plain measure YES/NO also needs at least one record; otherwise it is a lean.
   Viability is separate from scoring and shown only on request; the voter owns
   tactical choices. See the rules for the existing electability treatment.
5. Verify (Step 6) against primary sources; worker reports are claims until checked.
   Optionally run Step 8 on each research answer with a different model or a fresh chat; recommended for close calls.
6. Build the local guide (Step 7), with source links, research dates, uncertainty,
   open items and "where to look yourself". Sharing needs explicit authorization.
7. Recheck disputed facts; in values mode, re-run the existing calculator after
   user changes to signs or weights and explain which scores moved.

Use available web, browser, PDF and script tools without assuming a vendor or
connector. Delegate only when authorized, using bounded public-source tasks and
excluding addresses and personal stakes. See the rules for verification coverage.

## Files

- `references/rules.md` — shared research rules and the original values workflow.
- `references/prompts.md` — step prompts, with the neutral routing note.
- `scripts/score.py` — calculator; `python3 scripts/score.py --demo`.
