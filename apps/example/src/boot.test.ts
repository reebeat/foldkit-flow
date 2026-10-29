import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { Runtime } from "foldkit";
import { eventually } from "foldkit-flow/testing";

import { exampleApplication } from "./application.ts";

// A Foldkit container needs an id (without one the runtime logs an error and renders nothing), and the first render
// replaces the container element with the view's root. A test therefore holds the wrapper around the container, which
// the runtime never replaces, and looks inside it.
const newMount = (id: string) => {
  const wrapper = document.createElement("section");
  const container = document.createElement("div");

  container.id = id;
  wrapper.append(container);
  document.body.append(wrapper);

  return { container, wrapper };
};

const link = "a[href='https://xyflow.com']";

it.live(
  "Runtime.run renders the flow, the xyflow attribution is on, and the button hides it",
  () =>
    Effect.gen(function* boot() {
      const { container, wrapper } = newMount("boot-run");

      Runtime.run(exampleApplication(container));

      const nodes = yield* eventually(
        () => wrapper.querySelectorAll(".foldkit-flow__node").length,
        (count) => count > 0
      );

      assert.strictEqual(nodes, 5);
      assert.strictEqual(
        wrapper.querySelector("h1")?.textContent,
        "foldkit-flow"
      );
      assert.strictEqual(
        wrapper.querySelector(".foldkit-flow__pane")?.getAttribute("role"),
        "application"
      );
      assert.isNotNull(wrapper.querySelector(link));

      for (const button of wrapper.querySelectorAll("button")) {
        if (button.textContent === "Hide attribution") {
          button.dispatchEvent(new Event("click"));
        }
      }

      const after = yield* eventually(
        () => wrapper.querySelector(link),
        (found) => found === null
      );

      assert.isNull(after);
    })
);

it.live("choosing the Large graph renders 500 nodes", () =>
  Effect.gen(function* large() {
    const { container, wrapper } = newMount("boot-large");

    Runtime.run(exampleApplication(container));

    yield* eventually(
      () => wrapper.querySelectorAll(".foldkit-flow__node").length,
      (count) => count > 0
    );

    for (const button of wrapper.querySelectorAll("button")) {
      if (button.textContent === "Large") {
        button.dispatchEvent(new Event("click"));
      }
    }

    const count = yield* eventually(
      () => wrapper.querySelectorAll(".foldkit-flow__node").length,
      (nodes) => nodes === 500
    );

    assert.strictEqual(count, 500);
  })
);

it.live(
  "Runtime.embed renders, and disposing it removes the app and leaves the container empty",
  () =>
    Effect.gen(function* embedded() {
      const { container, wrapper } = newMount("boot-embed");

      yield* Effect.gen(function* running() {
        yield* Effect.acquireRelease(
          Effect.sync(() => Runtime.embed(exampleApplication(container))),
          (handle) =>
            Effect.sync(() => {
              handle.dispose();
            })
        );

        const heading = yield* eventually(
          () => wrapper.querySelector("h1"),
          (found) => found !== null
        );

        assert.isNotNull(heading);
      }).pipe(Effect.scoped);

      yield* Effect.sleep("100 millis");

      assert.isNull(wrapper.querySelector("h1"));
      assert.strictEqual(wrapper.firstElementChild?.childElementCount, 0);
    })
);
