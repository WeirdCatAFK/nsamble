import { Router } from "express";
import {
  startConversation,
  sendConversationInput,
} from "../access/modules/common/model-conversations.js";
import { allMessagesBySession } from "../access/resources/db/conversation-messages.js";
import { listSessionsByProject } from "../access/resources/db/conversation-sessions.js";
import { buildAllTools, getAllToolExecutors } from "../agents/registry.js";
import { setAgentContext, getAgentContext } from "../agents/context.js";

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
      const { message, attachments } = request.body;
      const files = attachments ?? [];

      if (
        !Array.isArray(files) ||
        files.some((item) => !item || typeof item.fileId !== "string")
      ) {
        return response.status(400).json({ error: "attachments must be a list of { fileId }." });
      }

      const text = typeof message === "string" ? message : "";

      if (!text.trim() && files.length === 0) {
        return response.status(400).json({ error: "message or attachments required." });
      }

      const attachmentIds = files.map((item) => item.fileId);

      const wantsStream = request.headers.accept === "text/event-stream";

      setAgentContext({
        userId: request.user.id,
        projectId: request.params.projectId,
        parentSessionId: request.params.sessionId,
      });

      const tools = await buildAllTools();
      const toolExecutors = await getAllToolExecutors();

      if (wantsStream) {
        response.setHeader("Content-Type", "text/event-stream");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Connection", "keep-alive");
        response.flushHeaders();

        const onEvent = (event) => {
          response.write(`data: ${JSON.stringify(event)}\n\n`);
        };

        getAgentContext().onEvent = onEvent;

        const result = await sendConversationInput({
          userId: request.user.id,
          projectId: request.params.projectId,
          sessionId: request.params.sessionId,
          input: text,
          attachments: attachmentIds,
          tools,
          toolExecutors,
          onEvent,
        });

        response.write(`data: ${JSON.stringify({ type: "done", ...result })}\n\n`);
        response.end();
      } else {
        const result = await sendConversationInput({
          userId: request.user.id,
          projectId: request.params.projectId,
          sessionId: request.params.sessionId,
          input: text,
          attachments: attachmentIds,
          tools,
          toolExecutors,
        });

        response.json(result);
      }
    } catch (error) {
      if (response.headersSent) {
        response.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
        response.end();
      } else {
        next(error);
      }
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
