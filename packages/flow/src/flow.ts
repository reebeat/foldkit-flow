import { defaultOptions, flowUpdate } from "./update.ts";
import type { FlowOptions } from "./update.ts";
import { flowView } from "./view.ts";
import { xyflowControllers } from "./xyflow.ts";
import type { Controllers } from "./xyflow.ts";

/**
 * Makes a Flow Submodel: the `update` and the `view` to embed with `Update.foldChild` and `h.submodel`, bound to the
 * rules that are code rather than data (`isValidConnection`, `keyboardStep`). Declare it once, at module scope.
 *
 * `controllers` are the xyflow controller factories the Mounts call. They default to the real `@xyflow/system` ones; a
 * test passes factories that record what was created.
 */
export const defineFlow = (
  options: Partial<FlowOptions> = {},
  controllers: Controllers = xyflowControllers
) => {
  const rules: FlowOptions = { ...defaultOptions, ...options };

  return {
    update: flowUpdate(rules),
    view: flowView(rules, controllers),
  };
};
