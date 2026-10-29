import { Effect, Schedule } from "effect";

/**
 * A helper for tests that boot a Foldkit runtime in a DOM (happy-dom): the runtime renders after the test body has
 * started, so a test waits for the DOM state it is about. It reads until `done` holds, at most 300 times 10 ms apart,
 * and returns the last read; the assertion that follows names a miss.
 */
export const eventually = <A>(read: () => A, done: (value: A) => boolean) =>
  Effect.sync(read).pipe(
    Effect.repeat({
      schedule: Schedule.spaced("10 millis"),
      times: 300,
      until: done,
    })
  );
