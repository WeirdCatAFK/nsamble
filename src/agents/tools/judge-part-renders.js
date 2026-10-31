/** Judge compile preview renders against the frozen spec dims. */
import { createSubagent } from "../../access/modules/agents/create-subagent.js";
import { runVisionJudge } from "../../access/modules/agents/run-vision-judge.js";
import { getAgentContext } from "../context.js";

export const name = "judge_part_renders";

export const description =
  "Judge the preview renders of one compiled part against its spec dims and mesh facts. " +
  "Pass the part name, the spec text, the measured mesh facts, and the PNG preview file IDs. " +
  "Returns the vision verdict with errors that block approval and warnings that do not.";

export const parameters = {
  type: "object",
  properties: {
    partName: {
      type: "string",
      description: "Part name from the frozen spec.",
    },
    spec: {
      type: "string",
      description: "Spec dims and features for this part.",
    },
    measurements: {
      type: "string",
      description: "Measured mesh facts from compile output.",
    },
    pngFileIds: {
      type: "array",
      items: { type: "string" },
      description: "Preview PNG file IDs to judge.",
    },
    modelSlug: {
      type: "string",
      description: "Model for the judge. Defaults to the parent session model.",
    },
  },
  required: ["partName", "spec", "pngFileIds"],
  additionalProperties: false,
};

export async function execute({ partName, spec, measurements = "", pngFileIds, modelSlug }) {
  const ctx = getAgentContext();
  if (!ctx) {
    return JSON.stringify({ error: "Agent context was not set." });
  }

  const { userId, projectId, parentSessionId } = ctx;
  const text = `Part: ${partName}\nSpec: ${spec}\nMeasured mesh facts: ${measurements || "none"}\nJudge the preview renders.`;

  const { agentRun } = await createSubagent({
    userId,
    projectId,
    parentSessionId,
    role: "vision-judge",
    input: { text, fileIds: pngFileIds },
    modelSlug,
  });

  const result = await runVisionJudge({ agentRunId: agentRun.id, userId, projectId });

  return JSON.stringify({
    role: "vision-judge",
    status: result.agentRun.status,
    output: result.output,
  });
}
