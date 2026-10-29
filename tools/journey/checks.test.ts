import { Array as Arr, Result } from "effect";
import { describe, expect, test } from "vite-plus/test";

import { check, outcome, performanceChecks, unrun } from "./checks.ts";
import type { Check } from "./checks.ts";

const statusesOf = (checks: readonly Check[]) =>
  Arr.map(checks, (entry) => entry.status);

const timing = (ok: boolean) => check("J9", "timing", ok, "times");

const memoisation = (ok: boolean) =>
  check("J9", "memoisation", ok, "mutations");

const quiet = Result.succeed({ after: "quiet", before: "quiet" });
const busy = Result.fail("inconclusive: host busy (load 19.4): too busy");

describe("performanceChecks", () => {
  test("on a busy host the timing is inconclusive and the memoisation check is still reported as measured", () => {
    const checks = performanceChecks(busy, {
      memoisation: memoisation(true),
      timing: timing(true),
    });

    expect(statusesOf(checks)).toStrictEqual(["inconclusive", "pass"]);
    expect(checks[0]?.detail).toContain("host busy (load 19.4)");
  });

  test("on a busy host a failed memoisation check is still a failure", () => {
    const checks = performanceChecks(busy, {
      memoisation: memoisation(false),
      timing: timing(true),
    });

    expect(statusesOf(checks)).toStrictEqual(["inconclusive", "fail"]);
    expect(outcome(checks)).toBe("failed");
  });

  test("on a quiet host both checks are as measured", () => {
    const checks = performanceChecks(quiet, {
      memoisation: memoisation(true),
      timing: timing(false),
    });

    expect(statusesOf(checks)).toStrictEqual(["fail", "pass"]);
  });
});

describe("outcome", () => {
  test("held, inconclusive and failed; a failure beats an inconclusive check", () => {
    expect(outcome([check("a", "a", true, "")])).toBe("held");
    expect(outcome([check("a", "a", true, ""), unrun("b", "b", "busy")])).toBe(
      "inconclusive"
    );
    expect(outcome([check("a", "a", false, ""), unrun("b", "b", "busy")])).toBe(
      "failed"
    );
  });
});
