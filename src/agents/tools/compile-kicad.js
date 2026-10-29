import { env } from "../../env.js";
import { uploadFile } from "../../access/modules/common/files.js";
import { getAgentContext } from "../context.js";

export const name = "compile_kicad";

export const description =
  "Compile KiCad schematic and board files to SVG previews and Gerber outputs. " +
  "Pass the schematic and board content as strings. Returns file IDs for the compiled outputs and DRC results.";

export const parameters = {
  type: "object",
  properties: {
    schematic: {
      type: "string",
      description: "The complete .kicad_sch file content (S-expression format).",
    },
    board: {
      type: "string",
      description: "The complete .kicad_pcb file content (S-expression format). Optional if only a schematic is needed.",
    },
    filename: {
      type: "string",
      description: "Base filename without extension (e.g. 'power-board').",
    },
  },
  required: ["schematic", "filename"],
  additionalProperties: false,
};

export async function execute({ schematic, board, filename = "output" }) {
  const ctx = getAgentContext();
  const uid = ctx?.userId;
  const pid = ctx?.projectId;

  const response = await fetch(`${env.kicad.url}/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schematic, board, filename }),
  });

  if (!response.ok) {
    return JSON.stringify({
      error: `KiCad service returned ${response.status}.`,
    });
  }

  const result = await response.json();

  const output = { errors: result.errors, warnings: result.warnings };

  if (result.drc) {
    output.drc = result.drc;
  }

  if (!uid || !pid) {
    return JSON.stringify(output);
  }

  if (result.schematic_svg) {
    const svgBuffer = Buffer.from(result.schematic_svg, "base64");
    const svgFile = await uploadFile({
      userId: uid,
      projectId: pid,
      name: `${filename}_schematic.svg`,
      mimeType: "image/svg+xml",
      source: svgBuffer,
    });
    output.schematicSvgFileId = svgFile.id;
    output.schematicSvgFileName = svgFile.name;
  }

  if (result.board_svgs) {
    output.boardSvgFileIds = {};
    for (const [viewName, svgB64] of Object.entries(result.board_svgs)) {
      const svgBuffer = Buffer.from(svgB64, "base64");
      const svgFile = await uploadFile({
        userId: uid,
        projectId: pid,
        name: `${filename}_board_${viewName}.svg`,
        mimeType: "image/svg+xml",
        source: svgBuffer,
      });
      output.boardSvgFileIds[viewName] = svgFile.id;
    }
  }

  if (result.gerbers) {
    output.gerberFileIds = {};
    for (const [gName, gB64] of Object.entries(result.gerbers)) {
      const gBuffer = Buffer.from(gB64, "base64");
      const gFile = await uploadFile({
        userId: uid,
        projectId: pid,
        name: gName,
        mimeType: "application/octet-stream",
        source: gBuffer,
      });
      output.gerberFileIds[gName] = gFile.id;
    }
  }

  if (result.drill) {
    const drillBuffer = Buffer.from(result.drill, "base64");
    const drillFile = await uploadFile({
      userId: uid,
      projectId: pid,
      name: `${filename}.drl`,
      mimeType: "application/octet-stream",
      source: drillBuffer,
    });
    output.drillFileId = drillFile.id;
  }

  const schFile = await uploadFile({
    userId: uid,
    projectId: pid,
    name: `${filename}.kicad_sch`,
    mimeType: "application/x-kicad-schematic",
    source: schematic,
  });
  output.schematicFileId = schFile.id;

  if (board) {
    const pcbFile = await uploadFile({
      userId: uid,
      projectId: pid,
      name: `${filename}.kicad_pcb`,
      mimeType: "application/x-kicad-pcb",
      source: board,
    });
    output.boardFileId = pcbFile.id;
  }

  return JSON.stringify(output);
}
