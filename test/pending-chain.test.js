import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const moduleUrl = pathToFileURL(
  resolve(here, "../src/access/modules/common/model-conversations.js"),
).href;

const PENDING = [{ call_id: "call_1", output: "Questions delivered." }];

function toolMessage(pendingOutputs, pendingResponseId) {
  return { role: "TOOL", content: { round: 1, pendingOutputs, pendingResponseId } };
}

describe("findPendingChain", () => {
  it("returns pending outputs only for the stored response", async () => {
    const mod = await import(moduleUrl);
    const messages = [
      { role: "USER", content: { text: "hi" } },
      toolMessage(PENDING, "resp_1"),
    ];
    assert.deepEqual(mod.findPendingChain(messages, "resp_1"), PENDING);
    assert.equal(mod.findPendingChain(messages, "resp_2"), null);
    assert.equal(mod.findPendingChain(messages, null), null);
    assert.equal(mod.findPendingChain([{ role: "USER", content: {} }], "resp_1"), null);
  });
});

describe("buildChainedInput", () => {
  it("passes input through when nothing is pending", async () => {
    const mod = await import(moduleUrl);
    assert.equal(mod.buildChainedInput({ providerInput: "hi", pendingOutputs: null }), "hi");
  });

  it("prepends outputs before string and array inputs", async () => {
    const mod = await import(moduleUrl);

    const chainedString = mod.buildChainedInput({ providerInput: "answers", pendingOutputs: PENDING });
    assert.equal(chainedString.length, 2);
    assert.equal(chainedString[0].type, "function_call_output");
    assert.equal(chainedString[0].call_id, "call_1");
    assert.deepEqual(chainedString[1], { role: "user", content: "answers" });

    const userPart = { role: "user", content: [{ type: "input_text", text: "see" }] };
    const chainedArray = mod.buildChainedInput({ providerInput: [userPart], pendingOutputs: PENDING });
    assert.equal(chainedArray.length, 2);
    assert.equal(chainedArray[0].type, "function_call_output");
    assert.deepEqual(chainedArray[1], userPart);
  });

  it("coerces non-string outputs", async () => {
    const mod = await import(moduleUrl);
    const chained = mod.buildChainedInput({
      providerInput: "hi",
      pendingOutputs: [{ call_id: "call_2", output: 42 }],
    });
    assert.equal(chained[0].output, "42");
  });
});

describe("buildRecoveryInput", () => {
  it("rebuilds a transcript and appends the current input", async () => {
    const mod = await import(moduleUrl);
    const messages = [
      { role: "SYSTEM", content: { text: "prompt" } },
      { role: "USER", content: { text: "make a bracket" } },
      {
        role: "TOOL",
        content: {
          round: 1,
          calls: [{ name: "ask_user", args: { questions: [] }, result: "sent", error: null }],
        },
      },
      { role: "ASSISTANT", content: { text: null } },
    ];
    const rebuilt = mod.buildRecoveryInput({ messages, providerInput: "M3 please", userText: "M3 please" });
    assert.equal(rebuilt.length, 3);
    assert.deepEqual(rebuilt[0], { role: "user", content: "make a bracket" });
    assert.equal(rebuilt[1].role, "assistant");
    assert.ok(rebuilt[1].content.includes("ask_user"));
    assert.deepEqual(rebuilt[2], { role: "user", content: "M3 please" });
  });

  it("spreads array inputs and caps history", async () => {
    const mod = await import(moduleUrl);
    const messages = Array.from({ length: 25 }, (_, index) => ({
      role: "USER",
      content: { text: `m${index}` },
    }));
    const part = { role: "user", content: "now" };
    const rebuilt = mod.buildRecoveryInput({ messages, providerInput: [part], userText: "" });
    assert.equal(rebuilt.length, 21);
    assert.deepEqual(rebuilt[20], part);
    assert.equal(rebuilt[0].content, "m5");
  });
});
