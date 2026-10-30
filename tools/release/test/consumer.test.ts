// The scratch consumer of `release:stage` (spec 0005): a staged package is used from an empty project that has only what
// its manifest declares, and `tsc` runs without `skipLibCheck`. Each rule has a control that breaks it in a fixture.
import path from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { consumerFindings } from "../consumer.ts";
import type { ShippedManifest } from "../release.ts";
import { repoRoot, withScratch, writeFixture } from "./scriptHarness.ts";

const tsc = path.join(repoRoot, "node_modules", ".bin", "tsc");

const manifest = (
  dependencies: Readonly<Record<string, string>>
): ShippedManifest => ({
  bugs: "https://example.test/issues",
  dependencies,
  description: "A probe.",
  exports: { ".": { default: "./index.mjs", types: "./index.d.mts" } },
  homepage: "https://example.test",
  license: "MIT",
  name: "@probe/probe",
  publishConfig: { access: "public" },
  repository: { directory: "packages/probe", type: "git", url: "git+x" },
  sideEffects: [],
  type: "module",
  version: "1.0.0",
});

interface Fixture {
  /** The text of the dependency's declaration file. */
  readonly dependencyTypes?: string;
  /** What the staged package's declaration file says. */
  readonly distTypes?: string;
  readonly installed?: boolean;
  readonly manifest: ShippedManifest;
}

/** Stages a probe package and a dependency `fakedep` in a scratch directory and runs the consumer check over them. */
const check = (fixture: Fixture): readonly string[] =>
  withScratch((dir) => {
    const dist = path.join(dir, "dist");
    const dependency = path.join(dir, "fakedep");

    writeFixture(
      path.join(dist, "package.json"),
      JSON.stringify(fixture.manifest)
    );
    writeFixture(
      path.join(dist, "index.d.mts"),
      fixture.distTypes ??
        'import type { Thing } from "fakedep";\nexport declare const thing: Thing;\n'
    );
    writeFixture(path.join(dist, "index.mjs"), "export const thing = {};\n");
    writeFixture(
      path.join(dependency, "package.json"),
      '{"name":"fakedep","version":"1.0.0","types":"index.d.ts"}\n'
    );
    writeFixture(
      path.join(dependency, "index.d.ts"),
      fixture.dependencyTypes ?? "export interface Thing { a: number }\n"
    );

    return consumerFindings({
      dist,
      installed: (name) =>
        name === "fakedep" && fixture.installed !== false
          ? dependency
          : undefined,
      manifest: fixture.manifest,
      tsc,
    });
  });

describe("the scratch consumer", () => {
  test("passes a package whose declarations import only what it declares", () => {
    expect(check({ manifest: manifest({ fakedep: "1.0.0" }) })).toStrictEqual(
      []
    );
  });

  test("fails a declaration that imports a package the manifest does not declare (control)", () => {
    const [finding] = check({ manifest: manifest({}) });

    expect(finding).toContain("fails");
    expect(finding).toContain("fakedep");
  });

  test("fails a declared package that the workspace did not install (control)", () => {
    expect(
      check({ installed: false, manifest: manifest({ fakedep: "1.0.0" }) })
    ).toStrictEqual(["@probe/probe: fakedep is declared but not installed"]);
  });

  test("runs without skipLibCheck: a type error inside a declaration file fails (control)", () => {
    const [finding] = check({
      dependencyTypes: "export interface Thing { a: Missing }\n",
      manifest: manifest({ fakedep: "1.0.0" }),
    });

    expect(finding).toContain("Missing");
  });
});
