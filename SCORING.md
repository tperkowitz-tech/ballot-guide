# How the scores work

Scores are optional. The default is a neutral, side-by-side comparison with no scores. If you choose **values match**, each choice gets a fit score against the priorities you enter. The score is a reproducible **summary of the evidence collected and how each item was tagged**. It is not a prediction, a poll, or a measured percentage.

## What counts as evidence

| Kind | Weight (Original, the default) | Examples |
|---|---|---|
| Record | 3 | Final-passage votes, rulings, official acts, audits, prior-office work |
| Questionnaire | 2 for one answer; 3 for two or more on a priority, never more than one record | Vote Smart, League of Women Voters (Vote411), Ballotpedia, published group questionnaires |
| Statement | 1 | Campaign site, interviews, debates |
| Donors and endorsements | All together count 1 per priority, like one statement | Official filings (FEC, state disclosure agencies), issue-group endorsements |

- **Your priorities only.** One-number left–right scores are not evidence; party counts only if you list it as a priority.
- A line counts only when its source is a full web link; a line with only a site name or title is shown but not counted.
- Lines about the same event count once. Topics you say you are torn on are left out of the score and listed separately.

## Scoring options

You choose one in Step 1 (values match only). Every option keeps the rest of this page: records count most, a firm call needs a record, and the same toss-up, range and coverage rules apply.

- **Original (the default).** All donors and endorsements on a priority together count 1, like one statement, and money on both sides still counts. This was also the scoring before v1.7.0.
- **Improved (proposed; under review).** All donors and endorsements on a priority together count 2, like one questionnaire answer, against 1 for a statement. Money that backs both candidates (a donor or endorser supporting more than one candidate in the same race) is shown but not counted, with a note ("backs more than one candidate here; not counted (access money)"). Opposing one candidate and backing the other still counts: that is a clear signal, not hedging. A candidate who withdrew is left out of this check: a donor who moves to the remaining candidate is not hedging (a candidate who crossed a deal-breaker stays in). The guide spots this by the donor's name, so research writes each donor's name as the line's event id, and "against-" plus the name for money spent against a candidate. A measure has only a YES side, so the rule never applies to it.
- **Custom.** You set each weight from 0 to 3: records, questionnaire answers, statements, and donors and endorsements, plus whether to ignore money that backs more than one candidate. 0 means not counted: those lines are shown, marked not counted, and give no coverage. All questionnaire answers on a priority still never count more than one record. At least one weight must be above 0. This is your call; the guide does not suggest custom weights.

**Why Improved is proposed.** It is under review against the research and may change. Research by Adam Bonica (2014, 2018) shows that who gives to a candidate predicts how they later vote, even for newcomers with no voting record. But access-oriented money flows to incumbents and likely winners (Fouirnaies and Hall, 2014). Leaving out money that backs both candidates in a race is this guide's own rule of thumb built on that: such money likely buys access rather than backing a position. Improved counts donors more and drops that two-sided money.

**The trade-off.** Donor signals mostly place candidates on a single left–right line, which can miss where a candidate stands on your particular priorities. That is why records still count most, why donors on a priority together never outweigh one record, and why Improved leaves out money that backs both sides. Original, the default, leans more on what candidates say than on who funds them.

## How a score is built

- Each of your priorities gets a position from its evidence, starting from a neutral weight so that one item cannot produce certainty.
- The score averages only the priorities that have evidence. A **range** ("62, could be 16–91") shows how far the priorities without the candidate's own evidence could move it. No evidence at all gives "Not enough evidence", never a free 50.
- **Coverage** shows how much of your weighted priorities the evidence reaches. **Evidence level** is strong, moderate or thin.

## How calls are made

- **Toss-up:** removing one item would change the leader. The guide names that item so you can check it first.
- **Uneven evidence:** if one side has much less evidence, the call is at most a lean.
- **Firm calls need a record.** A clear winner, "Vote for" or "Consider leaving blank" for an unopposed candidate, or a plain YES/NO on a measure needs at least one record. Otherwise the call is a lean or "Your call".
- **Deal-breakers** you list remove a choice from the call when they are proven by a record; the evidence is still shown. A candidate who withdrew or will not appear on the ballot is left out of the call the same way.
- Scores measure fit with your priorities, not who is likely to win. Viability is shown separately only if you ask.

## Limits

- Choosing and tagging evidence is a judgment. Every tag is shown with its source so you can challenge it.
- Donors are a limited signal: many groups give to every likely winner. Improved leaves out money that shows up on both sides of one race, but a donor who backs only the likely winner still counts.
- The arithmetic lives in [`ballot-guide/scripts/score.py`](ballot-guide/scripts/score.py) and is mirrored exactly in the web calculator; tests check that both give the same results.
