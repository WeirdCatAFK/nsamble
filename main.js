import { createApi } from "./src/api.js";
import { prisma } from "./src/access/primitives/db.js";
import { closeStorage, openStorage } from "./src/access/primitives/minio.js";
import { env, requireEnvironment } from "./src/env.js";

requireEnvironment(
  "DATABASE_URL",
  "MINIO_ENDPOINT",
  "MINIO_ROOT_USER",
  "MINIO_ROOT_PASSWORD",
  "MINIO_DOCUMENTS_BUCKET",
);

const app = createApi();
let server;

await prisma.$connect();

try {
  await openStorage();
  server = await new Promise((resolve, reject) => {
    const httpServer = app.listen(env.server.port, env.server.host, () => {
      resolve(httpServer);
    });
    httpServer.once("error", reject);
  });
} catch (error) {
  closeStorage();
  await prisma.$disconnect();
  throw error;
}

console.log(`API listening on http://${env.server.host}:${env.server.port}`);

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down.`);

  try {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  } finally {
    closeStorage();
    await prisma.$disconnect();
  }
}

function handleSignal(signal) {
  void shutdown(signal).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

process.once("SIGINT", () => handleSignal("SIGINT"));
process.once("SIGTERM", () => handleSignal("SIGTERM"));
