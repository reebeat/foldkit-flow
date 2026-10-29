import { Array as Arr, Result } from "effect";

// What a journey step reports, and how the steps add up to an exit code. Pure, so the rules are tested.

type Status = "fail" | "inconclusive" | "pass";

export interface Check {
  readonly detail: string;
  readonly id: string;
  readonly name: string;
  readonly status: Status;
}

export const check = (
  id: string,
  name: string,
  ok: boolean,
  detail: string
): Check => ({ detail, id, name, status: ok ? "pass" : "fail" });

/** A check that could not run: neither passed nor failed. */
export const unrun = (id: string, name: string, detail: string): Check => ({
  detail,
  id,
  name,
  status: "inconclusive",
});

/** A failed check fails the journey even when another check could not run; only a journey with no failure can be inconclusive. */
export const outcome = (
  checks: readonly Check[]
): "failed" | "held" | "inconclusive" => {
  if (Arr.some(checks, (entry) => entry.status === "fail")) {
    return "failed";
  }

  return Arr.some(checks, (entry) => entry.status === "inconclusive")
    ? "inconclusive"
    : "held";
};

/**
 * The two J9 checks. The memoisation check counts DOM mutations, not milliseconds, so it is reported as measured on
 * every host; the timing check is reported only when the host was quiet (`host` is a success), and is inconclusive with
 * the host's message otherwise.
 */
export const performanceChecks = (
  host: Result.Result<unknown, string>,
  measured: { readonly memoisation: Check; readonly timing: Check }
): readonly Check[] => [
  Result.match(host, {
    onFailure: (message) => unrun("J9", measured.timing.name, message),
    onSuccess: () => measured.timing,
  }),
  measured.memoisation,
];
