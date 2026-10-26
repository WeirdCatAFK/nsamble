#!/usr/bin/env python3
"""Standard Generated English (SGE) checker for Markdown text and JS/TS/Python comments.

Based on ste-lint.py by Dustin Yuchen Teng (MIT, see LICENSE-ste-lint). rules.md lists the rules.
"""
import argparse
import ast
import bisect
import contextlib
import fnmatch
import io
import json
import os
import re
import sys
import tempfile
import tokenize

IRREGULAR_PARTICIPLES = "given|taken|made|done|found|seen|known|shown|written|built|sent|set|run|read|kept|held|left|put|cut|hit|let|shut|split|spread|begun|become|come|gone|got|gotten|lost|met|paid|said|sold|told|thought|brought|bought|caught|taught|won|worn|torn|born|drawn|grown|thrown|flown|driven|risen|chosen|broken|spoken|frozen|hidden|ridden|forgotten|fallen|eaten|beaten|understood|stood|struck|stuck|swung|hung|led|fed|bled|fled|sped|bound|wound|dug|spun|slid|bit|lit|quit"

PASSIVE_PARTICIPLES = "given|taken|made|done|found|seen|known|shown|written|built|sent|set|run|read|kept|held|left|put"
MODAL_PERFECT_PREFIX = re.compile(
    r"\b(?:may|might|could|should|would|must|can|will|shall)"
    r"(?:\s+not|n['’]t)?\s+$", re.I,
)

RULES = [
    ("semicolon", "major",
     re.compile(r";"),
     "Do not use the semicolon. Split into separate sentences."),
    ("phrasal-verb", "minor",
     re.compile(r"\b(spin(?:ning|s)? up|spun up|reach(?:ing|es|ed)? out|div(?:e|es|ing|ed) into|dove into|kick(?:ing|s|ed)? off|circl(?:e|es|ing|ed) back|touch(?:ing|es|ed)? base)\b", re.I),
     "Soft phrasal verb. Use the single plain verb (start, contact, read, begin)."),
    ("marketing-adjective", "minor",
     re.compile(r"\b(seamless(?:ly)?|robust(?:ly)?|cutting-edge|effortless(?:ly)?|blazing[- ]fast|world-class|state-of-the-art|game-chang(?:ing|er))\b", re.I),
     "Marketing adjective. Delete, or replace with the measurement that earns the claim."),
    ("nominalization", "minor",
     re.compile(r"\b(perform|performs|performed|conduct|conducts|conducted|carry out|carries out|carried out)\s+(?:a|an|the)\s+\w+(?:tion|sion|ment|ance|ence|ysis)\b", re.I),
     "Action frozen into a noun. Use the verb (analyze, not perform an analysis of)."),
    ("passive-voice", "kind",
     re.compile(r"\b(is|are|was|were|been|being)\s+(\w+ed|" + PASSIVE_PARTICIPLES + r")\b(?!\s+(?:to|for|by)\s+\w+ing)", re.I),
     "Possible passive voice. Name the actor and use an active verb, unless the actor is unknown or irrelevant."),
    ("present-perfect", "minor",
     re.compile(r"(?<!\bmay )(?<!\bmight )(?<!\bcould )(?<!\bshould )(?<!\bwould )(?<!\bmust )\b(has|have|had)\s+(?:been\s+)?(?:\w+(?:ed|en)|" + IRREGULAR_PARTICIPLES + r")\b", re.I),
     "Compound tense. Use simple past/present unless current relevance is the point (then keep and flag)."),
    ("special-character", "minor",
     re.compile(r"[—•►←-⇿☀-➿\U0001F300-\U0001FAFF]|(?<!-)\s--\s(?!-)|-{4,}|={4,}|\*{3,}|^ {0,3}([-_=])\1{2,}\s*$"),
     "Separator, decoration, arrow or emoji character. Delete it, or use a sentence or a plain list."),
    ("bold-text", "minor",
     re.compile(r"(?<![*\w])\*\*(?=[^\s*])(.+?)(?<=[^\s*])\*\*(?!\*)|(?<![_\w])__(?=[^\s_])(.+?)(?<=[^\s_])__(?!_)"),
     "Bold text in the body. Remove the bold, or use a heading."),
]

SYNONYM_GROUPS = [
    ("check", "verify", "confirm", "validate"),
    ("delete", "remove", "erase"),
    ("start", "launch", "begin", "initiate"),
    ("stop", "halt", "terminate"),
    ("show", "display"),
    ("use", "utilize", "employ"),
    ("fix", "repair", "correct"),
    ("send", "transmit"),
    ("get", "retrieve", "fetch", "obtain"),
    ("change", "modify", "alter"),
]

COMMAND_VERBS = frozenset("""
add adjust align apply attach bend check clean close compile connect cut
disconnect do download drill examine fasten fill find fit give hold insert
install keep lift lock loosen lower make measure mount move open place print
pull push put read record release remove replace rotate run select send set
solder start stop tighten turn type unlock use wait write
""".split())

PROCEDURAL_CAP = 20
DESCRIPTIVE_CAP = 25
MAJOR_OVERFLOW = 5
PARAGRAPH_CAP = 6
SECOND_COMMAND = re.compile(r"\b(?:and|then)\s+(?:then\s+)?([A-Za-z]+)", re.I)
ING_WITH_OBJECT = re.compile(
    r"^\W*\w+ing\s+(?:the|a|an|all|each|every|this|that|these|those|its|their)\b", re.I)
HTML_ENTITY = re.compile(r"&#?\w+;")

SEVERITY_RANK = {"minor": 1, "major": 2}
VERDICTS = ("compliant", "minimal not compliant", "not compliant")
EXIT_CODES = {"compliant": 0, "minimal not compliant": 1, "not compliant": 3}


def _avoid_re(key):
    """Match a word to avoid and its simple inflections."""
    if not key.isalpha():
        body = re.escape(key).replace("'", "['’]")
    elif key.endswith("e"):
        body = re.escape(key[:-1]) + r"(?:e|es|ed|ing)"
    else:
        body = re.escape(key) + r"(?:s|es|ed|ing)?"
    return re.compile(r"(?<![\w-])" + body + r"(?![\w-])", re.I)


with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "avoid_words.json"),
          encoding="utf-8") as _fh:
    AVOID_WORDS = [
        (key, f"Avoid '{key}'. " + (f"{use[1:-1].capitalize()}." if use.startswith("(")
                                    else f"Use '{use}'."), _avoid_re(key))
        for key, use in sorted(json.load(_fh).items(), key=lambda item: -len(item[0]))]

CODE_FENCE = re.compile(r"^(```|~~~)")
INLINE_CODE = re.compile(r"`[^`]*`")
LIST_ITEM_START = re.compile(
    r"^(?P<indent> {0,3})(?P<marker>[-*+]|[0-9]+[.)])(?P<gap> +)(?P<body>.*)$"
)
CONJUNCTION_END = re.compile(r"\b(?:and|or)\s*$", re.I)
TABLE_SEPARATOR_CELL = re.compile(r"^:?-{3,}:?$")
STANDALONE_LINE = re.compile(r"^ {0,3}(?:#|<|(?:[-*_=] *){3,}$)")
BLOCKQUOTE_PREFIX = re.compile(r"^ {0,3}(?:> ?)+")
GITHUB_ALERT = re.compile(r"\[!(?:note|tip|important|warning|caution)\]", re.I)
HTML_BLOCK_TAG = re.compile(
    r"<(/?)(address|article|aside|blockquote|body|caption|center|dd|details|"
    r"dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|"
    r"header|hgroup|html|iframe|legend|li|main|menu|nav|noframes|ol|"
    r"optgroup|option|p|pre|script|search|section|style|summary|table|"
    r"tbody|td|textarea|tfoot|th|thead|title|tr|ul)(?=[\s/>])[^>]*>", re.I,
)
ANY_LIST_ITEM = re.compile(r"^\s*(?:[-*+]|[0-9]+[.)])(?:\s|$)")
WORD_CHAR = re.compile(r"[^\W_]")
SENTENCE_END = re.compile(r"[.!?][\"'”’)\]*_]*$")
OPENERS = "\"'“‘([*_"
ABBREVIATIONS = {"vs.", "cf.", "approx.", "mr.", "mrs.", "ms.", "dr.", "fig.", "no."}
DOTTED_ABBREVIATION = re.compile(r"(?:[a-z]\.){2,}", re.I)


def _word_re(base):
    return re.compile(r"\b" + base + r"(?:s|es|ed|d|ing)?\b", re.I)


def _count_words(text):
    """Count whitespace-separated tokens that contain a letter or a digit.

    Bare punctuation is not a word. A comma from a masked code span
    or a spaced dash does not make a sentence longer.
    """
    return sum(1 for token in text.split() if WORD_CHAR.search(token))


def _mask_inline_code(text):
    """Blank code spans with equal-length spaces so columns stay true."""
    return INLINE_CODE.sub(lambda match: " " * len(match.group(0)), text)


def _sentence_starts(text):
    """Return the offset of each sentence start in text.

    A sentence ends at a word that ends in terminal punctuation, after any
    closing quotes or brackets. Known abbreviations do not end a sentence.
    One pass over the words keeps the cost linear in the text length.
    """
    words = list(re.finditer(r"\S+", text))
    if not words:
        return [0]
    starts = [words[0].start()]
    for word, next_word in zip(words, words[1:]):
        end = SENTENCE_END.search(word.group())
        if not end:
            continue
        core = word.group()[:end.start() + 1].lstrip(OPENERS)
        if core.lower() in ABBREVIATIONS:
            continue
        if (DOTTED_ABBREVIATION.fullmatch(core)
                and not next_word.group().lstrip(OPENERS)[:1].isupper()):
            continue
        starts.append(next_word.start())
    return starts


def _first_word(text):
    token = text.split()[0] if text.split() else ""
    return re.sub(r"\W+$", "", token.strip(OPENERS + "*_")).lower()


def _kind(text):
    """Return "procedural" when the first word is a command verb, else "descriptive".

    shortcut: verb list, not POS tagging. Upgrade if real output gets the wrong kind.
    """
    return "procedural" if _first_word(text) in COMMAND_VERBS else "descriptive"


def _ing_command(word):
    """Return True when an -ing word is a command verb ("tightening")."""
    if not word.endswith("ing") or len(word) < 6:
        return False
    stem = word[:-3]
    return bool({stem, stem + "e", stem[:-1]} & COMMAND_VERBS)


def _sentences(pieces, filename):
    """Split one prose block into sentence records.

    pieces is a list of (lineno, source_column, text, is_list_item) tuples.
    The function joins the texts with spaces, so a sentence wrapped across
    source lines is one record. Each record keeps the (line, start col, end col)
    segments it covers, so line-based findings can map to it later.
    """
    offsets, position = [], 0
    for _, _, text, _ in pieces:
        offsets.append(position)
        position += len(text) + 1
    joined = " ".join(text for _, _, text, _ in pieces)
    records = []
    starts = _sentence_starts(joined)
    for start, end in zip(starts, starts[1:] + [len(joined)]):
        n = _count_words(joined[start:end])
        if not n:
            continue
        first = bisect.bisect_right(offsets, start) - 1
        last = bisect.bisect_right(offsets, end - 1) - 1
        segments = []
        for i in range(first, last + 1):
            lineno, column, text, _ = pieces[i]
            lo, hi = max(start, offsets[i]), min(end, offsets[i] + len(text))
            if lo < hi:
                segments.append((lineno, column + lo - offsets[i] + 1,
                                 column + hi - offsets[i] + 1))
        lineno, column, _, is_item = pieces[first]
        text = joined[start:end].strip()
        records.append({"file": filename, "line": lineno,
                        "col": column + start - offsets[first] + 1,
                        "kind": _kind(text), "words": n, "text": text,
                        "_item": is_item and not joined[offsets[first]:start].strip(),
                        "_segments": segments})
    return records


def _sentence_findings(records, base):
    """Run the rules that need a whole sentence: length, -ing, two commands, paragraph."""
    findings = []

    def add(index, rule, severity, match, message):
        rec = records[index]
        findings.append({"file": rec["file"], "line": rec["line"], "col": rec["col"],
                         "rule": rule, "severity": severity, "match": match,
                         "message": message, "sentence": base + index})

    for index, rec in enumerate(records):
        n, kind = rec["words"], rec["kind"]
        cap = PROCEDURAL_CAP if kind == "procedural" else DESCRIPTIVE_CAP
        if n > cap:
            add(index, "long-sentence", "major" if n - cap > MAJOR_OVERFLOW else "minor",
                f"{n} words", f"Sentence has {n} words (cap {cap} for {kind} text). Split it.")
        first = _first_word(rec["text"])
        if rec["_item"] and _ing_command(first) and ING_WITH_OBJECT.match(rec["text"]):
            add(index, "ing-instruction", "major", first,
                "Instruction starts with an -ing form. Use the command form (Tighten, not Tightening).")
        if kind == "procedural":
            for m in SECOND_COMMAND.finditer(rec["text"]):
                if m.group(1).lower() in COMMAND_VERBS:
                    add(index, "multiple-instructions", "major", m.group(0),
                        "Two instructions in one sentence. Write one instruction in each sentence.")
                    break
    if len(records) > PARAGRAPH_CAP:
        add(PARAGRAPH_CAP, "paragraph-length", "minor", f"{len(records)} sentences",
            f"Paragraph has {len(records)} sentences (cap {PARAGRAPH_CAP}). Split it.")
    return findings


def _leading_spaces(line):
    return len(line) - len(line.lstrip(" "))


def _is_list_continuation(line, content_indent):
    if not line.strip():
        return True
    if LIST_ITEM_START.match(line):
        return False
    return _leading_spaces(line) >= content_indent


def _split_table_row(line):
    """Return trimmed table cells and their zero-based source columns.

    A pipe must separate at least two cells. Escaped pipes stay in their cell.
    The function reads only the ordinary Markdown table shape. That is enough to
    tell a table from prose with a pipe.
    """
    left = len(line) - len(line.lstrip())
    right = len(line.rstrip())
    content = line[left:right]
    if "|" not in content:
        return None
    if content.startswith("|"):
        content = content[1:]
        left += 1
    if content.endswith("|"):
        content = content[:-1]
    raw_cells = re.split(r"(?<!\\)\|", content)
    if len(raw_cells) < 2:
        return None

    cells = []
    column = left
    for raw_cell in raw_cells:
        leading = len(raw_cell) - len(raw_cell.lstrip())
        cells.append((raw_cell.strip(), column + leading))
        column += len(raw_cell) + 1
    return cells


def _markdown_table_cells(lines):
    """Map ordinary Markdown table rows to their prose cells.

    The separator row anchors detection, so pipe-containing prose is not
    treated as a table. Both leading-pipe and no-leading-pipe table styles are
    accepted when their header and body use the same number of cells.
    """
    table_cells = {}
    index = 1
    while index < len(lines):
        separator = _split_table_row(lines[index])
        header = _split_table_row(lines[index - 1])
        if (not separator or not header or len(separator) != len(header)
                or not all(TABLE_SEPARATOR_CELL.fullmatch(cell)
                           for cell, _ in separator)):
            index += 1
            continue

        table_cells[index - 1] = header
        table_cells[index] = []
        index += 1
        while index < len(lines):
            row = _split_table_row(lines[index])
            if not row or len(row) != len(separator):
                break
            table_cells[index] = row
            index += 1
    return table_cells


def _dangling_conjunction_findings(text, filename):
    lines = text.splitlines()
    findings = []
    in_fence = False
    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if CODE_FENCE.match(stripped):
            in_fence = not in_fence
            index += 1
            continue
        if in_fence:
            index += 1
            continue
        start = LIST_ITEM_START.match(line)
        if not start:
            index += 1
            continue

        content_indent = (len(start.group("indent"))
                          + len(start.group("marker"))
                          + len(start.group("gap")))
        item_lines = [(index, start.group("body"))]
        next_index = index + 1
        item_fence = False
        while next_index < len(lines):
            candidate = lines[next_index]
            candidate_stripped = candidate.strip()
            if CODE_FENCE.match(candidate_stripped):
                item_fence = not item_fence
                next_index += 1
                continue
            if item_fence:
                next_index += 1
                continue
            if not _is_list_continuation(candidate, content_indent):
                break
            item_lines.append((next_index, candidate))
            next_index += 1

        meaningful = []
        for line_index, item_line in item_lines:
            cleaned = INLINE_CODE.sub(" CODE ", item_line).strip()
            if cleaned:
                meaningful.append((line_index, cleaned))
        if meaningful:
            end_line_index, end_line = meaningful[-1]
            conjunction = CONJUNCTION_END.search(end_line)
        else:
            end_line_index, end_line, conjunction = None, None, None
        if conjunction:
            if end_line_index == index:
                finding_line = index + 1
                finding_col = start.start("marker") + 1
            else:
                raw_end_line = next(
                    raw for line_index, raw in item_lines
                    if line_index == end_line_index
                )
                masked_end_line = INLINE_CODE.sub(
                    lambda match: " " * len(match.group(0)), raw_end_line
                )
                raw_conjunction = CONJUNCTION_END.search(masked_end_line)
                finding_line = end_line_index + 1
                finding_col = raw_conjunction.start() + 1 if raw_conjunction else 1
            findings.append({
                "file": filename,
                "line": finding_line,
                "col": finding_col,
                "rule": "dangling-conjunction",
                "severity": "minor",
                "match": end_line,
                "message": "List item ends with a coordinating conjunction. Complete the item or join it with the next item.",
                "sentence": None,
            })
        index = next_index
    return findings


def _locate(line_index, line, col):
    """Return the sentence that holds (line, col), or the nearest one on that line."""
    spans = line_index.get(line)
    if not spans:
        return None
    best = spans[0][2]
    for start, end, index in spans:
        if start <= col < end:
            return index
        if start <= col:
            best = index
    return best


def lint(text, filename="<stdin>", glossary=frozenset()):
    """Check text. Return (findings, words_total, sentences).

    Each finding has a "sentence" index into sentences, or None for a
    document-level finding. Sentence records keep internal "_" keys.
    """
    findings = []
    sentences = []
    line_index = {}
    words_total = 0
    in_fence = False
    html_containers = []
    lines = text.splitlines()
    table_cells = _markdown_table_cells(lines)
    seen_synonyms = {}
    block = []
    in_quote = False
    after_boundary = True
    blank_run = 0
    front_matter_end = 0
    if lines and lines[0].strip() == "---":
        front_matter_end = next((k for k in range(2, len(lines) + 1)
                                 if lines[k - 1].strip() in ("---", "...")), 0)

    def flush():
        if block:
            records = _sentences(block, filename)
            findings.extend(_sentence_findings(records, len(sentences)))
            for rec in records:
                for lineno, start, end in rec["_segments"]:
                    line_index.setdefault(lineno, []).append((start, end, len(sentences)))
                sentences.append(rec)
        block.clear()

    for lineno, raw_line in enumerate(lines, 1):
        if lineno <= front_matter_end:
            continue
        blank_run = 0 if raw_line.strip() else blank_run + 1
        if blank_run == 2 and not in_fence:
            findings.append({"file": filename, "line": lineno, "col": 1,
                             "rule": "special-character", "severity": "minor",
                             "match": "\\n\\n\\n", "sentence": None,
                             "message": "Repeated blank lines. Use one blank line."})
        if CODE_FENCE.match(raw_line.strip()):
            flush()
            in_fence = not in_fence
            after_boundary = True
            continue
        if in_fence:
            continue
        if HTML_BLOCK_TAG.match(raw_line.lstrip()):
            for tag in HTML_BLOCK_TAG.finditer(_mask_inline_code(raw_line)):
                name = tag.group(2).lower()
                if tag.group(1):
                    if name in html_containers:
                        while html_containers:
                            if html_containers.pop() == name:
                                break
                elif not tag.group().endswith("/>"):
                    html_containers.append(name)
        segments = table_cells.get(lineno - 1, [(raw_line, 0)])
        is_table = (lineno - 1) in table_cells
        quote = BLOCKQUOTE_PREFIX.match(raw_line)
        is_quote = bool(quote)
        content = raw_line[quote.end():] if quote else raw_line
        alert = (not html_containers and raw_line.startswith(">") and after_boundary
                 and quote.group().count(">") == 1
                 and GITHUB_ALERT.fullmatch(content.strip()))
        standalone = STANDALONE_LINE.match(content) or alert
        if (is_table or not content.strip() or standalone
                or ANY_LIST_ITEM.match(content) or is_quote != in_quote):
            flush()
        in_quote = is_quote
        after_boundary = not raw_line.strip()
        for segment, source_column in segments:
            line = HTML_ENTITY.sub(lambda m: " " * len(m.group(0)), _mask_inline_code(segment))
            words_total += len(line.split())
            for rule_id, severity, pattern, msg in RULES:
                if rule_id == "bold-text" and content.lstrip().startswith("#"):
                    continue
                for m in pattern.finditer(line):
                    if rule_id == "present-perfect" and MODAL_PERFECT_PREFIX.search(
                        line[:m.start()]
                    ):
                        continue
                    findings.append({"file": filename, "line": lineno,
                                     "col": source_column + m.start() + 1,
                                     "rule": rule_id, "severity": severity,
                                     "match": m.group(0), "message": msg,
                                     "sentence": None})
            covered = []
            for key, message, pattern in AVOID_WORDS:
                for m in pattern.finditer(line):
                    if (key in glossary or m.group(0).lower() in glossary
                            or any(s <= m.start() and m.end() <= e for s, e in covered)):
                        continue
                    covered.append(m.span())
                    findings.append({"file": filename, "line": lineno,
                                     "col": source_column + m.start() + 1,
                                     "rule": "avoid-word", "severity": "minor",
                                     "match": m.group(0), "sentence": None,
                                     "message": message})
            for gi, group in enumerate(SYNONYM_GROUPS):
                for base in group:
                    if (gi, base) in seen_synonyms:
                        continue
                    m = _word_re(base).search(line)
                    if m:
                        seen_synonyms[(gi, base)] = (
                            lineno, source_column + m.start() + 1, m.group(0)
                        )
            skip = quote.end() if quote and not is_table else 0
            marker = None if is_table else ANY_LIST_ITEM.match(segment[skip:])
            if marker:
                skip += marker.end()
            if line[skip:].strip():
                block.append((lineno, source_column + skip, line[skip:], bool(marker)))
            if is_table:
                flush()
        if standalone:
            flush()
    flush()
    for gi, group in enumerate(SYNONYM_GROUPS):
        present = [(seen_synonyms[(gi, b)], b) for b in group if (gi, b) in seen_synonyms]
        if len(present) > 1:
            present.sort()
            first_base = present[0][1]
            for (lineno, col, match), base in present[1:]:
                findings.append({"file": filename, "line": lineno, "col": col,
                                 "rule": "synonym-rotation", "severity": "minor",
                                 "match": match, "sentence": None,
                                 "message": f"'{base}' and '{first_base}' name the same action. Pick one and use it every time."})
    findings.extend(_dangling_conjunction_findings(text, filename))
    for f in findings:
        if f["sentence"] is None and f["match"] != "\\n\\n\\n":
            f["sentence"] = _locate(line_index, f["line"], f["col"])
        if f["severity"] == "kind":
            procedural = (f["sentence"] is not None
                          and sentences[f["sentence"]]["kind"] == "procedural")
            f["severity"] = "major" if procedural else "minor"
    findings.sort(key=lambda f: (f["line"], f["col"]))
    return findings, words_total, sentences


JS_EXTENSIONS = {".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"}
CODE_EXTENSIONS = JS_EXTENSIONS | {".py"}
GLOSSARY_FILE = "sge-glossary.json"
IGNORE_FILE = "sge-ignore.json"
HEADER_CAP = 3
DOC_CAP = 5
DIRECTIVE = re.compile(
    r"^\s*(?://|/\*|#)\s*(?:eslint|@ts-|prettier-ignore|istanbul ignore|c8 ignore|"
    r"biome-ignore|webpackChunkName|@vite-ignore|global\s|jshint|noqa|type:|pragma|"
    r"pylint:|fmt:|isort:|mypy:|pyright:)|^///\s*<reference|^#!|^#.*coding[:=]")
CAVEAT = re.compile(
    r"\b(?:note|however|except(?:ion)?s?|unless|but|important|warning|although)\b", re.I)
REGEX_PRECEDER = set("(,=:[!&|?{};+-*%<>~^")
REGEX_KEYWORDS = {"return", "typeof", "case", "do", "else", "in", "of", "new",
                  "delete", "void", "throw", "yield", "await"}


def _js_comments(text):
    """Scan JS/TS source. Return (comments, code_lines), each comment as (line, end, raw, trailing).

    shortcut: JSX text with a lone quote and nested template literals can confuse
    the scanner. Use a real parser if that shows up in this repo.
    """
    comments, code_lines = [], set()
    i, n, line = 0, len(text), 1
    last, word = "", ""
    if text.startswith("#!"):
        i = text.find("\n") if "\n" in text else n
        comments.append((1, 1, text[:i], False))
    while i < n:
        c = text[i]
        if c == "\n":
            line += 1
            i += 1
        elif c in " \t\r":
            i += 1
        elif text.startswith("//", i) or text.startswith("/*", i):
            if text[i + 1] == "/":
                j = text.find("\n", i)
                j = n if j < 0 else j
            else:
                j = text.find("*/", i + 2)
                j = n if j < 0 else j + 2
            raw = text[i:j]
            comments.append((line, line + raw.count("\n"), raw, line in code_lines))
            line += raw.count("\n")
            i = j
        else:
            code_lines.add(line)
            regex = c == "/" and (not last or last in REGEX_PRECEDER
                                  or (last == "a" and word in REGEX_KEYWORDS))
            if c in "'\"`" or regex:
                j, in_class = i + 1, False
                while j < n and (text[j] != c or in_class):
                    if text[j] == "\\":
                        j += 1
                    elif text[j] == "\n" and c != "`":
                        break
                    elif regex and text[j] in "[]":
                        in_class = text[j] == "["
                    j += 1
                spanned = text.count("\n", i, j)
                code_lines.update(range(line, line + spanned + 1))
                line += spanned
                i = j + 1 if j < n and text[j] == c else j
                last, word = c, ""
            elif c.isalnum() or c in "_$":
                j = i
                while j < n and (text[j].isalnum() or text[j] in "_$"):
                    j += 1
                last, word = "a", text[i:j]
                i = j
            else:
                last, word = c, ""
                i += 1
    return comments, code_lines


def _python_parts(text):
    """Return (comments, docstrings, error) of Python source, docstrings as (line, kind, value)."""
    try:
        tree = ast.parse(text)
        tokens = list(tokenize.generate_tokens(io.StringIO(text).readline))
    except (SyntaxError, ValueError, tokenize.TokenError) as e:
        return [], [], str(e)
    comments = [(t.start[0], t.start[0], t.string, bool(t.line[:t.start[1]].strip()))
                for t in tokens if t.type == tokenize.COMMENT]
    docs = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            first = node.body[0] if node.body else None
            if (isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant)
                    and isinstance(first.value.value, str)):
                kind = "header" if isinstance(node, ast.Module) else "doc"
                docs.append((first.lineno, kind, first.value.value))
    return comments, docs, None


def _comment_lines(raw, line):
    """Return the (line, text) pairs of a comment, without markers and blank lines."""
    out = []
    for k, s in enumerate(raw.splitlines()):
        s = re.sub(r"^\s*(?://+|/\*+|\*+(?!/))|\*+/\s*$", "", s).strip()
        if s:
            out.append((line + k, s))
    return out


def lint_code(text, filename="<stdin>", glossary=frozenset()):
    """Check the comments of a JS/TS or Python file. Return (findings, words_total, sentences).

    Allowed: one file header and doc comments directly above code. The text rules check their text.
    """
    findings, docs = [], []

    def add(line, rule, severity, match, message):
        findings.append({"file": filename, "line": line, "col": 1, "rule": rule,
                         "severity": severity, "match": match, "message": message,
                         "sentence": None})

    not_allowed = ("Comment that is not a file header or a doc comment directly above code. "
                   "Delete it, or move the information into the doc comment of the code.")
    if filename.endswith(".py"):
        comments, py_docs, error = _python_parts(text)
        if error:
            add(1, "parse-error", "major", error, "The file does not parse. The checker cannot examine its comments.")
        for line, _, raw, _ in comments:
            if not DIRECTIVE.match(raw):
                add(line, "comment-not-allowed", "major", raw.strip(), not_allowed)
        for line, kind, value in py_docs:
            docs.append((kind, [(line + k, s.strip())
                                for k, s in enumerate(value.splitlines()) if s.strip()]))
    else:
        comments, code_lines = _js_comments(text)
        ordered = sorted(code_lines)
        first_code = ordered[0] if ordered else float("inf")
        header = []
        for line, end, raw, trailing in comments:
            if DIRECTIVE.match(raw):
                continue
            k = bisect.bisect_right(ordered, end)
            above_code = k < len(ordered) and ordered[k] == end + 1
            if raw.startswith("/**") and not trailing and above_code:
                docs.append(("doc", _comment_lines(raw, line)))
            elif end < first_code:
                header.extend(_comment_lines(raw, line))
            else:
                add(line, "comment-not-allowed", "major", raw.splitlines()[0].strip(), not_allowed)
        if header:
            docs.append(("header", header))

    sentences, words_total = [], 0
    for kind, content in docs:
        cap = HEADER_CAP if kind == "header" else DOC_CAP
        if len(content) > cap:
            name = "File header" if kind == "header" else "Doc comment"
            add(content[0][0], f"{kind}-length", "minor", f"{len(content)} lines",
                f"{name} has {len(content)} lines (cap {cap}). Shorten it.")
        for line, s in content:
            for m in CAVEAT.finditer(s):
                add(line, "doc-caveat", "minor", m.group(0),
                    "Clarification or exception in a doc comment. State only what the code does.")
        f, w, s = lint("\n".join(s for _, s in content), filename, glossary)
        for finding in f:
            finding["line"] = content[finding["line"] - 1][0]
            if finding["sentence"] is not None:
                finding["sentence"] += len(sentences)
        for rec in s:
            rec["line"] = content[rec["line"] - 1][0]
        findings.extend(f)
        sentences.extend(s)
        words_total += w
    findings.sort(key=lambda f: (f["line"], f["col"]))
    return findings, words_total, sentences


def _verdict(findings):
    return VERDICTS[max((SEVERITY_RANK[f["severity"]] for f in findings), default=0)]


def report(findings, words_total, sentences, as_json):
    verdict = _verdict(findings)
    by_sentence, document = {}, []
    for f in findings:
        (document if f["sentence"] is None
         else by_sentence.setdefault(f["sentence"], [])).append(f)
    counts = {"sentences": len(sentences),
              "compliant": len(sentences) - len(by_sentence),
              "major": sum(f["severity"] == "major" for f in findings),
              "minor": sum(f["severity"] == "minor" for f in findings)}
    if as_json:
        def public(record):
            return {k: v for k, v in record.items() if not k.startswith("_") and k != "sentence"}
        failing = [dict(public(sentences[i]), verdict=_verdict(fs),
                        findings=[public(f) for f in fs])
                   for i, fs in sorted(by_sentence.items())]
        print(json.dumps({"verdict": verdict, "counts": counts, "words": words_total,
                          "sentences": failing,
                          "document_findings": [public(f) for f in document]}, indent=2))
        return verdict
    for f in findings:
        print(f"{f['file']}:{f['line']}:{f['col']} {f['rule']} ({f['severity']}): "
              f"{f['message']} [{f['match']}]")
    print(f"\nVerdict: {verdict}. {counts['sentences']} sentences, "
          f"{counts['compliant']} compliant, {counts['major']} major and "
          f"{counts['minor']} minor findings, {words_total} words.")
    print("Hedges/modality (may, might, could) are never flagged: confidence is content.")
    return verdict


def selftest():
    bad = ("The panel is removed; spin up the job. "
           "Perform an analysis of the seamless log. "
           "We have received the report.")
    findings, _, _ = lint(bad)
    rules = {f["rule"] for f in findings}
    for expected in ("semicolon", "phrasal-verb", "nominalization",
                     "marketing-adjective", "passive-voice", "present-perfect"):
        assert expected in rules, expected
    findings, _, _ = lint("The request may have failed. It could be a timeout. "
                          "The disk might have filled.")
    assert findings == [], findings
    findings, _, _ = lint("The task has run. The job has set the flag. We have begun.")
    assert sum(1 for f in findings if f["rule"] == "present-perfect") == 3, findings
    findings, _, _ = lint("The job may have run.")
    assert not any(f["rule"] == "present-perfect" for f in findings), findings
    for modal in ("may", "might", "could", "should", "would", "must"):
        for gap in (" ", "  ", "\t", " not "):
            findings, _, _ = lint(f"The task {modal}{gap}have run.")
            assert not any(f["rule"] == "present-perfect" for f in findings), findings
    findings, _, _ = lint("The task couldn't have run. The task MAY NOT HAVE RUN.")
    assert not any(f["rule"] == "present-perfect" for f in findings), findings
    findings, _, _ = lint("The task has run. We have begun. The flag is set.")
    assert sum(f["rule"] == "present-perfect" for f in findings) == 2, findings
    assert any(f["rule"] == "passive-voice" for f in findings), findings
    findings, _, _ = lint("The task is gone.")
    assert not any(f["rule"] == "passive-voice" for f in findings), findings
    findings, _, _ = lint("```\nx = a; y = b\n```")
    assert findings == []
    findings, _, _ = lint(
        "- Confirm the target and\n"
        "* Record the result OR  \n"
        "+ Close the panel\n"
        "1. Start the task and\n"
        "2) Stop the task OR"
    )
    dangling = [f for f in findings if f["rule"] == "dangling-conjunction"]
    assert len(dangling) == 4, dangling
    assert [f["line"] for f in dangling] == [1, 2, 4, 5], dangling
    assert [f["col"] for f in dangling] == [1, 1, 1, 1], dangling
    assert all(f["severity"] == "minor" for f in dangling), dangling

    findings, _, _ = lint("  - Confirm the target and\n    record the result.")
    assert not any(f["rule"] == "dangling-conjunction" for f in findings)
    findings, _, _ = lint("- Confirm the target\n  and")
    dangling = [f for f in findings if f["rule"] == "dangling-conjunction"]
    assert len(dangling) == 1 and dangling[0]["line"] == 2, dangling
    assert dangling[0]["col"] == 3, dangling
    findings, _, _ = lint("    - code and")
    assert not any(f["rule"] == "dangling-conjunction" for f in findings)
    findings, _, _ = lint("> - Confirm the target and\n> - Record the result or")
    assert not any(f["rule"] == "dangling-conjunction" for f in findings)
    findings, _, _ = lint("- Do this and\n~~~\ncode and\n~~~")
    dangling = [f for f in findings if f["rule"] == "dangling-conjunction"]
    assert len(dangling) == 1 and dangling[0]["line"] == 1, dangling
    findings, _, _ = lint("```text\n- code and\n```")
    assert not any(f["rule"] == "dangling-conjunction" for f in findings)

    findings, _, _ = lint(" - Start the task and\n   record the result.")
    assert not any(f["rule"] == "dangling-conjunction" for f in findings)
    findings, _, _ = lint("-  Start the task and\n   record the result.")
    assert not any(f["rule"] == "dangling-conjunction" for f in findings)
    findings, _, _ = lint("-\tStart the task and")
    assert not any(f["rule"] == "dangling-conjunction" for f in findings)
    findings, _, _ = lint("   - Start the task and", filename="fixture.md")
    dangling = [f for f in findings if f["rule"] == "dangling-conjunction"]
    assert len(dangling) == 1 and dangling[0]["col"] == 4, dangling
    assert dangling[0]["file"] == "fixture.md"
    assert dangling[0]["match"].endswith("and")
    assert "Complete the item" in dangling[0]["message"]
    findings, _, _ = lint("100. Start the task and\n  unrelated text")
    dangling = [f for f in findings if f["rule"] == "dangling-conjunction"]
    assert len(dangling) == 1, dangling
    findings, _, _ = lint("- Start the task and.\n- Stop the task or,")
    assert not any(f["rule"] == "dangling-conjunction" for f in findings)
    findings, _, _ = lint("- Start the task and\n\n  record the result.")
    assert not any(f["rule"] == "dangling-conjunction" for f in findings)
    findings, _, _ = lint("- Parent item and\n  - Nested item or")
    dangling = [f for f in findings if f["rule"] == "dangling-conjunction"]
    assert [f["line"] for f in dangling] == [1, 2], dangling

    findings, _, _ = lint("The process may include steps and")
    assert not any(f["rule"] == "dangling-conjunction" for f in findings)
    findings, _, _ = lint("- Use `and` as a label")
    assert not any(f["rule"] == "dangling-conjunction" for f in findings)
    findings, _, _ = lint("- Combine `left` and `right`")
    assert not any(f["rule"] == "dangling-conjunction" for f in findings), findings
    findings, _, _ = lint("~~~\n- code and\n~~~")
    assert not any(f["rule"] == "dangling-conjunction" for f in findings)
    findings, _, _ = lint(("word " * 30).strip() + ".")
    assert any(f["rule"] == "long-sentence" for f in findings)
    short_cell = " ".join(f"term{number}" for number in range(1, 25)) + "."
    for table in (
            "| Label | Detail |\n"
            "| --- | --- |\n"
            f"| Clear | {short_cell} |",
            "Label | Detail\n"
            "--- | ---\n"
            f"Clear | {short_cell}"):
        findings, words_total, _ = lint(table)
        assert not any(f["rule"] == "long-sentence" for f in findings), findings
        assert words_total == 27, words_total
    long_cell = " ".join(f"term{number}" for number in range(1, 27)) + "."
    findings, _, _ = lint(
        "| Label | Detail |\n"
        "| --- | --- |\n"
        f"| Clear | {long_cell} |"
    )
    long_sentences = [f for f in findings if f["rule"] == "long-sentence"]
    assert len(long_sentences) == 1, long_sentences
    assert long_sentences[0]["match"] == "26 words", long_sentences
    findings, _, _ = lint("Check the config file. Then verify the output. Verify twice.")
    rot = [f for f in findings if f["rule"] == "synonym-rotation"]
    assert len(rot) == 1 and "'verify' and 'check'" in rot[0]["message"], rot
    findings, _, _ = lint("Check the config. Check the output.")
    assert not any(f["rule"] == "synonym-rotation" for f in findings)
    findings, _, _ = lint("a; b", filename="x.md")
    assert findings[0]["file"] == "x.md"
    findings, _, _ = lint("Run `make all` then spin up the node.")
    phrasal = [f for f in findings if f["rule"] == "phrasal-verb"]
    assert len(phrasal) == 1 and phrasal[0]["col"] == 21, phrasal
    twenty = " ".join(["word"] * 20)
    findings, _, _ = lint(f'He asked "{twenty}?" Then {twenty} ended. (It {twenty}.) Next.')
    assert not any(f["rule"] == "long-sentence" for f in findings), findings
    findings, _, _ = lint(f"Use a tool, e.g. the {twenty} linter here now.")
    assert any(f["rule"] == "long-sentence" for f in findings), findings
    findings, _, _ = lint(f"Compare A vs. B in the {twenty} test.")
    assert any(f["rule"] == "long-sentence" for f in findings), findings
    findings, _, _ = lint(f"Intro text here.\nThe {twenty}\nwrapped tail words go here.")
    long_sentences = [f for f in findings if f["rule"] == "long-sentence"]
    assert len(long_sentences) == 1, long_sentences
    assert (long_sentences[0]["line"], long_sentences[0]["col"]) == (2, 1), long_sentences
    findings, _, _ = lint(f"- Item {twenty}\n  continued in the same item.")
    assert any(f["rule"] == "long-sentence" for f in findings), findings
    for sep in ("\n\n", "\n# Heading\n", "\n---\n", "\n- ", "\n> "):
        findings, _, _ = lint(f"First {twenty} line{sep}Second {twenty} line.")
        assert not any(f["rule"] == "long-sentence" for f in findings), (sep, findings)
    body = " ".join(["word"] * 25) + "."
    for alert in ("> [!NOTE]", "> [!tip]", ">[!Warning]", ">  [!CAUTION]  "):
        findings, _, _ = lint(f"{alert}\n> {body}")
        assert not any(f["rule"] == "long-sentence" for f in findings), (alert, findings)
    for text in (f"Text.\n\n> [!NOTE]\n> {body}", f"> Text.\n~~~\ncode\n~~~\n> [!NOTE]\n> {body}"):
        findings, _, _ = lint(text)
        assert not any(f["rule"] == "long-sentence" for f in findings), (text, findings)
    for opening, closing in (("<details>", "</details>"),
                             ('<DIV class="note">', "</DIV>"),
                             ("<section><details>", "</details></section>")):
        findings, _, _ = lint(f"{opening}\n\n> [!NOTE]\n> {body}\n\n{closing}")
        long_sentences = [f for f in findings if f["rule"] == "long-sentence"]
        assert [f["match"] for f in long_sentences] == ["26 words"], (opening, findings)
        findings, _, _ = lint(f"{opening}\n{closing}\n\n> [!NOTE]\n> {body}")
        assert not any(f["rule"] == "long-sentence" for f in findings), (opening, findings)
    findings, _, _ = lint(f"> [!NOTE]\n> {body}")
    assert not any(f["rule"] == "long-sentence" for f in findings), findings
    for content in ("<details>\n<div>\n</div>",
                    "<details>\n~~~\n</details>\n~~~"):
        findings, _, _ = lint(f"{content}\n\n> [!NOTE]\n> {body}\n\n</details>")
        long_sentences = [f for f in findings if f["rule"] == "long-sentence"]
        assert [f["match"] for f in long_sentences] == ["26 words"], (content, findings)
    for content in ("```html\n<details>\n```", "<!-- <details> -->",
                    "<span>Text.</span>", "<hr>", "<div />",
                    "<details></details>", "</details>"):
        findings, _, _ = lint(f"{content}\n\n> [!NOTE]\n> {body}")
        assert not any(f["rule"] == "long-sentence" for f in findings), (content, findings)
    for text in (f"> [!FOO]\n> {body}", f"> [!NOTE] {body}", f"> Intro.\n> [!NOTE]\n> {body}",
                 f"> > [!NOTE]\n> > {body}", f"> Intro.\ncontinuation.\n> [!NOTE]\n> {body}",
                 f"- Item.\n\n  > [!NOTE]\n  > {body}",
                 f"Text.\n> [!NOTE]\n> {body}", f"   > [!NOTE]\n   > {body}"):
        findings, _, _ = lint(text)
        long_sentences = [f for f in findings if f["rule"] == "long-sentence"]
        assert [f["match"] for f in long_sentences] == ["26 words"], (text, long_sentences)
    findings, _, _ = lint(f"**Lead.** The {twenty} more words here now.")
    assert not any(f["rule"] == "long-sentence" for f in findings), findings
    findings, _, _ = lint(f"_Note._ The {twenty} more words here now.")
    assert not any(f["rule"] == "long-sentence" for f in findings), findings
    findings, _, _ = lint(f"See **e.g.** the {twenty} linter here now.")
    assert any(f["rule"] == "long-sentence" for f in findings), findings
    findings, _, _ = lint(f"The team shipped it in the U.S. Then {twenty} today.")
    assert not any(f["rule"] == "long-sentence" for f in findings), findings
    for text in (f"- First item\n    - First {twenty} line\n      - Second {twenty} line",
                 f"> - First {twenty} line\n> - Second {twenty} line",
                 f"<!-- First {twenty} line -->\nSecond {twenty} line.",
                 f"> First {twenty} line.\n>\n> Second {twenty} line."):
        findings, _, _ = lint(text)
        assert not any(f["rule"] == "long-sentence" for f in findings), (text, findings)
    findings, _, _ = lint("> " + "\n> ".join(["word word word word word"] * 5) + ".")
    assert not any(f["rule"] == "long-sentence" for f in findings), findings
    twenty_five = " ".join(f"term{number}" for number in range(1, 26)) + "."
    for marker in ("-", "*", "+", "1.", "1)", "  -", "> -"):
        findings, _, _ = lint(f"{marker} {twenty_five}")
        assert not any(f["rule"] == "long-sentence" for f in findings), (marker, findings)
    findings, _, _ = lint(f"- term0 {twenty_five}")
    long_sentences = [f for f in findings if f["rule"] == "long-sentence"]
    assert [(f["match"], f["col"]) for f in long_sentences] == [("26 words", 3)], long_sentences
    findings, _, _ = lint(f"`label` 1) {twenty_five}")
    long_sentences = [f for f in findings if f["rule"] == "long-sentence"]
    assert [f["match"] for f in long_sentences] == ["26 words"], long_sentences
    for separator in (", ", " ", " / "):
        names = separator.join(f"`a{number}`" for number in range(30))
        findings, _, _ = lint(f"The adapters are {names}.")
        assert not any(f["rule"] == "long-sentence" for f in findings), (separator, findings)
    findings, _, _ = lint(" ".join(f"term{number}" for number in range(1, 25)) + " — term25.")
    assert not any(f["rule"] == "long-sentence" for f in findings), findings
    findings, _, _ = lint(f"Use `make` — {twenty_five}")
    long_sentences = [f for f in findings if f["rule"] == "long-sentence"]
    assert [f["match"] for f in long_sentences] == ["26 words"], long_sentences
    findings, _, _ = lint("The agent read the log.\n" * 20000)
    assert not any(f["rule"] == "long-sentence" for f in findings)

    assert _verdict(lint("Remove the panel. Clean the filter.")[0]) == "compliant"
    assert _verdict(lint("The fan is mounted on the lid.")[0]) == "minimal not compliant"
    assert _verdict(lint("Remove the panel; clean the filter.")[0]) == "not compliant"
    assert _verdict(lint("The request may have failed.")[0]) == "compliant"
    findings, _, sentences = lint("Install the fan that is mounted on the lid.")
    passive = [f for f in findings if f["rule"] == "passive-voice"]
    assert [f["severity"] for f in passive] == ["major"], passive
    assert sentences[0]["kind"] == "procedural", sentences

    def long_severity(text):
        return [f["severity"] for f in lint(text)[0] if f["rule"] == "long-sentence"]

    def command(n):
        return "Remove " + " ".join(["part"] * (n - 1)) + "."

    def description(n):
        return "The " + " ".join(["part"] * (n - 1)) + "."
    assert long_severity(command(20)) == [], command(20)
    assert long_severity(command(21)) == ["minor"]
    assert long_severity(command(25)) == ["minor"]
    assert long_severity(command(26)) == ["major"]
    assert long_severity(description(25)) == []
    assert long_severity(description(26)) == ["minor"]
    assert long_severity(description(31)) == ["major"]

    findings, _, _ = lint("1. Tightening the bolt.\n2. Cutting the panel.")
    ing = [f for f in findings if f["rule"] == "ing-instruction"]
    assert [(f["line"], f["severity"]) for f in ing] == [(1, "major"), (2, "major")], ing
    findings, _, _ = lint("Cutting acrylic needs a fan.\n\n- Spacing the parts is easy.\n"
                          "- Mounting geometry (hole diameter, hole spacing)")
    assert not any(f["rule"] == "ing-instruction" for f in findings), findings
    findings, _, _ = lint("&#91;embedded content\\]")
    assert findings == [], findings
    findings, _, _ = lint("Open the file and read line 3.")
    assert [f["rule"] for f in findings] == ["multiple-instructions"], findings
    findings, _, _ = lint("Open the file, then check the value.")
    assert any(f["rule"] == "multiple-instructions" for f in findings), findings
    findings, _, _ = lint("Remove the panel and the screws.")
    assert findings == [], findings

    findings, _, _ = lint("Commence the test. The fan facilitates cooling.")
    avoid = [f for f in findings if f["rule"] == "avoid-word"]
    assert [f["match"] for f in avoid] == ["Commence", "facilitates"], avoid
    assert "'start'" in avoid[0]["message"], avoid
    findings, _, _ = lint("Commence the test.", glossary=frozenset({"commence"}))
    assert findings == [], findings
    findings, _, _ = lint("---\nname: x\ndescription: Commence; it is done.\n---\n\nThe fan is quiet.")
    assert findings == [], findings
    findings, _, _ = lint("Text.\n\n---\n\nMore text.")
    assert [f["rule"] for f in findings] == ["special-character"], findings
    findings, _, _ = lint("The fan is a testament to care. It’s worth noting that experts agree.")
    avoid = [(f["match"], f["message"]) for f in findings if f["rule"] == "avoid-word"]
    assert avoid == [("is a testament to", "Avoid 'is a testament to'. Use 'shows'."),
                     ("It’s worth noting", "Avoid 'it's worth noting'. Delete it."),
                     ("experts agree", "Avoid 'experts agree'. Cite the source.")], avoid
    findings, _, _ = lint("The study delves into the data, showcasing intricate results.")
    assert [f["match"] for f in findings if f["rule"] == "avoid-word"] == [
        "delves", "showcasing", "intricate"], findings

    findings, _, _ = lint("Close the lid — wait 5 seconds. Item ➢ next.")
    assert [f["match"] for f in findings if f["rule"] == "special-character"] == ["—", "➢"]
    findings, _, _ = lint("```\na — b\n========\n```\n\nUse `a -- b` here.")
    assert findings == [], findings
    findings, _, _ = lint("Text.\n\n\nMore text.\n\n----------\n**Rewriter** -- text.")
    special = [f for f in findings if f["rule"] == "special-character"]
    assert [(f["line"], f["sentence"]) for f in special][:2] == [(3, None), (6, None)], special
    assert special[2]["sentence"] is not None, special
    assert len(special) == 3, special
    findings, _, _ = lint(" ".join(["The fan is quiet."] * 7))
    para = [f for f in findings if f["rule"] == "paragraph-length"]
    assert len(para) == 1 and para[0]["sentence"] == 6, para
    findings, _, _ = lint(" ".join(["The fan is quiet."] * 6))
    assert findings == [], findings

    findings, _, _ = lint("## A **bold** heading\n\nThe **fan** is quiet. Status ✅ done → next 🚀.")
    assert [f["match"] for f in findings if f["rule"] == "bold-text"] == ["**fan**"], findings
    assert [f["match"] for f in findings if f["rule"] == "special-character"] == ["✅", "→", "🚀"]
    findings, _, _ = lint("Use `**kwargs` and a__b__c here.")
    assert findings == [], findings

    def code_rules(text, name):
        return [(f["line"], f["rule"]) for f in lint_code(text, name)[0]]
    js = ("/** Builds the part list. */\n\n"
          "import x from 'y';\n\n"
          "/** Return the sum of a and b. */\n"
          "export function add(a, b) {\n"
          "  // eslint-disable-next-line no-console\n"
          "  const url = 'http://example.com'; // the url\n"
          "  const re = /\\/\\/ not a comment/;\n"
          "  const t = `a\n// not a comment\n`;\n"
          "  return a + b;\n"
          "}\n"
          "/* stray */\n")
    assert code_rules(js, "a.js") == [(8, "comment-not-allowed"), (15, "comment-not-allowed")]
    assert code_rules("// a\n// b\n// c\n// d\n\nconst x = 1;\n", "a.ts") == [(1, "header-length")]
    six = "/**\n * One.\n * Two.\n * Three.\n * Four.\n * Five.\n * Six.\n */\nfunction f() {}\n"
    assert code_rules(six, "a.ts") == [(2, "doc-length")]
    assert code_rules(six.replace(" * Six.\n", ""), "a.ts") == []
    assert code_rules("/** Return the value, unless it is empty. */\nfunction f() {}\n",
                      "a.tsx") == [(1, "doc-caveat")]
    assert code_rules("/** Lost doc. */\n\nconst y = 2;\n/** Last. */\n", "a.js") == [
        (4, "comment-not-allowed")]
    assert code_rules("const y = 2;\n/** Lost doc. */\n\nconst z = 2;\n", "a.js") == [
        (2, "comment-not-allowed")]
    assert sorted(code_rules("/** The value is computed; it is cached. */\nfunction f() {}\n",
                             "a.js")) == [(1, "passive-voice"), (1, "passive-voice"), (1, "semicolon")]
    py = ('#!/usr/bin/env python3\n'
          '"""Module header."""\n'
          'import os  # noqa: F401\n\n'
          'def f():\n'
          '    """Return one."""\n'
          '    # explain\n'
          '    s = "# not a comment"\n'
          '    return 1  # trailing\n')
    assert code_rules(py, "a.py") == [(7, "comment-not-allowed"), (9, "comment-not-allowed")]
    py_long = 'def f():\n    """One.\n\n    Two.\n    Three.\n    Four.\n    Five.\n    Six.\n    """\n'
    assert code_rules(py_long, "a.py") == [(2, "doc-length")]
    assert code_rules('"""One.\nTwo.\nThree.\nFour.\n"""\n', "a.py") == [(1, "header-length")]
    assert code_rules("def f(:\n", "a.py") == [(1, "parse-error")]

    with tempfile.TemporaryDirectory() as tmp:
        paths = [os.path.join(tmp, name) for name in ("a.md", "b.md")]
        for path in paths:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write("Short line here.\n")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            assert main([paths[0], "--json", paths[1]]) == 0
        result = json.loads(out.getvalue())
        assert result["words"] == 6 and result["verdict"] == "compliant", result
        for text, code in (("The fan is mounted.", 1), ("Open it; close it.", 3)):
            with open(paths[0], "w", encoding="utf-8") as fh:
                fh.write(text)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                assert main(["--json", paths[0]]) == code, (text, out.getvalue())
            failing = json.loads(out.getvalue())["sentences"]
            assert len(failing) == 1 and "_segments" not in failing[0], failing
        glossary = os.path.join(tmp, "glossary.json")
        with open(glossary, "w", encoding="utf-8") as fh:
            fh.write('["commence"]')
        with open(paths[0], "w", encoding="utf-8") as fh:
            fh.write("Commence the test.")
        with contextlib.redirect_stdout(io.StringIO()):
            assert main(["--glossary", glossary, paths[0]]) == 0
        with open(glossary, "w", encoding="utf-8") as fh:
            fh.write('{"terms": []}')
        for bad in (["--baseline", "3"], ["--disable", "passive"], ["--dis", "x"],
                    ["--glossary", os.path.join(tmp, "missing.json")],
                    ["--glossary", glossary]):
            try:
                with contextlib.redirect_stderr(io.StringIO()):
                    main(bad)
            except SystemExit as e:
                assert e.code == 2, (bad, e.code)
            else:
                raise AssertionError(bad)
        project = os.path.join(tmp, "project")
        os.makedirs(os.path.join(project, "docs"))
        doc = os.path.join(project, "docs", "guide.md")
        with open(doc, "w", encoding="utf-8") as fh:
            fh.write("Commence the test.")
        with contextlib.redirect_stdout(io.StringIO()):
            assert main([doc]) == 1
        with open(os.path.join(project, GLOSSARY_FILE), "w", encoding="utf-8") as fh:
            fh.write('["Commence"]')
        assert project_glossary(doc) == frozenset({"commence"})
        with contextlib.redirect_stdout(io.StringIO()):
            assert main([doc]) == 0
        empty = os.path.join(tmp, "empty.json")
        with open(empty, "w", encoding="utf-8") as fh:
            fh.write("[]")
        with contextlib.redirect_stdout(io.StringIO()):
            assert main(["--glossary", empty, doc]) == 1
        with open(os.path.join(project, GLOSSARY_FILE), "w", encoding="utf-8") as fh:
            fh.write('{"terms": []}')
        try:
            with contextlib.redirect_stderr(io.StringIO()):
                main([doc])
        except SystemExit as e:
            assert e.code == 2, e.code
        else:
            raise AssertionError("bad project glossary")

        other = os.path.join(tmp, "other")
        os.makedirs(os.path.join(other, "notes"))
        note = os.path.join(other, "notes", "a.md")
        kept = os.path.join(other, "b.md")
        for path in (note, kept):
            with open(path, "w", encoding="utf-8") as fh:
                fh.write("The **fan** is quiet.")
        ignore = os.path.join(other, IGNORE_FILE)
        with open(ignore, "w", encoding="utf-8") as fh:
            fh.write('[{"rule": "bold-text", "path": "notes/*.md", "match": "**FAN**",'
                     ' "reason": "Labels need bold."}]')
        with contextlib.redirect_stdout(io.StringIO()):
            assert main([note]) == 0
            assert main([kept]) == 1
        with open(ignore, "w", encoding="utf-8") as fh:
            fh.write('[{"rule": "bold-text"}]')
        try:
            with contextlib.redirect_stderr(io.StringIO()):
                main([note])
        except SystemExit as e:
            assert e.code == 2, e.code
        else:
            raise AssertionError("ignore entry without a reason")
    assert _rule_list("passive-voice,present-perfect") == {"passive-voice", "present-perfect"}
    print("selftest OK")


RULE_IDS = {rule_id for rule_id, *_ in RULES} | {
    "long-sentence", "synonym-rotation", "dangling-conjunction", "avoid-word",
    "ing-instruction", "multiple-instructions", "paragraph-length",
    "comment-not-allowed", "header-length", "doc-length", "doc-caveat", "parse-error"}


def _rule_list(value):
    rules = {r for r in value.split(",") if r}
    unknown = rules - RULE_IDS
    if unknown:
        raise argparse.ArgumentTypeError(
            f"unknown rule(s): {', '.join(sorted(unknown))}. "
            f"Known rules: {', '.join(sorted(RULE_IDS))}")
    return rules


def _glossary(path):
    try:
        with open(path, encoding="utf-8") as fh:
            terms = json.load(fh)
    except (OSError, ValueError) as e:
        raise argparse.ArgumentTypeError(f"cannot read glossary {path}: {e}")
    if not isinstance(terms, list) or not all(isinstance(t, str) for t in terms):
        raise argparse.ArgumentTypeError(f"glossary {path} must be a JSON list of strings")
    return frozenset(t.lower() for t in terms)


def _nearest(path, name):
    """Return the nearest file with this name in the folder of path or above it, or None."""
    folder = os.path.dirname(os.path.abspath(path))
    while True:
        candidate = os.path.join(folder, name)
        if os.path.isfile(candidate):
            return candidate
        parent = os.path.dirname(folder)
        if parent == folder:
            return None
        folder = parent


def project_glossary(path):
    """Return the terms of the nearest sge-glossary.json, or an empty set."""
    found = _nearest(path, GLOSSARY_FILE)
    return _glossary(found) if found else frozenset()


def _ignores(path):
    """Read an ignore file: a JSON list of objects, each with a rule and a reason."""
    try:
        with open(path, encoding="utf-8") as fh:
            entries = json.load(fh)
    except (OSError, ValueError) as e:
        raise argparse.ArgumentTypeError(f"cannot read ignore file {path}: {e}")
    if not isinstance(entries, list) or not all(
            isinstance(e, dict) and isinstance(e.get("rule"), str)
            and isinstance(e.get("reason"), str) and e["reason"].strip() for e in entries):
        raise argparse.ArgumentTypeError(
            f"ignore file {path} must be a JSON list of objects with a rule and a reason")
    return entries


def apply_ignores(findings, path):
    """Remove the findings that the nearest sge-ignore.json marks as false alarms."""
    found = _nearest(path, IGNORE_FILE)
    if not found:
        return findings
    entries = _ignores(found)
    relative = os.path.relpath(os.path.abspath(path), os.path.dirname(found)).replace(os.sep, "/")

    def ignored(f):
        return any(e["rule"] == f["rule"]
                   and fnmatch.fnmatch(relative, e.get("path", "*"))
                   and e.get("match", f["match"]).lower() == f["match"].lower()
                   for e in entries)
    return [f for f in findings if not ignored(f)]


def main(argv):
    parser = argparse.ArgumentParser(
        prog="sge_check.py", allow_abbrev=False,
        description="Standard Generated English checker. Gives each sentence a verdict: compliant, "
                    "minimal not compliant, or not compliant. "
                    "Reads stdin when no FILE is given.")
    parser.add_argument("paths", nargs="*", metavar="FILE")
    parser.add_argument("--json", action="store_true", help="print the result as JSON")
    parser.add_argument("--glossary", type=_glossary, default=None, metavar="PATH",
                        help="JSON list of permitted technical terms. Without it, the checker "
                             f"uses the nearest {GLOSSARY_FILE} above each file")
    parser.add_argument("--disable", type=_rule_list, default=set(), metavar="RULES",
                        help="comma-separated rule IDs to silence")
    parser.add_argument("--selftest", action="store_true", help="run the built-in tests")
    args = parser.parse_intermixed_args(argv)
    if args.selftest:
        selftest()
        return 0

    findings, sentences, words_total = [], [], 0
    texts = []
    for p in args.paths:
        try:
            with open(p, encoding="utf-8") as fh:
                texts.append((fh.read(), p))
        except OSError as e:
            parser.error(f"cannot read {p}: {e.strerror}")
    if not args.paths:
        texts.append((sys.stdin.read(), "<stdin>"))
    for text, name in texts:
        check = lint_code if os.path.splitext(name)[1].lower() in CODE_EXTENSIONS else lint
        location = name if args.paths else os.path.join(os.getcwd(), name)
        try:
            glossary = project_glossary(location) if args.glossary is None else args.glossary
            f, w, s = check(text, filename=name, glossary=glossary)
            f = apply_ignores(f, location)
        except argparse.ArgumentTypeError as e:
            parser.error(str(e))
        for finding in f:
            if finding["sentence"] is not None:
                finding["sentence"] += len(sentences)
        findings.extend(f)
        sentences.extend(s)
        words_total += w

    findings = [f for f in findings if f["rule"] not in args.disable]
    return EXIT_CODES[report(findings, words_total, sentences, args.json)]


def _utf8_streams():
    """Use UTF-8 for stdin and stdout. Windows uses cp1252, which breaks dashes and arrows."""
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")


if __name__ == "__main__":
    _utf8_streams()
    sys.exit(main(sys.argv[1:]))
