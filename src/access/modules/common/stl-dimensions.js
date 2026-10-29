const errLevel = "Error at module level in access:";

const HEADER_SIZE = 80;
const COUNT_SIZE = 4;
const TRIANGLE_SIZE = 50;

export function parseBoundingBox(buffer) {
  try {
    if (buffer.length < HEADER_SIZE + COUNT_SIZE) {
      throw new Error("Buffer too small for a valid binary STL.");
    }

    const triangleCount = buffer.readUInt32LE(HEADER_SIZE);
    const expectedSize = HEADER_SIZE + COUNT_SIZE + triangleCount * TRIANGLE_SIZE;

    if (buffer.length < expectedSize) {
      throw new Error("Buffer size does not match triangle count.");
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < triangleCount; i++) {
      const base = HEADER_SIZE + COUNT_SIZE + i * TRIANGLE_SIZE + 12;

      for (let v = 0; v < 3; v++) {
        const offset = base + v * 12;
        const x = buffer.readFloatLE(offset);
        const y = buffer.readFloatLE(offset + 4);
        const z = buffer.readFloatLE(offset + 8);

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }

    return {
      width: +(maxX - minX).toFixed(3),
      height: +(maxY - minY).toFixed(3),
      depth: +(maxZ - minZ).toFixed(3),
      min: { x: +minX.toFixed(3), y: +minY.toFixed(3), z: +minZ.toFixed(3) },
      max: { x: +maxX.toFixed(3), y: +maxY.toFixed(3), z: +maxZ.toFixed(3) },
      triangleCount,
    };
  } catch (error) {
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}
