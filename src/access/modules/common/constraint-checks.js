const errLevel = "Error at module level in access:";

const DEFAULT_BUILD_VOLUME = [220, 220, 250];

function toPosition(position) {
  if (Array.isArray(position)) {
    const [x, y, z] = position;
    return { x, y, z };
  }
  return { x: position?.x, y: position?.y, z: position?.z };
}

function isValidVector(values) {
  return (
    Array.isArray(values) &&
    values.length === 3 &&
    values.every((value) => typeof value === "number" && Number.isFinite(value))
  );
}

function boxesOverlap(minA, extA, minB, extB) {
  return (
    minA.x < minB.x + extB[0] &&
    minB.x < minA.x + extA[0] &&
    minA.y < minB.y + extB[1] &&
    minB.y < minA.y + extA[1] &&
    minA.z < minB.z + extB[2] &&
    minB.z < minA.z + extA[2]
  );
}

export function runConstraintChecks({ parts, bboxes = {}, buildVolume = DEFAULT_BUILD_VOLUME, knownIds = new Set() }) {
  try {
    if (!Array.isArray(parts)) {
      throw new Error("parts must be an array.");
    }
    if (!isValidVector(buildVolume)) {
      throw new Error("buildVolume must be [x, y, z] numbers.");
    }

    const failures = [];
    let passed = 0;
    const placed = [];

    for (const part of parts) {
      const location = part?.partId ?? "unknown part";
      const box = bboxes[part?.partId];

      if (Array.isArray(part.connections) && part.connections.length === 0) {
        failures.push({
          severity: "warning",
          rule: "no-connections",
          location,
          measured: "no connections",
          expected: "at least one connection",
        });
      } else {
        passed += 1;
      }

      if (!box) {
        failures.push({
          severity: "warning",
          rule: "missing-bbox",
          location,
          measured: "no compiled bounding box",
          expected: "one bounding box per part",
        });
        continue;
      }
      passed += 1;

      if (!isValidVector(box)) {
        throw new Error(`Bounding box for ${location} must be [x, y, z] numbers.`);
      }

      const over = [0, 1, 2].filter((axis) => box[axis] > buildVolume[axis]);
      if (over.length > 0) {
        failures.push({
          severity: "error",
          rule: "build-volume",
          location,
          measured: box.join(" x "),
          expected: `within ${buildVolume.join(" x ")}`,
        });
      } else {
        passed += 1;
      }

      for (const fastener of part.fasteners ?? []) {
        const id = fastener?.partId ?? fastener?.id ?? fastener?.type ?? "unknown fastener";
        if (knownIds.size > 0 && !knownIds.has(id)) {
          failures.push({
            severity: "error",
            rule: "unknown-fastener",
            location,
            measured: String(id),
            expected: "a parts-library ID",
          });
        } else {
          passed += 1;
        }
      }

      const position = toPosition(part.position);
      if (
        typeof position.x === "number" &&
        typeof position.y === "number" &&
        typeof position.z === "number"
      ) {
        placed.push({ location, position, box });
      }
    }

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        if (boxesOverlap(a.position, a.box, b.position, b.box)) {
          failures.push({
            severity: "error",
            rule: "bbox-overlap",
            location: `${a.location} vs ${b.location}`,
            measured: "bounding boxes intersect",
            expected: "disjoint bounding boxes",
          });
        } else {
          passed += 1;
        }
      }
    }

    return { passed, failures };
  } catch (error) {
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}
