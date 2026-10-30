import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const libraryDir = resolve(here, "../src/data/parts-library");
const toolsDir = resolve(here, "../src/agents/tools");

async function loadLibrary(file) {
  return JSON.parse(await readFile(resolve(libraryDir, file), "utf8"));
}

describe("parts library metric fasteners", () => {
  it("covers M2, M2.5, M3, M4, and M5 bolts with clearance dims", async () => {
    const fasteners = await loadLibrary("fasteners.json");
    const byId = new Map(fasteners.map((part) => [part.id, part]));

    for (const size of ["m2", "m2.5", "m3", "m4", "m5"]) {
      const bolt = byId.get(`${size}-socket-head-bolt`);
      assert.ok(bolt, `missing ${size} socket head bolt`);
      assert.equal(typeof bolt.dimensions.clearance_hole_mm, "number");
      assert.equal(typeof bolt.dimensions.close_fit_hole_mm, "number");
      assert.equal(typeof bolt.dimensions.head_diameter_mm, "number");
      assert.equal(typeof bolt.dimensions.hex_key_mm, "number");
      assert.ok(bolt.dimensions.clearance_hole_mm > bolt.dimensions.close_fit_hole_mm);
    }
  });

  it("covers M2, M2.5, M3, M4, and M5 nuts and washers", async () => {
    const fasteners = await loadLibrary("fasteners.json");
    const byId = new Map(fasteners.map((part) => [part.id, part]));

    for (const size of ["m2", "m2.5", "m3", "m4", "m5"]) {
      const nut = byId.get(`${size}-hex-nut`);
      assert.ok(nut, `missing ${size} hex nut`);
      assert.equal(typeof nut.dimensions.width_across_flats_mm, "number");
      assert.equal(typeof nut.dimensions.height_mm, "number");

      const washer = byId.get(`${size}-washer`);
      assert.ok(washer, `missing ${size} washer`);
      assert.equal(typeof washer.dimensions.inner_diameter_mm, "number");
      assert.equal(typeof washer.dimensions.outer_diameter_mm, "number");
      assert.equal(typeof washer.dimensions.thickness_mm, "number");
    }
  });
});

describe("parts library rack hardware", () => {
  it("covers the 19-inch rail and the cage-nut square hole", async () => {
    const rack = await loadLibrary("rack.json");
    const byId = new Map(rack.map((part) => [part.id, part]));

    const rail = byId.get("eia310-rail");
    assert.ok(rail, "missing eia310-rail");
    assert.equal(rail.dimensions.panel_width_mm, 482.6);
    assert.equal(rail.dimensions.u_height_mm, 44.45);

    const cageNut = byId.get("cage-nut-m5");
    assert.ok(cageNut, "missing cage-nut-m5");
    assert.equal(cageNut.dimensions.square_hole_mm, 9.5);
  });
});

describe("parts library fans", () => {
  it("covers 40, 60, 80, 92, and 120 mm fans with mounting spacing", async () => {
    const fans = await loadLibrary("fans.json");
    const byId = new Map(fans.map((part) => [part.id, part]));

    for (const size of ["40", "60", "80", "92", "120"]) {
      const fan = byId.get(`fan-${size}mm`);
      assert.ok(fan, `missing fan-${size}mm`);
      assert.equal(typeof fan.dimensions.frame_mm, "number");
      assert.equal(typeof fan.dimensions.mounting_spacing_mm, "number");
      assert.equal(typeof fan.dimensions.mounting_hole_diameter_mm, "number");
    }
  });
});

describe("parts library lookup", () => {
  it("finds new entries through the lookup tool", async () => {
    const mod = await import(pathToFileURL(resolve(toolsDir, "lookup-library-part.js")).href);

    for (const query of ["M2.5", "cage nut", "120mm fan"]) {
      const result = JSON.parse(await mod.execute({ query }));
      assert.ok(result.count > 0, `lookup found nothing for "${query}"`);
    }
  });
});
