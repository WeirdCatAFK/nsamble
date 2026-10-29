import "./env.js";
import express from "express";
import { authenticate } from "./middlewares/auth.js";
import healthRouter from "./routers/health.js";
import authRouter from "./routers/auth.js";
import projectsRouter from "./routers/projects.js";
import modelsRouter from "./routers/models.js";
import conversationsRouter from "./routers/conversations.js";
import filesRouter from "./routers/files.js";
import agentsRouter from "./routers/agents.js";
import scansRouter from "./routers/scans.js";

export function createApi() {
  const app = express();

  app.use(express.json());
  app.use(healthRouter);
  app.use(authRouter);
  app.use(authenticate);
  app.use(modelsRouter);
  app.use(projectsRouter);
  app.use(conversationsRouter);
  app.use(filesRouter);
  app.use(agentsRouter);
  app.use(scansRouter);
  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });
  app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    console.error("Unhandled error:", error);
    response.status(error.status || 500).json({ error: "Internal server error" });
  });

  return app;
}
