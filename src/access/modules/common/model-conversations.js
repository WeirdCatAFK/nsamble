import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../primitives/db.js";
import { createToolResponse } from "../../primitives/model-provider.js";
import {
  advanceConversationSession,
  createConversationSession,
  endConversationSession,
  findConversationSession,
} from "../../resources/db/conversation-sessions.js";
import { allMessagesBySession, createMessage } from "../../resources/db/conversation-messages.js";
import { findFile } from "../../resources/db/files.js";
import { readContent } from "../../resources/minio/files.js";
import {
  findActiveModelById,
  findActiveModelBySlug,
} from "../../resources/db/models.js";
import { createModelUsage } from "../../resources/db/model-usages.js";
import { findProject } from "../../resources/db/projects.js";
import { findUserById } from "../../resources/db/users.js";
import { loadRole } from "../../../agents/registry.js";

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

const MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024;

async function loadImageParts({ userId, projectId, attachments }) {
  const parts = [];
  const meta = [];
  for (const fileId of attachments) {
    const file = await findFile({ id: fileId, userId, projectId });
    if (!file) {
      throw new ModelConversationError(
        "Attached file was not found.",
        "EATTACHMENT",
      );
    }
    if (!file.mimeType?.startsWith("image/")) {
      throw new ModelConversationError(
        "Only image attachments are supported.",
        "EATTACHMENT",
      );
    }
    if (file.size > MAX_INLINE_IMAGE_BYTES) {
      throw new ModelConversationError(
        "Attached image is too large.",
        "EATTACHMENT",
      );
    }
    const content = await readContent(file.contentHash);
    if (!content) {
      throw new ModelConversationError(
        "Attached file content is missing.",
        "EATTACHMENT",
      );
    }
    const chunks = [];
    for await (const chunk of content.stream) chunks.push(chunk);
    const base64 = Buffer.concat(chunks).toString("base64");
    parts.push({
      type: "input_image",
      image_url: `data:${file.mimeType};base64,${base64}`,
      detail: "auto",
    });
    meta.push({ fileId: file.id, name: file.name, mimeType: file.mimeType });
  }
  return { parts, meta };
}

export function findPendingChain(messages, previousResponseId) {
  if (!previousResponseId) return null;
  const match = messages.find(
    (message) =>
      Array.isArray(message?.content?.pendingOutputs) &&
      message.content.pendingOutputs.length > 0 &&
      message.content.pendingResponseId === previousResponseId,
  );
  return match ? match.content.pendingOutputs : null;
}

const RECOVERY_MESSAGE_LIMIT = 20;
const RECOVERY_CALL_CHARS = 500;

export function buildRecoveryInput({ messages, providerInput, userText }) {
  const transcript = [];
  for (const message of messages.slice(-RECOVERY_MESSAGE_LIMIT)) {
    const content = message?.content;
    if (!content || typeof content !== "object") continue;
    if (message.role === "USER" && content.text) {
      transcript.push({ role: "user", content: content.text });
    } else if (message.role === "ASSISTANT" && content.text) {
      transcript.push({ role: "assistant", content: content.text });
    } else if (message.role === "TOOL" && Array.isArray(content.calls)) {
      const calls = content.calls
        .map((call) => {
          const detail = `${call.name}(${JSON.stringify(call.args ?? {}).slice(0, RECOVERY_CALL_CHARS)}) -> ${String(call.result ?? call.error ?? "").slice(0, RECOVERY_CALL_CHARS)}`;
          return detail;
        })
        .join("; ");
      if (calls) transcript.push({ role: "assistant", content: `Tool round ${content.round ?? "?"}: ${calls}` });
    }
  }
  if (typeof providerInput === "string") {
    transcript.push({ role: "user", content: userText });
  } else {
    transcript.push(...providerInput);
  }
  return transcript;
}

export function buildChainedInput({ providerInput, pendingOutputs }) {
  if (!pendingOutputs) return providerInput;
  const outputs = pendingOutputs.map((output) => ({
    type: "function_call_output",
    call_id: output.call_id,
    output: String(output.output ?? ""),
  }));
  if (typeof providerInput === "string") {
    return [...outputs, { role: "user", content: providerInput }];
  }
  return [...outputs, ...providerInput];
}

export async function sendConversationInput({
  userId,
  projectId,
  sessionId,
  input,
  attachments = [],
  tools = [],
  toolExecutors = new Map(),
  onEvent = () => {},
}) {
  try {
    const userText = typeof input === "string" ? input : "";
    if (userText.trim().length === 0 && attachments.length === 0) {
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

    const { parts: imageParts, meta: attachmentMeta } = await loadImageParts({
      userId,
      projectId,
      attachments,
    });

    await createMessage({
      sessionId: session.id,
      role: "USER",
      content: { text: userText, attachments: attachmentMeta },
    });

    const orchestrator = await loadRole("orchestrator");

    onEvent({ type: "status", message: "Reasoning..." });

    const isExpiredResponse = (err) =>
      /referenced response|not found|expired/i.test(err.message);
    const isMissingOutput = (err) => /no tool output found/i.test(err.message);

    const providerInput = imageParts.length === 0
      ? userText
      : [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: userText || "Describe what you see in these images.",
            },
            ...imageParts,
          ],
        },
      ];

    const priorMessages = await allMessagesBySession(session.id);
    const pendingOutputs = findPendingChain(priorMessages, session.previousResponseId);
    const chainedInput = buildChainedInput({ providerInput, pendingOutputs });
    if (pendingOutputs) {
      onEvent({ type: "status", message: "Resuming pending tool calls..." });
    }

    let lastResponse;
    let recoveredInput = null;
    try {
      lastResponse = await createToolResponse({
        model: model.slug,
        input: chainedInput,
        previousResponseId: session.previousResponseId,
        tools,
        instructions: orchestrator.systemPrompt,
      });
    } catch (err) {
      if (session.previousResponseId && isExpiredResponse(err)) {
        lastResponse = await createToolResponse({
          model: model.slug,
          input: providerInput,
          tools,
          instructions: orchestrator.systemPrompt,
        });
      } else if (session.previousResponseId && isMissingOutput(err)) {
        onEvent({ type: "status", message: "Repairing conversation chain..." });
        recoveredInput = buildRecoveryInput({ messages: priorMessages, providerInput, userText });
        lastResponse = await createToolResponse({
          model: model.slug,
          input: recoveredInput,
          tools,
          instructions: orchestrator.systemPrompt,
        });
      } else {
        throw err;
      }
    }

    const allUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
    const effectiveInput = recoveredInput ?? chainedInput;
    const conversationLog = typeof effectiveInput === "string"
      ? [{ role: "user", content: userText }]
      : [...effectiveInput];
    let awaitingUser = false;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const usage = usageFromResponse(lastResponse.usage);
      allUsage.inputTokens += usage.inputTokens;
      allUsage.cachedInputTokens += usage.cachedInputTokens;
      allUsage.outputTokens += usage.outputTokens;

      const functionCalls = extractFunctionCalls(lastResponse.output);
      if (functionCalls.length === 0) break;

      const reasoning = extractOutputText(lastResponse.output);

      if (reasoning) {
        onEvent({ type: "reasoning", text: reasoning, round: round + 1 });
      }

      const roundCalls = [];

      for (const call of functionCalls) {
        const args = call.arguments ? JSON.parse(call.arguments) : {};
        onEvent({ type: "tool_start", name: call.name, args, round: round + 1 });

        const executor = toolExecutors.get(call.name);
        let result;
        let error = null;
        if (executor) {
          try {
            result = await executor(args);
          } catch (err) {
            error = err.message;
            result = JSON.stringify({ error: err.message });
          }
        } else {
          error = `Tool ${call.name} is not available.`;
          result = JSON.stringify({ error });
        }

        const truncated = typeof result === "string" && result.length > 500
          ? result.slice(0, 500) + "..."
          : result;

        roundCalls.push({ name: call.name, args, result: truncated, error });
        onEvent({ type: "tool_end", name: call.name, args, result: truncated, error, round: round + 1 });

        call._toolOutput = {
          type: "function_call_output",
          call_id: call.call_id,
          output: result,
        };
      }

      const toolOutputs = functionCalls.map((c) => c._toolOutput);
      const roundAwaitingUser = functionCalls.some((call) => call.name === "ask_user");

      await createMessage({
        sessionId: session.id,
        role: "TOOL",
        content: {
          round: round + 1,
          reasoning,
          calls: roundCalls,
          pendingOutputs: roundAwaitingUser
            ? toolOutputs.map((output) => ({ call_id: output.call_id, output: output.output }))
            : null,
          pendingResponseId: roundAwaitingUser ? lastResponse.id : null,
        },
      });
      conversationLog.push(
        { role: "assistant", content: reasoning ?? "" },
        ...toolOutputs.map((t) => ({ role: "tool", tool_call_id: t.call_id, content: t.output })),
      );

      if (roundAwaitingUser) {
        awaitingUser = true;
        onEvent({ type: "status", message: "Waiting for your answers..." });
        break;
      }

      onEvent({ type: "status", message: `Analyzing results (round ${round + 2})...` });

      try {
        lastResponse = await createToolResponse({
          model: model.slug,
          input: toolOutputs,
          previousResponseId: lastResponse.id,
          tools,
        });
      } catch (err) {
        if (isExpiredResponse(err)) {
          lastResponse = await createToolResponse({
            model: model.slug,
            input: conversationLog,
            tools,
            instructions: orchestrator.systemPrompt,
          });
        } else {
          throw err;
        }
      }
    }

    const danglingCalls = awaitingUser ? [] : extractFunctionCalls(lastResponse.output);
    if (danglingCalls.length > 0) {
      const pendingOutputs = danglingCalls.map((call) => ({
        call_id: call.call_id,
        output: JSON.stringify({ error: "Tool round limit reached. The call was not executed." }),
      }));
      await createMessage({
        sessionId: session.id,
        role: "TOOL",
        content: {
          round: MAX_TOOL_ROUNDS + 1,
          reasoning: null,
          calls: danglingCalls.map((call) => ({
            name: call.name,
            args: call.arguments ? JSON.parse(call.arguments) : {},
            result: null,
            error: "Tool round limit reached.",
          })),
          pendingOutputs,
          pendingResponseId: lastResponse.id,
        },
      });
    }

    if (!awaitingUser) {
      const finalUsage = usageFromResponse(lastResponse.usage);
      allUsage.inputTokens += finalUsage.inputTokens;
      allUsage.cachedInputTokens += finalUsage.cachedInputTokens;
      allUsage.outputTokens += finalUsage.outputTokens;
    }

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

    const text = awaitingUser
      ? null
      : (lastResponse.output_text ?? extractOutputText(lastResponse.output));

    if (text) {
      await createMessage({ sessionId: session.id, role: "ASSISTANT", content: { text } });
    }

    return {
      responseId: lastResponse.id,
      text,
      awaitingUser,
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
