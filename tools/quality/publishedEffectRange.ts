import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Result,
  Record as Rec,
  Schema,
  String as Str,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

// Effect tags every export `@stability stable`, `unstable` or `experimental`. Since 4.0.0 an unstable or experimental
// API may break in a minor release; a stable one follows strict semver. A package that publishes code using such an
// API must therefore not accept the next minor: its Effect range needs an upper bound below it. Whether the code uses
// one is not guessed from import specifiers: `effect-tsgo diagnostics` says so (`unstableApiUses` below).

interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

interface Range {
  readonly ceiling: Option.Option<Version>;
  readonly floor: Version;
}

/** The lowest Effect release this repository supports. */
const minimumEffect: Version = { major: 4, minor: 1, patch: 0 };

const versionOrder: Order.Order<Version> = Order.Struct({
  major: Order.Number,
  minor: Order.Number,
  patch: Order.Number,
});

const show = ({ major, minor, patch }: Version) => `${major}.${minor}.${patch}`;

const semver = "(?<major>\\d+)\\.(?<minor>\\d+)\\.(?<patch>\\d+)";

const toVersion = (groups: Record<string, string | undefined> | undefined) =>
  groups?.major === undefined ||
  groups.minor === undefined ||
  groups.patch === undefined
    ? Option.none()
    : Option.some({
        major: Number(groups.major),
        minor: Number(groups.minor),
        patch: Number(groups.patch),
      });

const versionIn = (pattern: string, text: string) =>
  Option.flatMap(
    Option.fromNullishOr(new RegExp(pattern, "u").exec(text)),
    ({ groups }) => toVersion(groups)
  );

const bump = (version: Version, part: "major" | "minor" | "patch"): Version => {
  if (part === "major") {
    return { major: version.major + 1, minor: 0, patch: 0 };
  }

  return part === "minor"
    ? { major: version.major, minor: version.minor + 1, patch: 0 }
    : { ...version, patch: version.patch + 1 };
};

const boundedPattern = new RegExp(
  `^>=${semver} <(?<umajor>\\d+)\\.(?<uminor>\\d+)\\.(?<upatch>\\d+)$`,
  "u"
);

// The range forms a manifest may use: `^x.y.z`, `~x.y.z`, `x.y.z`, `>=x.y.z`, `>=x.y.z <a.b.c`. Anything else, such as
// `>=4.1.0 || ^3.0.0`, is reported, not guessed at.
const parseRange = (text: string): Option.Option<Range> => {
  const range = Str.trim(text);

  const caret = versionIn(`^\\^${semver}$`, range);
  const tilde = versionIn(`^~${semver}$`, range);
  const exact = versionIn(`^${semver}$`, range);
  const lower = versionIn(`^>=${semver}$`, range);

  const bounded = Option.flatMap(
    Option.fromNullishOr(boundedPattern.exec(range)),
    ({ groups }) =>
      Option.flatMap(toVersion(groups), (floor) =>
        Option.map(
          toVersion({
            major: groups?.umajor,
            minor: groups?.uminor,
            patch: groups?.upatch,
          }),
          (ceiling) => [floor, ceiling] as const
        )
      )
  );

  if (Option.isSome(caret)) {
    return Option.map(caret, (floor) => ({
      ceiling: Option.some(bump(floor, "major")),
      floor,
    }));
  }

  if (Option.isSome(tilde)) {
    return Option.map(tilde, (floor) => ({
      ceiling: Option.some(bump(floor, "minor")),
      floor,
    }));
  }

  if (Option.isSome(exact)) {
    return Option.map(exact, (floor) => ({
      ceiling: Option.some(bump(floor, "patch")),
      floor,
    }));
  }

  if (Option.isSome(bounded)) {
    return Option.map(bounded, ([floor, ceiling]) => ({
      ceiling: Option.some(ceiling),
      floor,
    }));
  }

  return Option.map(lower, (floor) => ({ ceiling: Option.none(), floor }));
};

const PackageManifest = Schema.Struct({
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  name: Schema.String,
  peerDependencies: Schema.optional(
    Schema.Record(Schema.String, Schema.String)
  ),
});

export type Manifest = typeof PackageManifest.Type;

// Build and test tooling of the Effect family is never a runtime dependency of a package.
const isEffectRuntime = (name: string) =>
  name === "effect" ||
  (Str.startsWith("@effect/")(name) &&
    !Arr.contains(["@effect/tsgo", "@effect/vitest"], name));

const dependencyFindings = (
  owner: string,
  name: string,
  text: string,
  unstableUses: readonly string[]
): readonly string[] => {
  const parsed = parseRange(text);

  if (Option.isNone(parsed)) {
    return [
      `${owner}: ${name} "${text}" is not a range this check reads (^, ~, exact, or >= with an optional < bound)`,
    ];
  }

  const { ceiling, floor } = parsed.value;
  const nextMinor = bump({ ...floor, patch: 0 }, "minor");

  const floorFinding = Order.isLessThan(versionOrder)(floor, minimumEffect)
    ? [`${owner}: ${name} "${text}" starts below ${show(minimumEffect)}`]
    : [];

  const openFinding =
    Arr.isReadonlyArrayNonEmpty(unstableUses) &&
    !Option.exists(ceiling, (bound) =>
      Order.isLessThanOrEqualTo(versionOrder)(bound, nextMinor)
    )
      ? [
          `${owner}: ${name} "${text}" must stay below ${show(nextMinor)} (use ~${show(floor)}) because the package uses unstable or experimental Effect APIs: ${Arr.join(Arr.take(unstableUses, 3), "; ")}`,
        ]
      : [];

  return [...floorFinding, ...openFinding];
};

/**
 * Sentences that say how the Effect ranges of a published manifest are wrong: a floor below `minimumEffect`, an
 * unreadable range, or, when the package uses unstable or experimental APIs, no upper bound below the next minor
 * release. `unstableUses` are the diagnostics that found them.
 */
export const effectRangeFindings = (
  manifest: Manifest,
  unstableUses: readonly string[]
): readonly string[] =>
  Arr.flatMap([manifest.dependencies, manifest.peerDependencies], (group) =>
    group === undefined
      ? []
      : Arr.flatMap(Rec.keys(group), (name) =>
          isEffectRuntime(name)
            ? dependencyFindings(
                manifest.name,
                name,
                group[name] ?? "",
                unstableUses
              )
            : []
        )
  );

// The authority on "unstable" is `@effect/tsgo` itself: with an empty `allowedUnstableApis` and the two stability
// diagnostics at error, it reports every member the TypeScript checker resolves to an API that Effect tags
// `@stability unstable` or `experimental`, however it was imported (a subpath, or the `effect` barrel).
const stabilityConfig =
  '{"allowedUnstableApis":[],"diagnosticSeverity":{"experimentalApiUsage":"error","unstableApiUsage":"error"}}';

const Diagnostics = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({ message: Schema.String, name: Schema.String })
  ),
});

const decodeDiagnostics = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Diagnostics)
);

const decodeManifest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(PackageManifest)
);

const stabilityNames = ["unstableApiUsage", "experimentalApiUsage"];

/**
 * The unstable or experimental Effect APIs the published sources (`src`, tests excluded) of one package use, as the
 * messages of `effect-tsgo diagnostics` run from `toolRoot` over a scratch tsconfig that extends the package's own.
 */
const unstableApiUses = (toolRoot: string, packageDirectory: string) =>
  Effect.gen(function* uses() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const scratch = yield* fs.makeTempDirectoryScoped();
    const project = path.join(scratch, "tsconfig.json");

    yield* fs.writeFileString(
      project,
      `{"extends":"${path.join(packageDirectory, "tsconfig.json")}","include":["${path.join(packageDirectory, "src", "**", "*.ts")}"],"exclude":["${path.join(packageDirectory, "src", "**", "*.test.ts")}"]}`
    );

    const output = yield* spawner.string(
      ChildProcess.make(
        "bunx",
        [
          "effect-tsgo",
          "diagnostics",
          "--project",
          project,
          "--lspconfig",
          stabilityConfig,
          "--format",
          "json",
        ],
        { cwd: toolRoot }
      )
    );

    const { diagnostics } = yield* decodeDiagnostics(output);

    return Arr.map(
      Arr.filter(diagnostics, (diagnostic) =>
        Arr.contains(stabilityNames, diagnostic.name)
      ),
      (diagnostic) => diagnostic.message
    );
  }).pipe(Effect.scoped);

// Any in-source `effect-diagnostics` directive can change what the diagnostics run reports: a rule switched off for a
// line or a file, a wildcard, a lowered severity, a rule name this check has not heard of yet. This check fails closed:
// a published package carries none (tests are not published and stay exempt), registered or not.
const diagnosticsDirective = /@effect-diagnostics/u;

/** The `file:line` of every directive in a package's published sources (tests excluded). */
const diagnosticDirectives = (packageDirectory: string) =>
  Effect.gen(function* directives() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const source = path.join(packageDirectory, "src");
    const entries = yield* fs.readDirectory(source, { recursive: true });

    const files = Arr.filter(
      entries,
      (entry) => Str.endsWith(".ts")(entry) && !Str.endsWith(".test.ts")(entry)
    );

    const perFile = yield* Effect.forEach(files, (file) =>
      Effect.map(fs.readFileString(path.join(source, file)), (text) =>
        Arr.filterMap(Str.split(text, "\n"), (line, index) =>
          diagnosticsDirective.test(line)
            ? Result.succeed(`src/${file}:${index + 1}`)
            : Result.failVoid
        )
      )
    );

    return Arr.flatten(perFile);
  });

/**
 * Findings for every package under `<packagesRoot>/packages`: the Effect range of each is checked against the unstable
 * APIs its published sources use. `toolRoot` is the directory `effect-tsgo` is installed in (the repository root).
 */
export const checkPublishedPackages = (
  packagesRoot: string,
  toolRoot: string
) =>
  Effect.gen(function* check() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const packagesDirectory = path.join(packagesRoot, "packages");
    const names = yield* fs.readDirectory(packagesDirectory);

    const perPackage = yield* Effect.forEach(names, (name) =>
      Effect.gen(function* one() {
        const directory = path.join(packagesDirectory, name);

        const manifest = yield* decodeManifest(
          yield* fs.readFileString(path.join(directory, "package.json"))
        );

        return [
          ...effectRangeFindings(
            manifest,
            yield* unstableApiUses(toolRoot, directory)
          ),
          ...Arr.map(
            yield* diagnosticDirectives(directory),
            (site) =>
              `${manifest.name}: ${site} has an @effect-diagnostics directive; a published package may not carry any, registered or not, because one can hide its unstable use from this check (any form, rule or severity)`
          ),
        ];
      })
    );

    return Arr.flatten(perPackage);
  });
