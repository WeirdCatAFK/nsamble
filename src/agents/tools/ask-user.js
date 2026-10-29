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
