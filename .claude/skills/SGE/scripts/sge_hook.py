"""Claude Code hooks that apply Standard Generated English to the files that Claude edits.

"snapshot" runs before each edit. "stop" runs at the end of a turn and blocks it while the edits add findings.
"""
import json
import os
import sys
import tempfile
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sge_check

TEXT_EXTENSIONS = {".md"}
MAX_BLOCKS = 2
MAX_LINES = 40
STATE_DIR = os.path.join(tempfile.gettempdir(), "sge-hook")


def _checked(path):
    return os.path.splitext(path)[1].lower() in TEXT_EXTENSIONS | sge_check.CODE_EXTENSIONS


def _findings(path):
    """Return (key, finding) pairs for a file. A file that does not exist has no findings."""
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    ext = os.path.splitext(path)[1].lower()
    check = sge_check.lint_code if ext in sge_check.CODE_EXTENSIONS else sge_check.lint
    findings, _, sentences = check(text, filename=path, glossary=sge_check.project_glossary(path))
    findings = sge_check.apply_ignores(findings, path)
    return [((f["rule"], f["match"],
              "" if f["sentence"] is None else sentences[f["sentence"]]["text"]), f)
            for f in findings]


def _state_file(event, state_dir):
    return os.path.join(state_dir, f"{event.get('session_id', 'default')}.json")


def _load(state_file):
    try:
        with open(state_file, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {"baseline": {}, "blocks": 0}


def _save(state, state_file):
    os.makedirs(os.path.dirname(state_file), exist_ok=True)
    with open(state_file, "w", encoding="utf-8") as fh:
        json.dump(state, fh)


def snapshot(event, state_dir=STATE_DIR):
    """Record the findings of a file before its first edit in this turn, and mark the turn as edited."""
    path = (event.get("tool_input") or {}).get("file_path", "")
    if not path or not _checked(path):
        return None
    state_file = _state_file(event, state_dir)
    state = _load(state_file)
    key = os.path.abspath(path)
    if key not in state["baseline"]:
        state["baseline"][key] = [list(k) for k, _ in _findings(key)]
    state["edited"] = True
    _save(state, state_file)
    return None


def stop(event, state_dir=STATE_DIR):
    """Return a block decision while the edited files have new findings.

    After a block, a reply with no new edits ends the turn: the reply explains the false alarms.
    shortcut: edits made with shell commands get no snapshot and no check. Add a Bash hook if that happens often.
    """
    state_file = _state_file(event, state_dir)
    if not os.path.exists(state_file):
        return None
    state = _load(state_file)
    if state["blocks"] and not state.get("edited"):
        os.remove(state_file)
        return None
    new = []
    for path, old in state["baseline"].items():
        remaining = Counter(tuple(k) for k in old)
        for key, finding in _findings(path):
            if remaining[key]:
                remaining[key] -= 1
            else:
                new.append(finding)
    if not new or state["blocks"] >= MAX_BLOCKS:
        os.remove(state_file)
        if new:
            return {"systemMessage": f"Standard Generated English: {len(new)} new findings remain "
                                     f"after {MAX_BLOCKS} checks."}
        return None
    state["blocks"] += 1
    state["edited"] = False
    _save(state, state_file)
    lines = [f"{f['file']}:{f['line']} {f['rule']} ({f['severity']}): {f['message']} [{f['match']}]"
             for f in new[:MAX_LINES]]
    if len(new) > MAX_LINES:
        lines.append(f"{len(new) - MAX_LINES} more findings are not shown.")
    return {"decision": "block",
            "reason": f"Standard Generated English found {len(new)} new findings in the files "
                      "that you edited. Fix them. If a finding is a false alarm, add it to "
                      f"{sge_check.IGNORE_FILE} with a reason and say so in your reply.\n"
                      + "\n".join(lines)}


def selftest():
    with tempfile.TemporaryDirectory() as tmp:
        doc = os.path.join(tmp, "a.md")

        def write(path, text):
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(text)
        write(doc, "The fan is mounted on the lid.\n")
        event = {"session_id": "t", "tool_input": {"file_path": doc}}
        assert snapshot(event, tmp) is None
        write(doc, "The fan is mounted on the lid.\n\nCommence the test; it is fast.\n")
        result = stop(event, tmp)
        assert result["decision"] == "block", result
        assert "semicolon" in result["reason"] and "avoid-word" in result["reason"], result
        assert "mounted" not in result["reason"], result
        snapshot(event, tmp)
        write(doc, "The fan is mounted on the lid.\n\nStart the test.\n")
        assert stop(event, tmp) is None
        assert not os.path.exists(os.path.join(tmp, "t.json"))

        snapshot(event, tmp)
        write(doc, "Open it; close it.\n")
        assert stop(event, tmp)["decision"] == "block"
        assert stop(event, tmp) is None
        assert not os.path.exists(os.path.join(tmp, "t.json"))

        snapshot(event, tmp)
        write(doc, "Open it; close it.\n\nTurn it; lock it.\n")
        assert stop(event, tmp)["decision"] == "block"
        snapshot(event, tmp)
        assert stop(event, tmp)["decision"] == "block"
        snapshot(event, tmp)
        assert "remain" in stop(event, tmp)["systemMessage"]
        assert stop(event, tmp) is None
        write(doc, "The fan is quiet.\n")

        snapshot({"session_id": "t", "tool_input": {"file_path": os.path.join(tmp, "a.png")}}, tmp)
        assert not os.path.exists(os.path.join(tmp, "t.json"))
        code = os.path.join(tmp, "b.py")
        snapshot({"session_id": "t", "tool_input": {"file_path": code}}, tmp)
        write(code, "x = 1  # explain\n")
        result = stop({"session_id": "t"}, tmp)
        assert "comment-not-allowed" in result["reason"], result
        stop({"session_id": "t"}, tmp)
        stop({"session_id": "t"}, tmp)

        project = os.path.join(tmp, "project")
        os.makedirs(project)
        write(os.path.join(project, sge_check.GLOSSARY_FILE), '["commence"]')
        guide = os.path.join(project, "guide.md")
        event = {"session_id": "g", "tool_input": {"file_path": guide}}
        snapshot(event, tmp)
        write(guide, "Commence the test.\n")
        assert stop(event, tmp) is None

        memory = os.path.join(project, "memory")
        os.makedirs(memory)
        write(os.path.join(project, sge_check.IGNORE_FILE),
              '[{"rule": "bold-text", "path": "memory/*.md", "reason": "Memory labels need bold."}]')
        label = os.path.join(memory, "fact.md")
        event = {"session_id": "m", "tool_input": {"file_path": label}}
        snapshot(event, tmp)
        write(label, "**Why:** the fan is quiet.\n")
        assert stop(event, tmp) is None
    print("selftest OK")


def main(argv):
    if argv == ["--selftest"]:
        selftest()
        return 0
    event = json.load(sys.stdin)
    result = (snapshot if argv[:1] == ["snapshot"] else stop)(event)
    if result:
        print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
