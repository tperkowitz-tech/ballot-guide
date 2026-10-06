"""Build docs/index.html and PROMPT-KIT.md from ballot-guide/references/prompts.md.

The prompts are read from ballot-guide/references/prompts.md (never hand-copied), so the web page and
the Markdown kit always match the source. tools/calc.js is inlined into the page, so the
browser calculator and tools/calc_test.js run the same code; tools/kit.js (profile and
Copy-for-chat text) is inlined the same way and tested by tools/kit_test.js.

Usage: python3 tools/build_kit.py
"""
import html
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://tperkowitz-tech.github.io/ballot-guide/"

HOW_INTRO = ("This kit works with any AI chat that has web search turned on, for example Google Gemini, "
             "Microsoft Copilot, Perplexity, Meta AI, Grok, DeepSeek, ChatGPT, or Claude. A local model on your "
             "own computer also works if you paste the source pages into the chat yourself.")
HOW_MODES = [
    "Neutral comparison: a sourced side-by-side of every choice, with no scores. Skip Steps 1 and 5.",
    "Values match: every choice scored against values you supply. Run all steps, and use the score "
    "calculator for Step 5.",
]
# The page walks through four stages; the Markdown kit is hand-filled.
HOW_STEPS_WEB = [
    "Your profile: fill in the form. Neutral comparison needs only your election details; values match "
    "also asks for your values, in your own words. The kit works for any political view.",
    "Find your ballot: click \"Copy for chat\", paste it into a new chat with web search turned on, and paste "
    "the AI's answer back. The page turns it into a list of races and measures.",
    "Research each item: one new chat per race or measure. Paste each answer back; in values mode the page "
    "does the scoring math for you.",
    "Check and build: spot-check three sources, then copy the check (Step 6) and the guide (Step 7) into new chats.",
    "Your address goes only into the Find your ballot chat. Every other chat gets \"Address: withheld\".",
]
HOW_STEPS_MD = [
    "Values match only: fill in Step 1 yourself. Use your own words for your values. The kit works for any "
    "political view.",
    "Start a new chat for each step. At the top of every chat, paste Step 0 (the shared rules) and, for a "
    "values match, your finished profile. Then paste the step.",
    "Run Step 3 once for each race and Step 4 once for each measure. One item per chat keeps a small model accurate.",
    "Values match only: instead of Step 5, use the score calculator below. Small AI models make arithmetic "
    "mistakes. Paste your profile and one Step 3 or Step 4 output at a time, and save the results.",
    "Then run Step 6 to check the work and Step 7 to build the guide.",
]
HOW_CROWDED = ("Crowded races: if a race has 5 or more candidates, you can choose a focus set by a rule that "
               "is not about party; the guide still lists everyone left out and why.")
HOW_NOTE = ("Scores measure how well each choice fits your values, not who is likely to win. "
            "If you want to see viability too, ask for it in your profile (Step 1).")

STEP_RE = re.compile(r"^## Step (\d+) · (.+?)\n\n_(.+?)_\n\n```text\n(.*?)\n```$", re.M | re.S)


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def write(rel, text):
    # Write to a temp file then rename, so a failed build never leaves a half-written page.
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def parse_steps(md):
    steps = [(int(n), title, when, text) for n, title, when, text in STEP_RE.findall(md)]
    if [s[0] for s in steps] != list(range(8)) or md.count("## Step ") != 8:
        sys.exit(f"Expected Steps 0-7 in ballot-guide/references/prompts.md, parsed {[s[0] for s in steps]}")
    return steps


def js_template(s):
    s = s.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    return s.replace("</", "<\\/")  # keep a literal "</script" from closing the script element


def build_html(steps, intro=""):
    page = read("tools/page.template.html")
    how = ("<p><strong>How to use</strong></p>\n<p>" + html.escape(HOW_INTRO) + "</p>\n<p>Two ways to use it:</p>\n<ul>\n"
           + "".join(f"  <li>{html.escape(s)}</li>\n" for s in HOW_MODES)
           + "</ul>\n<ol>\n"
           + "".join(f"  <li>{html.escape(s)}</li>\n" for s in HOW_STEPS_WEB)
           + "</ol>\n<p>" + html.escape(HOW_CROWDED) + "</p>\n<p>" + html.escape(HOW_NOTE) + "</p>")
    js_steps = ",\n\n".join(
        f"{{title:`{js_template(title)}`, when:`{js_template(when)}`, text:\n`{js_template(text)}`}}"
        for _, title, when, text in steps)
    calc = read("tools/calc.js").rstrip("\n")
    kit = read("tools/kit.js").rstrip("\n")
    for marker, value in (("<!--HOW-->", how), ("/*STEPS*/", js_steps), ("/*CALC*/", calc), ("/*KIT*/", kit)):
        if page.count(marker) != 1:
            sys.exit(f"Template marker {marker} must appear exactly once")
        page = page.replace(marker, value)
    if intro:
        page = page.replace("<p><strong>How to use</strong></p>", "<p>" + html.escape(intro) + "</p>\n<p><strong>How to use</strong></p>", 1)
    return page


def build_md(steps, intro=""):
    out = ["# Ballot Guide Prompt Kit", "",
           "Build a sourced voter guide for your ballot. By default it compares each race and measure "
           "neutrally, using records and funders, with sources. If you want, it also scores each choice "
           "against values you supply.", "",
           f"A web version with copy buttons and a score calculator is at {SITE}", "",
           "## How to use", "", HOW_INTRO, "", "Two ways to use it:", ""]
    out += [f"- {s}" for s in HOW_MODES] + [""]
    out += [f"{i}. {s}" for i, s in enumerate(HOW_STEPS_MD, 1)]
    out += ["", HOW_CROWDED, "", "The score calculator is on the web version. If you cannot use it, run Step 5 with the AI "
                "and check the math by hand.", "", HOW_NOTE, "",
            "Dates, deadlines and places to vote: use your official state or county election website, or vote.org.",
            ""]
    for n, title, when, text in steps:
        out += [f"## Step {n} · {title}", "", f"_{when}_", "", "```text", text, "```", ""]
    if intro:
        out.insert(2, intro)
    return "\n".join(out)


def main():
    # Works before and after the skill moves into ballot-guide/.
    src = next(p for p in ("ballot-guide/references/prompts.md", "references/prompts.md")
               if os.path.exists(os.path.join(ROOT, p)))
    source = read(src)
    intro = next((line for line in source.splitlines() if line.startswith("Neutral mode:")), "")
    steps = parse_steps(source)
    write("docs/index.html", build_html(steps, intro))
    write("PROMPT-KIT.md", build_md(steps, intro))
    print("wrote docs/index.html and PROMPT-KIT.md")


if __name__ == "__main__":
    main()
