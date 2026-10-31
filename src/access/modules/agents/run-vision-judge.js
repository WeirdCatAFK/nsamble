import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../primitives/db.js";
import { createToolResponse } from "../../primitives/model-provider.js";
import { findAgentRun, updateAgentRun } from "../../resources/db/agent-runs.js";
import { createMessage } from "../../resources/db/conversation-messages.js";
import { advanceConversationSession } from "../../resources/db/conversation-sessions.js";
import { findFile } from "../../resources/db/files.js";
import { readContent } from "../../resources/minio/files.js";
import { createModelUsage } from "../../resources/db/model-usages.js";
import { loadRole } from "../../../agents/registry.js";

const errLevel = "Error at module level in access:";
const MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024;

export class VisionJudgeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "VisionJudgeError";
    this.code = code;
  }
}

async function loadImageParts({ userId, projectId, fileIds }) {
  const parts = [];
  for (const fileId of fileIds) {
    const file = await findFile({ id: fileId, userId, projectId });
    if (!file) {
      throw new VisionJudgeError("Preview file was not found.", "EATTACHMENT");
    }
    if (!file.mimeType?.startsWith("image/")) {
      throw new VisionJudgeError("Only image previews are supported.", "EATTACHMENT");
    }
    if (file.size > MAX_INLINE_IMAGE_BYTES) {
      throw new VisionJudgeError("Preview image is too large.", "EATTACHMENT");
    }
    const content = await readContent(file.contentHash);
    if (!content) {
      throw new VisionJudgeError("Preview file content is missing.", "EATTACHMENT");
    }
    const chunks = [];
    for await (const chunk of content.stream) chunks.push(chunk);
    parts.push({
      type: "input_image",
      image_url: `data:${file.mimeType};base64,${Buffer.concat(chunks).toString("base64")}`,
      detail: "auto",
    });
  }
  return parts;
}

function extractOutputText(output) {
  for (const item of output ?? []) {
    if (item.type === "message") {
      for (const block of item.content) {
        if (block.type === "output_text") return block.text;
      }
    }
  }
  return null;
}

export async function runVisionJudge({ agentRunId, userId, projectId }) {
  try {
    const agentRun = await findAgentRun({ id: agentRunId, userId, projectId });

    if (!agentRun) {
      throw new VisionJudgeError("Agent run was not found.", "ENOTFOUND");
    }

    if (agentRun.status !== "QUEUED") {
      throw new VisionJudgeError(
        `Agent run status is ${agentRun.status}, expected QUEUED.`,
        "ESTATUS",
      );
    }

    const session = agentRun.childSession;
    const model = session.model;
    const input = agentRun.input ?? {};
    const text = typeof input === "string" ? input : (input.text ?? "");
    const fileIds = Array.isArray(input.fileIds) ? input.fileIds : [];

    if (fileIds.length === 0) {
      throw new VisionJudgeError("At least one preview file ID is required.", "EINPUT");
    }

    await updateAgentRun({
      id: agentRun.id,
      data: { status: "RUNNING", startedAt: new Date() },
    });

    try {
      const role = await loadRole(agentRun.role);
      const imageParts = await loadImageParts({ userId, projectId, fileIds });

      await createMessage({
        sessionId: session.id,
        role: "USER",
        content: { text, previewFileIds: fileIds },
      });

      const response = await createToolResponse({
        model: model.slug,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text }, ...imageParts],
          },
        ],
        previousResponseId: session.previousResponseId,
        tools: [],
        instructions: role.systemPrompt,
      });

      const usage = response.usage ?? {};
      const inputTokens = usage.input_tokens ?? 0;
      const cachedInputTokens = usage.input_tokens_details?.cached_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      const million = new Prisma.Decimal(1_000_000);
      const inputPricePerMillion = new Prisma.Decimal(model.inputPricePerMillion);
      const cachedInputPricePerMillion = new Prisma.Decimal(model.cachedInputPricePerMillion);
      const outputPricePerMillion = new Prisma.Decimal(model.outputPricePerMillion);
      const uncachedInputCost = new Prisma.Decimal(inputTokens - cachedInputTokens)
        .mul(inputPricePerMillion)
        .div(million);
      const cachedInputCost = new Prisma.Decimal(cachedInputTokens)
        .mul(cachedInputPricePerMillion)
        .div(million);
      const outputCost = new Prisma.Decimal(outputTokens).mul(outputPricePerMillion).div(million);

      await createModelUsage({
        userId,
        modelId: model.id,
        sessionId: session.id,
        billingSessionId: session.parentSessionId ?? session.id,
        providerResponseId: response.id ?? null,
        agentRunId: agentRun.id,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        inputPricePerMillion,
        cachedInputPricePerMillion,
        outputPricePerMillion,
        uncachedInputCost,
        cachedInputCost,
        outputCost,
        totalCost: uncachedInputCost.add(cachedInputCost).add(outputCost),
      });

      const outputText = extractOutputText(response.output);
      await createMessage({
        sessionId: session.id,
        role: "ASSISTANT",
        content: { text: outputText, responseId: response.id },
      });

      await advanceConversationSession({
        id: session.id,
        userId,
        projectId,
        expectedUpdatedAt: session.updatedAt,
        previousResponseId: response.id,
      });

      await updateAgentRun({
        id: agentRun.id,
        data: { status: "SUCCEEDED", output: { text: outputText }, completedAt: new Date() },
      });

      return { agentRun: { ...agentRun, status: "SUCCEEDED" }, output: outputText };
    } catch (error) {
      await updateAgentRun({
        id: agentRun.id,
        data: { status: "FAILED", error: { message: error.message }, completedAt: new Date() },
      });
      throw new VisionJudgeError(`Vision judge failed: ${error.message}`, "ERUNFAILED", {
        cause: error,
      });
    }
  } catch (error) {
    if (error instanceof VisionJudgeError) throw error;
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}
