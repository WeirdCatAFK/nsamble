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
  it("insists on unique clarifying questions with a content-set amount", async () => {
    const prompt = await loadPrompt("orchestrator");
    assert.ok(prompt.includes("Always ask"));
    assert.ok(prompt.includes("Let the content set the amount"));
    assert.ok(prompt.includes("Never repeat a question"));
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

describe("spec planner prompt", () => {
  it("requires a frozen JSON spec with library IDs and tags", async () => {
    const prompt = await loadPrompt("spec-planner");
    assert.ok(prompt.includes("Output ONLY the JSON spec"));
    assert.ok(prompt.includes("library IDs"));
    assert.ok(prompt.includes("function tags"));
  });
});

describe("vision judge prompt", () => {
  it("requires a JSON-only render verdict", async () => {
    const prompt = await loadPrompt("vision-judge");
    assert.ok(prompt.includes("Output ONLY the JSON verdict"));
    assert.ok(prompt.includes("preview renders"));
  });
});

describe("orchestrator pipeline prompt", () => {
  it("freezes a spec first and judges on the stronger model", async () => {
    const prompt = await loadPrompt("orchestrator");
    assert.ok(prompt.includes("delegate to spec-planner"));
    assert.ok(prompt.includes("muse-wonder"));
  });

  it("routes failures narrowly and binds measurements over opinion", async () => {
    const prompt = await loadPrompt("orchestrator");
    assert.ok(prompt.includes("Re-run only that stage"));
    assert.ok(prompt.includes("the check wins"));
  });

  it("calls the render judge and the constraint checks by name", async () => {
    const prompt = await loadPrompt("orchestrator");
    assert.ok(prompt.includes("judge_part_renders"));
    assert.ok(prompt.includes("check_constraints"));
    assert.ok(prompt.includes("validate_geometry"));
    assert.ok(prompt.includes("constraint-engine"));
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
