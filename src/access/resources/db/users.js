import { prisma } from "../../primitives/db.js";

const errLevel = "Error at resource level in access:";

export function findUserById(id, database = prisma) {
  try {
    return database.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export function findUserByEmail(email, database = prisma) {
  try {
    return database.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, passwordHash: true },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export function findUserByGoogleId(googleId, database = prisma) {
  try {
    return database.user.findUnique({
      where: { googleId },
      select: { id: true, email: true, name: true },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export function linkGoogleId({ userId, googleId }, database = prisma) {
  try {
    return database.user.update({
      where: { id: userId },
      data: { googleId },
      select: { id: true, email: true, name: true },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export function createUser({ email, name, passwordHash, googleId }, database = prisma) {
  try {
    return database.user.create({
      data: { email, name, passwordHash, googleId },
      select: { id: true, email: true, name: true },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export function findOrCreateDemoUser(database = prisma) {
  try {
    return database.user.upsert({
      where: { email: "demo@nsamble.local" },
      update: {},
      create: { email: "demo@nsamble.local", name: "Demo User" },
      select: { id: true, email: true, name: true },
    });
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}
