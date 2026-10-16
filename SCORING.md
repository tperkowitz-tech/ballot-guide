# How the scores work

Scores are optional. The default is a neutral, side-by-side comparison with no scores. If you choose **values match**, each choice gets a fit score against the priorities you enter. The score is a reproducible **summary of the evidence collected and how each item was tagged**. It is not a prediction, a poll, or a measured percentage.

## What counts as evidence

| Kind | Weight (Original, the default) | Examples |
|---|---|---|
| Record | 3 | Final-passage votes, rulings, official acts, audits, prior-office work |
| Questionnaire | 2 for one answer; 3 for two or more on a priority, never more than one record | Closed-ended answers (yes/no, multiple choice, rating scales), such as Vote Smart's Political Courage Test, and closed-ended items in Ballotpedia or group questionnaires |
| Statement | 1 | Campaign site, interviews, debates, and open-ended written questionnaire answers, such as the League of Women Voters' Vote411 |
| Donors and endorsements | All together count 1 per priority, like one statement | Official filings (FEC, state disclosure agencies), issue-group endorsements |

- **Your priorities only.** One-number left–right scores are not evidence; party counts only if you list it as a priority.
- A line counts only when its source is a full web link; a line with only a site name or title is shown but not counted.
- Lines about the same event count once. Topics you say you are torn on are left out of the score and listed separately.

## Scoring options

You choose one in Step 1 (values match only). Under every option a firm call needs a record, and the same toss-up, range and coverage rules apply. Original and Evidence-based also count records most; under Custom, how much each kind counts is your choice. No option is recommended.

- **Original (the default).** All donors and endorsements on a priority together count 1, like one statement, and money on both sides still counts. This was also the scoring before v1.7.0.
- **Evidence-based (research-informed; being tested).** Records, questionnaire answers and statements count as in Original. Donors and endorsements on a priority are still pooled into one entry, but its weight depends on the kind of money, which research writes into each line's event id:
  - `person-` individual donors or small-dollar totals; `cause-` a group whose mission is that priority's issue; `pac-` PAC, corporate or trade money; anything else is general.
  - For a **newcomer**, `person-` and `cause-` lines count 2 and the rest 1. For an **incumbent** (research writes "(incumbent)" after the name of a candidate who holds the office now), `pac-` lines count 0.5 and the rest 1.
  - The pool counts as much as its highest-weighted line (so never more than 2, less than one record), and its direction is the weighted average of its lines.

  This is a deliberately simple rule, not a fitted model. Money that backs more than one candidate in the same race is shown but not counted, with a note ("backs more than one candidate here; not counted (can't tell the candidates apart)"). Opposing one candidate and backing the other still counts: research writes "against-" in front of the id for money spent against a candidate (for example `against-pac-Example PAC`). A candidate who withdrew is left out of this check: a donor who moves to the remaining candidate is not hedging (a candidate who crossed a deal-breaker stays in). A measure has only a YES side, so the rule never applies to it. "Improved", the name of an earlier version of this option (v1.7), now means Evidence-based, in saved web-kit progress and in the calculator.
- **Custom.** You set each weight from 0 to 3: records, questionnaire answers, statements, and donors and endorsements, plus whether to ignore money that backs more than one candidate. It starts equal to Original. 0 means not counted: those lines are shown, marked not counted, and give no coverage. All questionnaire answers on a priority still never count more than one record. At least one weight must be above 0. This is your call; the guide does not suggest custom weights.

## What the research says

In plain terms, here is what studies have found about each kind of evidence (sources in [CREDITS.md](CREDITS.md)):

- **Records** are the best guide to what an incumbent will do. Once elected, lawmakers' voting positions stay very stable (Poole 2007), and elections change policy mostly by replacing members, not by changing their minds (Lee, Moretti and Butler 2004; Theriault 2006). A record from a previous office also predicts.
- **Closed-ended questionnaires** (yes/no or multiple-choice answers, such as Vote Smart's) predict members' roll-call votes and are the best non-record evidence on specific issues (Ansolabehere, Snyder and Stewart 2001). No study we found tests open-ended answers such as Vote411's, which read more like statements.
- **Statements** predict which issues a candidate will work on more than which way they will vote (Sulkin 2009, 2011).
- **Donors** mostly track a single left–right line and, through it, party. Donor-based scores predict a single left–right voting score well (Bonica 2014, 2018), but much of that is party, and other researchers find them weak at telling candidates of the same party apart (Tausanovitch and Warshaw 2017). No study we found tests them on specific issues. Access-oriented money flows to incumbents (Fouirnaies and Hall 2014), and individual donors give more ideologically than PACs do (Barber 2016).
- **Endorsements** are shortcuts that help voters (Lupia 1994), but we found no evidence that they predict how officials later act.
- **Judges:** prior career predicts sentencing and detention decisions: former public defenders incarcerate less often, and former prosecutors and police order detention or cash bail more often (Harris and Sen 2026; Oren and Topaz 2026). Separately, bar ratings did not predict judges' reversal rates (Sen 2014).

**No study tests a weighting scheme for a ballot guide.** That is why Original stays the default until the options can be checked against real results (a backtest). Evidence-based applies the findings above as simply as possible: it trusts individual donors and issue groups more for newcomers, and PAC money less for incumbents. Leaving out money that backs both candidates is this guide's own rule of thumb: such money can't tell the candidates apart and may reflect access-seeking, but no study we found measures how common it is.

**The trade-off.** Because donor signals largely track one left–right line and party, they can miss where a candidate stands on your particular priorities, and they bring back party, which the guide otherwise leaves out. That is why, under Original and Evidence-based, records count most and donors and endorsements on a priority together never outweigh one record. Custom can change that: with your own weights, donors can count as much as or more than a record.

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
- Donors are a limited signal: many groups give to every likely winner. Evidence-based leaves out money that shows up on both sides of one race and counts PAC money to incumbents at half weight, but a donor who backs only the likely winner still counts.
- The arithmetic lives in [`ballot-guide/scripts/score.py`](ballot-guide/scripts/score.py) and is mirrored exactly in the web calculator; tests check that both give the same results.
