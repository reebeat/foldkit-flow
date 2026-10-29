import { assert, it } from "@effect/vitest";
import { Array, Effect } from "effect";
import { vi } from "vite-plus/test";

import { abc } from "./testFlows.ts";
import { embedHost } from "./testHost.ts";
import { xyflowControllers } from "./xyflow.ts";
import type { Controllers } from "./xyflow.ts";

// Observes the call itself: some of a controller's teardown (XYPanZoom's `destroy`) has no effect a DOM test can see once
// the d3 bindings are removed by hand. The Flow is given controller factories (`defineFlow(options, controllers)`), so
// the test gives it factories that wrap the real ones and record each instance's `destroy`: every controller a Mount
// created must be destroyed. No module is replaced.

const recording = () => {
  const created = new Map<string, ReturnType<typeof vi.fn>[]>();

  const observed =
    <Args extends unknown[], Instance extends { destroy: () => void }>(
      name: string,
      make: (...args: Args) => Instance
    ) =>
    (...args: Args): Instance => {
      const instance = make(...args);
      const destroy = vi.fn(instance.destroy);

      created.set(name, [...(created.get(name) ?? []), destroy]);

      return { ...instance, destroy };
    };

  const controllers: Controllers = {
    ...xyflowControllers,
    XYDrag: observed("XYDrag", xyflowControllers.XYDrag),
    XYMinimap: observed("XYMinimap", xyflowControllers.XYMinimap),
    XYPanZoom: observed("XYPanZoom", xyflowControllers.XYPanZoom),
  };

  return { controllers, created };
};

it.live(
  "every xyflow controller a Mount created is destroyed when the app is disposed",
  () =>
    Effect.gen(function* destroyed() {
      const { controllers, created } = recording();

      yield* Effect.gen(function* running() {
        yield* embedHost(abc(), controllers);

        // the pane, the minimap and the three nodes each own one
        assert.strictEqual(created.get("XYPanZoom")?.length, 1);
        assert.strictEqual(created.get("XYMinimap")?.length, 1);
        assert.strictEqual(created.get("XYDrag")?.length, 3);
      }).pipe(Effect.scoped);

      yield* Effect.sleep("150 millis");

      const all = Array.flatten([...created.values()]);

      assert.strictEqual(all.length, 5);

      for (const destroy of all) {
        assert.strictEqual(destroy.mock.calls.length, 1);
      }
    })
);
