import { Router } from "express";
import { findAllActiveModels } from "../access/resources/db/models.js";

const router = Router();

router.get("/api/models", async (_request, response, next) => {
  try {
    const models = await findAllActiveModels();
    response.json(models);
  } catch (error) {
    next(error);
  }
});

export default router;
