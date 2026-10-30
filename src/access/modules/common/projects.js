import { prisma } from "../../primitives/db.js";
import {
  deleteProject as deleteProjectRecord,
  findProject,
} from "../../resources/db/projects.js";
import { deletePartsByProject } from "../../resources/db/parts.js";
import {
  countFilesByHash,
  deleteFilesByProject,
  listFileHashesByProject,
} from "../../resources/db/files.js";
import {
  deleteSessionsByIds,
  listAllSessionsByProject,
} from "../../resources/db/conversation-sessions.js";
import { deleteMessagesBySessions } from "../../resources/db/conversation-messages.js";
import { deleteAgentRunsByProject } from "../../resources/db/agent-runs.js";
import {
  deleteSearchSourcesByProject,
  deleteToolCallsByProject,
} from "../../resources/db/agent-tool-calls.js";
import { deleteModelUsageByProject } from "../../resources/db/model-usages.js";
import { deleteContent } from "../../resources/minio/files.js";

const errLevel = "Error at module level in access:";

export class ProjectNotFoundError extends Error {
  constructor() {
    super("Project was not found.");
    this.code = "PROJECT_NOT_FOUND";
    this.status = 404;
  }
}

export async function removeProject({ id, ownerId }) {
  try {
    const project = await findProject({ id, ownerId });
    if (!project) throw new ProjectNotFoundError();

    const hashes = await listFileHashesByProject({ projectId: id });

    await prisma.$transaction(async (database) => {
      await deleteSearchSourcesByProject({ projectId: id }, database);
      await deleteToolCallsByProject({ projectId: id }, database);
      await deleteModelUsageByProject({ projectId: id }, database);
      const sessions = await listAllSessionsByProject(
        { projectId: id },
        database,
      );
      const sessionIds = sessions.map((session) => session.id);
      if (sessionIds.length > 0) {
        await deleteMessagesBySessions({ sessionIds }, database);
      }
      await deleteFilesByProject({ projectId: id }, database);
      await deleteAgentRunsByProject({ projectId: id }, database);
      let remaining = sessions;
      while (remaining.length > 0) {
        const ids = new Set(remaining.map((session) => session.id));
        const leaves = remaining.filter(
          (session) =>
            !session.parentSessionId || !ids.has(session.parentSessionId),
        );
        const victims = leaves.length > 0 ? leaves : remaining;
        await deleteSessionsByIds(
          { ids: victims.map((session) => session.id) },
          database,
        );
        const gone = new Set(victims.map((session) => session.id));
        remaining = remaining.filter((session) => !gone.has(session.id));
      }
      await deletePartsByProject({ projectId: id }, database);
      await deleteProjectRecord({ id, ownerId }, database);
    });

    const uniqueHashes = new Set(hashes.map((row) => row.contentHash));
    for (const hash of uniqueHashes) {
      const refs = await countFilesByHash(hash);
      if (refs === 0) await deleteContent(hash).catch(() => {});
    }

    return { deleted: true };
  } catch (error) {
    if (error instanceof ProjectNotFoundError) throw error;
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}
