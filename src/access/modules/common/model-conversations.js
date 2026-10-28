import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../primitives/db.js";
import { createToolResponse } from "../../primitives/model-provider.js";
import {
  advanceConversationSession,
  createConversationSession,
  endConversationSession,
  findConversationSession,
} from "../../resources/db/conversation-sessions.js";
import {
  findActiveModelById,
  findActiveModelBySlug,
} from "../../resources/db/models.js";
import { createModelUsage } from "../../resources/db/model-usages.js";
import { findProject } from "../../resources/db/projects.js";
import { findUserById } from "../../resources/db/users.js";

const errLevel = "Error at module level in access:";

export class ModelConversationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ModelConversationError";
    this.code = code;
  }
}

function usageFromResponse(usage) {
  const inputTokens = usage?.input_tokens ?? 0;
  const cachedInputTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;

  if (
    !Number.isSafeInteger(inputTokens) ||
    !Number.isSafeInteger(cachedInputTokens) ||
    !Number.isSafeInteger(outputTokens) ||
    inputTokens < 0 ||
    cachedInputTokens < 0 ||
    cachedInputTokens > inputTokens ||
    outputTokens < 0
  ) {
    throw new ModelConversationError(
      "The model provider returned invalid usage.",
      "EUSAGE",
    );
  }

  return { inputTokens, cachedInputTokens, outputTokens };
}

function costsForUsage(model, usage) {
  const million = new Prisma.Decimal(1_000_000);
  const inputRate = new Prisma.Decimal(model.inputPricePerMillion);
  const cachedInputRate = new Prisma.Decimal(model.cachedInputPricePerMillion);
  const outputRate = new Prisma.Decimal(model.outputPricePerMillion);
  const uncachedInputTokens = usage.inputTokens - usage.cachedInputTokens;
  const uncachedInputCost = new Prisma.Decimal(uncachedInputTokens)
    .mul(inputRate)
    .div(million);
  const cachedInputCost = new Prisma.Decimal(usage.cachedInputTokens)
    .mul(cachedInputRate)
    .div(million);
  const outputCost = new Prisma.Decimal(usage.outputTokens)
    .mul(outputRate)
    .div(million);

  return {
    uncachedInputCost,
    cachedInputCost,
    outputCost,
    totalCost: uncachedInputCost.add(cachedInputCost).add(outputCost),
    inputPricePerMillion: inputRate,
    cachedInputPricePerMillion: cachedInputRate,
    outputPricePerMillion: outputRate,
  };
}

export async function startConversation({ userId, projectId, modelSlug }) {
  try {
    const [user, project, model] = await Promise.all([
      findUserById(userId),
      findProject({ id: projectId, ownerId: userId }),
      findActiveModelBySlug(modelSlug),
    ]);

    if (!user) {
      throw new ModelConversationError("User was not found.", "EUSER");
    }

    if (!model) {
      throw new ModelConversationError("Model is not active.", "EMODEL");
    }

    if (!project) {
      throw new ModelConversationError("Project was not found.", "EPROJECT");
    }

    return createConversationSession({ userId, projectId, modelId: model.id });
  } catch (error) {
    if (error instanceof ModelConversationError) throw error;
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}

const MAX_TOOL_ROUNDS = 10;

function extractFunctionCalls(output) {
  return (output ?? []).filter((item) => item.type === "function_call");
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

export async function sendConversationInput({
  userId,
  projectId,
  sessionId,
  input,
  tools = [],
  toolExecutors = new Map(),
}) {
  try {
    if (typeof input !== "string" || input.trim().length === 0) {
      throw new ModelConversationError(
        "Input must be a non-empty string.",
        "EINPUT",
      );
    }

    const session = await findConversationSession({
      id: sessionId,
      userId,
      projectId,
    });

    if (!session) {
      throw new ModelConversationError(
        "Conversation session was not found.",
        "ESESSION",
      );
    }

    if (session.endedAt) {
      throw new ModelConversationError(
        "Conversation session has ended.",
        "ESESSIONENDED",
      );
    }

    const model = await findActiveModelById(session.modelId);

    if (!model) {
      throw new ModelConversationError("Model is not active.", "EMODEL");
    }

    let lastResponse = await createToolResponse({
      model: model.slug,
      input,
      previousResponseId: session.previousResponseId,
      tools,
    });

    const allUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const usage = usageFromResponse(lastResponse.usage);
      allUsage.inputTokens += usage.inputTokens;
      allUsage.cachedInputTokens += usage.cachedInputTokens;
      allUsage.outputTokens += usage.outputTokens;

      const functionCalls = extractFunctionCalls(lastResponse.output);
      if (functionCalls.length === 0) break;

      const toolOutputs = [];
      for (const call of functionCalls) {
        const executor = toolExecutors.get(call.name);
        let result;
        if (executor) {
          try {
            const args = call.arguments ? JSON.parse(call.arguments) : {};
            result = await executor(args);
          } catch (err) {
            result = JSON.stringify({ error: err.message });
          }
        } else {
          result = JSON.stringify({ error: `Tool ${call.name} is not available.` });
        }

        toolOutputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: result,
        });
      }

      lastResponse = await createToolResponse({
        model: model.slug,
        input: toolOutputs,
        previousResponseId: lastResponse.id,
        tools,
      });
    }

    const finalUsage = usageFromResponse(lastResponse.usage);
    allUsage.inputTokens += finalUsage.inputTokens;
    allUsage.cachedInputTokens += finalUsage.cachedInputTokens;
    allUsage.outputTokens += finalUsage.outputTokens;

    const costs = costsForUsage(model, allUsage);

    await prisma.$transaction(async (database) => {
      await createModelUsage(
        {
          userId,
          modelId: model.id,
          sessionId: session.id,
          billingSessionId: session.parentSessionId ?? session.id,
          providerResponseId: lastResponse.id ?? null,
          ...allUsage,
          ...costs,
        },
        database,
      );

      const advanced = await advanceConversationSession(
        {
          id: session.id,
          userId,
          projectId,
          expectedUpdatedAt: session.updatedAt,
          previousResponseId: lastResponse.id,
        },
        database,
      );

      if (advanced.count !== 1) {
        throw new ModelConversationError(
          "Conversation session changed before this response could be stored.",
          "ECONFLICT",
        );
      }
    });

    const text =
      lastResponse.output_text ?? extractOutputText(lastResponse.output);

    return {
      responseId: lastResponse.id,
      text,
      usage: { ...allUsage, ...costs },
    };
  } catch (error) {
    if (error instanceof ModelConversationError) throw error;
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}

export async function endConversation({ userId, projectId, sessionId }) {
  try {
    const ended = await endConversationSession({
      id: sessionId,
      userId,
      projectId,
    });

    if (ended.count !== 1) {
      throw new ModelConversationError(
        "Conversation session was not found.",
        "ESESSION",
      );
    }
  } catch (error) {
    if (error instanceof ModelConversationError) throw error;
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}
