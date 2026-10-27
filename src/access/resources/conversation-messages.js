import { prisma } from "../primitives/db.js";

export function createMessage(
  { sessionId, role, content, toolCallId = null, name = null },
  database = prisma,
) {
  return database.conversationMessage.create({
    data: { sessionId, role, content, toolCallId, name },
  });
}

export function createMessages(rows, database = prisma) {
  return database.conversationMessage.createMany({ data: rows });
}

export function allMessagesBySession(sessionId, database = prisma) {
  return database.conversationMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
}
