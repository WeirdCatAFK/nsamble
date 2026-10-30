export const name = "ask_user";

export const description =
  "Ask the user clarifying questions before generating parts. " +
  "Each question can include a recommended answer and a list of options. " +
  "Stop and wait for the user to reply after calling this tool.";

export const parameters = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      description: "List of questions to present to the user.",
      items: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The question text.",
          },
          recommended: {
            type: "string",
            description: "The recommended answer.",
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Selectable answer options. The user can also type a custom answer.",
          },
          qualityPick: {
            type: "object",
            description: "The best-performance recommendation with its price and reason.",
            properties: {
              label: { type: "string" },
              price: { type: "string" },
              reason: { type: "string" },
            },
            required: ["label", "reason"],
          },
          costPick: {
            type: "object",
            description: "The lowest-cost recommendation with its price and reason.",
            properties: {
              label: { type: "string" },
              price: { type: "string" },
              reason: { type: "string" },
            },
            required: ["label", "reason"],
          },
        },
        required: ["question"],
      },
    },
  },
  required: ["questions"],
};

export async function execute() {
  return "Questions delivered to the user. Wait for the user to reply before you continue.";
}
