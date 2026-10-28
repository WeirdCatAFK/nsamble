import {
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env, requireEnvironment } from "../../env.js";

const errLevel = "Error at primitive level in access:";

let client = null;
let bucket = null;

function isNotFound(error) {
  return (
    ["NotFound", "NoSuchKey", "NoSuchBucket"].includes(error?.name) ||
    error?.$metadata?.httpStatusCode === 404
  );
}

export async function openStorage() {
  if (client) return client;

  requireEnvironment(
    "MINIO_ENDPOINT",
    "MINIO_ROOT_USER",
    "MINIO_ROOT_PASSWORD",
    "MINIO_DOCUMENTS_BUCKET",
  );

  const candidate = new S3Client({
    endpoint: env.storage.endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: env.storage.accessKeyId,
      secretAccessKey: env.storage.secretAccessKey,
    },
    forcePathStyle: true,
  });

  try {
    await candidate.send(new HeadBucketCommand({ Bucket: env.storage.bucket }));
  } catch (cause) {
    candidate.destroy();
    const message = isNotFound(cause)
      ? `Bucket ${env.storage.bucket} does not exist.`
      : `MinIO at ${env.storage.endpoint} is not reachable: ${cause.message}`;
    throw new Error(errLevel + message, { cause });
  }

  client = candidate;
  bucket = env.storage.bucket;
  return client;
}

export function closeStorage() {
  try {
    if (client) {
      client.destroy();
      client = null;
      bucket = null;
    }
  } catch (error) {
    throw new Error("Error occurred while closing storage.", { cause: error });
  }
}

export function getStorage() {
  try {
    if (!client || !bucket) {
      throw new Error("Storage is not open.", { cause: new Error("Storage is not open.") });
    }
    return { client, bucket };
  } catch (error) {
    throw new Error("Error occurred while accessing storage.", { cause: error });
  }
}

export async function pingStorage() {
  try {
    const { client: s3, bucket: b } = getStorage();
    await s3.send(new HeadBucketCommand({ Bucket: b }));
  } catch (error) {
    throw new Error("Error occurred while pinging storage.", { cause: error });
  }
}

