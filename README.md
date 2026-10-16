# Ballot Guide

**Build your own sourced guide to any US ballot with an AI assistant.** It finds the exact races and measures on your ballot, checks what candidates have *done* before what they say, fact-checks ballot measures, and links every claim to a source you can open. Free, open source, and not affiliated with any campaign or election office.

[See sample guides](https://tperkowitz-tech.github.io/ballot-guide/sample.html) built with it on real ballots.

There are three ways to use it: the skill, Quick start, and Advanced (one race at a time).

## Install the skill

For Claude apps, Claude Code and Codex. The skill runs every step for you and checks its own research files before scoring.

| You use | How to install |
|---|---|
| Claude apps | Download `ballot-guide.skill` from the [latest release](https://github.com/tperkowitz-tech/ballot-guide/releases/latest) and upload it in Claude's Skills settings |
| Claude Code | Unzip the release file into `~/.claude/skills/` |
| Codex | Copy the [`ballot-guide/`](ballot-guide/) folder to `~/.agents/skills/`, then restart Codex |

Then ask, for example, *"Research my ballot for the November election"* or *"Explain Measure 3"*. In Codex, start with `Use $ballot-guide to research my ballot.` If your app supports helpers and you allow it, the skill can [split the research across several AI helpers](ballot-guide/references/delegation.md).

## Quick start (any free AI chat)

Copy the starter from the [web kit](https://tperkowitz-tech.github.io/ballot-guide/#quick-start) into one AI chat with web search, type the races on your ballot, and type "next 3" until done. Then paste the chat's "export" back into the web kit, which checks each item, scores it if you gave priorities, and builds your guide table. The page has the full steps. ([Plain-text starter](PROMPT-KIT.md#quick-start-one-chat).)

## Advanced (one race at a time)

A separate chat and an optional double-check for each race or measure. Open "Advanced (one race at a time)" in the [web kit](https://tperkowitz-tech.github.io/ballot-guide/#step-kit), or use the plain-text [prompt kit](PROMPT-KIT.md). Plan on about 5 minutes per item; the web kit saves your progress.

Which free chats worked in testing: see [TESTED.md](TESTED.md).

## Privacy

The web kit collects nothing, uses no cookies or tracking, and keeps your progress only in your browser; "Start over" erases it. Your address is used only to look up your ballot and never appears in the guide. Anything you paste into an AI chat is covered by that chat's privacy policy. Details: the [web kit's Privacy section](https://tperkowitz-tech.github.io/ballot-guide/#privacy).

## Good to know

- **Neutral comparison** is the default. **Values match** is optional: scores reflect only the priorities you enter, and every piece of evidence is shown. [How the scores work](SCORING.md).
- It supports your own research; it does not replace it. AI can be wrong, so open the sources, especially for close calls.
- Use it once your ballot or voters' pamphlet arrives, when candidate lists are final. Re-check close races in the final week.
- Dates, deadlines and places to vote come only from your official election office ([vote.org](https://www.vote.org) can point you there).
- Found a wrong fact or a broken source? [Report it](https://github.com/tperkowitz-tech/ballot-guide/issues/new/choose). Tried it? [Tell us where it worked](TESTED.md#add-your-report).

## More

- [SCORING.md](SCORING.md): how scores and calls work, and what the research says.
- [TESTED.md](TESTED.md): where it has been tested, and which chats worked.
- [CREDITS.md](CREDITS.md): the work this builds on.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to edit, test and release.

MIT licensed. See [LICENSE](LICENSE).
