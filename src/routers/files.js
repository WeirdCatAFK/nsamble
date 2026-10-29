import { Router } from "express";
import multer from "multer";
import { getFile, getFileContent, uploadFile } from "../access/modules/common/files.js";
import { listFiles } from "../access/resources/db/files.js";
import { createPart, listParts } from "../access/resources/db/parts.js";
import { parseBoundingBox } from "../access/modules/common/stl-dimensions.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.get(
  "/api/projects/:projectId/files",
  async (request, response, next) => {
    try {
      const files = await listFiles({
        userId: request.user.id,
        projectId: request.params.projectId,
      });

      response.json(files);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/api/projects/:projectId/files/:id",
  async (request, response, next) => {
    try {
      const file = await getFile({
        id: request.params.id,
        userId: request.user.id,
        projectId: request.params.projectId,
      });

      response.json(file);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/api/projects/:projectId/files/:id/content",
  async (request, response, next) => {
    try {
      const { file, stream, size } = await getFileContent({
        id: request.params.id,
        userId: request.user.id,
        projectId: request.params.projectId,
      });

      response.set("Content-Type", file.mimeType ?? "application/octet-stream");
      response.set("Content-Length", String(size));
      response.set(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(file.name)}"`,
      );

      stream.pipe(response);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/api/projects/:projectId/parts",
  async (request, response, next) => {
    try {
      const parts = await listParts({ projectId: request.params.projectId });
      response.json(parts);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/api/projects/:projectId/files/upload",
  upload.single("file"),
  async (request, response, next) => {
    try {
      if (!request.file) {
        return response.status(400).json({ error: "No file provided." });
      }

      const { projectId } = request.params;
      const buffer = request.file.buffer;
      const name = request.file.originalname;
      const mimeType = request.file.mimetype || "application/octet-stream";

      const file = await uploadFile({
        userId: request.user.id,
        projectId,
        name,
        mimeType,
        source: buffer,
      });

      const result = { file };

      if (name.toLowerCase().endsWith(".stl")) {
        result.dimensions = parseBoundingBox(buffer);
      }

      if (request.query.createPart === "true" && result.dimensions) {
        result.part = await createPart({
          projectId,
          name: name.replace(/\.stl$/i, ""),
          manufacturingMethod: "scanned",
          specification: result.dimensions,
        });
      }

      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
