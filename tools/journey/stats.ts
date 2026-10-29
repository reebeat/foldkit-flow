import { Array as Arr, Option, Order } from "effect";

// Plain, total functions over measurements: the journey reports these numbers in the PR, so they are tested.

export interface Summary {
  readonly count: number;
  readonly max: number;
  readonly p50: number;
  readonly p95: number;
}

/** The nearest-rank percentile (`fraction` between 0 and 1) of an ascending, non-empty list. */
const nearestRank = (ascending: readonly number[], fraction: number) =>
  Option.getOrElse(
    Arr.get(ascending, Math.max(0, Math.ceil(fraction * ascending.length) - 1)),
    () => 0
  );

export const summarise = (values: readonly number[]): Summary => {
  const ascending = Arr.sort(values, Order.Number);

  return {
    count: ascending.length,
    max: nearestRank(ascending, 1),
    p50: nearestRank(ascending, 0.5),
    p95: nearestRank(ascending, 0.95),
  };
};

/** The share of `values` that are at most `limit` (1 for an empty list: nothing was late). */
export const shareAtMost = (values: readonly number[], limit: number) =>
  values.length === 0
    ? 1
    : Arr.filter(values, (value) => value <= limit).length / values.length;
