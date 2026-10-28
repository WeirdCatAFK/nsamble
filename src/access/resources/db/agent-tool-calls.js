import { prisma } from "../../primitives/db.js";

const errLevel = "Error at resource level in access:";

export function createAgentToolCall(data, database = prisma) {
  try {
    return database.agentToolCall.create({ data });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function completeAgentToolCall({ id, data }, database = prisma) {
  try {
    return database.agentToolCall.update({
      where: { id },
      data: {
        ...data,
        status: "SUCCEEDED",
        completedAt: new Date(),
      },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function failAgentToolCall({ id, error }, database = prisma) {
  try {
    return database.agentToolCall.update({
      where: { id },
      data: {
        status: "FAILED",
        error,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function createSearchSources({ toolCallId, sources }, database = prisma) {
  try {
    return database.searchSource.createMany({
      data: sources.map((source) => ({ ...source, toolCallId })),
      skipDuplicates: true,
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}
