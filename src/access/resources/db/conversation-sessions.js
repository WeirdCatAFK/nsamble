import { prisma } from "../../primitives/db.js";

const errLevel = "Error at resource level in access:";

export function createConversationSession(
  { userId, projectId, modelId, parentSessionId = null, kind = "MAIN" },
  database = prisma,
) {
  try {
    return database.conversationSession.create({
      data: { userId, projectId, modelId, parentSessionId, kind },
      include: { model: true },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function listSessionsByProject(
  { userId, projectId, kind = "MAIN" },
  database = prisma,
) {
  try {
    return database.conversationSession.findMany({
      where: { userId, projectId, kind },
      orderBy: { updatedAt: "desc" },
      include: { model: true },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}

export function findConversationSession(
  { id, userId, projectId },
  database = prisma,
) {
  try {
    return database.conversationSession.findFirst({
      where: { id, userId, projectId },
      include: { model: true },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function advanceConversationSession(
  { id, userId, projectId, expectedUpdatedAt, previousResponseId },
  database = prisma,
) {
  try {
    return database.conversationSession.updateMany({
      where: {
        id,
        userId,
        projectId,
        endedAt: null,
        updatedAt: expectedUpdatedAt,
      },
      data: { previousResponseId },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function endConversationSession(
  { id, userId, projectId },
  database = prisma,
) {
  try {
    return database.conversationSession.updateMany({
      where: { id, userId, projectId, endedAt: null },
      data: { endedAt: new Date() },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}
