import { prisma } from "../../primitives/db.js";

const errLevel = "Error at resource level in access:";

export function createAgentRun(data, database = prisma) {
  try {
    return database.agentRun.create({ data });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function findAgentRun({ id, userId, projectId }, database = prisma) {
  try {
    return database.agentRun.findFirst({
      where: { id, userId, projectId },
      include: {
        parentSession: true,
        childSession: { include: { model: true } },
      },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function updateAgentRun({ id, data }, database = prisma) {
  try {
    return database.agentRun.update({ where: { id }, data });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}
