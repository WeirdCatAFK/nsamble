/** Check English prose against the SGE house style with sge_check.py. */
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const baseDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(baseDir, "../../..");
const scriptPath = resolve(backendRoot, ".claude/skills/SGE/scripts/sge_check.py");

export const name = "sge_check";

export const description =
  "Check English prose against the SGE house style. " +
  "Pass text directly, or a repo file path to check by extension. " +
  "Returns the verdict with a capped finding list. " +
  "Do not use this on OpenSCAD code: the checker reads Markdown, Python, and JavaScript only.";

export const parameters = {
  type: "object",
  properties: {
    text: {
      type: "string",
      description: "Prose to check.",
    },
    path: {
      type: "string",
      description: "Repo file path to check, resolved from the backend root.",
    },
  },
  required: [],
  additionalProperties: false,
};

const MAX_FINDINGS = 20;
const TIMEOUT_MS = 30000;
const PYTHON_BINARIES = ["python3", "python"];

function runOnce(binary, args, stdinText) {
  return new Promise((settle) => {
    const child = execFile(
      binary,
      [scriptPath, "--json", ...args],
      { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error && !stdout) {
          settle({ transportError: error.code === "ENOENT" ? `Python binary '${binary}' was not found.` : error.message });
          return;
        }
        settle({ stdout });
      },
    );

    if (stdinText !== null) {
      try {
        child.stdin.write(stdinText);
        child.stdin.end();
      } catch {
        settle({ transportError: `Could not write to '${binary}' stdin.` });
      }
    }
  });
}

export async function execute({ text, path }) {
  if (!text && !path) {
    return JSON.stringify({ error: "Provide text or path." });
  }

  const args = path ? [resolve(backendRoot, path)] : [];
  const stdinText = path ? null : text;
  let stdout = null;
  let transportError = null;

  for (const binary of PYTHON_BINARIES) {
    const result = await runOnce(binary, args, stdinText);
    if (result.stdout) {
      stdout = result.stdout;
      transportError = null;
      break;
    }
    transportError = result.transportError;
    if (!transportError.endsWith("was not found.")) break;
  }

  if (!stdout) {
    return JSON.stringify({ error: transportError ?? "The SGE checker produced no output." });
  }

  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    return JSON.stringify({ error: `The SGE checker returned invalid JSON: ${stdout.slice(0, 200)}` });
  }

  const findings = [];
  for (const sentence of report.sentences ?? []) {
    for (const finding of sentence.findings ?? []) {
      findings.push({
        line: finding.line,
        rule: finding.rule,
        severity: finding.severity,
        match: finding.match,
        message: finding.message,
        text: sentence.text,
      });
    }
  }
  for (const finding of report.document_findings ?? []) {
    findings.push({
      line: finding.line ?? null,
      rule: finding.rule,
      severity: finding.severity,
      match: finding.match ?? null,
      message: finding.message,
      text: null,
    });
  }

  return JSON.stringify({
    verdict: report.verdict,
    counts: report.counts ?? null,
    findings: findings.slice(0, MAX_FINDINGS),
    findingCount: findings.length,
    truncated: findings.length > MAX_FINDINGS,
  });
}
