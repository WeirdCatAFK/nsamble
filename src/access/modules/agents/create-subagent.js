import { prisma } from "../../primitives/db.js";
import { createAgentRun } from "../../resources/agent-runs.js";
import {
  createConversationSession,
  findConversationSession,
} from "../../resources/conversation-sessions.js";
import {
  findActiveModelById,
  findActiveModelBySlug,
} from "../../resources/models.js";

export class SubagentError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "SubagentError";
    this.code = code;
  }
}

export async function createSubagent({
  userId,
  projectId,
  parentSessionId,
  role,
  input,
  modelSlug,
}) {
  if (typeof role !== "string" || role.trim().length === 0) {
    throw new SubagentError("Role must be a non-empty string.", "EROLE");
  }

  return prisma.$transaction(async (database) => {
    const parentSession = await findConversationSession(
      { id: parentSessionId, userId, projectId },
      database,
    );

    if (!parentSession) {
      throw new SubagentError("Parent session was not found.", "ESESSION");
    }

    if (parentSession.endedAt) {
      throw new SubagentError("Parent session has ended.", "ESESSIONENDED");
    }

    const model = modelSlug
      ? await findActiveModelBySlug(modelSlug, database)
      : await findActiveModelById(parentSession.modelId, database);

    if (!model) {
      throw new SubagentError("Selected model is not active.", "EMODEL");
    }

    const childSession = await createConversationSession(
      {
        userId,
        projectId,
        modelId: model.id,
        parentSessionId: parentSession.id,
        kind: "SUBAGENT",
      },
      database,
    );

    const agentRun = await createAgentRun(
      {
        userId,
        projectId,
        parentSessionId: parentSession.id,
        childSessionId: childSession.id,
        role: role.trim(),
        input,
      },
      database,
    );

    return { agentRun, childSession };
  });
}
