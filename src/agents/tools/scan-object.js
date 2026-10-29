import { getFileContent, uploadFile } from "../../access/modules/common/files.js";
import { createPart } from "../../access/resources/db/parts.js";
import { parseBoundingBox } from "../../access/modules/common/stl-dimensions.js";
import { getAgentContext } from "../context.js";
import { env } from "../../env.js";

export const name = "scan_object";

export const description =
  "Run the photogrammetry scanner on a video file already uploaded to the project. " +
  "The video must follow the .scan.<ext> naming convention (e.g. battery.scan.mp4). " +
  "Extracts frames, detects markers, reconstructs a dense point cloud, meshes it, " +
  "and imports the resulting STL back into the project as a part with bounding box dimensions.";

export const parameters = {
  type: "object",
  properties: {
    fileId: {
      type: "string",
      description: "ID of the video file in the project.",
    },
    partName: {
      type: "string",
      description: "Name for the resulting scanned part (without .stl extension).",
    },
  },
  required: ["fileId"],
  additionalProperties: false,
};

const SCAN_PATTERN = /^(.+)\.scan\.\w+$/i;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 200;

async function pollUntilDone(scanId) {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const res = await fetch(`${env.scanner.url}/scans/${scanId}`);
    if (!res.ok) throw new Error(`Scanner status check failed: ${res.status}`);
    const status = await res.json();

    if (status.status === "done") return status;
    if (status.status === "failed") throw new Error(status.error || "Scan failed.");

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Scan timed out.");
}

export async function execute({ fileId, partName }) {
  const ctx = getAgentContext();
  const uid = ctx?.userId;
  const pid = ctx?.projectId;
  if (!uid || !pid) {
    return JSON.stringify({ error: "Agent context (userId, projectId) is required." });
  }

  const { file, stream } = await getFileContent({ id: fileId, userId: uid, projectId: pid });

  const match = SCAN_PATTERN.exec(file.name);
  if (!match) {
    return JSON.stringify({
      error: `File "${file.name}" does not follow the scan naming convention. `
        + "Rename it to <name>.scan.<ext> (e.g. battery.scan.mp4).",
    });
  }

  const derivedName = partName || match[1];

  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const videoBuffer = Buffer.concat(chunks);

  const form = new FormData();
  form.append("video", new Blob([videoBuffer]), file.name);

  const createRes = await fetch(`${env.scanner.url}/scans`, {
    method: "POST",
    body: form,
  });
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    return JSON.stringify({ error: err.detail || "Scanner service rejected the request." });
  }

  const { id: scanId } = await createRes.json();

  await pollUntilDone(scanId);

  const modelRes = await fetch(`${env.scanner.url}/scans/${scanId}/model`);
  if (!modelRes.ok) {
    return JSON.stringify({ error: "Failed to retrieve model from scanner." });
  }

  const stlBuffer = Buffer.from(await modelRes.arrayBuffer());
  const stlName = `${derivedName}.stl`;

  const stlFile = await uploadFile({
    userId: uid,
    projectId: pid,
    name: stlName,
    mimeType: "model/stl",
    source: stlBuffer,
  });

  const dimensions = parseBoundingBox(stlBuffer);

  const part = await createPart({
    projectId: pid,
    name: derivedName,
    manufacturingMethod: "scanned",
    specification: dimensions,
  });

  return JSON.stringify({
    fileId: stlFile.id,
    fileName: stlName,
    partId: part.id,
    partName: part.name,
    dimensions,
  });
}
