import { prisma } from "../../primitives/db.js";
import { listFiles } from "../../resources/db/files.js";

const errLevel = "Error at module level in access:";

export async function buildManifest({ projectId, userId }) {
  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      include: {
        parts: true,
      },
    });

    if (!project) {
      throw new Error("Project was not found.");
    }

    const files = await listFiles({ userId, projectId });

    const stlFiles = files.filter((f) => f.name.endsWith(".stl"));
    const scadFiles = files.filter((f) => f.name.endsWith(".scad"));

    return {
      projectId: project.id,
      name: project.name,
      description: project.description,
      parts: project.parts.map((p) => ({
        id: p.id,
        name: p.name,
        quantity: p.quantity,
        material: p.material,
        manufacturingMethod: p.manufacturingMethod,
        specification: p.specification,
      })),
      files: {
        stl: stlFiles.map((f) => ({ id: f.id, name: f.name })),
        scad: scadFiles.map((f) => ({ id: f.id, name: f.name })),
        all: files.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
      },
    };
  } catch (error) {
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}
