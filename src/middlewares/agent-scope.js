import { runWithAgentContext } from "../agents/context.js";

export function agentScope(_request, _response, next) {
  runWithAgentContext(null, () => next());
}
