import { Router } from "express";
import {
  startConversation,
  sendConversationInput,
} from "../access/modules/common/model-conversations.js";
import { allMessagesBySession } from "../access/resources/db/conversation-messages.js";
import { listSessionsByProject } from "../access/resources/db/conversation-sessions.js";
import { buildAllTools, getAllToolExecutors } from "../agents/registry.js";
import { setAgentContext } from "../agents/context.js";

const router = Router();

router.get(
  "/api/projects/:projectId/conversations",
  async (request, response, next) => {
    try {
      const sessions = await listSessionsByProject({
        userId: request.user.id,
        projectId: request.params.projectId,
      });
      response.json(sessions);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/api/projects/:projectId/conversations",
  async (request, response, next) => {
    try {
      const { modelSlug } = request.body;

      if (!modelSlug || typeof modelSlug !== "string") {
        return response.status(400).json({ error: "modelSlug is required." });
      }

      const session = await startConversation({
        userId: request.user.id,
        projectId: request.params.projectId,
        modelSlug,
      });

      response.status(201).json(session);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/api/projects/:projectId/conversations/:sessionId/messages",
  async (request, response, next) => {
    try {
      const { message } = request.body;

      if (!message || typeof message !== "string") {
        return response.status(400).json({ error: "message is required." });
      }

      setAgentContext({
        userId: request.user.id,
        projectId: request.params.projectId,
        parentSessionId: request.params.sessionId,
      });

      const tools = await buildAllTools();
      const toolExecutors = await getAllToolExecutors();

      const result = await sendConversationInput({
        userId: request.user.id,
        projectId: request.params.projectId,
        sessionId: request.params.sessionId,
        input: message,
        tools,
        toolExecutors,
      });

      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/api/projects/:projectId/conversations/:sessionId/messages",
  async (request, response, next) => {
    try {
      const messages = await allMessagesBySession(request.params.sessionId);
      response.json(messages);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
