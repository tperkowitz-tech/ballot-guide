# Where it has been tested

Where people have tried the ballot guide, from voluntary reports. Each row shows only a
coarse location (state, and a county or city if the reporter chose to share it). No names,
addresses, political views or votes are recorded.

## Areas tested

One row per state, generated from the report log below.

<!-- summary:start -->
| State | Reports | Used in | Last tested | Results |
|---|---|---|---|---|
| Arizona | 1 | Perplexity (free, logged out) | 2026-10-06 | 1 Did not work |
| Georgia | 1 | ChatGPT (free, logged out) | 2026-10-06 | 1 Worked with fixes |
| Ohio | 1 | ChatGPT (free, logged out) | 2026-10-06 | 1 Worked with fixes |
| Pennsylvania | 1 | ChatGPT (free, logged out) | 2026-10-06 | 1 Worked with fixes |
| Washington | 1 | Claude Code | 2026-10-06 | 1 Worked with fixes |
<!-- summary:end -->

## Add your report

[Tell us how it went](https://github.com/tperkowitz-tech/ballot-guide/issues/new?template=test-report.yml).
The web kit's "Share how it went" panel opens the same form with a few fields filled in.
Nothing is sent until you submit it. A maintainer adds a row here from each report.

| Date | State | Area | Election | Used in | Mode | Result | Notes | Version |
|---|---|---|---|---|---|---|---|---|
| 2026-10-06 | Washington | (withheld) | 2026 General | Claude Code | Both | Worked with fixes | Full ballot; deep research with sub-agents; found several parser and scoring issues, all fixed in v1.3.x | v1.3.1 |
| 2026-10-06 | Ohio | (public test address) | 2026 General | ChatGPT (free, logged out) | Neutral | Worked with fixes | Maintainer test; full ballot found from county list; neutral answers did not load (fixed in v1.5.0) | v1.4.0 |
| 2026-10-06 | Georgia | (public test address) | 2026 General | ChatGPT (free, logged out) | Neutral | Worked with fixes | Maintainer test; first try said no web access, retry worked; sources were titles not URLs (fixed in v1.5.0) | v1.4.0 |
| 2026-10-06 | Pennsylvania | (public test address) | 2026 General | ChatGPT (free, logged out) | Values | Worked with fixes | Maintainer test; values scores produced; one candidate added outside the ballot list (now flagged) | v1.4.0 |
| 2026-10-06 | Arizona | (public test address) | 2026 General | Perplexity (free, logged out) | Neutral | Did not work | Maintainer test; could not open official PDFs; second question needs sign-up | v1.4.0 |
