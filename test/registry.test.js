import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const base = resolve(dirname(fileURLToPath(import.meta.url)), "../src/agents");
const rolesDir = resolve(base, "roles");
const toolsDir = resolve(base, "tools");

describe("agent roles", () => {
  it("every role JSON has name, systemPrompt, and a tools array", async () => {
    const files = (await readdir(rolesDir)).filter((f) => f.endsWith(".json"));
    assert.ok(files.length > 0, "no role files found");

    for (const file of files) {
      const role = JSON.parse(await readFile(resolve(rolesDir, file), "utf8"));
      assert.ok(role.name, `${file}: missing name`);
      assert.ok(role.systemPrompt, `${file}: missing systemPrompt`);
      assert.ok(Array.isArray(role.tools), `${file}: tools must be an array`);
    }
  });

  it("every tool referenced by a role exists as a .js file", async () => {
    const roleFiles = (await readdir(rolesDir)).filter((f) => f.endsWith(".json"));
    const toolFiles = new Set(
      (await readdir(toolsDir)).filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, "")),
    );

    for (const file of roleFiles) {
      const role = JSON.parse(await readFile(resolve(rolesDir, file), "utf8"));
      for (const toolName of role.tools) {
        assert.ok(toolFiles.has(toolName), `${file}: references tool "${toolName}" which does not exist`);
      }
    }
  });
});

describe("agent tools", () => {
  it("every tool exports name, description, parameters, and execute", async () => {
    const files = (await readdir(toolsDir)).filter((f) => f.endsWith(".js"));
    assert.ok(files.length > 0, "no tool files found");

    for (const file of files) {
      const mod = await import(pathToFileURL(resolve(toolsDir, file)).href);
      assert.equal(typeof mod.name, "string", `${file}: name must be a string`);
      assert.equal(typeof mod.description, "string", `${file}: description must be a string`);
      assert.equal(typeof mod.parameters, "object", `${file}: parameters must be an object`);
      assert.equal(typeof mod.execute, "function", `${file}: execute must be a function`);
    }
  });
});
