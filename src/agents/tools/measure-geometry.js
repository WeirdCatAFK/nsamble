/** Measure exact geometry facts with the constraint engine. */
import { env } from "../../env.js";

export const name = "measure_geometry";

export const description =
  "Measure exact facts about an OpenSCAD script with the constraint engine: bounding box, volume, holes, thickness, and printability. " +
  "Pass the full script as a string. Returns measured facts only, with no judgment.";

export const parameters = {
  type: "object",
  properties: {
    script: {
      type: "string",
      description: "The complete OpenSCAD source code.",
    },
    toolArgs: {
      type: "object",
      description: "Extra engine args, e.g. a measurement mode.",
    },
  },
  required: ["script"],
  additionalProperties: false,
};

export async function execute({ script, toolArgs = {} }) {
  const response = await fetch(`${env.constraintEngine.url}/measure`, {
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
