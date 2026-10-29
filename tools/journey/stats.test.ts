import { describe, expect, test } from "vite-plus/test";

import { shareAtMost, summarise } from "./stats.ts";

describe("summarise", () => {
  test("reports the nearest-rank p50, p95 and the maximum, whatever the input order", () => {
    const values = [9, 1, 3, 2, 8, 4, 7, 6, 5, 10];

    expect(summarise(values)).toStrictEqual({
      count: 10,
      max: 10,
      p50: 5,
      p95: 10,
    });
  });

  test("a single late frame in a hundred does not reach the p95", () => {
    const values = [...Array.from({ length: 99 }, () => 1), 50];

    expect(summarise(values).p95).toBe(1);
    expect(summarise(values).max).toBe(50);
  });

  test("an empty list summarises to zeros", () => {
    expect(summarise([])).toStrictEqual({ count: 0, max: 0, p50: 0, p95: 0 });
  });
});

describe("shareAtMost", () => {
  test("is the share of values within the limit, and 1 when there is nothing to be late", () => {
    expect(shareAtMost([10, 20, 40, 50], 33.5)).toBe(0.5);
    expect(shareAtMost([], 33.5)).toBe(1);
  });
});
