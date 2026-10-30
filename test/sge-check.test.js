import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/agents/tools");

describe("sge-check tool", () => {
  it("flags a passive sentence and passes a clean instruction", async () => {
    const mod = await import(pathToFileURL(resolve(toolsDir, "sge-check.js")).href);

    const bad = JSON.parse(
      await mod.execute({ text: "The bolt was tightened by the technician yesterday morning." }),
    );
    assert.notEqual(bad.verdict, "compliant");
    assert.ok(bad.findings.length > 0);
    assert.ok(bad.findings.some((finding) => finding.rule === "passive-voice"));

    const good = JSON.parse(await mod.execute({ text: "Tighten the bolt." }));
    assert.equal(good.verdict, "compliant");
    assert.equal(good.findings.length, 0);
  });
});
