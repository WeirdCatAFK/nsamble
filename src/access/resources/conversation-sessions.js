import { prisma } from "../primitives/db.js";

export function createConversationSession(
  { userId, projectId, modelId, parentSessionId = null, kind = "MAIN" },
  database = prisma,
) {
  return database.conversationSession.create({
    data: { userId, projectId, modelId, parentSessionId, kind },
    include: { model: true },
  });
}

export function findConversationSession(
  { id, userId, projectId },
  database = prisma,
) {
  return database.conversationSession.findFirst({
    where: { id, userId, projectId },
    include: { model: true },
  });
}

export function advanceConversationSession(
  { id, userId, projectId, expectedUpdatedAt, previousResponseId },
  database = prisma,
) {
  return database.conversationSession.updateMany({
    where: { id, userId, projectId, endedAt: null, updatedAt: expectedUpdatedAt },
    data: { previousResponseId },
  });
}

export function endConversationSession({ id, userId, projectId }, database = prisma) {
  return database.conversationSession.updateMany({
    where: { id, userId, projectId, endedAt: null },
    data: { endedAt: new Date() },
  });
}
