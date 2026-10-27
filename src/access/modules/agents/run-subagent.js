import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../primitives/db.js";
import { createToolResponse } from "../../primitives/model-provider.js";
import { findAgentRun, updateAgentRun } from "../../resources/agent-runs.js";
import {
  createMessage,
  allMessagesBySession,
} from "../../resources/conversation-messages.js";
import {
  advanceConversationSession,
} from "../../resources/conversation-sessions.js";
import { createModelUsage } from "../../resources/model-usages.js";
import {
  createAgentToolCall,
  completeAgentToolCall,
  failAgentToolCall,
} from "../../resources/agent-tool-calls.js";
import { createSearchSources } from "../../resources/agent-tool-calls.js";
import { loadRole, getToolsForRole, buildToolsPayload } from "../../../agents/registry.js";

const MAX_TOOL_ROUNDS = 10;

export class SubagentRunError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "SubagentRunError";
    this.code = code;
  }
}

function usageFromResponse(usage) {
  const inputTokens = usage?.input_tokens ?? 0;
  const cachedInputTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
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

function extractFunctionCalls(output) {
  return output.filter((item) => item.type === "function_call");
}

function extractWebSearchCalls(output) {
  return output.filter((item) => item.type === "web_search_call");
}

function extractOutputText(output) {
  for (const item of output) {
    if (item.type === "message") {
      for (const block of item.content) {
        if (block.type === "output_text") return block.text;
      }
    }
  }
  return null;
}

function extractCitations(output) {
  const citations = [];
  for (const item of output) {
    if (item.type === "message") {
      for (const block of item.content) {
        if (block.annotations) {
          for (const ann of block.annotations) {
            if (ann.type === "url_citation") {
              citations.push({
                title: ann.title,
                url: ann.url,
                snippet: null,
                cited: true,
              });
            }
          }
        }
      }
    }
  }
  return citations;
}

function extractSearchSources(output) {
  const sources = [];
  for (const item of extractWebSearchCalls(output)) {
    if (item.results) {
      for (const result of item.results) {
        sources.push({
          title: result.title,
          url: result.url,
          snippet: result.snippet ?? null,
          cited: false,
        });
      }
    }
  }
  return sources;
}

async function recordUsage({ agentRun, session, model, usage }) {
  const billingSessionId =
    session.parentSessionId ?? session.id;
  const costs = costsForUsage(model, usage);

  await createModelUsage({
    userId: agentRun.userId,
    modelId: model.id,
    sessionId: session.id,
    billingSessionId,
    agentRunId: agentRun.id,
    ...usage,
    ...costs,
  });
}

async function storeAssistantMessage(sessionId, response) {
  const text = extractOutputText(response.output);
  await createMessage({
    sessionId,
    role: "ASSISTANT",
    content: { text, responseId: response.id },
  });
}

async function storeSearchData(agentRunId, toolCallRecord, output) {
  const searchSources = extractSearchSources(output);
  const citations = extractCitations(output);
  const all = [...searchSources, ...citations];

  const unique = new Map();
  for (const source of all) {
    if (!unique.has(source.url)) {
      unique.set(source.url, source);
    } else if (source.cited) {
      unique.get(source.url).cited = true;
    }
  }

  const sources = [...unique.values()];
  if (sources.length > 0 && toolCallRecord) {
    await createSearchSources({
      toolCallId: toolCallRecord.id,
      sources,
    });
  }
}

export async function runSubagent({ agentRunId, userId, projectId }) {
  const agentRun = await findAgentRun(
    { id: agentRunId, userId, projectId },
  );

  if (!agentRun) {
    throw new SubagentRunError("Agent run was not found.", "ENOTFOUND");
  }

  if (agentRun.status !== "QUEUED") {
    throw new SubagentRunError(
      `Agent run status is ${agentRun.status}, expected QUEUED.`,
      "ESTATUS",
    );
  }

  const session = agentRun.childSession;
  const model = session.model;

  await updateAgentRun({
    id: agentRun.id,
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const role = await loadRole(agentRun.role);
    const toolDefs = await getToolsForRole(agentRun.role);
    const toolsPayload = await buildToolsPayload(agentRun.role);

    const toolExecutors = new Map();
    for (const tool of toolDefs) {
      toolExecutors.set(tool.name, tool.execute);
    }

    await createMessage({
      sessionId: session.id,
      role: "SYSTEM",
      content: { text: role.systemPrompt },
    });

    const userInput =
      typeof agentRun.input === "string"
        ? agentRun.input
        : JSON.stringify(agentRun.input);

    await createMessage({
      sessionId: session.id,
      role: "USER",
      content: { text: userInput },
    });

    const input = [
      { role: "system", content: role.systemPrompt },
      { role: "user", content: userInput },
    ];

    let previousResponseId = session.previousResponseId;
    let lastResponse = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await createToolResponse({
        model: model.slug,
        input: round === 0 ? input : undefined,
        previousResponseId: round === 0 ? previousResponseId : lastResponse.id,
        tools: toolsPayload,
      });

      lastResponse = response;
      const usage = usageFromResponse(response.usage);
      await recordUsage({ agentRun, session, model, usage });
      await storeAssistantMessage(session.id, response);

      await advanceConversationSession({
        id: session.id,
        userId,
        projectId,
        expectedUpdatedAt: session.updatedAt,
        previousResponseId: response.id,
      });

      const webSearchCalls = extractWebSearchCalls(response.output);
      for (const ws of webSearchCalls) {
        const toolRecord = await createAgentToolCall({
          agentRunId: agentRun.id,
          name: "web_search",
          status: "SUCCEEDED",
          input: {},
          output: { resultCount: ws.results?.length ?? 0 },
          completedAt: new Date(),
        });
        await storeSearchData(agentRun.id, toolRecord, response.output);
      }

      const functionCalls = extractFunctionCalls(response.output);
      if (functionCalls.length === 0) break;

      const toolOutputs = [];

      for (const call of functionCalls) {
        const toolRecord = await createAgentToolCall({
          agentRunId: agentRun.id,
          name: call.name,
          input: call.arguments ? JSON.parse(call.arguments) : {},
        });

        try {
          const executor = toolExecutors.get(call.name);
          if (!executor) {
            throw new Error(`Tool ${call.name} is not registered.`);
          }

          const args = call.arguments ? JSON.parse(call.arguments) : {};
          const result = await executor(args);

          await completeAgentToolCall({
            id: toolRecord.id,
            data: { output: { result } },
          });

          await createMessage({
            sessionId: session.id,
            role: "TOOL",
            content: { result },
            toolCallId: call.call_id,
            name: call.name,
          });

          toolOutputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: result,
          });
        } catch (toolError) {
          const errorMessage = toolError.message ?? "Tool execution failed.";
          await failAgentToolCall({
            id: toolRecord.id,
            error: { message: errorMessage },
          });

          await createMessage({
            sessionId: session.id,
            role: "TOOL",
            content: { error: errorMessage },
            toolCallId: call.call_id,
            name: call.name,
          });

          toolOutputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({ error: errorMessage }),
          });
        }
      }

      const followUp = await createToolResponse({
        model: model.slug,
        input: toolOutputs,
        previousResponseId: lastResponse.id,
        tools: toolsPayload,
      });

      lastResponse = followUp;
      const followUpUsage = usageFromResponse(followUp.usage);
      await recordUsage({ agentRun, session, model, usage: followUpUsage });
      await storeAssistantMessage(session.id, followUp);

      const nextFunctionCalls = extractFunctionCalls(followUp.output);
      if (nextFunctionCalls.length === 0) break;
    }

    const finalText = extractOutputText(lastResponse.output);

    await updateAgentRun({
      id: agentRun.id,
      data: {
        status: "SUCCEEDED",
        output: { text: finalText },
        completedAt: new Date(),
      },
    });

    return { agentRun: { ...agentRun, status: "SUCCEEDED" }, output: finalText };
  } catch (error) {
    await updateAgentRun({
      id: agentRun.id,
      data: {
        status: "FAILED",
        error: { message: error.message },
        completedAt: new Date(),
      },
    });

    throw new SubagentRunError(
      `Agent run failed: ${error.message}`,
      "ERUNFAILED",
      { cause: error },
    );
  }
}
