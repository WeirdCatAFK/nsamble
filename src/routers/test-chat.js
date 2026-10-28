import { Router } from "express";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../access/primitives/db.js";
import { upsertModel } from "../access/resources/db/models.js";
import {
  startConversation,
  sendConversationInput,
} from "../access/modules/common/model-conversations.js";
import { createSubagent } from "../access/modules/agents/create-subagent.js";
import { runSubagent } from "../access/modules/agents/run-subagent.js";
import { allMessagesBySession } from "../access/resources/db/conversation-messages.js";
import { buildAllTools, getAllToolExecutors } from "../agents/registry.js";

const baseDir = dirname(fileURLToPath(import.meta.url));
const router = Router();

let testUser = null;

async function getTestUser() {
  if (testUser) return testUser;
  testUser = await prisma.user.upsert({
    where: { email: "test@nsamble.local" },
    create: { email: "test@nsamble.local", name: "Test User" },
    update: {},
  });
  return testUser;
}

router.get("/test-chat", async (_request, response) => {
  const html = await readFile(
    resolve(baseDir, "../../public/test-chat.html"),
    "utf8",
  );
  response.type("html").send(html);
});

router.post("/api/test/setup", async (_request, response, next) => {
  try {
    const user = await getTestUser();

    const modelsFile = await readFile(
      resolve(baseDir, "../../models.json"),
      "utf8",
    ).catch(() => null);

    if (modelsFile) {
      const models = JSON.parse(modelsFile);
      for (const [slug, prices] of Object.entries(models)) {
        await upsertModel({ slug, provider: "meta", prices });
      }
    }

    const project = await prisma.project.create({
      data: {
        ownerId: user.id,
        name: `Test ${Date.now()}`,
        description: "Test chat project.",
      },
    });

    const session = await startConversation({
      userId: user.id,
      projectId: project.id,
      modelSlug: "muse-spark-1.3",
    });

    response.json({
      userId: user.id,
      projectId: project.id,
      sessionId: session.id,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/api/test/chat", async (request, response, next) => {
  try {
    const { userId, projectId, sessionId, message } = request.body;
    const tools = await buildAllTools();
    const toolExecutors = await getAllToolExecutors();
    const result = await sendConversationInput({
      userId,
      projectId,
      sessionId,
      input: message,
      tools,
      toolExecutors,
    });
    response.json({ text: result.text, usage: result.usage });
  } catch (error) {
    next(error);
  }
});

router.post("/api/test/subagent", async (request, response, next) => {
  try {
    const { userId, projectId, sessionId, role, input } = request.body;

    const { agentRun } = await createSubagent({
      userId,
      projectId,
      parentSessionId: sessionId,
      role,
      input,
    });

    const result = await runSubagent({
      agentRunId: agentRun.id,
      userId,
      projectId,
    });

    const messages = await allMessagesBySession(
      agentRun.childSessionId,
    );

    response.json({
      agentRunId: agentRun.id,
      status: result.agentRun.status,
      output: result.output,
      messageCount: messages.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
