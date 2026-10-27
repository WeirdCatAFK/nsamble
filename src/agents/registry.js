import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const baseDir = dirname(fileURLToPath(import.meta.url));
const rolesDir = resolve(baseDir, "roles");
const toolsDir = resolve(baseDir, "tools");

const roleCache = new Map();
const toolCache = new Map();

export async function loadRole(roleName) {
  if (roleCache.has(roleName)) return roleCache.get(roleName);

  const filePath = resolve(rolesDir, `${roleName}.json`);
  const role = JSON.parse(await readFile(filePath, "utf8"));
  roleCache.set(roleName, role);
  return role;
}

async function loadTool(toolFileName) {
  if (toolCache.has(toolFileName)) return toolCache.get(toolFileName);

  const mod = await import(pathToFileURL(resolve(toolsDir, `${toolFileName}.js`)).href);
  const tool = {
    name: mod.name,
    description: mod.description,
    parameters: mod.parameters,
    execute: mod.execute,
  };
  toolCache.set(toolFileName, tool);
  return tool;
}

export async function getToolsForRole(roleName) {
  const role = await loadRole(roleName);
  const toolNames = role.tools ?? [];
  return Promise.all(toolNames.map(loadTool));
}

export async function buildToolsPayload(roleName) {
  const tools = await getToolsForRole(roleName);
  const role = await loadRole(roleName);

  const payload = tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  if (role.webSearch) {
    payload.push({ type: "web_search" });
  }

  return payload;
}

export async function getAllToolExecutors() {
  const files = await readdir(toolsDir);
  const toolFiles = files
    .filter((f) => f.endsWith(".js"))
    .map((f) => f.replace(/\.js$/, ""));

  const tools = await Promise.all(toolFiles.map(loadTool));
  const executors = new Map();
  for (const tool of tools) {
    executors.set(tool.name, tool.execute);
  }
  return executors;
}

export async function buildAllTools() {
  const files = await readdir(toolsDir);
  const toolFiles = files
    .filter((f) => f.endsWith(".js"))
    .map((f) => f.replace(/\.js$/, ""));

  const tools = await Promise.all(toolFiles.map(loadTool));

  const payload = tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  payload.push({ type: "web_search" });
  return payload;
}
