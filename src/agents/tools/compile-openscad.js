import { env } from "../../env.js";
import { uploadFile } from "../../access/modules/common/files.js";
import { getAgentContext } from "../context.js";

export const name = "compile_openscad";

export const description =
  "Compile an OpenSCAD script to STL and a preview PNG. " +
  "Pass the full script as a string. Returns file IDs for the compiled outputs and any errors.";

export const parameters = {
  type: "object",
  properties: {
    script: {
      type: "string",
      description: "The complete OpenSCAD source code.",
    },
    filename: {
      type: "string",
      description: "Base filename without extension (e.g. 'side-panel').",
    },
  },
  required: ["script", "filename"],
  additionalProperties: false,
};

export async function execute({ script, filename = "output" }) {
  const ctx = getAgentContext();
  const uid = ctx?.userId;
  const pid = ctx?.projectId;

  const response = await fetch(`${env.openscad.url}/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script, filename }),
  });

  if (!response.ok) {
    return JSON.stringify({
      error: `OpenSCAD service returned ${response.status}.`,
    });
  }

  const result = await response.json();

  const output = { errors: result.errors, warnings: result.warnings };

  if (result.validation) {
    output.validation = result.validation;
  }

  if (result.stl && uid && pid) {
    const stlBuffer = Buffer.from(result.stl, "base64");
    const stlFile = await uploadFile({
      userId: uid,
      projectId: pid,
      name: `${filename}.stl`,
      mimeType: "model/stl",
      source: stlBuffer,
    });
    output.stlFileId = stlFile.id;
    output.stlFileName = stlFile.name;
  }

  if (result.pngs && uid && pid) {
    output.pngFileIds = {};
    for (const [viewName, pngB64] of Object.entries(result.pngs)) {
      const pngBuffer = Buffer.from(pngB64, "base64");
      const pngFile = await uploadFile({
        userId: uid,
        projectId: pid,
        name: `${filename}_${viewName}.png`,
        mimeType: "image/png",
        source: pngBuffer,
      });
      output.pngFileIds[viewName] = pngFile.id;
    }
    if (output.pngFileIds.isometric) {
      output.pngFileId = output.pngFileIds.isometric;
      output.pngFileName = `${filename}_isometric.png`;
    }
  } else if (result.png && uid && pid) {
    const pngBuffer = Buffer.from(result.png, "base64");
    const pngFile = await uploadFile({
      userId: uid,
      projectId: pid,
      name: `${filename}.png`,
      mimeType: "image/png",
      source: pngBuffer,
    });
    output.pngFileId = pngFile.id;
    output.pngFileName = pngFile.name;
  }

  if (uid && pid) {
    const scadFile = await uploadFile({
      userId: uid,
      projectId: pid,
      name: `${filename}.scad`,
      mimeType: "application/x-openscad",
      source: script,
    });
    output.scadFileId = scadFile.id;
  }

  return JSON.stringify(output);
}
