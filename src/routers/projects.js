import { Router } from "express";
import {
  createProject,
  findProject,
  listProjects,
  updateProject,
} from "../access/resources/db/projects.js";

const router = Router();

router.post("/api/projects", async (request, response, next) => {
  try {
    const { name, description } = request.body;

    if (!name || typeof name !== "string") {
      return response.status(400).json({ error: "name is required." });
    }

    const project = await createProject({
      ownerId: request.user.id,
      name: name.trim(),
      description: description ?? null,
    });

    response.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

router.get("/api/projects", async (request, response, next) => {
  try {
    const projects = await listProjects({ ownerId: request.user.id });
    response.json(projects);
  } catch (error) {
    next(error);
  }
});

router.patch("/api/projects/:id", async (request, response, next) => {
  try {
    const { name, description } = request.body;
    const result = await updateProject({
      id: request.params.id,
      ownerId: request.user.id,
      name,
      description,
    });
    if (result.count === 0) return response.status(404).json({ error: "Project not found." });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/api/projects/:id", async (request, response, next) => {
  try {
    const project = await findProject({
      id: request.params.id,
      ownerId: request.user.id,
    });

    if (!project) return response.status(404).json({ error: "Project not found." });
    response.json(project);
  } catch (error) {
    next(error);
  }
});

export default router;
