import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Record as Rec,
  Result,
  Schema,
  String as Str,
} from "effect";

// Effect tags every export `@stability stable`, `unstable` or `experimental`. Since 4.0.0 an unstable or experimental
// API may break in a minor release; a stable one follows strict semver. A package that publishes code importing an
// unstable API must therefore not accept the next minor: its Effect range needs an upper bound below it. The set of
// unstable APIs is the one the root tsconfig lists in `allowedUnstableApis`.

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

// The range forms a manifest may use: `^x.y.z`, `~x.y.z`, `x.y.z`, `>=x.y.z`, `>=x.y.z <a.b.c`.
const parseRange = (text: string): Option.Option<Range> => {
  const range = Str.trim(text);

  const caret = versionIn(`^\\^${semver}$`, range);
  const tilde = versionIn(`^~${semver}$`, range);
  const exact = versionIn(`^${semver}$`, range);
  const lower = versionIn(`^>=${semver}(?: |$)`, range);

  const upper = Option.flatMap(
    Option.fromNullishOr(new RegExp(`^>=.* <${semver}$`, "u").exec(range)),
    ({ groups }) => toVersion(groups)
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

  return Option.map(lower, (floor) => ({ ceiling: upper, floor }));
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
  importsUnstableApi: boolean
): readonly string[] => {
  const parsed = parseRange(text);

  if (Option.isNone(parsed)) {
    return [
      `${owner}: ${name} "${text}" is not a range this check reads (^, ~, exact, >= with optional <)`,
    ];
  }

  const { ceiling, floor } = parsed.value;
  const nextMinor = bump({ ...floor, patch: 0 }, "minor");

  const floorFinding = Order.isLessThan(versionOrder)(floor, minimumEffect)
    ? [`${owner}: ${name} "${text}" starts below ${show(minimumEffect)}`]
    : [];

  const openFinding =
    importsUnstableApi &&
    !Option.exists(ceiling, (bound) =>
      Order.isLessThanOrEqualTo(versionOrder)(bound, nextMinor)
    )
      ? [
          `${owner}: ${name} "${text}" must stay below ${show(nextMinor)} (use ~${show(floor)}) because the package imports an unstable Effect API`,
        ]
      : [];

  return [...floorFinding, ...openFinding];
};

/**
 * Sentences that say how the Effect ranges of a published manifest are wrong: a floor below `minimumEffect`, an
 * unreadable range, or, when the package imports an unstable API, no upper bound below the next minor release.
 */
export const effectRangeFindings = (
  manifest: Manifest,
  importsUnstableApi: boolean
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
                importsUnstableApi
              )
            : []
        )
  );

const importSpecifier = /(?:from|import)\s*\(?\s*"(?<specifier>[^"]+)"/gu;

/** Whether `source` imports an API from `unstable`: a listed specifier, one below it, or any `unstable/` path. */
export const importsUnstable = (
  source: string,
  unstable: readonly string[]
): boolean =>
  Arr.some(
    Arr.filterMap(
      Arr.fromIterable(Str.matchAll(importSpecifier)(source)),
      ({ groups }) =>
        groups?.specifier === undefined
          ? Result.failVoid
          : Result.succeed(groups.specifier)
    ),
    (specifier) =>
      Str.includes("/unstable/")(specifier) ||
      Arr.some(
        unstable,
        (api) => specifier === api || Str.startsWith(`${api}/`)(specifier)
      )
  );

const TsConfig = Schema.Struct({
  compilerOptions: Schema.Struct({
    plugins: Schema.Array(
      Schema.Struct({
        allowedUnstableApis: Schema.optional(Schema.Array(Schema.String)),
      })
    ),
  }),
});

const decodeManifest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(PackageManifest)
);

const decodeTsConfig = Schema.decodeUnknownEffect(
  Schema.fromJsonString(TsConfig)
);

const publishedSources = (directory: string) =>
  Effect.gen(function* sources() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(directory, { recursive: true });

    return Arr.map(
      Arr.filter(
        entries,
        (entry) =>
          Str.endsWith(".ts")(entry) &&
          !Str.endsWith(".test.ts")(entry) &&
          !Str.includes("node_modules")(entry)
      ),
      (entry) => path.join(directory, entry)
    );
  });

/**
 * Findings for every package under `<root>/packages`: the Effect range of each is checked against the unstable APIs
 * its published sources (not its tests) import. The unstable set is `allowedUnstableApis` of the root tsconfig.
 */
export const checkPublishedPackages = (root: string) =>
  Effect.gen(function* check() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const tsconfig = yield* decodeTsConfig(
      yield* fs.readFileString(path.join(root, "tsconfig.json"))
    );

    const unstable = Arr.flatMap(
      tsconfig.compilerOptions.plugins,
      (plugin) => plugin.allowedUnstableApis ?? []
    );

    const packagesDirectory = path.join(root, "packages");

    const names = yield* fs.readDirectory(packagesDirectory);

    const perPackage = yield* Effect.forEach(names, (name) =>
      Effect.gen(function* one() {
        const directory = path.join(packagesDirectory, name);

        const manifest = yield* decodeManifest(
          yield* fs.readFileString(path.join(directory, "package.json"))
        );

        const files = yield* publishedSources(path.join(directory, "src"));

        const texts = yield* Effect.forEach(files, (file) =>
          fs.readFileString(file)
        );

        return effectRangeFindings(
          manifest,
          Arr.some(texts, (text) => importsUnstable(text, unstable))
        );
      })
    );

    return Arr.flatten(perPackage);
  });
