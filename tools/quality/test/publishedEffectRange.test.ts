import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import {
  checkPublishedPackages,
  effectRangeFindings,
} from "../publishedEffectRange.ts";

const manifest = (effect: string) => ({
  name: "pkg",
  peerDependencies: { effect },
});

const unstableUse = ["`effect/FileSystem#FileSystem` is an unstable API."];

describe("effectRangeFindings", () => {
  it("lets a package that uses only stable APIs take the next minor", () => {
    assert.deepStrictEqual(effectRangeFindings(manifest("^4.1.0"), []), []);
  });

  it("refuses a caret range when the package uses an unstable API", () => {
    assert.deepStrictEqual(
      effectRangeFindings(manifest("^4.1.0"), unstableUse),
      [
        'pkg: effect "^4.1.0" must stay below 4.2.0 (use ~4.1.0) because the package uses unstable or experimental Effect APIs: `effect/FileSystem#FileSystem` is an unstable API.',
      ]
    );
  });

  it("refuses an open lower bound when the package uses an unstable API", () => {
    assert.strictEqual(
      effectRangeFindings(manifest(">=4.1.0"), unstableUse).length,
      1
    );
  });

  it("accepts a tilde range, an exact version and a bounded range for an unstable use", () => {
    assert.deepStrictEqual(
      effectRangeFindings(manifest("~4.1.0"), unstableUse),
      []
    );

    assert.deepStrictEqual(
      effectRangeFindings(manifest("4.1.3"), unstableUse),
      []
    );

    assert.deepStrictEqual(
      effectRangeFindings(manifest(">=4.1.0 <4.2.0"), unstableUse),
      []
    );
  });

  it("refuses a range that reaches the minor after the floor even when bounded", () => {
    assert.strictEqual(
      effectRangeFindings(manifest(">=4.1.0 <4.3.0"), unstableUse).length,
      1
    );
  });

  it("refuses a floor below 4.1.0", () => {
    assert.deepStrictEqual(effectRangeFindings(manifest("~4.0.2"), []), [
      'pkg: effect "~4.0.2" starts below 4.1.0',
    ]);
  });

  it("applies to @effect/* runtime packages and to dependencies, not to test tooling", () => {
    const wide = {
      dependencies: { "@effect/platform-browser": "^4.1.0" },
      name: "pkg",
      peerDependencies: { "@effect/vitest": "^4.0.0" },
    };

    assert.deepStrictEqual(effectRangeFindings(wide, unstableUse), [
      'pkg: @effect/platform-browser "^4.1.0" must stay below 4.2.0 (use ~4.1.0) because the package uses unstable or experimental Effect APIs: `effect/FileSystem#FileSystem` is an unstable API.',
    ]);
  });

  it("reports a range it cannot read instead of passing it", () => {
    assert.strictEqual(effectRangeFindings(manifest("catalog:"), []).length, 1);
  });

  it("reports a range with an unparsed tail after a lower bound", () => {
    assert.deepStrictEqual(
      effectRangeFindings(manifest(">=4.1.0 || ^3.0.0"), []),
      [
        'pkg: effect ">=4.1.0 || ^3.0.0" is not a range this check reads (^, ~, exact, or >= with an optional < bound)',
      ]
    );
  });
});

const repositoryRoot = Effect.gen(function* root() {
  const path = yield* Path.Path;

  return yield* path.fromFileUrl(new URL("../../../", import.meta.url));
});

// A package `lib` in a temporary root. Its `node_modules` is a link to the library's, so `effect` resolves.
const writePackage = (root: string, effect: string, source: string) =>
  Effect.gen(function* tree() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = path.join(root, "packages", "lib");
    const repository = yield* repositoryRoot;

    yield* fs.makeDirectory(path.join(directory, "src"), { recursive: true });

    yield* fs.symlink(
      path.join(repository, "packages", "flow", "node_modules"),
      path.join(directory, "node_modules")
    );

    yield* fs.writeFileString(
      path.join(directory, "package.json"),
      `{"name":"lib","peerDependencies":{"effect":"${effect}"}}`
    );

    yield* fs.writeFileString(
      path.join(directory, "tsconfig.json"),
      '{"compilerOptions":{"plugins":[{"name":"@effect/language-service"}],"module":"nodenext","moduleResolution":"nodenext","strict":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["src/**/*.ts"]}'
    );

    yield* fs.writeFileString(path.join(directory, "src", "index.ts"), source);
  });

const barrelImport =
  'import { FileSystem } from "effect";\n\nexport const fileSystemTag = FileSystem.FileSystem;\n';

const subpathImport =
  'import { FileSystem } from "effect/FileSystem";\n\nexport const fileSystemTag = FileSystem.FileSystem;\n';

const stableImport =
  'import { Effect } from "effect";\n\nexport const noop = Effect.void;\n';

const findingsOf = (effect: string, source: string) =>
  Effect.gen(function* findings() {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped();

    yield* writePackage(root, effect, source);

    return yield* checkPublishedPackages(root, yield* repositoryRoot);
  }).pipe(Effect.provide(NodeServices.layer));

describe("checkPublishedPackages", () => {
  it.effect("passes on the packages of this repository", () =>
    Effect.gen(function* repository() {
      const root = yield* repositoryRoot;

      assert.deepStrictEqual(yield* checkPublishedPackages(root, root), []);
    }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "fails a package that uses an unstable API imported from the effect barrel under a caret range",
    () =>
      Effect.gen(function* barrel() {
        const findings = yield* findingsOf("^4.1.0", barrelImport);

        assert.strictEqual(findings.length, 1);
        assert.include(
          findings[0],
          'lib: effect "^4.1.0" must stay below 4.2.0'
        );
        assert.include(findings[0], "effect/FileSystem#FileSystem");
      })
  );

  it.effect("fails the same use imported from its subpath", () =>
    Effect.gen(function* subpath() {
      assert.strictEqual(
        (yield* findingsOf("^4.1.0", subpathImport)).length,
        1
      );
    })
  );

  it.effect("passes the same use under a tilde range", () =>
    Effect.gen(function* tilde() {
      assert.deepStrictEqual(yield* findingsOf("~4.1.0", barrelImport), []);
    })
  );

  it.effect(
    "passes a package that uses only stable APIs under a caret range",
    () =>
      Effect.gen(function* stable() {
        assert.deepStrictEqual(yield* findingsOf("^4.1.0", stableImport), []);
      })
  );
});
