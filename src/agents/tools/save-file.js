import { uploadFile } from "../../access/modules/common/files.js";
import { getAgentContext } from "../context.js";

export const name = "save_file";

export const description =
  "Save generated content as a file in the project. " +
  "Returns the file ID, name, and size.";

export const parameters = {
  type: "object",
  properties: {
    content: {
      type: "string",
      description: "File content as a string.",
    },
    filename: {
      type: "string",
      description:
        "File name with extension. Use folder prefixes to keep output organized " +
        "(e.g. 'cad/bracket.stl', 'docs/notes.md', 'reports/bom.md').",
    },
    mimeType: {
      type: "string",
      description: "MIME type (e.g. 'application/json').",
    },
  },
  required: ["content", "filename"],
  additionalProperties: false,
};

export async function execute({ content, filename, mimeType }) {
  const ctx = getAgentContext();
  const uid = ctx?.userId;
  const pid = ctx?.projectId;

  if (!uid || !pid) {
    return JSON.stringify({ error: "userId and projectId are required." });
  }

  const clean = String(filename ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");

  if (!clean) {
    return JSON.stringify({ error: "filename is required." });
  }

  const file = await uploadFile({
    userId: uid,
    projectId: pid,
    name: clean,
    mimeType: mimeType ?? "application/octet-stream",
    source: content,
  });

  return JSON.stringify({ fileId: file.id, name: file.name, size: file.size });
}
