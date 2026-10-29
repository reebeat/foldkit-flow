import { assert, it } from "@effect/vitest";
import { Effect, Schedule } from "effect";
import { Runtime } from "foldkit";

import { exampleApplication } from "./application.ts";

// The runtime renders after the test body has started, so a test waits for the DOM state it is about: it reads the DOM
// until `done` holds, at most 300 times 10 ms, and returns the last read (the assertion that follows names a miss).
const eventually = <A>(read: () => A, done: (value: A) => boolean) =>
  Effect.sync(read).pipe(
    Effect.repeat({
      schedule: Schedule.spaced("10 millis"),
      times: 300,
      until: done,
    })
  );

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

it.live(
  "Runtime.run renders the shell into its container and a click hides the attribution",
  () =>
    Effect.gen(function* boot() {
      const { container, wrapper } = newMount("boot-run");

      Runtime.run(exampleApplication(container));

      const heading = yield* eventually(
        () => wrapper.querySelector("h1"),
        (found) => found !== null
      );

      assert.strictEqual(heading?.textContent, "foldkit-flow");
      assert.isNotNull(wrapper.querySelector("a[href='https://xyflow.com']"));

      wrapper.querySelector("button")?.dispatchEvent(new Event("click"));

      const link = yield* eventually(
        () => wrapper.querySelector("a[href='https://xyflow.com']"),
        (found) => found === null
      );

      assert.isNull(link);
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

      assert.isNull(wrapper.querySelector("h1"));
      assert.strictEqual(wrapper.firstElementChild?.childElementCount, 0);
    })
);
