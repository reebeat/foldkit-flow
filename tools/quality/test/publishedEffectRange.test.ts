import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import {
  checkPublishedPackages,
  effectRangeFindings,
  importsUnstable,
} from "../publishedEffectRange.ts";

const manifest = (effect: string) => ({
  name: "pkg",
  peerDependencies: { effect },
});

describe("effectRangeFindings", () => {
  it("lets a package that uses only stable APIs take the next minor", () => {
    assert.deepStrictEqual(effectRangeFindings(manifest("^4.1.0"), false), []);
  });

  it("refuses a caret range when the package imports an unstable API", () => {
    assert.deepStrictEqual(effectRangeFindings(manifest("^4.1.0"), true), [
      'pkg: effect "^4.1.0" must stay below 4.2.0 (use ~4.1.0) because the package imports an unstable Effect API',
    ]);
  });

  it("refuses an open lower bound when the package imports an unstable API", () => {
    assert.strictEqual(
      effectRangeFindings(manifest(">=4.1.0"), true).length,
      1
    );
  });

  it("accepts a tilde range, an exact version and a bounded range for an unstable import", () => {
    assert.deepStrictEqual(effectRangeFindings(manifest("~4.1.0"), true), []);
    assert.deepStrictEqual(effectRangeFindings(manifest("4.1.3"), true), []);
    assert.deepStrictEqual(
      effectRangeFindings(manifest(">=4.1.0 <4.2.0"), true),
      []
    );
  });

  it("refuses a range that reaches the minor after the floor even when bounded", () => {
    assert.strictEqual(
      effectRangeFindings(manifest(">=4.1.0 <4.3.0"), true).length,
      1
    );
  });

  it("refuses a floor below 4.1.0", () => {
    assert.deepStrictEqual(effectRangeFindings(manifest("~4.0.2"), false), [
      'pkg: effect "~4.0.2" starts below 4.1.0',
    ]);
  });

  it("applies to @effect/* runtime packages and to dependencies, not to test tooling", () => {
    const wide = {
      dependencies: { "@effect/platform-browser": "^4.1.0" },
      devDependencies: { "@effect/vitest": "^4.0.0" },
      name: "pkg",
      peerDependencies: { "@effect/vitest": "^4.0.0" },
    };

    assert.deepStrictEqual(effectRangeFindings(wide, true), [
      'pkg: @effect/platform-browser "^4.1.0" must stay below 4.2.0 (use ~4.1.0) because the package imports an unstable Effect API',
    ]);
  });

  it("reports a range it cannot read instead of passing it", () => {
    assert.strictEqual(
      effectRangeFindings(manifest("catalog:"), false).length,
      1
    );
  });
});

describe("importsUnstable", () => {
  const unstable = ["effect/FileSystem", "effect/cli"];

  it("finds a listed specifier, one below it and any unstable/ path", () => {
    assert.isTrue(
      importsUnstable('import { x } from "effect/FileSystem";', unstable)
    );
    assert.isTrue(
      importsUnstable('import { x } from "effect/cli/Command";', unstable)
    );
    assert.isTrue(
      importsUnstable('import { x } from "effect/unstable/http";', unstable)
    );
    assert.isTrue(
      importsUnstable('const m = await import("effect/FileSystem");', unstable)
    );
  });

  it("ignores stable imports and look-alike prefixes", () => {
    assert.isFalse(
      importsUnstable('import { Effect } from "effect";', unstable)
    );
    assert.isFalse(
      importsUnstable('import { x } from "effect/FileSystemX";', unstable)
    );
  });
});

const writeTree = (root: string, effect: string, source: string) =>
  Effect.gen(function* tree() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = path.join(root, "packages", "lib");

    yield* fs.makeDirectory(path.join(directory, "src"), { recursive: true });

    yield* fs.writeFileString(
      path.join(root, "tsconfig.json"),
      '{"compilerOptions":{"plugins":[{"allowedUnstableApis":["effect/FileSystem"]}]}}'
    );

    yield* fs.writeFileString(
      path.join(directory, "package.json"),
      `{"name":"lib","peerDependencies":{"effect":"${effect}"}}`
    );

    yield* fs.writeFileString(path.join(directory, "src", "index.ts"), source);
  });

describe("checkPublishedPackages", () => {
  it.effect("passes on the packages of this repository", () =>
    Effect.gen(function* repository() {
      const path = yield* Path.Path;

      const findings = yield* checkPublishedPackages(
        yield* path.fromFileUrl(new URL("../../../", import.meta.url))
      );

      assert.deepStrictEqual(findings, []);
    }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "fails a package that imports an unstable API under a caret range",
    () =>
      Effect.gen(function* caret() {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();

        yield* writeTree(
          root,
          "^4.1.0",
          'import { FileSystem } from "effect/FileSystem";\nexport { FileSystem };\n'
        );

        assert.deepStrictEqual(yield* checkPublishedPackages(root), [
          'lib: effect "^4.1.0" must stay below 4.2.0 (use ~4.1.0) because the package imports an unstable Effect API',
        ]);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect("passes the same package under a tilde range", () =>
    Effect.gen(function* tilde() {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();

      yield* writeTree(
        root,
        "~4.1.0",
        'import { FileSystem } from "effect/FileSystem";\nexport { FileSystem };\n'
      );

      assert.deepStrictEqual(yield* checkPublishedPackages(root), []);
    }).pipe(Effect.provide(NodeServices.layer))
  );
});
