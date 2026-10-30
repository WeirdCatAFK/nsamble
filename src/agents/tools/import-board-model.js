import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../../env.js";
import { uploadFile } from "../../access/modules/common/files.js";
import { getAgentContext } from "../context.js";

const boardModelsDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../data/board-models",
);

export const name = "import_board_model";

export const description =
  "Import a pre-made dev board 3D model into the project. " +
  "Compiles the board's OpenSCAD model to STL and uploads it. " +
  "Returns file IDs for the STL and preview PNG.";

export const parameters = {
  type: "object",
  properties: {
    board_id: {
      type: "string",
      description:
        "Board ID from the parts library (e.g. 'esp32-devkit-v1').",
    },
    filename: {
      type: "string",
      description:
        "Base filename without extension. Defaults to the board ID.",
    },
  },
  required: ["board_id"],
  additionalProperties: false,
};

export async function execute({ board_id, filename }) {
  const ctx = getAgentContext();
  const uid = ctx?.userId;
  const pid = ctx?.projectId;
  const base = filename || board_id;

  let script;
  try {
    script = await readFile(resolve(boardModelsDir, `${board_id}.scad`), "utf8");
  } catch {
    return JSON.stringify({ error: `No board model found for '${board_id}'.` });
  }

  const response = await fetch(`${env.openscad.url}/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script, filename: base }),
  });

  if (!response.ok) {
    return JSON.stringify({
      error: `OpenSCAD service returned ${response.status}.`,
    });
  }

  const result = await response.json();
  const output = { errors: result.errors, warnings: result.warnings };

  if (result.stl && uid && pid) {
    const stlBuffer = Buffer.from(result.stl, "base64");
    const stlFile = await uploadFile({
      userId: uid,
      projectId: pid,
      name: `${base}.stl`,
      mimeType: "model/stl",
      source: stlBuffer,
    });
    output.stlFileId = stlFile.id;
    output.stlFileName = stlFile.name;
  }

  if (result.pngs?.isometric && uid && pid) {
    const pngBuffer = Buffer.from(result.pngs.isometric, "base64");
    const pngFile = await uploadFile({
      userId: uid,
      projectId: pid,
      name: `${base}_preview.png`,
      mimeType: "image/png",
      source: pngBuffer,
    });
    output.pngFileId = pngFile.id;
    output.pngFileName = pngFile.name;
  } else if (result.png && uid && pid) {
    const pngBuffer = Buffer.from(result.png, "base64");
    const pngFile = await uploadFile({
      userId: uid,
      projectId: pid,
      name: `${base}_preview.png`,
      mimeType: "image/png",
      source: pngBuffer,
    });
    output.pngFileId = pngFile.id;
    output.pngFileName = pngFile.name;
  }

  return JSON.stringify(output);
}
