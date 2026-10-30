import { prisma } from "../../primitives/db.js";

const errLevel = "Error at resource level in access:";

function pageSize(take) {
  try {
    if (!Number.isSafeInteger(take) || take < 1 || take > 100) {
      throw new Error("take must be an integer from 1 to 100.");
    }

    return take;
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function createFile(data, database = prisma) {
  try {
    return database.file.create({ data });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function findFile({ id, userId, projectId }, database = prisma) {
  try {
    return database.file.findFirst({
      where: { id, userId, projectId },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function listFiles(
  { userId, projectId, cursor, take = 25 },
  database = prisma,
) {
  try {
    return database.file.findMany({
      where: { userId, projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize(take),
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function searchFiles(
  { userId, projectId, query, cursor, take = 25 },
  database = prisma,
) {
  try {
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
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function updateFileRecord(
  { id, userId, projectId, data },
  database = prisma,
) {
  try {
    const update = {};

    if (typeof data.name === "string") update.name = data.name;
    if (data.mimeType === null || typeof data.mimeType === "string") {
      update.mimeType = data.mimeType;
    }

    if (Object.keys(update).length === 0) {
      throw new Error("Only name and mimeType can be updated.");
    }

    return database.file.updateMany({
      where: { id, userId, projectId },
      data: update,
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function deleteFileRecord({ id }, database = prisma) {
  try {
    return database.file.deleteMany({ where: { id } });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function countFilesByHash(contentHash, database = prisma) {
  try {
    return database.file.count({ where: { contentHash } });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function listFileHashesByProject({ projectId }, database = prisma) {
  try {
    return database.file.findMany({
      where: { projectId },
      select: { contentHash: true },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export function deleteFilesByProject({ projectId }, database = prisma) {
  try {
    return database.file.deleteMany({ where: { projectId } });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}
