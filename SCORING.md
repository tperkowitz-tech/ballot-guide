# How the scores work

Scores are optional. The default is a neutral, side-by-side comparison with no scores. If you choose **values match**, each choice gets a fit score against the priorities you enter. The score is a reproducible **summary of the evidence collected and how each item was tagged**. It is not a prediction, a poll, or a measured percentage.

## What counts as evidence

| Kind | Weight | Examples |
|---|---|---|
| Record | 3 | Final-passage votes, rulings, official acts, audits, prior-office work |
| Questionnaire | 2 for one answer; 3 for two or more on a priority, never more than one record | Vote Smart, League of Women Voters (Vote411), Ballotpedia, published group questionnaires |
| Statement | 1 | Campaign site, interviews, debates |
| Donors and endorsements | All together count no more than one statement per priority | Official filings (FEC, state disclosure agencies), issue-group endorsements |

- **Your priorities only.** One-number left–right scores are not evidence; party counts only if you list it as a priority.
- Lines about the same event count once. Topics you say you are torn on are left out of the score and listed separately.

## How a score is built

- Each of your priorities gets a position from its evidence, starting from a neutral weight so that one item cannot produce certainty.
- The score averages only the priorities that have evidence. A **range** ("62, could be 16–91") shows how far the priorities without the candidate's own evidence could move it. No evidence at all gives "Not enough evidence", never a free 50.
- **Coverage** shows how much of your weighted priorities the evidence reaches. **Evidence level** is strong, moderate or thin.

## How calls are made

- **Toss-up:** removing one item would change the leader. The guide names that item so you can check it first.
- **Uneven evidence:** if one side has much less evidence, the call is at most a lean.
- **Firm calls need a record.** A clear winner, "Vote for" or "Consider leaving blank" for an unopposed candidate, or a plain YES/NO on a measure needs at least one record. Otherwise the call is a lean or "Your call".
- **Deal-breakers** you list remove a choice from the call when they are proven by a record; the evidence is still shown.
- Scores measure fit with your priorities, not who is likely to win. Viability is shown separately only if you ask.

## Limits

- Choosing and tagging evidence is a judgment. Every tag is shown with its source so you can challenge it.
- Donors are a weak signal: many groups give to every likely winner.
- The arithmetic lives in [`ballot-guide/scripts/score.py`](ballot-guide/scripts/score.py) and is mirrored exactly in the web calculator; tests check that both give the same results.
