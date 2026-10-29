import { defaultOptions, flowUpdate } from "./update.ts";
import type { FlowOptions } from "./update.ts";
import { flowView } from "./view.ts";

/**
 * Makes a Flow Submodel: the `update` and the `view` to embed with `Update.foldChild` and `h.submodel`, bound to the
 * rules that are code rather than data (`isValidConnection`, `keyboardStep`). Declare it once, at module scope.
 */
export const makeFlow = (options: Partial<FlowOptions> = {}) => {
  const rules: FlowOptions = { ...defaultOptions, ...options };

  return { update: flowUpdate(rules), view: flowView(rules) };
};
