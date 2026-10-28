import { createHash, randomUUID } from "node:crypto";
import { PassThrough, Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { env } from "../../../env.js";
import { StorageError, getStorage } from "../../primitives/minio.js";

const errLevel = "Error at resource level in access:";

const TMP_PREFIX = "tmp/";
const CONTENT_PREFIX = "content/";
const HASH_RE = /^[0-9a-f]{64}$/;

function contentKey(hash) {
  if (!HASH_RE.test(hash)) {
    throw new StorageError(`Invalid sha-256 hash: ${hash}`, "EBADHASH");
  }
  return `${CONTENT_PREFIX}${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}

function isNotFound(error) {
  return (
    ["NotFound", "NoSuchKey", "NoSuchBucket"].includes(error?.name) ||
    error?.$metadata?.httpStatusCode === 404
  );
}

function createMeter(maxBytes) {
  const digest = createHash("sha256");
  let size = 0;
  let failure = null;

  const stream = new Transform({
    transform(chunk, _encoding, done) {
      size += chunk.length;

      if (size > maxBytes) {
        failure = new StorageError(
          `Upload exceeds ${maxBytes} bytes.`,
          "ETOOLARGE",
        );
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

export async function putContent(
  source,
  { maxBytes = env.storage.maxUploadBytes } = {},
) {
  const { client: s3, bucket } = getStorage();
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
    throw (
      meter.failure() ?? new Error(errLevel + error.message, { cause: error })
    );
  } finally {
    await s3
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: tmpKey }))
      .catch(() => {});
  }
}

export async function readContent(hash) {
  const { client: s3, bucket } = getStorage();
  try {
    const response = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: contentKey(hash) }),
    );
    return { stream: response.Body, size: response.ContentLength };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export async function statContent(hash) {
  const { client: s3, bucket } = getStorage();
  try {
    const response = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: contentKey(hash) }),
    );
    return { size: response.ContentLength };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw new Error(errLevel + error.message, { cause: error });
  }
}

export async function deleteContent(hash) {
  const { client: s3, bucket } = getStorage();
  if (!(await statContent(hash))) return false;

  try {
    await s3.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: contentKey(hash) }),
    );
    return true;
  } catch (error) {
    throw new Error(errLevel + error.message, { cause: error });
  }
}
