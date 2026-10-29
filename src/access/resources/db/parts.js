import { prisma } from "../../primitives/db.js";

const errLevel = "Error at resource level in access:";

export function createPart(data, database = prisma) {
  try {
    return database.projectPart.create({ data });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}

export function listParts({ projectId }, database = prisma) {
  try {
    return database.projectPart.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}

export function findPart({ id, projectId }, database = prisma) {
  try {
    return database.projectPart.findFirst({
      where: { id, projectId },
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}
