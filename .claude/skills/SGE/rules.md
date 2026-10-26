# Standard Generated English rules

Standard Generated English (SGE) is a house standard for text that agents write. It covers Markdown documents and the comments in code. Its goal is text that a person or another agent reads in one way only.

`scripts/sge_check.py` applies the rules. Run it with `--help` for the options.

## Verdicts

Each rule has a severity. The checker gives each sentence the verdict of its worst finding. The verdict of a run is the worst verdict of all sentences and all file-level findings.

| Verdict | Condition | Exit code |
|---|---|---|
| compliant | No findings | 0 |
| minimal not compliant | Only minor findings | 1 |
| not compliant | One or more major findings | 3 |

Exit code 2 means a usage error.

## Sentence kinds

A sentence is procedural when its first word is a command verb from the list in `sge_check.py` (`COMMAND_VERBS`). All other sentences are descriptive. This test uses a word list, not a grammar parser. Some sentences can get the wrong kind.

## Text rules

| Rule | Severity | The checker flags |
|---|---|---|
| `semicolon` | major | Each semicolon |
| `long-sentence` | major when more than 5 words over the cap, minor otherwise | A procedural sentence with more than 20 words, or a descriptive sentence with more than 25 words |
| `ing-instruction` | major | A list item that starts with an -ing command verb and an article ("Tightening the bolt") |
| `multiple-instructions` | major | A procedural sentence with a second command verb after "and" or "then" |
| `passive-voice` | major in procedural text, minor in descriptive text | A form of "be" plus a past participle |
| `present-perfect` | minor | "has", "have" or "had" plus a past participle |
| `phrasal-verb` | minor | Soft phrasal verbs such as `spin up` and `kick off` |
| `marketing-adjective` | minor | Words such as `seamless` and `robust` |
| `nominalization` | minor | `Perform an analysis` and similar forms |
| `synonym-rotation` | minor | Two words for the same action in one file, such as `check` and `verify` |
| `dangling-conjunction` | minor | A list item that ends with "and" or "or" |
| `avoid-word` | minor | A word from `avoid_words.json`. The message gives the word to use. |
| `special-character` | minor | Em dashes, spaced double hyphens, runs of `----`, `====` or `***`, decoration marks, arrows, emoji and status marks, and two or more blank lines in sequence |
| `bold-text` | minor | Each bold span in body text. Headings are not examined. |
| `paragraph-length` | minor | A paragraph with more than 6 sentences |

The checker does not examine YAML front matter, code blocks, inline code or HTML entities.

## Words to avoid and the glossary

`scripts/avoid_words.json` holds the words to avoid. Each word has a replacement, or an instruction in parentheses such as "(cite the source)". Add a word to the file when an agent uses a word that a reader can misread.

The list has these groups:

1. Formal words that have a plain equivalent, such as `commence` and `prior to`.
2. Words that LLMs use much more often than people do, such as `delve` and `showcase`. The source is the study by Juzek and Ward (COLING 2025) and the Wikipedia guide "Signs of AI writing".
3. Claims with no source, such as `experts agree` and `studies show`. A false fact often hides behind these words.
4. Text that fills a gap in the information, such as `based on available information`.
5. Phrases that a chat assistant adds, such as `I hope this helps`.

The list does not include words that have a real meaning in technical work, such as `align`, `highlight`, `harness`, `overall` and `landscape`. For some of these words, the list holds only the LLM phrase, such as `evolving landscape`. When a word matches inside a longer phrase on the list, the checker reports only the phrase.

A project glossary is a file named `sge-glossary.json` that holds a JSON list of technical terms. The checker uses the nearest glossary in the folder of each file or in a folder above it. The hooks use it too. The `--glossary PATH` option replaces that glossary. The checker does not flag a glossary term as a word to avoid.

The checker has no list of approved words. It does not flag a word only because the word is unknown.

## False alarms

`sge-ignore.json` lists the findings that are false alarms. The checker and the hooks use the nearest file in the folder of each checked file or in a folder above it. The file holds a JSON list of entries:

| Field | Needed | Effect |
|---|---|---|
| `rule` | yes | The rule of the finding to ignore |
| `reason` | yes | Why the finding is a false alarm |
| `path` | no | A glob pattern for the file path, relative to the folder of `sge-ignore.json`. Without it, the entry applies to all files. |
| `match` | no | The flagged text. Without it, the entry applies to all findings of the rule. Case does not matter. |

An entry without a reason is a usage error. Make each entry as narrow as possible.

## Comments in code

The checker reads `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx` and `.py` files as code. It examines only the comments.

A code file can have these comments:

1. One file header at the start, before all code. It is optional. In Python, the header is the module docstring.
2. Doc comments directly above the code that they describe. In JS and TS, a doc comment is a JSDoc block. In Python, it is a function or class docstring.
3. Tool directives, such as `eslint-disable`, `@ts-expect-error`, `# noqa` and `# type: ignore`. Directives are configuration, not documentation.

| Rule | Severity | The checker flags |
|---|---|---|
| `comment-not-allowed` | major | All other comments, including comments after code on the same line and doc comments with a blank line below them |
| `header-length` | minor | A file header with more than 3 lines of text |
| `doc-length` | minor | A doc comment with more than 5 lines of text. Tag lines such as `@param` count as text. |
| `doc-caveat` | minor | Clarification and exception words in a header or doc comment: note, however, except, unless, but, important, warning, although |
| `parse-error` | major | A Python file that does not parse |

The text rules above also apply to the text of headers and doc comments.

A comment must describe what the code does now. A clarification or an exception adds a second text that you must change each time the code changes. Put a known limit in the doc comment of the code, in the form `shortcut: <the limit>, <when to upgrade>`.

## What the checker does not do

- It does not find noun clusters. That check needs a part-of-speech tagger.
- It does not find omitted words, such as a missing article or verb.
- It does not examine if a paragraph has one topic.
- It does not find false facts. It finds only the words that often hide them.
- It never flags hedges such as "may", "might" or "could". A hedge is part of the meaning.
