let _current = null;

export function setAgentContext(ctx) {
  _current = ctx;
}

export function getAgentContext() {
  return _current;
}
