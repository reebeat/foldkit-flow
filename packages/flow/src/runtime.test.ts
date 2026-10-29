import { assert, describe, it } from "@effect/vitest";
import { Array, Effect, Predicate, String } from "effect";
import { constVoid } from "effect/Function";
import { Runtime } from "foldkit";
import { vi } from "vite-plus/test";

import {
  FlowHandle,
  FlowMinimap,
  FlowNodeMount,
  FlowPane,
  FlowReconnect,
} from "./mounts.ts";
import { abc, compound } from "./testFlows.ts";
import { hostApplication } from "./testHost.ts";
import { eventually } from "./testing.ts";

// These tests boot a real Foldkit runtime in happy-dom with the Flow Submodel embedded, so the view, the Mounts and the
// xyflow controllers run for real. happy-dom has no layout: pointer-geometry behaviour (box, drag, connect) is covered
// by the browser journey (`bun run journey`).

let mounts = 0;

const mountPoint = () => {
  mounts += 1;

  const wrapper = document.createElement("section");
  const container = document.createElement("div");

  container.id = `flow-host-${mounts}`;
  wrapper.append(container);
  document.body.append(wrapper);

  return { container, wrapper };
};

const nodeElement = (wrapper: Element, id: string) =>
  wrapper.querySelector(`.foldkit-flow__node[data-id='${id}']`);

const transformOf = (wrapper: Element, id: string) =>
  nodeElement(wrapper, id)?.getAttribute("style") ?? "";

describe("the rendered flow", () => {
  it.live(
    "is an application with named node groups, instructions and a live region",
    () =>
      Effect.gen(function* rendered() {
        const { container, wrapper } = mountPoint();

        Runtime.run(hostApplication(container, abc()));

        yield* eventually(
          () => wrapper.querySelectorAll(".foldkit-flow__node").length,
          (count) => count === 3
        );

        const pane = wrapper.querySelector(".foldkit-flow__pane");

        assert.strictEqual(pane?.getAttribute("role"), "application");
        assert.strictEqual(pane?.getAttribute("aria-label"), "Test graph");
        assert.isNotNull(
          wrapper.querySelector(`#${pane?.getAttribute("aria-describedby")}`)
        );

        const node = nodeElement(wrapper, "a");

        assert.strictEqual(node?.getAttribute("role"), "group");
        assert.strictEqual(node?.getAttribute("aria-roledescription"), "node");
        assert.strictEqual(node?.getAttribute("aria-label"), "Node a");
        assert.strictEqual(node?.getAttribute("tabindex"), "0");

        assert.strictEqual(
          wrapper.querySelector("[role='status']")?.getAttribute("aria-live"),
          "polite"
        );
        assert.strictEqual(
          wrapper.querySelectorAll(".foldkit-flow__edge").length,
          2
        );
        assert.strictEqual(
          wrapper.querySelectorAll(".foldkit-flow__handle").length,
          6
        );
        assert.isNotNull(wrapper.querySelector("a[href='https://xyflow.com']"));
        assert.strictEqual(
          wrapper.querySelector("[role='img']")?.getAttribute("aria-label"),
          "Minimap"
        );
      })
  );

  it.live("puts a child inside its parent's coordinates", () =>
    Effect.gen(function* nested() {
      const { container, wrapper } = mountPoint();

      Runtime.run(hostApplication(container, compound()));

      yield* eventually(
        () => nodeElement(wrapper, "child-a"),
        (found) => found !== null
      );

      // scene at 100,100 and child at 20,30 inside it: 120,130 in flow coordinates
      assert.include(
        transformOf(wrapper, "child-a"),
        "translate(120px, 130px)"
      );
    })
  );
});

const press = (element: Element | null, key: string, shiftKey = false) => {
  element?.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, key, shiftKey })
  );
};

describe("the keyboard", () => {
  it.live(
    "moves a focused node with the arrow keys, by four times as much with Shift, and says so",
    () =>
      Effect.gen(function* moves() {
        const { container, wrapper } = mountPoint();

        Runtime.run(hostApplication(container, abc()));

        yield* eventually(
          () => nodeElement(wrapper, "a"),
          (found) => found !== null
        );

        press(nodeElement(wrapper, "a"), "ArrowRight");

        yield* eventually(
          () => transformOf(wrapper, "a"),
          String.includes("translate(10px, 0px)")
        );

        press(nodeElement(wrapper, "a"), "ArrowDown", true);

        yield* eventually(
          () => transformOf(wrapper, "a"),
          String.includes("translate(10px, 40px)")
        );

        assert.strictEqual(
          wrapper.querySelector("[role='status']")?.textContent,
          "Moved Node a to 10, 40"
        );
      })
  );

  it.live(
    "selects with Enter and deletes with Delete, removing the edges that ended on the node",
    () =>
      Effect.gen(function* deletes() {
        const { container, wrapper } = mountPoint();

        Runtime.run(hostApplication(container, abc()));

        yield* eventually(
          () => nodeElement(wrapper, "b"),
          (found) => found !== null
        );

        press(nodeElement(wrapper, "b"), "Enter");

        yield* eventually(
          () => {
            const element = nodeElement(wrapper, "b");

            return element instanceof HTMLElement
              ? element.dataset.selected
              : undefined;
          },
          (selected) => selected === "true"
        );

        press(nodeElement(wrapper, "b"), "Delete");

        yield* eventually(
          () => wrapper.querySelectorAll(".foldkit-flow__node").length,
          (count) => count === 2
        );

        assert.isNull(nodeElement(wrapper, "b"));
        assert.strictEqual(
          wrapper.querySelectorAll(".foldkit-flow__edge").length,
          0
        );
        assert.strictEqual(
          wrapper.querySelector("[role='status']")?.textContent,
          "Deleted 1 node and 2 edges"
        );
      })
  );
});

describe("the controls", () => {
  it.live("zoom in changes the viewport transform and nothing else", () =>
    Effect.gen(function* zooms() {
      const { container, wrapper } = mountPoint();

      Runtime.run(hostApplication(container, abc()));

      yield* eventually(
        () => wrapper.querySelector("button[aria-label='Zoom in']"),
        (found) => found !== null
      );

      const before = transformOf(wrapper, "a");

      wrapper
        .querySelector("button[aria-label='Zoom in']")
        ?.dispatchEvent(new Event("click"));

      yield* eventually(
        () =>
          wrapper
            .querySelector(".foldkit-flow__viewport")
            ?.getAttribute("style") ?? "",
        String.includes("scale(1.2)")
      );

      assert.strictEqual(transformOf(wrapper, "a"), before);
    })
  );
});

// The listeners a test cares about live on the document and the window (a leak there outlives the app) and on the
// elements d3 binds (d3 keeps its bindings in the `__on` property of the element).
const spyOnListeners = (target: EventTarget) => ({
  add: vi.spyOn(target, "addEventListener"),
  remove: vi.spyOn(target, "removeEventListener"),
});

const net = (spies: ReturnType<typeof spyOnListeners>) => {
  const counts = new Map<string, number>();

  for (const [type] of spies.add.mock.calls) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  for (const [type] of spies.remove.mock.calls) {
    counts.set(type, (counts.get(type) ?? 0) - 1);
  }

  return Array.filter([...counts.entries()], ([, count]) => count !== 0);
};

const d3Listeners = (element: Element | null) => {
  if (element === null || !Predicate.hasProperty(element, "__on")) {
    return 0;
  }

  return Array.isArray(element.__on) ? element.__on.length : 0;
};

describe("lifetimes", () => {
  it.live(
    "building and discarding a Mount adds no listener: the work starts when the element is inserted",
    () =>
      Effect.sync(() => {
        const onDocument = spyOnListeners(document);
        const onWindow = spyOnListeners(window);

        // the spies see a listener when one is added (so the empty result below is not vacuous)
        document.addEventListener("flow-probe", constVoid);
        document.removeEventListener("flow-probe", constVoid);
        assert.strictEqual(onDocument.add.mock.calls.length, 1);

        onDocument.add.mockClear();
        onDocument.remove.mockClear();

        FlowPane();
        FlowMinimap();
        FlowNodeMount({ id: "a" });
        FlowHandle({ handleId: "out", kind: "source", nodeId: "a" });
        FlowReconnect({ edgeId: "ab", end: "source" });

        assert.strictEqual(onDocument.add.mock.calls.length, 0);
        assert.strictEqual(onWindow.add.mock.calls.length, 0);

        vi.restoreAllMocks();
      })
  );

  it.live(
    "disposing the runtime leaves no listener on the document or the window and no d3 binding on the elements",
    () =>
      Effect.gen(function* disposes() {
        const { container, wrapper } = mountPoint();
        const onDocument = spyOnListeners(document);
        const onWindow = spyOnListeners(window);

        const bound = yield* Effect.gen(function* running() {
          yield* Effect.acquireRelease(
            Effect.sync(() => Runtime.embed(hostApplication(container, abc()))),
            (handle) =>
              Effect.sync(() => {
                handle.dispose();
              })
          );

          yield* eventually(
            () => wrapper.querySelectorAll(".foldkit-flow__node").length,
            (count) => count === 3
          );

          // let the Mounts acquire their controllers
          yield* Effect.sleep("150 millis");

          const pane = wrapper.querySelector(".foldkit-flow__pane");
          const nodes = [...wrapper.querySelectorAll(".foldkit-flow__node")];

          // the controllers are attached: d3 bound the pane (zoom) and every node (drag), and the Mounts listen
          assert.isAbove(d3Listeners(pane), 0);
          assert.isAbove(d3Listeners(nodes[0] ?? null), 0);
          assert.isAbove(onDocument.add.mock.calls.length, 0);

          return [pane, ...nodes];
        }).pipe(Effect.scoped);

        yield* Effect.sleep("150 millis");

        assert.isNull(wrapper.querySelector(".foldkit-flow__pane"));
        assert.deepStrictEqual(net(onDocument), []);
        // Foldkit's runtime registers `pageshow` on the window itself and keeps it; the Mounts add nothing there
        assert.deepStrictEqual(
          Array.filter(net(onWindow), ([type]) => type !== "pageshow"),
          []
        );

        for (const element of bound) {
          assert.strictEqual(d3Listeners(element ?? null), 0);
        }

        vi.restoreAllMocks();
      })
  );
});
