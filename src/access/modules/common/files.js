import {
  createFile,
  findFile,
  listFiles,
  searchFiles,
  updateFileRecord,
  deleteFileRecord,
  countFilesByHash,
} from "../../resources/db/files.js";
import {
  putContent,
  readContent,
  deleteContent,
} from "../../resources/minio/files.js";

const errLevel = "Error at module level in access:";

export async function uploadFile({ userId, projectId, name, mimeType, source, maxBytes }) {
  try {
    const stored = await putContent(source, maxBytes ? { maxBytes } : undefined);

    return createFile({
      userId,
      projectId,
      name,
      mimeType: mimeType ?? null,
      contentHash: stored.hash,
      size: stored.size,
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}

export async function getFile({ id, userId, projectId }) {
  try {
    const file = await findFile({ id, userId, projectId });
    if (!file) {
      throw new Error(errLevel + " File was not found.");
    }
    return file;
  } catch (error) {
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}

export async function getFileContent({ id, userId, projectId }) {
  try {
    const file = await getFile({ id, userId, projectId });
    const content = await readContent(file.contentHash);

    if (!content) {
      throw new Error(errLevel + " File content is missing from storage.");
    }

    return { file, ...content };
  } catch (error) {
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}

export { listFiles, searchFiles };

export async function updateFile({ id, userId, projectId, data }) {
  try {
    const updated = await updateFileRecord({ id, userId, projectId, data });

    if (updated.count === 0) {
      throw new Error(errLevel + " File was not found.");
    }

    return findFile({ id, userId, projectId });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}

export async function deleteFile({ id, userId, projectId }) {
  try {
    const file = await findFile({ id, userId, projectId });
    if (!file) {
      throw new Error(errLevel + " File was not found.");
    }

    await deleteFileRecord({ id });

    const remaining = await countFilesByHash(file.contentHash);
    if (remaining === 0) {
      await deleteContent(file.contentHash);
    }

    return file;
  } catch (error) {
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}
