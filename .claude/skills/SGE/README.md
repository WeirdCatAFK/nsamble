# Standard Generated English

Standard Generated English (SGE) is a writing standard for text that AI agents write. It is also a Claude Code skill and a checker that applies the standard.

SGE keeps text short, literal and plain. A person or another agent must read each sentence in one way only. SGE also limits code comments to a short file header and short doc comments.

## What the checker examines

- Markdown: sentence length, passive voice, semicolons, words to avoid, bold body text, separators, emoji and other decoration.
- Words to avoid: formal words, words that LLMs overuse, claims with no source, and leftover chatbot phrases. The list has 154 entries.
- Code: the comments in `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx` and `.py` files. The checker permits one file header of 3 lines or less, and doc comments of 5 lines or less directly above the code.

`rules.md` lists each rule and its severity.

## Install

Clone the repository into the Claude Code skills folder:

```bash
git clone https://github.com/WeirdCatAFK/SGE ~/.claude/skills/standard-generated-english
```

Claude Code then loads the skill in all your projects. The checker needs Python 3.8 or later and no other packages. The tests ran on Python 3.14.

## Use

Run the checker on files:

```bash
python -I ~/.claude/skills/standard-generated-english/scripts/sge_check.py README.md src/app.ts
```

Run it on the changed files of a git repository:

```bash
git ls-files -m -o --exclude-standard -z -- '*.md' '*.py' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.ts' '*.tsx' | xargs -0 -r python -I ~/.claude/skills/standard-generated-english/scripts/sge_check.py
```

Options:

| Option              | Effect                                                       |
| ------------------- | ------------------------------------------------------------ |
| `--json`          | Prints the result as JSON, with only the sentences that fail |
| `--glossary PATH` | Permits the technical terms in a JSON list, in place of `sge-glossary.json` |
| `--disable RULES` | Turns off the rules in a comma-separated list                |
| `--selftest`      | Runs the built-in tests                                      |

### Project glossary

Put the technical terms of a project in `sge-glossary.json` at the repository root:

```json
["leverage", "harness", "kerf"]
```

The checker and the hooks use the nearest `sge-glossary.json` in the folder of each file or in a folder above it. A glossary term is not flagged as a word to avoid.

### False alarms

Mark a false alarm in `sge-ignore.json`, next to the glossary. Each entry needs a rule and a reason. A path glob and the flagged text make the entry narrower:

```json
[
  {
    "rule": "bold-text",
    "path": "projects/*/memory/*.md",
    "reason": "The memory format requires bold labels."
  }
]
```

`rules.md` describes each field.

## Verdicts

| Verdict               | Condition                  | Exit code |
| --------------------- | -------------------------- | --------- |
| compliant             | No findings                | 0         |
| minimal not compliant | Only minor findings        | 1         |
| not compliant         | One or more major findings | 3         |

Exit code 2 means a usage error.

## Automatic check

Two Claude Code hooks run the checker without a request:

1. Before Claude edits a file for the first time in a turn, `snapshot` records the findings of that file.
2. When Claude finishes a turn, `stop` checks each edited file. It blocks the end of the turn while the edits add findings. The findings that were in a file before the edit do not block the turn.
3. After a block, a reply with no new edits ends the turn. The reply explains the false alarms.
4. After 2 blocks, `stop` lets the turn end and shows the number of findings that remain.

The hooks do not see edits that a shell command makes. Add them to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "timeout": 30,
          "command": "python -I \"$HOME/.claude/skills/standard-generated-english/scripts/sge_hook.py\" snapshot" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "timeout": 60,
          "command": "python -I \"$HOME/.claude/skills/standard-generated-english/scripts/sge_hook.py\" stop" }]
      }
    ]
  }
}
```

Merge these entries into the hooks that you have. Run `sge_hook.py --selftest` to test the hooks.

## Credits

The checker started as a fork of `ste-lint.py` from the asd-ste100 skill by Dustin Yuchen Teng. `LICENSE-ste-lint` holds its MIT license. SGE is a separate standard. It does not copy ASD-STE100 or its dictionary, and it does not claim compliance with ASD-STE100.

The words that LLMs overuse come from Juzek and Ward, `Why Does ChatGPT "Delve" So Much?` (COLING 2025), and from the Wikipedia guide "Signs of AI writing".

## License

MIT. See `LICENSE`.
