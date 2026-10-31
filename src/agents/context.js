import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

export function runWithAgentContext(ctx, fn) {
  return storage.run({ current: ctx ?? null }, fn);
}

export function setAgentContext(ctx) {
  const store = storage.getStore();
  if (store) {
    store.current = ctx;
  }
}

export function getAgentContext() {
  return storage.getStore()?.current ?? null;
}
