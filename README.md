# Ballot Guide

**An AI skill that builds your own sourced guide to any US ballot.** Ask your AI assistant to research your ballot, and it finds the exact races and measures, checks what candidates have *done* before what they say, fact-checks ballot measures, and links every claim to a source you can open. Free, open source, and not affiliated with any campaign or election office.

No AI app with skills? The same steps work in any AI chat through the [web kit](https://tperkowitz-tech.github.io/ballot-guide/) or the plain-text [prompt kit](PROMPT-KIT.md).

[See sample guides](https://tperkowitz-tech.github.io/ballot-guide/sample.html) researched with this tool on real ballots.

## Install the skill

| You use | How |
|---|---|
| Claude apps | Download `ballot-guide.skill` from the [latest release](https://github.com/tperkowitz-tech/ballot-guide/releases/latest) and upload it in Claude's Skills settings |
| Claude Code | Unzip the release file into `~/.claude/skills/` |
| Codex | Copy the [`ballot-guide/`](ballot-guide/) folder to `~/.agents/skills/`, then restart Codex |

Then ask, for example: *"Research my ballot for the November election"*, *"Compare the candidates for county sheriff"*, or *"Explain Measure 3"*. In Codex, start with `Use $ballot-guide to research my ballot.` The assistant asks for your address only to look up your ballot, and leaves it out of the guide.

What the skill does that the web and prompt kits can't:
- Runs every step for you, opening sources itself when your app has web search, instead of you copying and pasting.
- Comes with a checker for its research files that catches missing sources, malformed entries and street addresses before scoring or building the guide.
- When you allow it, in apps that support helpers, can split the research across several AI helpers and have a stronger one check their work ([how](ballot-guide/references/delegation.md)).

## No skills? Use any AI chat

| Option | Best for |
|---|---|
| [Web kit](https://tperkowitz-tech.github.io/ballot-guide/) | Anyone with a browser. The page writes each question, you paste it into an AI chat with web search, and paste the answer back. No install, no account. |
| [Prompt kit](PROMPT-KIT.md) | People who prefer plain text, or chats the web kit doesn't fit. The same questions, to copy by hand. |

[![The Ballot Guide web kit](docs/img/web-kit.jpg)](https://tperkowitz-tech.github.io/ballot-guide/)

In testing (October 2026), ChatGPT with search worked without signing in. Free Copilot needs a sign-in, logged-out Perplexity stops after one question, and free Gemini declined or returned errors on these election questions. Google AI Mode searched every step and worked for basic research, but missed some ballot items; check its ballot list against your official sample ballot. See [where it's been tested](TESTED.md).

With the kits, plan on about 5 minutes per race or measure; a ballot of 20 items takes 1 to 2 hours, so do a few at a time. The web kit saves your progress.

## When to use it

Once your ballot or voters' pamphlet arrives (usually 2 to 6 weeks before Election Day), when candidate lists are final and most questionnaires and donor reports are out. In the final week, re-check close races and the candidate list for withdrawals, late donor reports and news. Avoid waiting until Election Day: there is no time left to check sources.

## Privacy

- **The skill** runs inside your AI app. Your address is used only to look up your ballot and is left out of the guide; the app's own privacy policy covers your conversation.
- **The web kit** keeps your progress only in your own browser. It collects nothing about you, uses no cookies or tracking, and loads nothing from other sites; GitHub, which hosts it, sees visitors' IP addresses like any website host. Your address goes only into the question that looks up your ballot (and its optional double-check), which you paste into an AI chat yourself. Press "Start over" to erase everything saved. Full details are in the [web kit's privacy section](https://tperkowitz-tech.github.io/ballot-guide/#privacy).
- **Any AI chat** may keep what you send it. Some free chats, such as DeepSeek, Qwen, Kimi and Z.ai, are made by companies based in China or their affiliates. Some say they store what you send in China (DeepSeek, for one); others store it elsewhere but may allow access from China. Read a chat's privacy policy before you share your address.

## Good to know

- Neutral comparison by default; if you choose scores, they reflect only the priorities you enter, and every piece of evidence is shown ([how the scores work](SCORING.md)).
- It supports your own research; it does not replace it. AI can be wrong, so open the sources, especially for close calls.
- Dates, deadlines and places to vote come only from your official election office ([vote.org](https://www.vote.org) can point you there).
- Tried it? [Tell us where it worked](TESTED.md).
- Found a wrong fact or a broken source? [Report it](https://github.com/tperkowitz-tech/ballot-guide/issues/new/choose).

## For contributors

The skill in [`ballot-guide/`](ballot-guide/) is the source of truth: the web kit and prompt kit are generated from its prompts, so a change to the skill reaches every version. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to edit, test (`python3 tools/check.py`) and release.

This tool builds on other people's work; see [CREDITS.md](CREDITS.md). MIT licensed. See [LICENSE](LICENSE).
