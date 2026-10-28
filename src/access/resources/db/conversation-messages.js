import { prisma } from "../../primitives/db.js";

const errLevel = "Error at resource level in access:";

export function createMessage(
  { sessionId, role, content, toolCallId = null, name = null },
  database = prisma,
) {
  try {
    return database.conversationMessage.create({
      data: { sessionId, role, content, toolCallId, name },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function createMessages(rows, database = prisma) {
  try {
    return database.conversationMessage.createMany({ data: rows });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function allMessagesBySession(sessionId, database = prisma) {
  try {
    return database.conversationMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}
