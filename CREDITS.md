# Credits

Ballot Guide was shaped by other people's work. None of the projects, writers or organizations below endorse this tool, and no code was copied from them; they informed its design, rules and tests.

## Projects and writing that improved the design

- **[charbel-design/ca-ballot-analysis](https://github.com/charbel-design/ca-ballot-analysis)** (MIT): a California ballot-analysis skill. It prompted the "what is not on your ballot" check, records-backed deal-breakers, leaving a race blank, "what would change this call", fuller ballot-measure checks, and a confidence-calibration check.
- **[Analyze Proposition](https://github.com/bdmorin/the-no-shop/tree/main/plugins/fabric-analysis/skills/analyze-proposition)** from bdmorin/the-no-shop, adapted from [danielmiessler/fabric](https://github.com/danielmiessler/fabric) (both MIT): prompted the neutral explainer mode, "what NO means", and showing the strongest argument on each side.
- **Scott Alexander, ["Use AI This Election"](https://www.astralcodexten.com/p/use-ai-this-election)** (Astral Codex Ten): prompted the rules against inferring party from ideology labels, researching every candidate (not only front-runners), checking hidden donors and vote thresholds, and treating the guide as a starting point for your own research.
- **States United Democracy Center, ["AI and Elections"](https://statesunited.org/resources/ai-and-elections/)**: prompted official-source-only ballot facts and logistics, links to official election sites in every guide, and caution about wikis and incomplete candidate lists.
- **Independent critiques and reviews** of earlier versions, which exposed false precision in the scoring and led to the current model (coverage, ranges, evidence levels, "turns on" calls).

## Research behind the scoring

- Poole, K. T. (2007). "Changing minds? Not in Congress!" *Public Choice* 131: legislators' voting positions stay stable over their careers.
- Bonica, A. (2014). "Mapping the Ideological Marketplace." *American Journal of Political Science* 58(2); and Bonica, A. (2018). "Inferring Roll-Call Scores from Campaign Contributions Using Supervised Machine Learning." *AJPS* 62(4): donor networks predict later votes.
- Bonica, A., and M. J. Woodruff (2015). "A Common-Space Measure of State Supreme Court Ideology." *Journal of Law, Economics, and Organization* 31(3).
- Thomson, R., et al. (2017). "The Fulfillment of Parties' Election Pledges." *AJPS* 61(3): how often governing parties keep promises.
- Ansolabehere, S., J. M. Snyder Jr., and C. Stewart III (2001). "Candidate Positioning in U.S. House Elections." *AJPS* 45(1): uses a candidate questionnaire (NPAT) to measure candidates' positions.
- Segal, J. A., and A. D. Cover (1989). "Ideological Values and the Votes of U.S. Supreme Court Justices." *American Political Science Review* 83(2).
- Lupia, A. (1994). "Shortcuts versus Encyclopedias." *American Political Science Review* 88(1): endorsements as information shortcuts.
- CQ Roll Call vote studies and [Voteview](https://voteview.com) on roll-call voting.

## Public information sources the guide relies on

Official state and county election offices and voters' pamphlets; state legislature roll-call records; court opinion archives; the [Federal Election Commission](https://www.fec.gov) and state campaign-finance agencies; [OpenSecrets](https://www.opensecrets.org) and [FollowTheMoney](https://www.followthemoney.org) industry categories; candidate questionnaires from [Vote Smart](https://justfacts.votesmart.org), the League of Women Voters' [Vote411](https://www.vote411.org) and [Ballotpedia](https://ballotpedia.org); and [vote.org](https://www.vote.org) for voting help.

## Built with

Written and tested with help from AI coding assistants (Anthropic's Claude and OpenAI's Codex), with every change independently reviewed before release.
