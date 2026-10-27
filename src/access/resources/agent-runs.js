import { prisma } from "../primitives/db.js";

export function createAgentRun(data, database = prisma) {
  return database.agentRun.create({ data });
}

export function findAgentRun({ id, userId, projectId }, database = prisma) {
  return database.agentRun.findFirst({
    where: { id, userId, projectId },
    include: {
      parentSession: true,
      childSession: { include: { model: true } },
    },
  });
}

export function updateAgentRun({ id, data }, database = prisma) {
  return database.agentRun.update({ where: { id }, data });
}
