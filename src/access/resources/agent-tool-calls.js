import { prisma } from "../primitives/db.js";

export function createAgentToolCall(data, database = prisma) {
  return database.agentToolCall.create({ data });
}

export function completeAgentToolCall({ id, data }, database = prisma) {
  return database.agentToolCall.update({
    where: { id },
    data: {
      ...data,
      status: "SUCCEEDED",
      completedAt: new Date(),
    },
  });
}

export function failAgentToolCall({ id, error }, database = prisma) {
  return database.agentToolCall.update({
    where: { id },
    data: {
      status: "FAILED",
      error,
      completedAt: new Date(),
    },
  });
}

export function createSearchSources({ toolCallId, sources }, database = prisma) {
  return database.searchSource.createMany({
    data: sources.map((source) => ({ ...source, toolCallId })),
    skipDuplicates: true,
  });
}
