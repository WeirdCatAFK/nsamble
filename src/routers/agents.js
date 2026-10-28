import { Router } from "express";
import { createSubagent } from "../access/modules/agents/create-subagent.js";
import { runSubagent } from "../access/modules/agents/run-subagent.js";

const router = Router();

router.post(
  "/api/projects/:projectId/agents/run",
  async (request, response, next) => {
    try {
      const { role, input, parentSessionId, modelSlug } = request.body;

      if (!role || typeof role !== "string") {
        return response.status(400).json({ error: "role is required." });
      }

      if (!input) {
        return response.status(400).json({ error: "input is required." });
      }

      if (!parentSessionId || typeof parentSessionId !== "string") {
        return response.status(400).json({ error: "parentSessionId is required." });
      }

      const userId = request.user.id;
      const projectId = request.params.projectId;

      const { agentRun } = await createSubagent({
        userId,
        projectId,
        parentSessionId,
        role,
        input,
        modelSlug,
      });

      const result = await runSubagent({
        agentRunId: agentRun.id,
        userId,
        projectId,
      });

      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
