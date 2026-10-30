import { createSubagent } from "../../access/modules/agents/create-subagent.js";
import { runSubagent } from "../../access/modules/agents/run-subagent.js";
import { getAgentContext, setAgentContext } from "../context.js";

export const name = "delegate_to_agent";

export const description =
  "Delegate a task to a specialist agent. " +
  "Available roles: geometry-generator, electronics-designer, prototype-engineer, dfm-reviewer, assembly-planner, cost-estimator, laser-prep, sge-writer. " +
  "Pass a clear task description as input. The agent runs to completion and returns its output.";

export const parameters = {
  type: "object",
  properties: {
    role: {
      type: "string",
      description: "The specialist role to delegate to.",
    },
    input: {
      type: "string",
      description: "Task description and context for the specialist.",
    },
    modelSlug: {
      type: "string",
      description: "Model to use for the subagent. Defaults to the parent session model.",
    },
  },
  required: ["role", "input"],
  additionalProperties: false,
};

export async function execute({ role, input, modelSlug }) {
  const ctx = getAgentContext();
  if (!ctx) {
    return JSON.stringify({ error: "Agent context was not set." });
  }

  const { userId, projectId, parentSessionId } = ctx;

  const { agentRun } = await createSubagent({
    userId,
    projectId,
    parentSessionId,
    role,
    input,
    modelSlug,
  });

  const result = await runSubagent({
    agentRunId: agentRun.id,
    userId,
    projectId,
  });

  return JSON.stringify({
    role,
    status: result.agentRun.status,
    output: result.output,
  });
}
