import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  SubagentError,
  createSubagent,
} from "../access/modules/agents/create-subagent.js";
import {
  SubagentRunError,
  runSubagent,
} from "../access/modules/agents/run-subagent.js";

export function createMcpGateway() {
  const server = new McpServer({
    name: "nsamble-internal",
    version: "0.0.0",
  });

  server.registerTool(
    "create_subagent",
    {
      title: "Create subagent",
      description: "Creates a persisted subagent run for a project conversation.",
      inputSchema: {
        userId: z.string().min(1),
        projectId: z.string().min(1),
        parentSessionId: z.string().min(1),
        role: z.string().min(1),
        input: z.unknown(),
        modelSlug: z.string().min(1).optional(),
      },
      outputSchema: {
        agentRunId: z.string(),
        childSessionId: z.string(),
        status: z.literal("QUEUED"),
      },
    },
    async (arguments_) => {
      try {
        const { agentRun, childSession } = await createSubagent(arguments_);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                agentRunId: agentRun.id,
                childSessionId: childSession.id,
                status: agentRun.status,
              }),
            },
          ],
          structuredContent: {
            agentRunId: agentRun.id,
            childSessionId: childSession.id,
            status: agentRun.status,
          },
        };
      } catch (error) {
        const message =
          error instanceof SubagentError ? error.message : "Unable to create subagent.";

        return {
          isError: true,
          content: [{ type: "text", text: message }],
        };
      }
    },
  );

  server.registerTool(
    "run_subagent",
    {
      title: "Run subagent",
      description: "Executes a previously created subagent run through the full agent loop.",
      inputSchema: {
        agentRunId: z.string().min(1),
        userId: z.string().min(1),
        projectId: z.string().min(1),
      },
      outputSchema: {
        agentRunId: z.string(),
        status: z.enum(["SUCCEEDED", "FAILED"]),
        output: z.unknown().nullable(),
      },
    },
    async (arguments_) => {
      try {
        const { agentRun, output } = await runSubagent(arguments_);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                agentRunId: agentRun.id,
                status: "SUCCEEDED",
                output,
              }),
            },
          ],
          structuredContent: {
            agentRunId: agentRun.id,
            status: "SUCCEEDED",
            output,
          },
        };
      } catch (error) {
        const message =
          error instanceof SubagentRunError
            ? error.message
            : "Unable to run subagent.";

        return {
          isError: true,
          content: [{ type: "text", text: message }],
        };
      }
    },
  );

  return server;
}
