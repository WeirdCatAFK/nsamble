import "./env.js";
import express from "express";
import healthRouter from "./routers/health.js";
import testChatRouter from "./routers/test-chat.js";

export function createApi() {
  const app = express();

  app.use(express.json());
  app.use(healthRouter);
  app.use(testChatRouter);
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
