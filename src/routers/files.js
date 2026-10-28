import { Router } from "express";
import { getFile, getFileContent } from "../access/modules/common/files.js";
import { listFiles } from "../access/resources/db/files.js";

const router = Router();

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

export default router;
