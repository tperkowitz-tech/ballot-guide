# Ballot Guide

**Build your own sourced guide to any US ballot with an AI assistant.** It finds the exact races and measures on your ballot, checks what candidates have *done* before what they say, fact-checks ballot measures, and links every claim to a source you can open. Free, open source, and not affiliated with any campaign or election office.

[See sample guides](https://tperkowitz-tech.github.io/ballot-guide/sample.html) built with it on real ballots.

There are three ways to use it: the skill, Quick start, and Advanced (one race at a time).

## Install the skill

The skill runs every step for you and checks its own research files before scoring. Pick your tool below. A folder install ends with one folder, `ballot-guide/`, holding `SKILL.md` directly. If you unzip by hand, unzip into the skills folder itself, not into a folder you named `ballot-guide` (that gives `ballot-guide/ballot-guide/`, which no tool finds).

**Claude apps (claude.ai).** Skills work on the Free, Pro, Max, Team and Enterprise plans.

1. Download `ballot-guide.zip` from the [latest release](https://github.com/tperkowitz-tech/ballot-guide/releases/latest).
2. Make sure code execution is turned on in your settings. Skills need it.
3. Go to **Customize > Skills > + > Create skill > Upload a skill** and pick the zip.

Team and Enterprise owners can add the skill for everyone in the organization. On Enterprise, the owner must also turn on "Code execution and file creation" and Skills.

**Claude Code.** In Claude Code, run:

```
/plugin marketplace add tperkowitz-tech/ballot-guide
/plugin install ballot-guide@ballot-guide
```

As a plugin, the skill is called `/ballot-guide:ballot-guide`. Or copy it into your personal skills folder from a terminal:

```sh
# macOS / Linux
curl -fsSL -o "${TMPDIR:-/tmp}/ballot-guide.zip" https://github.com/tperkowitz-tech/ballot-guide/releases/latest/download/ballot-guide.zip && mkdir -p ~/.claude/skills && unzip -o "${TMPDIR:-/tmp}/ballot-guide.zip" -d ~/.claude/skills
```

```powershell
# Windows PowerShell
$z = "$env:TEMP\ballot-guide.zip"; Invoke-WebRequest https://github.com/tperkowitz-tech/ballot-guide/releases/latest/download/ballot-guide.zip -OutFile $z -UseBasicParsing; Expand-Archive $z "$HOME\.claude\skills" -Force
```

To share it with a project instead, put the folder in that repo's `.claude/skills/` and commit it. No restart is needed. If `~/.claude/skills/` did not exist when your session started, run `/reload-skills` once.

**Codex.** From a terminal, install into `~/.agents/skills/`:

```sh
# macOS / Linux
curl -fsSL -o "${TMPDIR:-/tmp}/ballot-guide.zip" https://github.com/tperkowitz-tech/ballot-guide/releases/latest/download/ballot-guide.zip && mkdir -p ~/.agents/skills && unzip -o "${TMPDIR:-/tmp}/ballot-guide.zip" -d ~/.agents/skills
```

```powershell
# Windows PowerShell
$z = "$env:TEMP\ballot-guide.zip"; Invoke-WebRequest https://github.com/tperkowitz-tech/ballot-guide/releases/latest/download/ballot-guide.zip -OutFile $z -UseBasicParsing; Expand-Archive $z "$HOME\.agents\skills" -Force
```

Codex picks up new skills automatically; if it doesn't show up, restart Codex. Start with `Use $ballot-guide to research my ballot.` (or pick it from `/skills`).

**Other tools.** Copy the `ballot-guide/` folder into one of these personal folders. Most of them also read `~/.agents/skills/`, so the Codex install covers them.

| Tool | Personal skills folder | Notes |
|---|---|---|
| GitHub Copilot (VS Code, CLI) | `~/.copilot/skills/` or `~/.agents/skills/` | Project: `.github/skills/` |
| Cursor | `~/.cursor/skills/` or `~/.agents/skills/` | Loads skills when Cursor starts |
| Gemini CLI | `~/.gemini/skills/` or `~/.agents/skills/` | Or `gemini skills install https://github.com/tperkowitz-tech/ballot-guide.git --path ballot-guide`; then `/skills reload` |
| OpenCode | `~/.config/opencode/skills/` or `~/.agents/skills/` | |
| Goose | `~/.agents/skills/` | Start a new session |
| Amp | `~/.config/agents/skills/` or `~/.agents/skills/` | Ask "Reload my skills" |
| Windsurf (Devin Desktop) | `~/.codeium/windsurf/skills/` or `~/.agents/skills/` | |
| Kiro | `~/.kiro/skills/` | Or **Import a skill > GitHub** with `https://github.com/tperkowitz-tech/ballot-guide/tree/main/ballot-guide` |
| ChatGPT (Business, Enterprise, Healthcare, Edu) | Upload the zip: **Skills > Create > Upload from your computer** | Your admin may limit uploads |

On Windows, `~` is your user folder (`%USERPROFILE%`).

**Cross-tool installers.** Either one installs for many tools at once:

- `npx skills add https://github.com/tperkowitz-tech/ballot-guide/tree/main/ballot-guide` (needs Node.js 22.20 or later; add `-g` to install for your user account instead of one project and pick your tools when asked).
- `gh skill install tperkowitz-tech/ballot-guide ballot-guide/SKILL.md --agent claude-code --scope user` (GitHub CLI 2.90 or later, in preview; change `--agent` to `codex`, `cursor`, `github-copilot` and so on).

**Requirements.** The optional scoring scripts need Python 3.8 or later, standard library only. On Windows, the command may be `python` or `py -3` instead of `python3`.

**Check it worked.** Ask *"What does the ballot-guide skill do?"*, then *"Research my ballot for the November election"* or *"Explain Measure 3"*. If your app supports helpers and you allow it, the skill can [split the research across several AI helpers](ballot-guide/references/delegation.md).

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
