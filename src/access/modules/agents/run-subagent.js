import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../primitives/db.js";
import { createToolResponse } from "../../primitives/model-provider.js";
import { findAgentRun, updateAgentRun } from "../../resources/db/agent-runs.js";
import {
  createMessage,
  allMessagesBySession,
} from "../../resources/db/conversation-messages.js";
import {
  advanceConversationSession,
} from "../../resources/db/conversation-sessions.js";
import { createModelUsage } from "../../resources/db/model-usages.js";
import {
  createAgentToolCall,
  completeAgentToolCall,
  failAgentToolCall,
} from "../../resources/db/agent-tool-calls.js";
import { createSearchSources } from "../../resources/db/agent-tool-calls.js";
import { loadRole, getToolsForRole, buildToolsPayload } from "../../../agents/registry.js";
import { getAgentContext, setAgentContext } from "../../../agents/context.js";

const errLevel = "Error at module level in access:";
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

export async function runSubagent({ agentRunId, userId, projectId, onEvent = () => {} }) {
  try {
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

    const previousContext = getAgentContext();
    setAgentContext({
      userId: agentRun.userId,
      projectId: agentRun.projectId,
      parentSessionId: agentRun.parentSessionId,
    });

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

      const isExpiredResponse = (err) =>
        /referenced response|not found|expired/i.test(err.message);

      const conversationLog = [...input];

      let lastResponse;
      try {
        lastResponse = await createToolResponse({
          model: model.slug,
          input,
          previousResponseId: session.previousResponseId,
          tools: toolsPayload,
        });
      } catch (err) {
        if (session.previousResponseId && isExpiredResponse(err)) {
          lastResponse = await createToolResponse({
            model: model.slug,
            input,
            tools: toolsPayload,
          });
        } else {
          throw err;
        }
      }

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const usage = usageFromResponse(lastResponse.usage);
        await recordUsage({ agentRun, session, model, usage });
        await storeAssistantMessage(session.id, lastResponse);

        await advanceConversationSession({
          id: session.id,
          userId,
          projectId,
          expectedUpdatedAt: session.updatedAt,
          previousResponseId: lastResponse.id,
        });

        const webSearchCalls = extractWebSearchCalls(lastResponse.output);
        for (const ws of webSearchCalls) {
          const toolRecord = await createAgentToolCall({
            agentRunId: agentRun.id,
            name: "web_search",
            status: "SUCCEEDED",
            input: {},
            output: { resultCount: ws.results?.length ?? 0 },
            completedAt: new Date(),
          });
          await storeSearchData(agentRun.id, toolRecord, lastResponse.output);
        }

        const functionCalls = extractFunctionCalls(lastResponse.output);
        if (functionCalls.length === 0) break;

        const toolOutputs = [];

        for (const call of functionCalls) {
          const args = call.arguments ? JSON.parse(call.arguments) : {};
          onEvent({ type: "subagent_tool_start", role: agentRun.role, name: call.name, args });

          const toolRecord = await createAgentToolCall({
            agentRunId: agentRun.id,
            name: call.name,
            input: args,
          });

          try {
            const executor = toolExecutors.get(call.name);
            if (!executor) {
              throw new Error(`Tool ${call.name} is not registered.`);
            }

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

            onEvent({ type: "subagent_tool_end", role: agentRun.role, name: call.name });
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

            onEvent({ type: "subagent_tool_end", role: agentRun.role, name: call.name, error: errorMessage });
          }
        }

        const assistantText = extractOutputText(lastResponse.output);
        conversationLog.push(
          { role: "assistant", content: assistantText ?? "" },
          ...toolOutputs.map((t) => ({ role: "tool", tool_call_id: t.call_id, content: t.output })),
        );

        try {
          lastResponse = await createToolResponse({
            model: model.slug,
            input: toolOutputs,
            previousResponseId: lastResponse.id,
            tools: toolsPayload,
          });
        } catch (err) {
          if (isExpiredResponse(err)) {
            lastResponse = await createToolResponse({
              model: model.slug,
              input: conversationLog,
              tools: toolsPayload,
            });
          } else {
            throw err;
          }
        }
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
    } finally {
      setAgentContext(previousContext);
    }
  } catch (error) {
    if (error instanceof SubagentRunError) throw error;
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}
