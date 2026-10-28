import { prisma } from "../../primitives/db.js";

const errLevel = "Error at resource level in access:";

export function createProject({ ownerId, name, description }, database = prisma) {
  try {
    return database.project.create({
      data: { ownerId, name, description },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export function findProject({ id, ownerId }, database = prisma) {
  try {
    return database.project.findFirst({
      where: { id, ownerId },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export function listProjects({ ownerId }, database = prisma) {
  try {
    return database.project.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}
