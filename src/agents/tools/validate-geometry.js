/** Validate an OpenSCAD script against design rules with the constraint engine. */
import { env } from "../../env.js";

export const name = "validate_geometry";

export const description =
  "Validate an OpenSCAD script against design rules with the constraint engine: syntax, geometry, predicates, and printability. " +
  "Pass the full script as a string. Returns rule findings. " +
  "Run this on each compile before the DFM review.";

export const parameters = {
  type: "object",
  properties: {
    script: {
      type: "string",
      description: "The complete OpenSCAD source code.",
    },
    toolArgs: {
      type: "object",
      description: "Extra engine args, e.g. a validation mode or predicate sweep.",
    },
  },
  required: ["script"],
  additionalProperties: false,
};

export async function execute({ script, toolArgs = {} }) {
  const response = await fetch(`${env.constraintEngine.url}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scad: script, tool_args: toolArgs }),
  });

  if (!response.ok) {
    return JSON.stringify({
      error: `Constraint engine returned ${response.status}.`,
    });
  }

  return JSON.stringify(await response.json());
}
