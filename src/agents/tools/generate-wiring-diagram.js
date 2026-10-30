import { env } from "../../env.js";
import { uploadFile } from "../../access/modules/common/files.js";
import { getAgentContext } from "../context.js";

export const name = "generate_wiring_diagram";

export const description =
  "Generate a Fritzing-style breadboard wiring diagram as SVG. " +
  "Pass the board type, component list, and connections. Returns the SVG file ID.";

export const parameters = {
  type: "object",
  properties: {
    board: {
      type: "string",
      description:
        "Board ID (e.g. 'esp32-devkit-v1', 'arduino-uno-r3').",
    },
    components: {
      type: "array",
      description: "Components in the circuit.",
      items: {
        type: "object",
        properties: {
          type: { type: "string", description: "Component type ID." },
          label: { type: "string", description: "Reference designator (e.g. 'U1')." },
          color: { type: "string", description: "Color for LEDs." },
          value: { type: "string", description: "Value for passives (e.g. '220')." },
        },
        required: ["type", "label"],
      },
    },
    connections: {
      type: "array",
      description: "Wires between pins.",
      items: {
        type: "object",
        properties: {
          from: {
            type: "object",
            properties: {
              device: { type: "string", description: "'board' or a component label." },
              pin: { type: "string", description: "Pin name." },
            },
            required: ["device", "pin"],
          },
          to: {
            type: "object",
            properties: {
              device: { type: "string", description: "'board' or a component label." },
              pin: { type: "string", description: "Pin name." },
            },
            required: ["device", "pin"],
          },
          color: { type: "string", description: "Wire color as hex (e.g. '#2196F3')." },
        },
        required: ["from", "to"],
      },
    },
    power_rails: {
      type: "object",
      description: "Power rail labels (e.g. { vcc: '3.3V', gnd: 'GND' }).",
    },
    filename: {
      type: "string",
      description: "Base filename without extension. Defaults to 'wiring'.",
    },
  },
  required: ["board", "components", "connections"],
  additionalProperties: false,
};

export async function execute({ board, components, connections, power_rails, filename }) {
  const ctx = getAgentContext();
  const uid = ctx?.userId;
  const pid = ctx?.projectId;
  const base = filename || "wiring";

  const response = await fetch(`${env.wiring.url}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ board, components, connections, power_rails }),
  });

  if (!response.ok) {
    return JSON.stringify({
      error: `Wiring diagram service returned ${response.status}.`,
    });
  }

  const result = await response.json();
  const output = { warnings: result.warnings || [] };

  if (result.svg && uid && pid) {
    const svgBuffer = Buffer.from(result.svg, "base64");
    const svgFile = await uploadFile({
      userId: uid,
      projectId: pid,
      name: `${base}_wiring.svg`,
      mimeType: "image/svg+xml",
      source: svgBuffer,
    });
    output.svgFileId = svgFile.id;
    output.svgFileName = svgFile.name;
  }

  return JSON.stringify(output);
}
