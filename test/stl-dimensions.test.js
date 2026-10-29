import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBoundingBox } from "../src/access/modules/common/stl-dimensions.js";

function buildMinimalStl(triangles) {
  const header = Buffer.alloc(80, 0);
  const count = Buffer.alloc(4);
  count.writeUInt32LE(triangles.length);

  const triBuffers = triangles.map(({ normal, v1, v2, v3 }) => {
    const buf = Buffer.alloc(50, 0);
    let off = 0;
    for (const vec of [normal, v1, v2, v3]) {
      buf.writeFloatLE(vec[0], off);
      buf.writeFloatLE(vec[1], off + 4);
      buf.writeFloatLE(vec[2], off + 8);
      off += 12;
    }
    return buf;
  });

  return Buffer.concat([header, count, ...triBuffers]);
}

describe("parseBoundingBox", () => {
  it("parses a single-triangle STL", () => {
    const stl = buildMinimalStl([
      {
        normal: [0, 0, 1],
        v1: [0, 0, 0],
        v2: [10, 0, 0],
        v3: [5, 8, 3],
      },
    ]);

    const box = parseBoundingBox(stl);
    assert.equal(box.triangleCount, 1);
    assert.equal(box.width, 10);
    assert.equal(box.height, 8);
    assert.equal(box.depth, 3);
  });

  it("rejects a too-small buffer", () => {
    assert.throws(() => parseBoundingBox(Buffer.alloc(10)), /too small/i);
  });
});
