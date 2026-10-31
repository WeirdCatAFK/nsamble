import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const moduleUrl = pathToFileURL(
  resolve(here, "../src/access/modules/common/auth.js"),
).href;

describe("classifyGoogleError", () => {
  it("maps network failures to 503 and token failures to 401", async () => {
    const mod = await import(moduleUrl);

    for (const message of [
      "fetch failed",
      "network timeout of 10000ms exceeded",
      "getaddrinfo ENOTFOUND www.googleapis.com",
      "socket hang up",
    ]) {
      const result = mod.classifyGoogleError(new Error(message));
      assert.equal(result.status, 503);
      assert.equal(result.code, "EGOOGLE_UNREACHABLE");
    }

    for (const message of [
      "Token used too late, 1761942942 > 1761942000",
      "Invalid token signature",
      "Wrong recipient, payload audience != requiredAudience",
    ]) {
      const result = mod.classifyGoogleError(new Error(message));
      assert.equal(result.status, 401);
      assert.equal(result.code, "EGOOGLE");
    }
  });

  it("treats missing errors as token failures", async () => {
    const mod = await import(moduleUrl);
    assert.equal(mod.isTransientGoogleError(null), false);
    assert.equal(mod.isTransientGoogleError({}), false);
    assert.equal(mod.classifyGoogleError(null).status, 401);
  });
});
