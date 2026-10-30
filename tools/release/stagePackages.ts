// `bun run release:stage`: builds what is published, into `packages/<name>/dist`, and checks that nothing else ships
// (spec 0005). For each published package: `vp pack` of its TypeScript exports with declarations, its CSS exports as
// they are, the manifest that ships (`releaseManifest`), the repository's LICENSE and NOTICE, a README, and the CHANGELOG
// when Changesets wrote one. Then `npm pack --dry-run --json` of a copy outside the repository (npm refuses to run below
// a root `package.json` whose `devEngines.packageManager` names another tool) and a failure on any file that is not
// built output, on any import of a built file that the manifest does not ship the means to resolve (`importFindings`),
// and on a scratch consumer: the staged package installed in an empty project, with only what its manifest declares,
// and type-checked WITHOUT `skipLibCheck` (a declaration that imports a package whose types do not ship fails there).
// Copied from phibkro/pg-txmode (Apache-2.0, Copyright 2026 Philip Bjørknes Krogh) `tools/quality/stagePackages.ts` at
// 23be53c0c66a129540350697253b5c19abde3171 (specs 0006 and 0007). Deviations: no `bin`; CSS assets are copied; the scratch consumer is new; the fallback README
// names the package's own homepage. This file remains Apache-2.0 under its header: see PROVENANCE.md and LICENSES/.
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  globSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { consumerFindings } from "./consumer.ts";
import {
  assetFiles,
  entryPoints,
  importFindings,
  ManifestSchema,
  PackListingSchema,
  publishedPackages,
  releaseManifest,
  RootSchema,
  strayFiles,
} from "./release.ts";
import type { BuiltFile, PackageEntry, ShippedManifest } from "./release.ts";

const root = path.resolve(import.meta.dirname, "../..");

const readText = (file: string): string => readFileSync(file, "utf-8");

const workspacePackages = (): readonly PackageEntry[] =>
  globSync("packages/*/package.json", { cwd: root })
    .toSorted()
    .map((file) => ({
      dir: path.dirname(file),
      manifest: ManifestSchema.parse(
        JSON.parse(readText(path.join(root, file)))
      ),
    }));

const run = (command: string, args: readonly string[], cwd: string): string =>
  execFileSync(command, [...args], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "inherit"],
  });

const stage = (entry: PackageEntry, manifest: ShippedManifest): void => {
  const dir = path.join(root, entry.dir);
  const dist = path.join(dir, "dist");

  rmSync(dist, { force: true, recursive: true });
  run(
    "bunx",
    [
      "vp",
      "pack",
      ...entryPoints(entry.manifest),
      "--dts",
      "--out-dir",
      "dist",
    ],
    dir
  );

  for (const asset of assetFiles(entry.manifest)) {
    copyFileSync(path.join(dir, asset), path.join(dist, path.basename(asset)));
  }

  writeFileSync(
    path.join(dist, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  copyFileSync(path.join(root, "LICENSE"), path.join(dist, "LICENSE"));
  copyFileSync(path.join(root, "NOTICE"), path.join(dist, "NOTICE"));

  // A package's own README ships when it has one; the others get a short generated one.
  if (existsSync(path.join(dir, "README.md"))) {
    copyFileSync(path.join(dir, "README.md"), path.join(dist, "README.md"));
  } else {
    writeFileSync(
      path.join(dist, "README.md"),
      `# ${entry.manifest.name}\n\n${entry.manifest.description}\n\nDocumentation: ${manifest.homepage}\n`
    );
  }

  if (existsSync(path.join(dir, "CHANGELOG.md"))) {
    copyFileSync(
      path.join(dir, "CHANGELOG.md"),
      path.join(dist, "CHANGELOG.md")
    );
  }
};

/** The files `npm pack` would put in the tarball of `dist`, taken from a copy outside the repository. */
const tarballFiles = (dist: string): readonly string[] => {
  const scratch = mkdtempSync(path.join(tmpdir(), "foldkit-flow-pack-"));

  try {
    cpSync(dist, scratch, { recursive: true });

    return strayFiles(
      PackListingSchema.parse(
        JSON.parse(run("npm", ["pack", "--dry-run", "--json"], scratch))
      )
    );
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
};

/** Where this workspace installed a dependency: the package's own `node_modules`, else the root's. */
const installedPackage = (dir: string, name: string): string | undefined => {
  const found = [
    path.join(root, dir, "node_modules", name),
    path.join(root, "node_modules", name),
  ].find((candidate) => existsSync(candidate));

  return found === undefined ? undefined : realpathSync(found);
};

const rootManifest = RootSchema.parse(
  JSON.parse(readText(path.join(root, "package.json")))
);

const published = publishedPackages(workspacePackages());

const context = {
  catalog: rootManifest.catalog,
  versions: new Map(
    published.map((entry) => [entry.manifest.name, entry.manifest.version])
  ),
};

const staged = published.map((entry) => ({
  entry,
  result: releaseManifest(entry, rootManifest, context),
}));

const problems = staged.flatMap(({ result }) =>
  result.ok ? [] : result.problems
);

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}

for (const { entry, result } of staged) {
  if (result.ok) {
    stage(entry, result.manifest);
  }
}

const builtFiles = (dist: string): readonly BuiltFile[] =>
  readdirSync(dist)
    .filter((name) => name.endsWith(".mjs") || name.endsWith(".d.mts"))
    .map((name) => ({ name, text: readText(path.join(dist, name)) }));

const relativeImport = /\b(?:from|import)\s*"(?<target>\.[^"]+)"/gu;

/**
 * The sources the bundler reads: the entries and what they import by relative path (test files are not among them). An
 * import of a development dependency there is inlined, so no built file shows it.
 */
const sourceFiles = (
  dir: string,
  entries: readonly string[]
): readonly BuiltFile[] => {
  const seen = new Map<string, BuiltFile>();
  const pending = [...entries];

  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const name = path.normalize(next);

    if (!seen.has(name)) {
      const text = readText(path.join(dir, name));

      seen.set(name, { name, text });
      pending.push(
        ...[...text.matchAll(relativeImport)].map(({ groups }) =>
          path.join(path.dirname(name), groups?.target ?? "")
        )
      );
    }
  }

  return [...seen.values()];
};

const findings = staged.flatMap(({ entry, result }) => [
  ...tarballFiles(path.join(root, entry.dir, "dist")).map(
    (file) =>
      `${entry.manifest.name}: ${file} would ship and is not built output`
  ),
  ...importFindings(entry.manifest, [
    ...builtFiles(path.join(root, entry.dir, "dist")),
    ...sourceFiles(path.join(root, entry.dir), entryPoints(entry.manifest)),
  ]),
  ...(result.ok
    ? consumerFindings({
        dist: path.join(root, entry.dir, "dist"),
        installed: (name) => installedPackage(entry.dir, name),
        manifest: result.manifest,
        tsc: path.join(root, "node_modules", ".bin", "tsc"),
      })
    : []),
]);

if (findings.length > 0) {
  process.stderr.write(`${findings.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(
  `Staged ${published.map((entry) => entry.manifest.name).join(", ")}.\n`
);
