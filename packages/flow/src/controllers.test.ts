import { assert, it } from "@effect/vitest";
import type * as Xyflow from "@xyflow/system";
import { Array, Effect } from "effect";
import { vi } from "vite-plus/test";

import { abc } from "./testFlows.ts";
import { embedHost } from "./testHost.ts";

// Observes the call itself: some of a controller's teardown (XYPanZoom's `destroy`) has no effect a DOM test can see once
// the d3 bindings are removed by hand, so the controllers are wrapped and every one that was created must be destroyed.

// `vi.mock` is hoisted above the imports, so what its factory uses is hoisted with it.
const seen = vi.hoisted(() => {
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

  return { created, observed };
});

const { created } = seen;

vi.mock("@xyflow/system", (importOriginal: () => Promise<typeof Xyflow>) =>
  importOriginal().then((original) => ({
    ...original,
    XYDrag: seen.observed("XYDrag", original.XYDrag),
    XYMinimap: seen.observed("XYMinimap", original.XYMinimap),
    XYPanZoom: seen.observed("XYPanZoom", original.XYPanZoom),
  }))
);

it.live(
  "every xyflow controller a Mount created is destroyed when the app is disposed",
  () =>
    Effect.gen(function* destroyed() {
      yield* Effect.gen(function* running() {
        yield* embedHost(abc());

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
