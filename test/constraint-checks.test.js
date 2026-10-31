import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const moduleUrl = pathToFileURL(resolve(here, "../src/access/modules/common/constraint-checks.js")).href;
const toolUrl = pathToFileURL(resolve(here, "../src/agents/tools/check-constraints.js")).href;

const VOLUME = [220, 220, 250];
const KNOWN = new Set(["m3-socket-head-bolt", "m4-socket-head-bolt", "m4-hex-nut"]);

function part(partId, position, fasteners = []) {
  return { partId, position, fasteners, connections: ["other"] };
}

describe("constraint checks", () => {
  it("passes a clean manifest", async () => {
    const mod = await import(moduleUrl);
    const report = mod.runConstraintChecks({
      parts: [part("a", { x: 0, y: 0, z: 0 }), part("b", { x: 50, y: 0, z: 0 })],
      bboxes: { a: [20, 20, 20], b: [20, 20, 20] },
      buildVolume: VOLUME,
      knownIds: KNOWN,
    });
    assert.ok(report.passed > 0);
    assert.equal(report.failures.length, 0);
  });

  it("flags bounding-box overlap as an error", async () => {
    const mod = await import(moduleUrl);
    const report = mod.runConstraintChecks({
      parts: [part("a", { x: 0, y: 0, z: 0 }), part("b", { x: 10, y: 0, z: 0 })],
      bboxes: { a: [20, 20, 20], b: [20, 20, 20] },
      buildVolume: VOLUME,
      knownIds: KNOWN,
    });
    const overlap = report.failures.find((failure) => failure.rule === "bbox-overlap");
    assert.ok(overlap, "missing bbox-overlap finding");
    assert.equal(overlap.severity, "error");
  });

  it("flags parts outside the build volume as errors", async () => {
    const mod = await import(moduleUrl);
    const report = mod.runConstraintChecks({
      parts: [part("big", { x: 0, y: 0, z: 0 })],
      bboxes: { big: [300, 20, 20] },
      buildVolume: VOLUME,
      knownIds: KNOWN,
    });
    const volume = report.failures.find((failure) => failure.rule === "build-volume");
    assert.ok(volume, "missing build-volume finding");
    assert.equal(volume.severity, "error");
  });

  it("flags unknown fastener IDs as errors", async () => {
    const mod = await import(moduleUrl);
    const report = mod.runConstraintChecks({
      parts: [part("a", { x: 0, y: 0, z: 0 }, [{ partId: "m4x12-bolt" }])],
      bboxes: { a: [20, 20, 20] },
      buildVolume: VOLUME,
      knownIds: KNOWN,
    });
    const unknown = report.failures.find((failure) => failure.rule === "unknown-fastener");
    assert.ok(unknown, "missing unknown-fastener finding");
    assert.equal(unknown.severity, "error");
  });

  it("warns on isolated parts and missing boxes", async () => {
    const mod = await import(moduleUrl);
    const report = mod.runConstraintChecks({
      parts: [{ partId: "lonely", position: [0, 0, 0], fasteners: [], connections: [] }],
      bboxes: {},
      buildVolume: VOLUME,
      knownIds: KNOWN,
    });
    const rules = new Map(report.failures.map((failure) => [failure.rule, failure.severity]));
    assert.equal(rules.get("no-connections"), "warning");
    assert.equal(rules.get("missing-bbox"), "warning");
  });
});

describe("check-constraints tool", () => {
  it("checks a manifest through the tool", async () => {
    const mod = await import(toolUrl);
    const report = JSON.parse(
      await mod.execute({
        parts: [{ partId: "a", position: { x: 0, y: 0, z: 0 }, fasteners: [{ partId: "m3-socket-head-bolt" }] }],
        bboxes: { a: [20, 20, 20] },
      }),
    );
    assert.equal(report.failures.length, 0);
  });
});
