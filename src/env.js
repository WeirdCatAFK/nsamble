import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: resolve(projectRoot, ".env") });

function optional(name, fallback = undefined) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function positiveInteger(name, fallback) {
  const value = optional(name, String(fallback));
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export const env = Object.freeze({
  nodeEnv: optional("NODE_ENV", "development"),
  server: Object.freeze({
    host: optional("HOST", "0.0.0.0"),
    port: positiveInteger("PORT", 3000),
  }),
  auth: Object.freeze({
    jwtSecret: optional("JWT_SECRET"),
    tokenExpiresIn: optional("JWT_EXPIRES_IN", "24h"),
    googleClientId: optional("GOOGLE_CLIENT_ID"),
  }),
  database: Object.freeze({
    url: optional("DATABASE_URL"),
  }),
  storage: Object.freeze({
    endpoint: optional("MINIO_ENDPOINT"),
    accessKeyId: optional("MINIO_ROOT_USER"),
    secretAccessKey: optional("MINIO_ROOT_PASSWORD"),
    bucket: optional("MINIO_DOCUMENTS_BUCKET"),
    maxUploadBytes: positiveInteger("MAX_UPLOAD_BYTES", 536870912),
  }),
  modelProvider: Object.freeze({
    apiKey: optional("MODEL_API_KEY"),
    baseUrl: optional("MODEL_API_BASE_URL", "https://api.meta.ai/v1"),
  }),
  openscad: Object.freeze({
    url: optional("OPENSCAD_URL", "http://localhost:8080"),
  }),
  scanner: Object.freeze({
    url: optional("SCANNER_URL", "http://localhost:8000"),
  }),
});

export function requireEnvironment(...names) {
  const missing = names.filter((name) => !optional(name));

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
