---
name: standard-generated-english
description: "Standard Generated English (SGE), the house writing standard for agent-written text: Markdown docs, reports, code comments and JSDoc/docstrings. Use when writing or editing .md, .js, .jsx, .ts, .tsx or .py files, and run its checker after each batch of edits before reporting work as done. Triggers: SGE, house style, style check, check the docs, clean up comments."
---

# Standard Generated English

SGE keeps agent-written text short, literal and plain. A person or another agent must read each sentence in one way only. `rules.md` holds the full rules.

## Write it right the first time

1. Use 20 words or less in an instruction and 25 words or less in a description.
2. Write one instruction in each sentence. Use the active voice and simple tenses.
3. Do not use semicolons, phrasal verbs, em dashes, separator lines, emoji, arrows or bold body text.
4. Use the plain word. `scripts/avoid_words.json` lists the words to avoid.
5. Cite a source for each claim, or delete the claim. Keep each hedge such as "may" or "could".
6. In code, write one optional file header of 3 lines or less. Write doc comments of 5 lines or less directly above the code. Write no other comments, except tool directives.
7. Put a known limit in the doc comment as `shortcut: <the limit>, <when to upgrade>`.

## Run the checker after each batch of edits

Run this command in the repository before you report the work as done:

```bash
git ls-files -m -o --exclude-standard -z -- '*.md' '*.py' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.ts' '*.tsx' ':!:.claude/*' | xargs -0 -r python -I "$HOME/.claude/skills/standard-generated-english/scripts/sge_check.py"
```

Outside a git repository, give the files as arguments. Add `--json` to get only the sentences that fail.

The checker reads the technical terms of a project from `sge-glossary.json`, a JSON list at the repository root. Add a term only when it is a real technical term of the project. Write each added term in your report.

## Act on the findings

1. Fix each finding in the text and code that you changed.
2. Write the findings that were in the files before your edit in your report. Do not fix them without approval.
3. If a finding is a false alarm, add a narrow entry with a reason to `sge-ignore.json` at the repository root, and write it in your report. Do not change the rules or the word list to stop it. `rules.md` gives the entry format.
4. Run `sge_check.py --selftest` after each change to the checker.
