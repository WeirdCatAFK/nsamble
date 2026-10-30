import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rolesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/agents/roles");

async function loadPrompt(roleName) {
  const role = JSON.parse(await readFile(resolve(rolesDir, `${roleName}.json`), "utf8"));
  return role.systemPrompt;
}

describe("orchestrator prompt", () => {
  it("requires 15 to 50 clarifying questions across constraint categories", async () => {
    const prompt = await loadPrompt("orchestrator");
    assert.ok(prompt.includes("15 to 50 clarifying questions"));
    for (const category of ["dimensions", "materials", "assembly", "environment", "electrical", "scope"]) {
      assert.ok(prompt.includes(category), `missing category ${category}`);
    }
  });

  it("caps revisions at five cycles with a best-version fallback", async () => {
    const prompt = await loadPrompt("orchestrator");
    assert.ok(prompt.includes("maximum of five revision cycles"));
    assert.ok(prompt.includes("best version with the remaining issues"));
  });
});

describe("dfm reviewer prompt", () => {
  it("requires JSON-only output with object findings", async () => {
    const prompt = await loadPrompt("dfm-reviewer");
    assert.ok(prompt.includes("Output ONLY the JSON object"));
  });

  it("covers seal keepout and doc-block comment style", async () => {
    const prompt = await loadPrompt("dfm-reviewer");
    assert.ok(prompt.includes("gasket and seal"));
    assert.ok(prompt.includes("one doc comment block"));
  });
});

describe("geometry generator prompt", () => {
  it("requires a self-check of cutters, bounds, and comments", async () => {
    const prompt = await loadPrompt("geometry-generator");
    assert.ok(prompt.includes("lands on solid material"));
    assert.ok(prompt.includes("bounding box"));
    assert.ok(prompt.includes("Count the comment lines"));
  });
});

describe("assembly planner prompt", () => {
  it("requires object positions, an overlap table, and install order", async () => {
    const prompt = await loadPrompt("assembly-planner");
    assert.ok(prompt.includes('"position": {"x"'));
    assert.ok(prompt.includes("pairwise overlap table"));
    assert.ok(prompt.includes("insertion path"));
  });
});
