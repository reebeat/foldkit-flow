// The release workflow rules (specs 0005 and 0008): no token authentication, check cannot publish,
// and the release hold stops a publish. Each
// rule has a control that breaks it in a fixture, and each runs on the real files.
// Copied from phibkro/pg-txmode (Apache-2.0, Copyright 2026 Philip Bjørknes Krogh)
// `tools/quality/test/releaseWorkflow.test.ts` at 23be53c0c66a129540350697253b5c19abde3171, which ported it from
// tsukuri-labs/tsukuri spec 0009 (PR #29, merge commit d0c5a1de330200302edbad58784f351b09eeb4f8). Deviation: the
// fixture packages are `@probe/*` (the publish step is generic over `packages/*/dist`). This file remains Apache-2.0
// under its header: see PROVENANCE.md and LICENSES/.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vite-plus/test";
import { parseDocument } from "yaml";

import {
  evaluateCondition,
  holdFindings,
  holdScript,
  modeFindings,
  stepScript,
} from "../releaseWorkflow.ts";
import type { WorkflowFile } from "../releaseWorkflow.ts";
import {
  repoRoot,
  runBash,
  withScratch,
  writeFixture,
} from "./scriptHarness.ts";

const checkCondition =
  "inputs.mode == 'check' && github.ref == 'refs/heads/main'";

const publishCondition =
  "inputs.mode == 'publish' && github.ref == 'refs/heads/main'";

interface Changes {
  readonly beforeHold?: string;
  readonly checkRun?: string;
  readonly checkSteps?: string;
  readonly environment?: string;
  readonly holdExtra?: string;
  readonly jobEnv?: string;
  readonly jobExtra?: string;
  readonly mode?: string;
  readonly needs?: string;
  readonly noHold?: boolean;
  readonly publishExtra?: string;
  readonly publishIf?: string;
  readonly publishRun?: string;
  readonly workflowEnv?: string;
}

/** The hold step of the fixture: the real script's test, with a line a control may add to the step. */
const holdBlock = (changes: Changes): string =>
  changes.noHold === true
    ? ""
    : `      - name: Release hold\n        run: if [ -e .github/release-hold ]; then exit 1; fi\n${changes.holdExtra ?? ""}`;

/** A release workflow in the shape the real one has, with the lines a control changes made explicit. */
const release = (changes: Changes): WorkflowFile => ({
  name: "release.yml",
  text: `name: Release
on:
  workflow_dispatch:
    inputs:
      mode:
        type: choice
        options: [check, publish]
        default: ${changes.mode ?? "check"}
${changes.workflowEnv ?? ""}
jobs:
  check:
    if: ${checkCondition}
    runs-on: ubuntu-latest
    environment: ${changes.environment ?? "npm-release"}
${changes.needs ?? ""}
    steps:
      - name: Check
        run: ${changes.checkRun ?? "npm publish ./dist --dry-run"}
${changes.checkSteps ?? ""}
  publish:
    if: ${changes.publishIf ?? publishCondition}
    runs-on: ubuntu-latest
    environment: npm-release
${changes.jobEnv ?? ""}${changes.jobExtra ?? ""}
    steps:
      - uses: actions/checkout@abc
${changes.beforeHold ?? ""}${holdBlock(changes)}      - name: Publish
${changes.publishExtra ?? ""}        run: ${changes.publishRun ?? "bunx changeset publish"}
`,
});

const mentions =
  (text: string) =>
  (lines: readonly string[]): boolean =>
    lines.some((line) => line.includes(text));

const readRepositoryFile = (name: string): string =>
  readFileSync(path.join(repoRoot, name), "utf-8");

const tokenAuth =
  /NPM_TOKEN|NODE_AUTH_TOKEN|_auth|_password|npm_config_.*token|secrets.(?!GITHUB_TOKEN)[A-Za-z_][A-Za-z0-9_]*/iu;

describe("token-free publishing", () => {
  test("catches credential references and npm auth configuration", () => {
    for (const text of [
      "secrets.NPM_TOKEN",
      "NODE_AUTH_TOKEN",
      "_authToken",
      "npm_config_token",
      "NPM_CONFIG__AUTH: ${{ secrets.NPMJS_KEY }}",
      "_password",
      "secrets.OTHER",
      "secrets.GITHUB_TOKEN_EXTRA",
    ]) {
      expect(tokenAuth.test(text)).toBe(true);
    }

    expect(tokenAuth.test("id-token: write")).toBe(false);
    expect(tokenAuth.test("secrets.GITHUB_TOKEN")).toBe(false);
    const actual = readRepositoryFile(".github/workflows/release.yml");
    expect(
      tokenAuth.test(`${actual}\nNPM_CONFIG__AUTH: \${{ secrets.NPMJS_KEY }}`)
    ).toBe(true);
  });
});

describe("the release mode", () => {
  const onMain = "refs/heads/main";

  test("reads the condition grammar of the workflow and refuses any other", () => {
    expect(
      evaluateCondition(publishCondition, { mode: "check", ref: onMain })
    ).toBe(false);
    expect(
      evaluateCondition(publishCondition, { mode: "publish", ref: onMain })
    ).toBe(true);
    expect(
      evaluateCondition(`\${{ ${publishCondition} }}`, {
        mode: "publish",
        ref: onMain,
      })
    ).toBe(true);
    expect(
      evaluateCondition("inputs.mode != 'check'", {
        mode: "check",
        ref: onMain,
      })
    ).toBeUndefined();
    expect(
      evaluateCondition("always()", { mode: "check", ref: onMain })
    ).toBeUndefined();
  });

  test("holds for the workflow in its intended shape: check never reaches the publish (baseline)", () => {
    expect(modeFindings(release({}))).toStrictEqual([]);
  });

  test("fails when the publish job has no mode condition, or one the gate cannot read (controls)", () => {
    expect(
      mentions('with mode "check"')(
        modeFindings(release({ publishIf: "github.ref == 'refs/heads/main'" }))
      )
    ).toBe(true);
    expect(
      mentions("cannot evaluate")(
        modeFindings(release({ publishIf: "inputs.mode != 'check'" }))
      )
    ).toBe(true);
    expect(
      mentions("refs/heads/feature")(
        modeFindings(release({ publishIf: "inputs.mode == 'publish'" }))
      )
    ).toBe(true);
  });

  test("fails when the check job holds a publish command, or needs the publisher (controls)", () => {
    expect(
      mentions('with mode "check"')(
        modeFindings(release({ checkRun: "npm publish ./dist" }))
      )
    ).toBe(true);
    expect(
      mentions("needs a job that publishes")(
        modeFindings(release({ needs: "    needs: publish" }))
      )
    ).toBe(true);
  });

  test("a dry run is not a publish, but a dry run cannot excuse a publish beside it (controls)", () => {
    expect(
      modeFindings(release({ checkRun: "npm publish ./dist --dry-run" }))
    ).toStrictEqual([]);
    expect(
      modeFindings(
        release({
          checkRun: "|\n          npm publish ./dist \\\n            --dry-run",
        })
      )
    ).toStrictEqual([]);
    expect(
      mentions('with mode "check"')(
        modeFindings(
          release({
            checkRun: "npm publish ./dist && npm publish ./other --dry-run",
          })
        )
      )
    ).toBe(true);
    expect(
      mentions('with mode "check"')(
        modeFindings(
          release({ checkRun: "npm publish ./dist ; echo --dry-run" })
        )
      )
    ).toBe(true);
  });

  test("a publish is not excused by a flag that turns the dry run off, or by a comment (controls)", () => {
    const reaches = mentions('with mode "check"');

    for (const checkRun of [
      'npm publish "$dist" --dry-run=false',
      'npm publish "$dist" --dry-run false',
      'npm publish "$dist" --dry-run --no-dry-run',
      'npm publish "$dist" --no-dry-run',
      'npm publish "$dist" # --dry-run',
      'echo "#"; npm publish "$dist" # --dry-run',
      "npm publish ./dist --dry-run=0",
    ]) {
      expect(reaches(modeFindings(release({ checkRun })))).toBe(true);
    }

    expect(
      modeFindings(
        release({ checkRun: 'npm publish "$dist" --dry-run # a dry run' })
      )
    ).toStrictEqual([]);
    expect(
      modeFindings(
        release({
          checkRun:
            "|\n          # npm publish ./dist\n          npm view x --dry-run",
        })
      )
    ).toStrictEqual([]);
  });

  test("fails when the default is not check, or no job publishes in publish mode (controls)", () => {
    expect(
      mentions("must default to check")(
        modeFindings(release({ mode: "publish" }))
      )
    ).toBe(true);
    expect(
      mentions("no job publishes")(
        modeFindings(release({ publishRun: "echo nothing" }))
      )
    ).toBe(true);
  });
});

describe("the real files", () => {
  test("no workflow reads an npm token or configures token auth", () => {
    for (const name of readdirSync(path.join(repoRoot, ".github/workflows"))) {
      if (name.endsWith(".yml") || name.endsWith(".yaml")) {
        expect(readRepositoryFile(`.github/workflows/${name}`)).not.toMatch(
          tokenAuth
        );
      }
    }

    expect(existsSync(path.join(repoRoot, "secretspec.toml"))).toBe(false);
  });

  test("the release workflow's check mode cannot reach a publish, for any mode or ref", () => {
    expect(
      modeFindings({
        name: "release.yml",
        text: readRepositoryFile(".github/workflows/release.yml"),
      })
    ).toStrictEqual([]);
  });

  test("the workflow keeps provenance: id-token write on the publisher and NPM_CONFIG_PROVENANCE", () => {
    const text = readRepositoryFile(".github/workflows/release.yml");

    const workflow = parseDocument(text);
    expect(workflow.getIn(["jobs", "publish", "permissions", "id-token"])).toBe(
      "write"
    );
    expect(
      workflow.getIn(["jobs", "publish", "env", "NPM_CONFIG_PROVENANCE"])
    ).toBe("true");
    expect(workflow.getIn(["jobs", "publish", "environment"])).toBe(
      "npm-release"
    );
  });

  test("the check job dry-runs each package and holds no publish", () => {
    const text = readRepositoryFile(".github/workflows/release.yml");

    expect(text).toContain('npm publish "$dist" --dry-run');
  });
});

describe("the release hold", () => {
  const early = "      - name: Install\n        run: nix profile add x\n";

  test("holds for the shape in which the hold step follows the checkout", () => {
    expect(holdFindings(release({}))).toStrictEqual([]);
  });

  test("fails a publishing job without a hold step, or with a step before it (controls)", () => {
    expect(
      mentions("has no step that tests .github/release-hold")(
        holdFindings(release({ noHold: true }))
      )
    ).toBe(true);
    expect(
      mentions("before the release hold")(
        holdFindings(release({ beforeHold: early }))
      )
    ).toBe(true);
  });

  test("fails a hold that a failure does not stop: continue-on-error, or an if on a later step (controls)", () => {
    const bypass = mentions("hold");

    expect(
      bypass(
        holdFindings(
          release({ holdExtra: "        continue-on-error: true\n" })
        )
      )
    ).toBe(true);
    expect(
      bypass(
        holdFindings(release({ jobExtra: "\n    continue-on-error: true" }))
      )
    ).toBe(true);
    expect(
      mentions("has an if")(
        holdFindings(release({ publishExtra: "        if: always()\n" }))
      )
    ).toBe(true);
    expect(
      mentions("has an if")(
        holdFindings(
          release({ publishExtra: `        if: \${{ !cancelled() }}\n` })
        )
      )
    ).toBe(true);
  });

  test("the real hold step refuses where the file exists and passes where it does not, and the real job has one", () => {
    const workflow: WorkflowFile = {
      name: "release.yml",
      text: readRepositoryFile(".github/workflows/release.yml"),
    };

    const script = holdScript(workflow);

    expect(holdFindings(workflow)).toStrictEqual([]);
    expect(script).toBeDefined();

    withScratch((without) => {
      withScratch((withFile) => {
        writeFixture(
          path.join(withFile, ".github", "release-hold"),
          "on hold\n"
        );

        expect(runBash(["-c", script ?? "false"], {}, without).exitCode).toBe(
          0
        );
        expect(runBash(["-c", script ?? "false"], {}, withFile).exitCode).toBe(
          1
        );
      });
    });
  });
});

const published = (log: readonly string[]): readonly string[] =>
  log.filter((line) => line.startsWith("publish "));

describe("the publish step", () => {
  const releasePackages = ["core", "effect", "lint", "pg"];

  /** Runs the real `Publish` step in a scratch repository, with `devenv` and `npm` replaced by stubs that log. */
  const runPublish = (options: {
    readonly existing: readonly string[];
    readonly npmExit?: number;
    readonly pre?: string | undefined;
    readonly refuse?: string;
    readonly viewError?: string;
  }): {
    readonly exitCode: number;
    readonly log: readonly string[];
    readonly stdout: string;
  } =>
    withScratch((dir) => {
      const bin = path.join(dir, "bin");
      const log = path.join(dir, "npm.log");

      for (const name of releasePackages) {
        writeFixture(
          path.join(dir, "packages", name, "dist", "package.json"),
          `${JSON.stringify({ name: `@probe/${name}`, version: "0.1.0-alpha.1" })}\n`
        );
      }

      if (options.pre !== undefined) {
        writeFixture(path.join(dir, ".changeset", "pre.json"), options.pre);
      }

      writeFixture(
        path.join(bin, "devenv"),
        '#!/bin/sh\nshift 2\nexec "$@"\n',
        0o755
      );
      writeFixture(
        path.join(bin, "npm"),
        [
          "#!/bin/sh",
          'echo "$*" >> "$LOG"',
          'if [ "$1" = view ]; then',
          '  case " $EXISTING " in *" $2 "*) exit 0;; esac',
          '  if [ -n "$VIEW_ERROR" ]; then echo "$VIEW_ERROR" >&2; exit 1; fi',
          '  echo "npm error code E404" >&2',
          "  exit 1",
          "fi",
          'if [ -n "$REFUSE" ] && [ "$2" = "$REFUSE" ]; then echo "npm error code E403" >&2; exit 1; fi',
          'exit "${NPM_EXIT:-0}"',
          "",
        ].join("\n"),
        0o755
      );

      const script = stepScript(
        {
          name: "release.yml",
          text: readRepositoryFile(".github/workflows/release.yml"),
        },
        "publish",
        "Publish"
      );

      const result = runBash(
        ["-c", script ?? "exit 99"],
        {
          EXISTING: options.existing.join(" "),
          LOG: log,
          NPM_EXIT: String(options.npmExit ?? 0),
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          REFUSE: options.refuse ?? "",
          VIEW_ERROR: options.viewError ?? "",
        },
        dir
      );

      return {
        ...result,
        log: existsSync(log)
          ? readFileSync(log, "utf-8")
              .split("\n")
              .filter((line) => line !== "")
          : [],
      };
    });

  const alpha = '{ "mode": "pre", "tag": "alpha" }';

  test("publishes each package the registry lacks to the tag of pre mode, core first", () => {
    const { exitCode, log } = runPublish({ existing: [], pre: alpha });

    expect(exitCode).toBe(0);
    expect(published(log)).toStrictEqual(
      releasePackages.map(
        (name) => `publish ./packages/${name}/dist --tag alpha --access public`
      )
    );
  });

  test("skips what the registry has, and publishes the rest (a re-run after a partial publish)", () => {
    const { exitCode, log, stdout } = runPublish({
      existing: ["@probe/core@0.1.0-alpha.1", "@probe/effect@0.1.0-alpha.1"],
      pre: alpha,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain(
      "@probe/core@0.1.0-alpha.1 is on the registry: skipped"
    );
    expect(published(log)).toStrictEqual([
      "publish ./packages/lint/dist --tag alpha --access public",
      "publish ./packages/pg/dist --tag alpha --access public",
    ]);
    expect(
      published(
        runPublish({
          existing: releasePackages.map(
            (name) => `@probe/${name}@0.1.0-alpha.1`
          ),
          pre: alpha,
        }).log
      )
    ).toStrictEqual([]);
  });

  test("the tag is latest outside pre mode: no pre.json, or one that has left pre mode (controls)", () => {
    for (const pre of [undefined, '{ "mode": "exit", "tag": "alpha" }']) {
      expect(published(runPublish({ existing: [], pre }).log)[0]).toBe(
        "publish ./packages/core/dist --tag latest --access public"
      );
    }
  });

  test("stops at the first failed publish (control)", () => {
    const { exitCode, log } = runPublish({
      existing: [],
      npmExit: 1,
      pre: alpha,
    });

    expect(exitCode).not.toBe(0);
    expect(published(log)).toStrictEqual([
      "publish ./packages/core/dist --tag alpha --access public",
    ]);
  });

  test("a view error that is not E404 stops the step and is printed; nothing is published for it (control)", () => {
    const { exitCode, log, stdout } = runPublish({
      existing: [],
      pre: alpha,
      viewError: "npm error code ENOTFOUND registry unreachable",
    });

    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("not E404");
    expect(stdout).toContain("ENOTFOUND registry unreachable");
    expect(published(log)).toStrictEqual([]);
  });

  test("an error that merely mentions E404 is not the E404 error code: nothing is published (control)", () => {
    const { exitCode, log } = runPublish({
      existing: [],
      pre: alpha,
      viewError: "npm error 503 proxy said: upstream returned E404 in a body",
    });

    expect(exitCode).not.toBe(0);
    expect(published(log)).toStrictEqual([]);
  });

  test("a refused name (E403) stops the set, and a re-run skips what was published and publishes the rest", () => {
    const first = runPublish({
      existing: [],
      pre: alpha,
      refuse: "./packages/effect/dist",
    });

    expect(first.exitCode).not.toBe(0);
    expect(published(first.log)).toStrictEqual([
      "publish ./packages/core/dist --tag alpha --access public",
      "publish ./packages/effect/dist --tag alpha --access public",
    ]);

    const second = runPublish({
      existing: ["@probe/core@0.1.0-alpha.1"],
      pre: alpha,
    });

    expect(second.exitCode).toBe(0);
    expect(published(second.log)).toStrictEqual([
      "publish ./packages/effect/dist --tag alpha --access public",
      "publish ./packages/lint/dist --tag alpha --access public",
      "publish ./packages/pg/dist --tag alpha --access public",
    ]);
  });

  test("does not use changeset publish, which tags a second alpha latest (control)", () => {
    expect(
      stepScript(
        {
          name: "release.yml",
          text: readRepositoryFile(".github/workflows/release.yml"),
        },
        "publish",
        "Publish"
      )
    ).not.toMatch(/changeset\s+publish/u);
  });
});
