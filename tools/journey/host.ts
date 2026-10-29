import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Result,
  String as Str,
} from "effect";

// Admission control for the performance measurement (spec 0001, J9). A frame time taken on a busy host measures the host,
// so it is neither a pass nor a fail: the journey refuses to time and says "inconclusive". The approach is that of
// studio's `headroom.sh` (the operator's limits, read from /proc, failing closed): a reading that cannot be read
// refuses, it never admits.
//
// The load limit is a judgement from this repository's own runs, not a standard. On a 32-thread host the median of the
// three p95 scripting times was 4.3 to 6.5 ms at a load average of 9 to 12 (twelve runs, all passed), and 5.7 to 8.7 ms
// at a load average of 19 to 20 (five runs, three over the 8 ms limit, style and layout times up about 40% too, with
// the previous head showing the same drift). The limit is half the logical cores (16 here): below the drift, above the
// loads the passing runs had, and it moves with the machine.

export interface Readings {
  readonly cores: Option.Option<number>;
  readonly load1: Option.Option<number>;
  readonly load5: Option.Option<number>;
  readonly memAvailableKiB: Option.Option<number>;
  readonly memTotalKiB: Option.Option<number>;
  /** The `full` avg60 of the memory pressure (PSI), in percent. */
  readonly memoryPressure: Option.Option<number>;
  /** Pages swapped in per second over the sample window. */
  readonly swapInPerSecond: Option.Option<number>;
}

export interface Limits {
  /** Refuse above this share of the logical cores, for the 1 and the 5 minute load average. */
  readonly loadPerCore: number;
  /** MemAvailable after the job's demand must be at least this share of the memory. */
  readonly memoryFreeAfterPercent: number;
  /** The job's expected demand: a headless Chromium and the preview server. */
  readonly demandMiB: number;
  /** Refuse above this memory pressure (`full` avg60, percent). */
  readonly memoryPressurePercent: number;
  readonly swapInPerSecond: number;
}

/** The operator's headroom limits for a heavy job (2026-10-29), and the load limit above. */
export const limits: Limits = {
  demandMiB: 2048,
  loadPerCore: 0.5,
  memoryFreeAfterPercent: 20,
  memoryPressurePercent: 10,
  swapInPerSecond: 1000,
};

// PARSING (plain, total functions over the text of /proc files)

const finite = (value: number) =>
  Number.isFinite(value) ? Option.some(value) : Option.none();

const captured = (text: string, pattern: RegExp, group: string) =>
  Option.flatMap(
    Option.fromNullishOr(pattern.exec(text)?.groups?.[group]),
    (found) => finite(Number(found))
  );

/** The 1 and the 5 minute load averages of `/proc/loadavg`. */
export const parseLoad = (text: string) => {
  const fields = Arr.filter(
    Str.split(Str.trim(text), /\s+/u),
    (field) => field !== ""
  );

  return {
    load1: Option.flatMap(Arr.get(fields, 0), (field) => finite(Number(field))),
    load5: Option.flatMap(Arr.get(fields, 1), (field) => finite(Number(field))),
  };
};

/** A `kB` value of `/proc/meminfo`, for example `MemAvailable`. */
export const parseMeminfo = (text: string, key: string) =>
  captured(text, new RegExp(`^${key}:\\s+(?<value>\\d+)\\s+kB`, "mu"), "value");

/** The `full` avg60 of `/proc/pressure/memory`. */
export const parsePressureFull = (text: string) =>
  captured(text, /^full\s.*\bavg60=(?<value>[\d.]+)/mu, "value");

/** A cumulative counter of `/proc/vmstat`, for example `pswpin`. */
export const parseVmstat = (text: string, key: string) =>
  captured(text, new RegExp(`^${key}\\s+(?<value>\\d+)`, "mu"), "value");

/** The number of logical cores: the `processor` entries of `/proc/cpuinfo` (none counts as unreadable). */
export const parseCores = (text: string) => {
  const count = Arr.length(
    Arr.filter(Str.split(text, /\r?\n/u), (line) =>
      /^processor\s*:/u.test(line)
    )
  );

  return count === 0 ? Option.none() : Option.some(count);
};

// THE VERDICT (pure: injected readings in, a refusal or an admission out)

const unreadable = (name: string) => `${name} unreadable`;

const refusal = <A>(
  reading: Option.Option<A>,
  name: string,
  refuses: (value: A) => Option.Option<string>
) =>
  Option.match(reading, {
    onNone: () => Option.some(unreadable(name)),
    onSome: refuses,
  });

const when = (isRefused: boolean, reason: string) =>
  isRefused ? Option.some(reason) : Option.none();

const memoryAfterPercent = (
  available: number,
  total: number,
  demandMiB: number
) => (100 * (available - demandMiB * 1024)) / total;

const shown = (value: Option.Option<number>) =>
  Option.match(value, { onNone: () => "?", onSome: (n) => `${n}` });

/**
 * Whether the host is quiet enough to time. `Result.succeed` carries what was read, for the report; `Result.fail`
 * carries every reason the host is refused. An unreadable reading is a reason: the check fails closed.
 */
export const assess = (
  readings: Readings,
  rules: Limits = limits
): Result.Result<string, readonly string[]> => {
  const loadLimit = Option.map(
    readings.cores,
    (cores) => cores * rules.loadPerCore
  );

  const overLoad = (name: string, load: Option.Option<number>) =>
    refusal(load, name, (value) =>
      Option.match(loadLimit, {
        onNone: () => Option.some(unreadable("core count")),
        onSome: (limit) =>
          when(value > limit, `${name} ${value} is above ${limit}`),
      })
    );

  const memoryAfter = Option.zipWith(
    readings.memAvailableKiB,
    readings.memTotalKiB,
    (available, whole) => memoryAfterPercent(available, whole, rules.demandMiB)
  );

  const total = Option.zipWith(
    readings.memAvailableKiB,
    readings.memTotalKiB,
    (available, whole) => ({ available, whole })
  );

  const reasons = Arr.getSomes([
    overLoad("load average (1 min)", readings.load1),
    overLoad("load average (5 min)", readings.load5),
    refusal(total, "MemAvailable or MemTotal", ({ available, whole }) =>
      when(
        memoryAfterPercent(available, whole, rules.demandMiB) <
          rules.memoryFreeAfterPercent,
        `memory free after ${rules.demandMiB} MiB is ${memoryAfterPercent(available, whole, rules.demandMiB).toFixed(1)}%, below ${rules.memoryFreeAfterPercent}%`
      )
    ),
    refusal(readings.memoryPressure, "memory pressure (full avg60)", (value) =>
      when(
        value >= rules.memoryPressurePercent,
        `memory pressure full avg60 ${value}% is not below ${rules.memoryPressurePercent}%`
      )
    ),
    refusal(readings.swapInPerSecond, "swap-in rate", (value) =>
      when(
        value > rules.swapInPerSecond,
        `swap-in ${value.toFixed(0)} pages/s is above ${rules.swapInPerSecond}`
      )
    ),
  ]);

  const summary = `load ${shown(readings.load1)} / ${shown(readings.load5)} (1 / 5 min) on ${shown(readings.cores)} cores, memory free after the job ${shown(Option.map(memoryAfter, (percent) => Number(percent.toFixed(1))))}%, pressure ${shown(readings.memoryPressure)}%, swap-in ${shown(readings.swapInPerSecond)} pages/s`;

  return Arr.isReadonlyArrayNonEmpty(reasons)
    ? Result.fail(reasons)
    : Result.succeed(summary);
};

/** What a refusal says: `inconclusive: host busy (load X)` with the reasons. */
export const inconclusive = (
  readings: Readings,
  reasons: readonly string[]
) => {
  const load = Option.match(readings.load1, {
    onNone: () => "unreadable",
    onSome: (value) => `${value}`,
  });

  return `inconclusive: host busy (load ${load}): ${Arr.join(reasons, "; ")}`;
};

// READING THE HOST

const readText = (fs: FileSystem.FileSystem, path: string) =>
  Effect.option(fs.readFileString(path));

/** Reads /proc, sampling the swap-in counter over `sampleSeconds`. Anything that cannot be read is `Option.none`. */
export const readHost = (sampleSeconds: number) =>
  Effect.gen(function* read() {
    const fs = yield* FileSystem.FileSystem;
    const cpuinfo = yield* readText(fs, "/proc/cpuinfo");
    const loadavg = yield* readText(fs, "/proc/loadavg");
    const meminfo = yield* readText(fs, "/proc/meminfo");
    const pressure = yield* readText(fs, "/proc/pressure/memory");
    const before = yield* readText(fs, "/proc/vmstat");

    yield* Effect.sleep(`${sampleSeconds} seconds`);

    const after = yield* readText(fs, "/proc/vmstat");
    const load = Option.map(loadavg, parseLoad);

    const swapIn = Option.zipWith(
      Option.flatMap(before, (text) => parseVmstat(text, "pswpin")),
      Option.flatMap(after, (text) => parseVmstat(text, "pswpin")),
      (first, second) => (second - first) / sampleSeconds
    );

    return {
      cores: Option.flatMap(cpuinfo, parseCores),
      load1: Option.flatMap(load, (parsed) => parsed.load1),
      load5: Option.flatMap(load, (parsed) => parsed.load5),
      memAvailableKiB: Option.flatMap(meminfo, (text) =>
        parseMeminfo(text, "MemAvailable")
      ),
      memTotalKiB: Option.flatMap(meminfo, (text) =>
        parseMeminfo(text, "MemTotal")
      ),
      memoryPressure: Option.flatMap(pressure, parsePressureFull),
      swapInPerSecond: swapIn,
    } satisfies Readings;
  });

// THE GATE

/**
 * Runs `measure` only on a quiet host, and only trusts it if the host was still quiet afterwards: the host is read
 * before and after. `Result.fail` is the inconclusive message (nothing, or nothing trustworthy, was measured);
 * `Result.succeed` carries the measurement and what was read.
 */
export const admitted = <A, E, R, E2, R2>(
  read: Effect.Effect<Readings, E, R>,
  measure: Effect.Effect<A, E2, R2>
) =>
  Effect.gen(function* gate() {
    const before = yield* read;

    return yield* Result.match(assess(before), {
      onFailure: (reasons) =>
        Effect.succeed(Result.fail(inconclusive(before, reasons))),
      onSuccess: (readBefore) =>
        Effect.gen(function* measured() {
          const value = yield* measure;
          const after = yield* read;

          return Result.match(assess(after), {
            onFailure: (reasons) =>
              Result.fail(
                `${inconclusive(after, reasons)} (it became busy during the measurement)`
              ),
            onSuccess: (readAfter) =>
              Result.succeed({ after: readAfter, before: readBefore, value }),
          });
        }),
    });
  });
