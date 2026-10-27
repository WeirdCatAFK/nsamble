import { Router } from "express";
import { checkHealth } from "../access/modules/common/health.js";

const router = Router();

router.get("/health", async (_request, response, next) => {
  try {
    const result = await checkHealth();
    response.status(result.healthy ? 200 : 503).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
