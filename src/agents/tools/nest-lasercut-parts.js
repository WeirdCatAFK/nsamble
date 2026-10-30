import { uploadFile } from "../../access/modules/common/files.js";
import { getAgentContext } from "../context.js";

export const name = "nest_lasercut_parts";

export const description =
  "Nest laser-cut part SVGs onto sheets to minimize material waste. " +
  "Uses deterministic skyline bin-packing. Returns sheet SVGs and a placement manifest.";

export const parameters = {
  type: "object",
  properties: {
    parts: {
      type: "array",
      description: "Parts to nest.",
      items: {
        type: "object",
        properties: {
          svg: { type: "string", description: "SVG content of the part." },
          name: { type: "string", description: "Part name for the manifest." },
          qty: { type: "integer", description: "Number of copies (default 1).", minimum: 1 },
          noRotate: { type: "boolean", description: "If true, do not try 90-degree rotation." },
        },
        required: ["svg", "name"],
      },
    },
    sheetWidth: { type: "number", description: "Sheet width in mm." },
    sheetHeight: { type: "number", description: "Sheet height in mm." },
    gap: { type: "number", description: "Minimum gap between parts in mm (default 3)." },
    margin: { type: "number", description: "Margin from sheet edges in mm (default 5)." },
  },
  required: ["parts", "sheetWidth", "sheetHeight"],
  additionalProperties: false,
};

function parseSvgBounds(svg) {
  const vbMatch = svg.match(/viewBox\s*=\s*"([^"]+)"/);
  if (vbMatch) {
    const [, , w, h] = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (w > 0 && h > 0) return { width: w, height: h };
  }

  const wMatch = svg.match(/\bwidth\s*=\s*"([\d.]+)\s*mm"/);
  const hMatch = svg.match(/\bheight\s*=\s*"([\d.]+)\s*mm"/);
  if (wMatch && hMatch) {
    return { width: parseFloat(wMatch[1]), height: parseFloat(hMatch[1]) };
  }

  const wPx = svg.match(/\bwidth\s*=\s*"([\d.]+)"/);
  const hPx = svg.match(/\bheight\s*=\s*"([\d.]+)"/);
  if (wPx && hPx) {
    return { width: parseFloat(wPx[1]), height: parseFloat(hPx[1]) };
  }

  return null;
}

function stripSvgWrapper(svg) {
  return svg
    .replace(/<\?xml[^?]*\?>\s*/g, "")
    .replace(/<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
}

function createSheet(index, sheetW, sheetH, margin) {
  return {
    index,
    skyline: new Float64Array(Math.ceil(sheetW)).fill(margin),
    placements: [],
    usableW: sheetW,
    usableH: sheetH,
  };
}

function findPosition(sheet, partW, partH, gap, margin) {
  const maxX = sheet.usableW - margin - partW;
  const maxY = sheet.usableH - margin;
  let bestX = -1;
  let bestY = Infinity;

  const cols = sheet.skyline;
  const iStart = Math.floor(margin);
  const iEnd = Math.floor(maxX);

  for (let ix = iStart; ix <= iEnd; ix++) {
    let reqY = 0;
    const colEnd = Math.min(ix + Math.ceil(partW), cols.length);
    for (let c = ix; c < colEnd; c++) {
      if (cols[c] > reqY) reqY = cols[c];
    }
    if (reqY > margin) reqY += gap;
    if (reqY + partH <= maxY && reqY < bestY) {
      bestY = reqY;
      bestX = ix;
    }
  }

  if (bestX < 0) return null;
  return { x: bestX, y: bestY };
}

function placeOnSheet(sheet, x, y, partW, partH) {
  const topEdge = y + partH;
  const colStart = Math.floor(x);
  const colEnd = Math.min(colStart + Math.ceil(partW), sheet.skyline.length);
  for (let c = colStart; c < colEnd; c++) {
    sheet.skyline[c] = topEdge;
  }
}

export async function execute({
  parts,
  sheetWidth,
  sheetHeight,
  gap = 3,
  margin = 5,
}) {
  const expanded = [];
  for (const part of parts) {
    const bounds = parseSvgBounds(part.svg);
    if (!bounds) {
      return JSON.stringify({
        error: `Cannot parse dimensions from SVG for part "${part.name}". Ensure the SVG has a viewBox or width/height in mm.`,
      });
    }
    const qty = part.qty ?? 1;
    for (let i = 0; i < qty; i++) {
      expanded.push({
        name: part.name,
        svg: part.svg,
        width: bounds.width,
        height: bounds.height,
        noRotate: part.noRotate ?? false,
        copyIndex: i,
      });
    }
  }

  expanded.sort((a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    if (areaB !== areaA) return areaB - areaA;
    const maxA = Math.max(a.width, a.height);
    const maxB = Math.max(b.width, b.height);
    return maxB - maxA;
  });

  const sheets = [createSheet(1, sheetWidth, sheetHeight, margin)];

  const manifest = [];

  for (const part of expanded) {
    let bestResult = null;

    const rotations = part.noRotate ? [0] : [0, 90];

    for (const rot of rotations) {
      const w = rot === 0 ? part.width : part.height;
      const h = rot === 0 ? part.height : part.width;

      if (w + 2 * margin > sheetWidth || h + 2 * margin > sheetHeight) continue;

      for (const sheet of sheets) {
        const pos = findPosition(sheet, w, h, gap, margin);
        if (pos && (!bestResult || pos.y < bestResult.y)) {
          bestResult = { sheet, x: pos.x, y: pos.y, w, h, rotation: rot };
        }
      }
    }

    if (!bestResult) {
      const newSheet = createSheet(sheets.length + 1, sheetWidth, sheetHeight, margin);
      sheets.push(newSheet);

      for (const rot of rotations) {
        const w = rot === 0 ? part.width : part.height;
        const h = rot === 0 ? part.height : part.width;
        const pos = findPosition(newSheet, w, h, gap, margin);
        if (pos && (!bestResult || pos.y < bestResult.y)) {
          bestResult = { sheet: newSheet, x: pos.x, y: pos.y, w, h, rotation: rot };
        }
      }
    }

    if (!bestResult) {
      return JSON.stringify({
        error: `Part "${part.name}" (${part.width}x${part.height} mm) does not fit on a ${sheetWidth}x${sheetHeight} mm sheet.`,
      });
    }

    placeOnSheet(bestResult.sheet, bestResult.x, bestResult.y, bestResult.w, bestResult.h);

    bestResult.sheet.placements.push({
      name: part.name,
      copyIndex: part.copyIndex,
      x: bestResult.x,
      y: bestResult.y,
      width: bestResult.w,
      height: bestResult.h,
      rotation: bestResult.rotation,
      svg: part.svg,
    });

    manifest.push({
      part: part.name,
      copy: part.copyIndex + 1,
      sheet: bestResult.sheet.index,
      x: Math.round(bestResult.x * 100) / 100,
      y: Math.round(bestResult.y * 100) / 100,
      rotation: bestResult.rotation,
    });
  }

  const ctx = getAgentContext();
  const uid = ctx?.userId;
  const pid = ctx?.projectId;

  const sheetFiles = [];
  let totalPartArea = 0;

  for (const sheet of sheets) {
    if (sheet.placements.length === 0) continue;

    let groups = "";
    for (const p of sheet.placements) {
      const inner = stripSvgWrapper(p.svg);
      const transform =
        p.rotation === 90
          ? `translate(${p.x + p.width},${p.y}) rotate(90)`
          : `translate(${p.x},${p.y})`;
      groups += `  <g transform="${transform}" data-part="${p.name}" data-copy="${p.copyIndex + 1}">\n    ${inner}\n  </g>\n`;
      totalPartArea += p.width * p.height;
    }

    const svgContent =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `width="${sheetWidth}mm" height="${sheetHeight}mm" ` +
      `viewBox="0 0 ${sheetWidth} ${sheetHeight}">\n` +
      `  <rect x="0" y="0" width="${sheetWidth}" height="${sheetHeight}" ` +
      `fill="none" stroke="#CCCCCC" stroke-width="0.25" stroke-dasharray="2,2"/>\n` +
      groups +
      `</svg>\n`;

    const sheetName = `sheet_${sheet.index}.svg`;

    if (uid && pid) {
      const file = await uploadFile({
        userId: uid,
        projectId: pid,
        name: sheetName,
        mimeType: "image/svg+xml",
        source: svgContent,
      });
      sheetFiles.push({ sheet: sheet.index, fileId: file.id, fileName: file.name });
    } else {
      sheetFiles.push({ sheet: sheet.index, fileName: sheetName });
    }
  }

  const usedSheets = sheetFiles.length;
  const totalSheetArea = usedSheets * sheetWidth * sheetHeight;
  const utilization = totalSheetArea > 0
    ? Math.round((totalPartArea / totalSheetArea) * 10000) / 100
    : 0;

  if (uid && pid) {
    const manifestFile = await uploadFile({
      userId: uid,
      projectId: pid,
      name: "lasercut-manifest.json",
      mimeType: "application/json",
      source: JSON.stringify({ manifest, sheets: sheetFiles }, null, 2),
    });
    sheetFiles.push({ manifest: true, fileId: manifestFile.id, fileName: manifestFile.name });
  }

  return JSON.stringify({
    sheets: sheetFiles,
    manifest,
    summary: {
      totalParts: expanded.length,
      sheetsUsed: usedSheets,
      sheetSize: `${sheetWidth}x${sheetHeight} mm`,
      utilization: `${utilization}%`,
    },
  });
}
