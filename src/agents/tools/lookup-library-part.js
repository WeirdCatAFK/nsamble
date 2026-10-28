import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const baseDir = dirname(fileURLToPath(import.meta.url));
const libraryDir = resolve(baseDir, "../../data/parts-library");

let partsCache = null;

async function loadLibrary() {
  if (partsCache) return partsCache;

  const files = await readdir(libraryDir);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const allParts = [];
  for (const file of jsonFiles) {
    const content = JSON.parse(await readFile(resolve(libraryDir, file), "utf8"));
    allParts.push(...content);
  }

  partsCache = allParts;
  return allParts;
}

export const name = "lookup_library_part";

export const description =
  "Search the standard parts library for hardware with known dimensions. " +
  "Returns matching parts with full specifications. " +
  "Use this before writing OpenSCAD to get correct hole sizes, mounting positions, and clearances.";

export const parameters = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Free text search (e.g. 'M3 bolt', 'raspberry pi', 'USB-C').",
    },
    category: {
      type: "string",
      description: "Filter by category: fastener, board, connector.",
    },
    id: {
      type: "string",
      description: "Look up a part by exact ID.",
    },
  },
  required: [],
  additionalProperties: false,
};

export async function execute({ query, category, id }) {
  const parts = await loadLibrary();

  if (id) {
    const match = parts.find((p) => p.id === id);
    return JSON.stringify(match ?? { error: `Part '${id}' not found.` });
  }

  let results = parts;

  if (category) {
    results = results.filter((p) => p.category === category);
  }

  if (query) {
    const terms = query.toLowerCase().split(/\s+/);
    results = results.filter((p) => {
      const text = `${p.id} ${p.name} ${p.category} ${p.standard ?? ""}`.toLowerCase();
      return terms.every((t) => text.includes(t));
    });
  }

  if (results.length === 0) {
    return JSON.stringify({ results: [], note: "No matching parts. The agent can create a new part." });
  }

  return JSON.stringify({ results, count: results.length });
}
