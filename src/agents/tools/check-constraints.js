/** Run deterministic constraint checks over an assembly manifest. */
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runConstraintChecks } from "../../access/modules/common/constraint-checks.js";

const baseDir = dirname(fileURLToPath(import.meta.url));
const libraryDir = resolve(baseDir, "../../data/parts-library");

export const name = "check_constraints";

export const description =
  "Run deterministic checks over an assembly manifest: build volume, bounding-box overlap, fastener IDs, and part connections. " +
  "Position is the part min corner in mm. Boxes come from compile output. " +
  "Returns a report with a pass count and failures in error or warning severity.";

export const parameters = {
  type: "object",
  properties: {
    parts: {
      type: "array",
      description: "Manifest parts with partId, position, fasteners, and connections.",
      items: { type: "object" },
    },
    bboxes: {
      type: "object",
      description: "Compiled bounding-box extents per part ID, e.g. {\"bracket\": [40, 30, 10]}.",
    },
    buildVolume: {
      type: "array",
      items: { type: "number" },
      description: "Build volume in mm. Defaults to [220, 220, 250].",
    },
  },
  required: ["parts"],
  additionalProperties: false,
};

export async function execute({ parts, bboxes = {}, buildVolume }) {
  const files = await readdir(libraryDir);
  const knownIds = new Set();

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const entries = JSON.parse(await readFile(resolve(libraryDir, file), "utf8"));
    for (const entry of entries) knownIds.add(entry.id);
  }

  const report = runConstraintChecks({ parts, bboxes, buildVolume, knownIds });
  return JSON.stringify(report);
}
