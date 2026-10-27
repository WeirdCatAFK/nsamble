import { createHash, randomUUID } from "node:crypto";
import { PassThrough, Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { env, requireEnvironment } from "../../env.js";

const TMP_PREFIX = "tmp/";
const CONTENT_PREFIX = "content/";
const HASH_RE = /^[0-9a-f]{64}$/;

export class StorageError extends Error {
  constructor(message, code, options) {
    super(message, options);
    this.name = "StorageError";
    this.code = code;
  }
}

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
    throw new StorageError(message, isNotFound(cause) ? "ENOBUCKET" : "EUNREACHABLE", {
      cause,
    });
  }

  client = candidate;
  bucket = env.storage.bucket;
  return client;
}

export function closeStorage() {
  client?.destroy();
  client = null;
  bucket = null;
}

function getClient() {
  if (!client) {
    throw new StorageError("Storage is not open.", "ECLOSED");
  }

  return client;
}

function contentKey(hash) {
  if (!HASH_RE.test(hash)) {
    throw new StorageError(`Invalid sha-256 hash: ${hash}`, "EBADHASH");
  }

  return `${CONTENT_PREFIX}${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}

function createMeter(maxBytes) {
  const digest = createHash("sha256");
  let size = 0;
  let failure = null;

  const stream = new Transform({
    transform(chunk, _encoding, done) {
      size += chunk.length;

      if (size > maxBytes) {
        failure = new StorageError(`Upload exceeds ${maxBytes} bytes.`, "ETOOLARGE");
        done(failure);
        return;
      }

      digest.update(chunk);
      done(null, chunk);
    },
  });

  return {
    stream,
    failure: () => failure,
    result: () => ({ hash: digest.digest("hex"), size }),
  };
}

function asStorageError(error) {
  if (error instanceof StorageError) return error;
  return new StorageError(`Storage operation failed: ${error.message}`, "EIO", {
    cause: error,
  });
}

export async function pingStorage() {
  await getClient().send(new HeadBucketCommand({ Bucket: bucket }));
}

export async function putContent(source, { maxBytes = env.storage.maxUploadBytes } = {}) {
  const s3 = getClient();
  const tmpKey = `${TMP_PREFIX}${randomUUID()}`;
  const readable =
    Buffer.isBuffer(source) || typeof source === "string"
      ? Readable.from([Buffer.from(source)])
      : source;
  const meter = createMeter(maxBytes);
  const body = new PassThrough();
  const streamDone = pipeline(readable, meter.stream, body);

  try {
    await Promise.all([
      new Upload({
        client: s3,
        params: { Bucket: bucket, Key: tmpKey, Body: body },
      }).done(),
      streamDone,
    ]);

    const { hash, size } = meter.result();
    const key = contentKey(hash);
    const existed = (await statContent(hash)) !== null;

    if (!existed) {
      await s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: key,
          CopySource: `${bucket}/${tmpKey}`,
        }),
      );
    }

    return { hash, size, existed };
  } catch (error) {
    await streamDone.catch(() => {});
    throw meter.failure() ?? asStorageError(error);
  } finally {
    await s3
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: tmpKey }))
      .catch(() => {});
  }
}

export async function readContent(hash) {
  try {
    const response = await getClient().send(
      new GetObjectCommand({ Bucket: bucket, Key: contentKey(hash) }),
    );
    return { stream: response.Body, size: response.ContentLength };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw asStorageError(error);
  }
}

export async function statContent(hash) {
  try {
    const response = await getClient().send(
      new HeadObjectCommand({ Bucket: bucket, Key: contentKey(hash) }),
    );
    return { size: response.ContentLength };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw asStorageError(error);
  }
}

export async function deleteContent(hash) {
  if (!(await statContent(hash))) return false;

  try {
    await getClient().send(
      new DeleteObjectCommand({ Bucket: bucket, Key: contentKey(hash) }),
    );
    return true;
  } catch (error) {
    throw asStorageError(error);
  }
}
