// The scratch consumer of `release:stage` (spec 0005): the staged package used from an empty project that has only what
// its manifest declares, type-checked WITHOUT `skipLibCheck`. A declaration file that imports a package the manifest does
// not declare, or one whose types do not ship, fails here as it would for the first user. Original code, MIT (this
// repository's own licence); the idea comes from the finding of phibkro/pg-txmode spec 0006, Revisions 1 (a consumer
// check without `skipLibCheck` found a missing `@types` dependency).
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { consumerSource } from "./release.ts";
import type { ShippedManifest } from "./release.ts";

export interface ConsumerCheck {
  /** The staged package: the directory that `npm publish` is given. */
  readonly dist: string;
  /** Where the workspace installed a package, or `undefined` when it did not. */
  readonly installed: (name: string) => string | undefined;
  readonly manifest: ShippedManifest;
  /** The TypeScript compiler binary. */
  readonly tsc: string;
}

const packageDirectory = (modules: string, name: string): string =>
  path.join(modules, ...name.split("/"));

/** The findings of `tsc` over the consumer, empty when it type-checks. */
export const consumerFindings = ({
  dist,
  installed,
  manifest,
  tsc,
}: ConsumerCheck): readonly string[] => {
  const scratch = mkdtempSync(path.join(tmpdir(), "foldkit-flow-consumer-"));

  try {
    const modules = path.join(scratch, "node_modules");
    const own = packageDirectory(modules, manifest.name);

    mkdirSync(path.dirname(own), { recursive: true });
    cpSync(dist, own, { recursive: true });

    const declared = Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    });

    for (const name of declared) {
      const source = installed(name);

      if (source === undefined) {
        return [`${manifest.name}: ${name} is declared but not installed`];
      }

      mkdirSync(path.dirname(packageDirectory(modules, name)), {
        recursive: true,
      });
      symlinkSync(source, packageDirectory(modules, name));
    }

    writeFileSync(path.join(scratch, "consumer.ts"), consumerSource(manifest));
    writeFileSync(
      path.join(scratch, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          lib: ["es2023", "dom"],
          module: "esnext",
          moduleResolution: "bundler",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "es2023",
          types: [],
        },
        files: ["consumer.ts"],
      })
    );

    const result = spawnSync(tsc, ["-p", scratch], {
      cwd: scratch,
      encoding: "utf-8",
    });

    return result.status === 0
      ? []
      : [
          `${manifest.name}: a consumer that type-checks without skipLibCheck fails:\n${result.stdout}${result.stderr}`,
        ];
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
};
