import { prisma } from "../primitives/db.js";

function pageSize(take) {
  if (!Number.isSafeInteger(take) || take < 1 || take > 100) {
    throw new Error("take must be an integer from 1 to 100.");
  }

  return take;
}

export function createFile(data, database = prisma) {
  return database.file.create({ data });
}

export function findFile({ id, userId, projectId }, database = prisma) {
  return database.file.findFirst({
    where: { id, userId, projectId },
  });
}

export function listFiles({ userId, projectId, cursor, take = 25 }, database = prisma) {
  return database.file.findMany({
    where: { userId, projectId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize(take),
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });
}

export function searchFiles(
  { userId, projectId, query, cursor, take = 25 },
  database = prisma,
) {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("query must be a non-empty string.");
  }

  const term = query.trim();

  return database.file.findMany({
    where: {
      userId,
      projectId,
      name: { contains: term, mode: "insensitive" },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize(take),
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });
}

export async function updateFile({ id, userId, projectId, data }, database = prisma) {
  const update = {};

  if (typeof data.name === "string") update.name = data.name;
  if (data.mimeType === null || typeof data.mimeType === "string") {
    update.mimeType = data.mimeType;
  }

  if (Object.keys(update).length === 0) {
    throw new Error("Only name and mimeType can be updated.");
  }

  const updated = await database.file.updateMany({
    where: { id, userId, projectId },
    data: update,
  });

  if (updated.count === 0) return null;
  return findFile({ id, userId, projectId }, database);
}

export async function deleteFile({ id, userId, projectId }, database = prisma) {
  const file = await findFile({ id, userId, projectId }, database);
  if (!file) return null;
  return database.file.delete({ where: { id } });
}

export function countFilesByHash(contentHash, database = prisma) {
  return database.file.count({ where: { contentHash } });
}
