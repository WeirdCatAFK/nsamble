import OpenAI from "openai";
import { env, requireEnvironment } from "../../env.js";

const errLevel = "Error at primitive level in access:";

let client = null;

function getClient() {
  try {
    if (client) return client;

    requireEnvironment("MODEL_API_KEY");
    client = new OpenAI({
      baseURL: env.modelProvider.baseUrl,
      apiKey: env.modelProvider.apiKey,
    });
    return client;
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export async function createModelResponse({ model, input, previousResponseId }) {
  try {
    return await getClient().responses.create({
      model,
      input,
      ...(previousResponseId && { previous_response_id: previousResponseId }),
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}

export async function createToolResponse({
  model,
  input,
  previousResponseId,
  tools = [],
  instructions,
}) {
  try {
    return await getClient().responses.create({
      model,
      input,
      tools,
      ...(instructions && { instructions }),
      ...(previousResponseId && { previous_response_id: previousResponseId }),
    });
  } catch (error) {
    throw new Error(errLevel + " " + error.message, {
      cause: error,
    });
  }
}
