import { Router } from "express";
import multer from "multer";
import { env } from "../env.js";
import { uploadFile } from "../access/modules/common/files.js";
import { createPart } from "../access/resources/db/parts.js";
import { parseBoundingBox } from "../access/modules/common/stl-dimensions.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

router.post(
  "/api/projects/:projectId/scans",
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "calibration", maxCount: 1 },
  ]),
  async (request, response, next) => {
    try {
      const videoFile = request.files?.video?.[0];
      if (!videoFile) {
        return response.status(400).json({ error: "No video file provided." });
      }

      const form = new FormData();
      form.append("video", new Blob([videoFile.buffer]), videoFile.originalname);

      const calFile = request.files?.calibration?.[0];
      if (calFile) {
        form.append("calibration", new Blob([calFile.buffer]), "calibration.json");
      }

      const scannerResponse = await fetch(`${env.scanner.url}/scans`, {
        method: "POST",
        body: form,
      });

      if (!scannerResponse.ok) {
        const err = await scannerResponse.json().catch(() => ({}));
        return response.status(502).json({ error: err.detail || "Scanner service error." });
      }

      const scan = await scannerResponse.json();
      response.status(202).json({
        scanId: scan.id,
        status: scan.status,
        projectId: request.params.projectId,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/api/projects/:projectId/scans/:scanId",
  async (request, response, next) => {
    try {
      const scannerResponse = await fetch(
        `${env.scanner.url}/scans/${request.params.scanId}`,
      );

      if (!scannerResponse.ok) {
        return response.status(scannerResponse.status).json({ error: "Scan not found." });
      }

      const scan = await scannerResponse.json();
      response.json(scan);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/api/projects/:projectId/scans/:scanId/import",
  async (request, response, next) => {
    try {
      const { projectId, scanId } = request.params;

      const statusResponse = await fetch(`${env.scanner.url}/scans/${scanId}`);
      if (!statusResponse.ok) {
        return response.status(404).json({ error: "Scan not found." });
      }
      const status = await statusResponse.json();
      if (status.status !== "done") {
        return response.status(400).json({ error: `Scan not ready. Status: ${status.status}` });
      }

      const modelResponse = await fetch(`${env.scanner.url}/scans/${scanId}/model`);
      if (!modelResponse.ok) {
        return response.status(502).json({ error: "Failed to retrieve model from scanner." });
      }

      const buffer = Buffer.from(await modelResponse.arrayBuffer());
      const name = request.body?.name || "scanned_part.stl";

      const file = await uploadFile({
        userId: request.user.id,
        projectId,
        name,
        mimeType: "model/stl",
        source: buffer,
      });

      const dimensions = parseBoundingBox(buffer);

      const part = await createPart({
        projectId,
        name: name.replace(/\.stl$/i, ""),
        manufacturingMethod: "scanned",
        specification: dimensions,
      });

      response.status(201).json({ file, part, dimensions });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
