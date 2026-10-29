import { Effect, Option, Result } from "effect";
import { describe, expect, test } from "vite-plus/test";

import {
  admitted,
  assess,
  parseCores,
  parseLoad,
  parseMeminfo,
  parsePressureFull,
  parseVmstat,
} from "./host.ts";
import type { Readings } from "./host.ts";

// A quiet 32-core host: the readings the passing runs had (load 10, 62 GiB of memory, 24 GiB available).
const quiet: Readings = {
  cores: Option.some(32),
  load1: Option.some(10),
  load5: Option.some(11),
  memAvailableKiB: Option.some(24 * 1024 * 1024),
  memTotalKiB: Option.some(64 * 1024 * 1024),
  memoryPressure: Option.some(1),
  swapInPerSecond: Option.some(30),
};

const reasonsOf = (readings: Readings) =>
  Result.match(assess(readings), {
    onFailure: (reasons) => reasons,
    onSuccess: () => [],
  });

// Runs the gate with readings that are served in order (the last one repeats), counting reads and measurements.
const run = (readings: readonly Readings[]) => {
  let reads = 0;
  let measurements = 0;

  const read = Effect.sync(() => {
    const next = readings[Math.min(reads, readings.length - 1)] ?? quiet;

    reads += 1;

    return next;
  });

  const measure = Effect.sync(() => {
    measurements += 1;

    return "timed";
  });

  const result = Effect.runSync(admitted(read, measure));

  return { measurements, reads, result };
};

describe("assess", () => {
  test("admits a quiet host and reports what it read", () => {
    const verdict = assess(quiet);

    expect(Result.isSuccess(verdict)).toBe(true);
    expect(Result.getOrElse(verdict, () => "")).toContain("load 10 / 11");
  });

  test("refuses a load above half the cores, for the 1 minute and the 5 minute average", () => {
    expect(reasonsOf({ ...quiet, load1: Option.some(19) })).toHaveLength(1);
    expect(reasonsOf({ ...quiet, load5: Option.some(19.5) })).toHaveLength(1);
    expect(reasonsOf({ ...quiet, load1: Option.some(16) })).toStrictEqual([]);
  });

  test("the load limit moves with the machine: 16 on 32 cores, 4 on 8", () => {
    const eight = {
      ...quiet,
      cores: Option.some(8),
      load1: Option.some(5),
      load5: Option.some(3),
    };

    expect(reasonsOf(eight)).toHaveLength(1);
    expect(reasonsOf({ ...eight, load1: Option.some(4) })).toStrictEqual([]);
  });

  test("refuses on memory, memory pressure and swap-in", () => {
    expect(
      reasonsOf({ ...quiet, memAvailableKiB: Option.some(8 * 1024 * 1024) })
    ).toHaveLength(1);
    expect(
      reasonsOf({ ...quiet, memoryPressure: Option.some(10) })
    ).toHaveLength(1);
    expect(
      reasonsOf({ ...quiet, swapInPerSecond: Option.some(1001) })
    ).toHaveLength(1);
  });

  test("fails closed: every reading that cannot be read refuses", () => {
    for (const unreadable of [
      { cores: Option.none() },
      { load1: Option.none() },
      { load5: Option.none() },
      { memAvailableKiB: Option.none() },
      { memTotalKiB: Option.none() },
      { memoryPressure: Option.none() },
      { swapInPerSecond: Option.none() },
    ]) {
      expect(reasonsOf({ ...quiet, ...unreadable }).length).toBeGreaterThan(0);
    }
  });

  test("reports every reason, not only the first", () => {
    expect(
      reasonsOf({
        ...quiet,
        load1: Option.some(25),
        memoryPressure: Option.some(30),
      })
    ).toHaveLength(2);
  });
});

describe("admitted", () => {
  test("a busy host refuses before timing: nothing is measured, and the message says inconclusive with the load", () => {
    const { measurements, reads, result } = run([
      { ...quiet, load1: Option.some(19.4) },
    ]);

    expect(measurements).toBe(0);
    expect(reads).toBe(1);
    expect(Result.isFailure(result)).toBe(true);
    expect(Result.merge(result)).toMatch(
      /^inconclusive: host busy \(load 19\.4\)/u
    );
  });

  test("a host that cannot be read refuses: nothing is measured", () => {
    const { measurements, result } = run([{ ...quiet, cores: Option.none() }]);

    expect(measurements).toBe(0);
    expect(Result.merge(result)).toContain("core count unreadable");
  });

  test("a quiet host is timed, and the value comes with both readings", () => {
    const { measurements, reads, result } = run([quiet]);

    expect(measurements).toBe(1);
    expect(reads).toBe(2);
    expect(Result.isSuccess(result)).toBe(true);
  });

  test("a host that became busy during the measurement makes it inconclusive, not a pass", () => {
    const { measurements, result } = run([
      quiet,
      { ...quiet, load1: Option.some(21) },
    ]);

    expect(measurements).toBe(1);
    expect(Result.isFailure(result)).toBe(true);
    expect(Result.merge(result)).toContain(
      "became busy during the measurement"
    );
  });
});

describe("the /proc parsers", () => {
  test("read the load averages, a meminfo value, the pressure, a vmstat counter and the cores", () => {
    expect(parseLoad("11.40 10.56 10.57 5/6045 935218\n")).toStrictEqual({
      load1: Option.some(11.4),
      load5: Option.some(10.56),
    });
    expect(
      parseMeminfo(
        "MemTotal:   65536000 kB\nMemAvailable:   24090468 kB\n",
        "MemAvailable"
      )
    ).toStrictEqual(Option.some(24_090_468));
    expect(
      parsePressureFull(
        "some avg10=0.00 avg60=0.10 avg300=0.20 total=1\nfull avg10=1.28 avg60=2.17 avg300=2.07 total=2\n"
      )
    ).toStrictEqual(Option.some(2.17));
    expect(
      parseVmstat("pgfault 1\npswpin 100382876\npswpout 5\n", "pswpin")
    ).toStrictEqual(Option.some(100_382_876));
    expect(
      parseCores("processor\t: 0\nmodel\t: x\nprocessor\t: 1\n")
    ).toStrictEqual(Option.some(2));
  });

  test("an empty or malformed file is none, never a number", () => {
    expect(parseLoad("")).toStrictEqual({
      load1: Option.none(),
      load5: Option.none(),
    });
    expect(parseLoad("x y")).toStrictEqual({
      load1: Option.none(),
      load5: Option.none(),
    });
    expect(parseMeminfo("", "MemAvailable")).toStrictEqual(Option.none());
    expect(parsePressureFull("")).toStrictEqual(Option.none());
    expect(parseVmstat("", "pswpin")).toStrictEqual(Option.none());
    expect(parseCores("")).toStrictEqual(Option.none());
  });
});
