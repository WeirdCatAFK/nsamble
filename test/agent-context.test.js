import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const moduleUrl = pathToFileURL(resolve(here, "../src/agents/context.js")).href;

function tick(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

describe("agent context", () => {
  it("is null outside a scope", async () => {
    const mod = await import(moduleUrl);
    assert.equal(mod.getAgentContext(), null);
  });

  it("isolates interleaved async chains", async () => {
    const mod = await import(moduleUrl);
    const seen = await Promise.all([
      mod.runWithAgentContext({ userId: "u1" }, async () => {
        await tick(20);
        return mod.getAgentContext()?.userId;
      }),
      mod.runWithAgentContext({ userId: "u2" }, async () => {
        await tick(5);
        return mod.getAgentContext()?.userId;
      }),
    ]);
    assert.deepEqual(seen, ["u1", "u2"]);
  });

  it("shares mutations within one chain only", async () => {
    const mod = await import(moduleUrl);
    const seen = await mod.runWithAgentContext(null, async () => {
      mod.setAgentContext({ userId: "u3" });
      await tick(10);
      return mod.getAgentContext()?.userId;
    });
    assert.equal(seen, "u3");
    assert.equal(mod.getAgentContext(), null);
  });

  it("isolates requests through the middleware", async () => {
    const mod = await import(moduleUrl);
    const scope = await import(
      pathToFileURL(resolve(here, "../src/middlewares/agent-scope.js")).href
    );
    const seen = await Promise.all([
      new Promise((resolvePromise) => {
        scope.agentScope({}, {}, async () => {
          mod.setAgentContext({ userId: "r1" });
          await tick(20);
          resolvePromise(mod.getAgentContext()?.userId);
        });
      }),
      new Promise((resolvePromise) => {
        scope.agentScope({}, {}, async () => {
          mod.setAgentContext({ userId: "r2" });
          await tick(5);
          resolvePromise(mod.getAgentContext()?.userId);
        });
      }),
    ]);
    assert.deepEqual(seen, ["r1", "r2"]);
  });

  it("restores the outer scope after nested runs and throws", async () => {
    const mod = await import(moduleUrl);
    const seen = await mod.runWithAgentContext({ userId: "outer" }, async () => {
      const inner = await mod.runWithAgentContext({ userId: "inner" }, async () => {
        await tick(5);
        return mod.getAgentContext()?.userId;
      });
      let afterThrow = null;
      try {
        await mod.runWithAgentContext({ userId: "boom" }, async () => {
          throw new Error("fail");
        });
      } catch {
        afterThrow = mod.getAgentContext()?.userId;
      }
      return [inner, afterThrow, mod.getAgentContext()?.userId];
    });
    assert.deepEqual(seen, ["inner", "outer", "outer"]);
  });
});
