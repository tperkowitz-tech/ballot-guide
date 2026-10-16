# Credits

Ballot Guide was shaped by other people's work. None of the projects, writers or organizations below endorse this tool, and no code was copied from them; they informed its design, rules and tests.

## Projects and writing that improved the design

- **[charbel-design/ca-ballot-analysis](https://github.com/charbel-design/ca-ballot-analysis)** (MIT): a California ballot-analysis skill. It prompted the "what is not on your ballot" check, records-backed deal-breakers, leaving a race blank, "what would change this call", fuller ballot-measure checks, and a confidence-calibration check.
- **[Analyze Proposition](https://github.com/bdmorin/the-no-shop/tree/main/plugins/fabric-analysis/skills/analyze-proposition)** from bdmorin/the-no-shop, adapted from [danielmiessler/fabric](https://github.com/danielmiessler/fabric) (both MIT): prompted the neutral explainer mode, "what NO means", and showing the strongest argument on each side.
- **Scott Alexander, ["Use AI This Election"](https://www.astralcodexten.com/p/use-ai-this-election)** (Astral Codex Ten): prompted the rules against inferring party from ideology labels, researching every candidate (not only front-runners), checking hidden donors and vote thresholds, and treating the guide as a starting point for your own research.
- **States United Democracy Center, ["AI and Elections"](https://statesunited.org/resources/ai-and-elections/)**: prompted official-source-only ballot facts and logistics, links to official election sites in every guide, and caution about wikis and incomplete candidate lists.
- **Independent critiques and reviews** of earlier versions, which exposed false precision in the scoring and led to the current model (coverage, ranges, evidence levels, "turns on" calls).

## Research behind the scoring

None of this research tests a weighting scheme for a ballot guide; see [SCORING.md](SCORING.md) for how the guide uses it.

Records
- Poole, K. T. (2007). "Changing minds? Not in Congress!" *Public Choice* 131(3–4): 435–451. https://doi.org/10.1007/s11127-006-9124-y. Legislators' voting positions stay stable over their careers.
- Lee, D. S., E. Moretti, and M. J. Butler (2004). "Do Voters Affect or Elect Policies? Evidence from the U.S. House." *Quarterly Journal of Economics* 119(3): 807–859. https://doi.org/10.1162/0033553041502153. Voters choose policies by choosing members; a stronger electoral position did not change how members voted.
- Theriault, S. M. (2006). "Party Polarization in the US Congress: Member Replacement and Member Adaptation." *Party Politics* 12(4): 483–503. https://doi.org/10.1177/1354068806064730. About two-thirds of polarization came from replacing members, one-third from members changing.

Questionnaires and statements
- Ansolabehere, S., J. M. Snyder Jr., and C. Stewart III (2001). "The Effects of Party and Preferences on Congressional Roll-Call Voting." *Legislative Studies Quarterly* 26(4): 533–572. https://doi.org/10.2307/440269. Members' answers to Vote Smart's closed-ended questionnaire (NPAT) predict their roll-call votes, especially on issues off the main left–right line.
- Ansolabehere, S., J. M. Snyder Jr., and C. Stewart III (2001). "Candidate Positioning in U.S. House Elections." *American Journal of Political Science* 45(1): 136–159. https://doi.org/10.2307/2669364. Uses the same questionnaire to place incumbents, challengers and open-seat candidates.
- Sulkin, T. (2009). "Campaign Appeals and Legislative Action." *Journal of Politics* 71(3): 1093–1108. https://doi.org/10.1017/S0022381609090902; and Sulkin, T. (2011). *The Legislative Legacy of Congressional Campaigns.* Cambridge University Press. https://doi.org/10.1017/CBO9780511973734. Members follow through on their campaign themes in the bills they introduce and cosponsor: statements predict what they work on, not how they vote.
- Thomson, R., et al. (2017). "The Fulfillment of Parties' Election Pledges: A Comparative Study on the Impact of Power Sharing." *American Journal of Political Science* 61(3): 527–542. https://doi.org/10.1111/ajps.12313. Covers parties' pledges (more than 20,000 pledges in 57 campaigns across 12 countries, mostly parliamentary systems), not individual US candidates' statements; parties that govern alone keep the most.

Donors and endorsements
- Bonica, A. (2014). "Mapping the Ideological Marketplace." *American Journal of Political Science* 58(2): 367–386. https://doi.org/10.1111/ajps.12062; and Bonica, A. (2018). "Inferring Roll-Call Scores from Campaign Contributions Using Supervised Machine Learning." *AJPS* 62(4): 830–848. https://doi.org/10.1111/ajps.12376. Donor networks predict later votes on a single left–right roll-call scale, much of it through party.
- Tausanovitch, C., and C. Warshaw (2017). "Estimating Candidates' Political Orientation in a Polarized Congress." *Political Analysis* 25(2): 167–187. https://doi.org/10.1017/pan.2017.5. Donor-based and other pre-election measures predict weakly among candidates of the same party.
- Fouirnaies, A., and A. B. Hall (2014). "The Financial Incumbency Advantage: Causes and Consequences." *Journal of Politics* 76(3): 711–724. https://doi.org/10.1017/S0022381614000139. Incumbency raises the share of donations to the incumbent's party, driven by access-oriented interest groups. (Leaving out money that backs both candidates is the guide's own rule of thumb, not a finding of this study.)
- Barber, M. J. (2016). "Ideological Donors, Contribution Limits, and the Polarization of American Legislatures." *Journal of Politics* 78(1): 296–310. https://doi.org/10.1086/683453. Individual donors favor more ideological candidates; access-seeking PACs favor moderates.
- Lupia, A. (1994). "Shortcuts versus Encyclopedias." *American Political Science Review* 88(1): 63–76. https://doi.org/10.2307/2944882. Voters used endorsement-style cues well on California ballot initiatives; it is about voters' use of cues, not evidence that endorsements predict how officials act.

Judges
- Segal, J. A., and A. D. Cover (1989). "Ideological Values and the Votes of U.S. Supreme Court Justices." *American Political Science Review* 83(2): 557–565. https://doi.org/10.2307/1962405.
- Bonica, A., and M. J. Woodruff (2015). "A Common-Space Measure of State Supreme Court Ideology." *Journal of Law, Economics, and Organization* 31(3): 472–498. https://doi.org/10.1093/jleo/ewu016.
- Sen, M. (2014). "How Judicial Qualification Ratings May Disadvantage Minority and Female Candidates." *Journal of Law and Courts* 2(1): 33–65. https://doi.org/10.1086/674579. Bar ratings did not predict judges' reversal rates.
- Harris, A. P., and M. Sen (2026). "How Judges' Professional Experience Impacts Case Outcomes: An Examination of Public Defenders and Criminal Sentencing." *Journal of Politics* 88(1): 431–437. https://doi.org/10.1086/734532. Former public defenders incarcerate less often.
- Oren, O., and C. M. Topaz (2026). "Judicial Professional Background and Pretrial Detention Outcomes." *Journal of Law and Courts* 14(1): 196–219. https://doi.org/10.1017/jlc.2025.10010. Judges who were prosecutors or police ordered detention or cash bail more often.

- CQ Roll Call vote studies and [Voteview](https://voteview.com) on roll-call voting.

## Public information sources the guide relies on

Official state and county election offices and voters' pamphlets; state legislature roll-call records; court opinion archives; the [Federal Election Commission](https://www.fec.gov) and state campaign-finance agencies; [OpenSecrets](https://www.opensecrets.org) and [FollowTheMoney](https://www.followthemoney.org) industry categories; candidate questionnaires from [Vote Smart](https://justfacts.votesmart.org) (closed-ended), the League of Women Voters' [Vote411](https://www.vote411.org) (open-ended) and [Ballotpedia](https://ballotpedia.org); and [vote.org](https://www.vote.org) for voting help.

## Built with

Written and tested with help from AI coding assistants (Anthropic's Claude and OpenAI's Codex), with every change independently reviewed before release.
