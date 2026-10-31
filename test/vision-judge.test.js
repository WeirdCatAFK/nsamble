import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("vision judge module", () => {
  it("exports the runner and the error class", async () => {
    const mod = await import(
      pathToFileURL(resolve(here, "../src/access/modules/agents/run-vision-judge.js")).href
    );
    assert.equal(typeof mod.runVisionJudge, "function");
    assert.equal(typeof mod.VisionJudgeError, "function");
  });
});
