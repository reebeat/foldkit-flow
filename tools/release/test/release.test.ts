// The release rules (spec 0005): which packages are published, the manifest that ships for each, what a tarball may
// hold, and that Changesets knows exactly the published set; and the licence hygiene of what ships. Each rule has a
// control that breaks it in a fixture, and each runs on the real manifests.
// Copied from phibkro/pg-txmode (Apache-2.0, Copyright 2026 Philip Bjørknes Krogh) `tools/quality/test/release.test.ts`
// at 23be53c0c66a129540350697253b5c19abde3171, which follows tsukuri-labs/tsukuri spec 0009 (PR #29, merge commit
// d0c5a1de330200302edbad58784f351b09eeb4f8). Deviations: this repository's one package; the CSS export, `sideEffects`,
// the licence and the Effect peer tests are new; the harness and `bin` tests are dropped. This file remains Apache-2.0
// under its header: see PROVENANCE.md and LICENSES/.
import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import {
  consumerSource,
  describePack,
  entryPoints,
  importFindings,
  ManifestSchema,
  publishedPackages,
  releaseManifest,
  RootSchema,
  strayFiles,
  unboundedPeers,
  unpublishedDependencies,
} from "../release.ts";
import type {
  Context,
  Manifest,
  PackageEntry,
  RootManifest,
} from "../release.ts";
import { repoRoot, runBash } from "./scriptHarness.ts";

const readText = (file: string): string =>
  readFileSync(path.join(repoRoot, file), "utf-8");

const readJson = <T>(file: string, schema: z.ZodType<T>): T =>
  schema.parse(JSON.parse(readText(file)));

const workspace: readonly PackageEntry[] = globSync("packages/*/package.json", {
  cwd: repoRoot,
})
  .toSorted()
  .map((file) => ({
    dir: path.dirname(file),
    manifest: readJson(file, ManifestSchema),
  }));

const root: RootManifest = readJson("package.json", RootSchema);

const published = publishedPackages(workspace);
const publishedNames = published.map((entry) => entry.manifest.name).toSorted();

const context: Context = {
  catalog: root.catalog,
  versions: new Map(
    published.map((entry) => [entry.manifest.name, entry.manifest.version])
  ),
};

/** A published package in the shape of the real one, with the fields a control changes. */
const fixture = (changes: Partial<Manifest>): PackageEntry => ({
  dir: "packages/probe",
  manifest: {
    dependencies: {},
    description: "A probe.",
    devDependencies: {},
    exports: { ".": "./src/index.ts" },
    homepage: "https://example.test",
    license: "MIT",
    name: "@probe/probe",
    peerDependencies: {},
    publishConfig: { access: "public", directory: "dist" },
    repository: {
      directory: "packages/probe",
      type: "git",
      url: "git+https://example.test/probe.git",
    },
    version: "1.0.0",
    ...changes,
  },
});

const problems = (entry: PackageEntry): readonly string[] => {
  const staged = releaseManifest(entry, root, context);

  return staged.ok ? [] : staged.problems;
};

const mentions =
  (text: string) =>
  (lines: readonly string[]): boolean =>
    lines.some((line) => line.includes(text));

const ChangesetConfig = z.object({
  access: z.string(),
  fixed: z.array(z.array(z.string())),
});

const Pre = z.object({ mode: z.string(), tag: z.string() });

/** The version `bun.lock` records for a workspace package (the lock file is JSONC: read by pattern). */
const lockedVersion = (text: string, name: string): string | undefined =>
  new RegExp(`"name": "${name}",\\s*"version": "(?<version>[^"]+)"`, "u").exec(
    text
  )?.groups?.version;

describe("which packages are published", () => {
  test("@tsukuri/flow only; the example and the tools stay private", () => {
    expect(publishedNames).toStrictEqual(["@tsukuri/flow"]);
    expect(
      globSync("{apps,tools}/*/package.json", { cwd: repoRoot }).flatMap(
        (file) =>
          readJson(file, ManifestSchema).private === true ? [] : [file]
      )
    ).toStrictEqual([]);
  });

  test("Changesets versions exactly the published set, in lockstep, as public alpha prereleases", () => {
    const config = readJson(".changeset/config.json", ChangesetConfig);

    expect(config.access).toBe("public");
    expect(config.fixed.map((group) => [...group].toSorted())).toStrictEqual([
      publishedNames,
    ]);
  });

  test("bun.lock records the version of each published workspace package, so a plain `bun install` makes no diff after a version commit", () => {
    const lock = readText("bun.lock");

    for (const entry of published) {
      expect(
        lockedVersion(lock, entry.manifest.name),
        entry.manifest.name
      ).toBe(entry.manifest.version);
      // Control: a lock written before the version commit records another version, and the same check fails it.
      expect(
        lockedVersion(
          lock.replace(
            `"version": "${entry.manifest.version}"`,
            '"version": "0.0.0"'
          ),
          entry.manifest.name
        )
      ).not.toBe(entry.manifest.version);
    }
  });

  test("the pre mode is alpha: the file is committed, so a dispatch before the version commit still tags alpha", () => {
    // Extra keys that `changeset version` adds (the consumed changesets) are not part of the rule: the schema drops them.
    expect(readJson(".changeset/pre.json", Pre)).toStrictEqual({
      mode: "pre",
      tag: "alpha",
    });
  });

  test("no published package depends on one that is not published (control)", () => {
    const names = new Set(workspace.map((entry) => entry.manifest.name));
    const publishedSet = new Set(publishedNames);

    for (const entry of published) {
      expect(unpublishedDependencies(entry, publishedSet, names)).toStrictEqual(
        []
      );
    }

    // A workspace package that is private: the fixture adds one to the workspace names.
    expect(
      unpublishedDependencies(
        fixture({ dependencies: { "@probe/private": "workspace:*" } }),
        publishedSet,
        new Set([...names, "@probe/private"])
      )
    ).toStrictEqual(["@probe/private"]);
  });
});

describe("the manifest that ships", () => {
  test("the real package builds a clean manifest: no workspace: or catalog: left, MIT, public access, built exports", () => {
    for (const entry of published) {
      const staged = releaseManifest(entry, root, context);

      expect(staged.ok).toBe(true);

      if (staged.ok) {
        expect(JSON.stringify(staged.manifest)).not.toMatch(
          /workspace:|catalog:/u
        );
        expect(staged.manifest.license).toBe("MIT");
        expect(staged.manifest.publishConfig).toStrictEqual({
          access: "public",
        });
        expect(JSON.stringify(staged.manifest.exports)).not.toContain(".ts");
        expect(JSON.stringify(staged.manifest.exports)).not.toContain("src/");
      }
    }
  });

  test("@tsukuri/flow ships ESM with declarations, the stylesheet, and a sideEffects list of the stylesheet alone", () => {
    const flow = published.find(
      (entry) => entry.manifest.name === "@tsukuri/flow"
    );

    const staged = releaseManifest(flow ?? fixture({}), root, context);

    expect(staged.ok).toBe(true);

    if (staged.ok) {
      expect(staged.manifest.type).toBe("module");
      expect(staged.manifest.main).toBe("./index.mjs");
      expect(staged.manifest.types).toBe("./index.d.mts");
      expect(staged.manifest.exports).toStrictEqual({
        ".": { default: "./index.mjs", types: "./index.d.mts" },
        "./flow.css": { default: "./flow.css" },
        "./testing": { default: "./testing.mjs", types: "./testing.d.mts" },
      });
      expect(staged.manifest.sideEffects).toStrictEqual(["./flow.css"]);
      expect(staged.manifest.license).toBe("MIT");
      expect(staged.manifest.repository.url).toBe(
        "git+https://github.com/tsukuri-labs/foldkit-flow.git"
      );
    }
  });

  test("rewrites workspace:* to the version and catalog: to the catalog's, and puts types before default", () => {
    const staged = releaseManifest(
      fixture({
        dependencies: { "@tsukuri/flow": "workspace:*", zod: "catalog:" },
        exports: {
          ".": "./src/index.ts",
          "./cancel": "./src/cancel.ts",
          "./style.css": "./src/style.css",
        },
      }),
      root,
      { ...context, catalog: { zod: "4.6.7" } }
    );

    expect(staged.ok).toBe(true);

    if (staged.ok) {
      expect(staged.manifest.dependencies).toStrictEqual({
        "@tsukuri/flow": context.versions.get("@tsukuri/flow"),
        zod: "^4.6.7",
      });
      expect(
        Object.keys(staged.manifest.exports["./cancel"] ?? {})
      ).toStrictEqual(["types", "default"]);
      expect(staged.manifest.exports["./style.css"]).toStrictEqual({
        default: "./style.css",
      });
      expect(staged.manifest.sideEffects).toStrictEqual(["./style.css"]);
    }
  });

  test("builds only the TypeScript exports; a stylesheet is copied, not built", () => {
    expect(
      entryPoints(
        fixture({
          exports: { ".": "./src/index.ts", "./a.css": "./src/a.css" },
        }).manifest
      )
    ).toStrictEqual(["./src/index.ts"]);
  });

  test("fails a dependency that npm cannot resolve (controls)", () => {
    expect(
      mentions("is workspace:* but is not a published package")(
        problems(fixture({ dependencies: { "@probe/private": "workspace:*" } }))
      )
    ).toBe(true);
    expect(
      mentions("is catalog: but not in the catalog")(
        problems(fixture({ dependencies: { nothing: "catalog:" } }))
      )
    ).toBe(true);
    expect(
      mentions("which npm cannot resolve")(
        problems(fixture({ dependencies: { zod: "workspace:^" } }))
      )
    ).toBe(true);
    expect(
      mentions("which npm cannot resolve")(
        problems(fixture({ peerDependencies: { zod: "catalog:default" } }))
      )
    ).toBe(true);
  });

  test("fails a licence that is not the repository's, a missing description, homepage, repository or public access, an export that is not a source file, and a name clash (controls)", () => {
    expect(
      mentions("license is Apache-2.0")(
        problems(fixture({ license: "Apache-2.0" }))
      )
    ).toBe(true);
    expect(
      mentions("description is missing")(
        problems(fixture({ description: undefined }))
      )
    ).toBe(true);
    expect(
      mentions("homepage is missing")(
        problems(fixture({ homepage: undefined }))
      )
    ).toBe(true);
    expect(
      mentions("repository is missing")(
        problems(fixture({ repository: undefined }))
      )
    ).toBe(true);
    expect(
      mentions("publishConfig.access")(
        problems(fixture({ publishConfig: { directory: "dist" } }))
      )
    ).toBe(true);
    expect(
      mentions("publishConfig.directory")(
        problems(fixture({ publishConfig: { access: "public" } }))
      )
    ).toBe(true);
    expect(
      mentions("not a ./src/*.ts or ./src/*.css file")(
        problems(fixture({ exports: { ".": "./index.js" } }))
      )
    ).toBe(true);
    expect(
      mentions("would both build to index.mjs")(
        problems(
          fixture({
            exports: { ".": "./src/index.ts", "./other": "./src/x/index.ts" },
          })
        )
      )
    ).toBe(true);
    expect(
      mentions("is not a plain version")(
        problems(fixture({ version: "workspace:*" }))
      )
    ).toBe(true);
  });

  test("a published package refuses to be published from its source directory", () => {
    for (const entry of published) {
      const script = readJson(
        path.join(entry.dir, "package.json"),
        z.object({ scripts: z.object({ prepublishOnly: z.string() }) })
      ).scripts.prepublishOnly;

      expect(runBash(["-c", script], {}, repoRoot).exitCode).toBe(1);
    }
  });

  test("the scratch consumer imports every typed export and no stylesheet", () => {
    const staged = releaseManifest(
      fixture({
        exports: {
          ".": "./src/index.ts",
          "./a.css": "./src/a.css",
          "./testing": "./src/testing.ts",
        },
      }),
      root,
      context
    );

    expect(staged.ok).toBe(true);

    if (staged.ok) {
      expect(consumerSource(staged.manifest)).toBe(
        'export * as entry0 from "@probe/probe";\nexport * as entry1 from "@probe/probe/testing";\n'
      );
    }
  });
});

const listing = (...files: readonly string[]) => [
  {
    files: files.map((file, index) => ({ path: file, size: 10 * (index + 1) })),
    size: 7,
    unpackedSize: 99,
  },
];

describe("the size of what ships, read from a script", () => {
  test("describePack names the file count, the packed and unpacked bytes, and each file with its size", () => {
    expect(
      describePack("@probe/probe", listing("index.mjs", "LICENSE"))
    ).toStrictEqual([
      "@probe/probe: 2 files, 7 bytes packed, 99 unpacked",
      "       10 index.mjs",
      "       20 LICENSE",
    ]);
  });
});

describe("what a tarball may hold", () => {
  test("built output, the stylesheet, the manifest and the documents only", () => {
    expect(
      strayFiles(
        listing(
          "index.mjs",
          "index.d.mts",
          "extract-D8E.mjs",
          "flow.css",
          "package.json",
          "README.md",
          "CHANGELOG.md",
          "LICENSE",
          "NOTICE"
        )
      )
    ).toStrictEqual([]);
  });

  test("fails source, tests, maps, build info, nested files and the Apache text (controls)", () => {
    expect(
      strayFiles(
        listing(
          "index.mjs",
          "src/index.ts",
          "index.mjs.map",
          "test/x.test.ts",
          "tsconfig.tsbuildinfo",
          "nested/index.mjs",
          ".npmrc",
          "LICENSES/Apache-2.0.txt"
        )
      )
    ).toStrictEqual([
      "src/index.ts",
      "index.mjs.map",
      "test/x.test.ts",
      "tsconfig.tsbuildinfo",
      "nested/index.mjs",
      ".npmrc",
      "LICENSES/Apache-2.0.txt",
    ]);
  });
});

const built = (name: string, text: string) => [{ name, text }];

describe("what a built file may import", () => {
  const { manifest } = fixture({
    dependencies: { "@types/pg": "8.0.0", pg: "8.0.0", zod: "4.0.0" },
    devDependencies: { "@types/node": "1.0.0" },
    peerDependencies: { peerlib: ">=1.0.0 <2.0.0" },
  });

  test("declared packages, subpaths, relative and node: imports are fine", () => {
    expect(
      importFindings(
        manifest,
        built(
          "index.mjs",
          'import { z } from "zod";\nimport { a } from "peerlib/sub/path";\nimport x from "./chunk-1.mjs";\nimport fs from "node:fs";\nconst m = await import("pg");'
        )
      )
    ).toStrictEqual([]);
  });

  test('reads a side-effect import: an undeclared package or a development dependency named in `import "x"` fails (controls)', () => {
    expect(
      importFindings(
        manifest,
        built(
          "index.mjs",
          'import "left-pad";\nimport "@types/node";\nimport "./chunk-1.mjs";'
        )
      )
    ).toStrictEqual([
      "@probe/probe: index.mjs imports left-pad, which is not in dependencies or peerDependencies",
      "@probe/probe: index.mjs imports @types/node, which is not in dependencies or peerDependencies",
    ]);
    expect(
      importFindings(
        manifest,
        built("index.mjs", 'import "zod";\nimport "peerlib/sub";')
      )
    ).toStrictEqual([]);
  });

  test("fails a bare import that is not a dependency or a peer (control)", () => {
    expect(
      importFindings(
        manifest,
        built(
          "index.mjs",
          'import { x } from "left-pad";\nimport y from "@scope/lib/sub";'
        )
      )
    ).toStrictEqual([
      "@probe/probe: index.mjs imports left-pad, which is not in dependencies or peerDependencies",
      "@probe/probe: index.mjs imports @scope/lib, which is not in dependencies or peerDependencies",
    ]);
  });

  test("fails declarations whose types come from a development dependency, imported or augmented (control)", () => {
    const typed = fixture({
      dependencies: { pg: "8.0.0" },
      devDependencies: { "@types/pg": "8.0.0" },
    }).manifest;

    const finding =
      "@probe/probe: index.d.mts imports pg, and its types @types/pg are a devDependency, which does not ship";

    for (const text of [
      'import { Pool } from "pg";',
      'declare module "pg" { interface Client {} }',
    ]) {
      expect(importFindings(typed, built("index.d.mts", text))).toStrictEqual([
        finding,
      ]);
      expect(importFindings(typed, built("index.mjs", text))).toStrictEqual([]);
      expect(
        importFindings(manifest, built("index.d.mts", text))
      ).toStrictEqual([]);
    }
  });

  test("maps a scoped package to its types name", () => {
    const scoped = fixture({
      dependencies: { "@scope/lib": "1.0.0" },
      devDependencies: { "@types/scope__lib": "1.0.0" },
    }).manifest;

    expect(
      importFindings(
        scoped,
        built("index.d.mts", 'import { a } from "@scope/lib/sub";')
      )
    ).toStrictEqual([
      "@probe/probe: index.d.mts imports @scope/lib, and its types @types/scope__lib are a devDependency, which does not ship",
    ]);
  });
});

describe("the peer ranges", () => {
  const flow = workspace.find(
    (entry) => entry.manifest.name === "@tsukuri/flow"
  );

  test("@tsukuri/flow peers on effect ~4.1.0 and foldkit ~0.170.0, both below the next minor", () => {
    expect(flow?.manifest.peerDependencies).toStrictEqual({
      effect: "~4.1.0",
      foldkit: "~0.170.0",
    });
    expect(
      unboundedPeers(flow?.manifest ?? fixture({}).manifest)
    ).toStrictEqual([]);
  });

  test("fails a caret or open range (controls)", () => {
    expect(
      unboundedPeers(
        fixture({ peerDependencies: { effect: "^4.1.0" } }).manifest
      )
    ).toStrictEqual(["effect"]);
    expect(
      unboundedPeers(
        fixture({ peerDependencies: { foldkit: ">=0.170.0" } }).manifest
      )
    ).toStrictEqual(["foldkit"]);
    expect(
      unboundedPeers(
        fixture({
          peerDependencies: { effect: ">=4.1.0 <4.2.0", other: "~1.2.0" },
        }).manifest
      )
    ).toStrictEqual([]);
  });
});

describe("licence hygiene: what ships is flow's own MIT code and its attributions", () => {
  const flowSources = globSync("packages/flow/src/**/*.{ts,css}", {
    cwd: repoRoot,
  }).filter((file) => !file.endsWith(".test.ts"));

  test("the repository LICENSE is the MIT text of the standard form, and the shipped package says MIT", () => {
    const text = readText("LICENSE");

    expect(
      text.startsWith("MIT License\n\nCopyright 2026 Philip Bjørknes Krogh\n")
    ).toBe(true);
    expect(text).toContain("Permission is hereby granted, free of charge");
    expect(text).not.toContain("Apache");
    expect(root.license).toBe("MIT");
  });

  test("no source of the package carries an Apache or other copied-code header: it is original MIT code (control: the scan finds one in a copied tool)", () => {
    expect(flowSources.length).toBeGreaterThan(5);

    for (const file of flowSources) {
      expect(readText(file)).not.toMatch(
        /Apache|Copied from|Provenance: (?:copied|adapted)/iu
      );
    }

    // The tooling copied from Apache-2.0 repositories does carry its header (the scan can see one).
    expect(readText("tools/release/release.ts")).toMatch(/Apache-2\.0/u);
  });

  test("NOTICE attributes xyflow (MIT) and d3 (ISC), and the Apache text is kept in LICENSES/ for the copied files, outside the package", () => {
    const notice = readText("NOTICE");

    expect(notice).toContain("@xyflow/system");
    expect(notice).toContain("MIT licence");
    expect(notice).toContain("ISC licence");
    expect(notice).toContain("PROVENANCE.md");
    expect(readText("LICENSES/Apache-2.0.txt")).toContain(
      "Apache License\n                           Version 2.0, January 2004"
    );
  });

  test("PROVENANCE.md names every file copied from pg-txmode and its commit, and each copy keeps its Apache-2.0 header", () => {
    const provenance = readText("PROVENANCE.md");

    const withHeader = [
      "tools/release/release.ts",
      "tools/release/releaseWorkflow.ts",
      "tools/release/stagePackages.ts",
      "tools/release/test/release.test.ts",
      "tools/release/test/releaseWorkflow.test.ts",
      "tools/release/test/scriptHarness.ts",
      ".github/workflows/release.yml",
    ];

    for (const file of [...withHeader, ".changeset/config.json"]) {
      expect(provenance, file).toContain(path.basename(file));
    }

    // JSON has no comment: `.changeset/config.json` is covered by its row in PROVENANCE.md alone.
    for (const file of withHeader) {
      expect(readText(file).split("\n").slice(0, 12).join("\n"), file).toMatch(
        /Apache-2\.0/u
      );
    }

    expect(provenance).toContain("23be53c0c66a129540350697253b5c19abde3171");
  });

  test("the package README says the testing export is a test helper and keeps the xyflow credit", () => {
    const readme = readText("packages/flow/README.md");

    expect(readme).toContain("@tsukuri/flow/testing");
    expect(readme).toMatch(/test helper/iu);
    expect(readme).toContain("xyflow");
  });
});
