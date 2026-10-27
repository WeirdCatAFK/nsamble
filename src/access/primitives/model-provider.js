import OpenAI from "openai";
import { env, requireEnvironment } from "../../env.js";

let client = null;

function getClient() {
  if (client) return client;

  requireEnvironment("MODEL_API_KEY");
  client = new OpenAI({
    baseURL: env.modelProvider.baseUrl,
    apiKey: env.modelProvider.apiKey,
  });
  return client;
}

export async function createModelResponse({ model, input, previousResponseId }) {
  return getClient().responses.create({
    model,
    input,
    ...(previousResponseId && { previous_response_id: previousResponseId }),
  });
}

export async function createToolResponse({
  model,
  input,
  previousResponseId,
  tools = [],
}) {
  return getClient().responses.create({
    model,
    input,
    tools,
    include: ["web_search_call.results"],
    ...(previousResponseId && { previous_response_id: previousResponseId }),
  });
}
