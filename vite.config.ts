// Provenance: adapted from tsukuri-labs/tsukuri @ f7c348877585f54b6bf00651608726dd7e5044d3 (vite.config.ts), which adapted it from
// phibkro/vektorprogrammet-reimagined @ 797e9e41d96194b9479ff224ac1c40bbc0545888. Deviations: the Effect groups and the
// per-file overrides of tsukuri's packages are replaced by this repository's own (apps/example, packages/flow,
// tools/quality), and the Foldkit Oxlint plugin rules apply to apps/example and packages/flow. See PROVENANCE.md.
import { effectNative, strict } from "@effect/tsgo/oxlint-presets";
import foldkitRecommended from "@foldkit/oxlint-plugin/recommended.json" with { type: "json" };
import { effect } from "@phibkro/oxlint-effect-plugin";
import type { EffectConfigInput } from "@phibkro/oxlint-effect-plugin";
import ultraciteFmt from "ultracite/oxfmt";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import { defineConfig } from "vite-plus";

import { diagnosticRules } from "./tools/quality/diagnosticRules.ts";
import { foldkitLint } from "./tools/quality/foldkitLint.ts";

const foldkit = foldkitLint(foldkitRecommended);

export const tsgoRules = diagnosticRules.lint;

// Effect roles per path. A package adds its own group in the spec that creates it.
const effectConfig: EffectConfigInput = {
  groups: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      platform: "node",
      role: "test",
      strictness: "strict",
    },
    {
      // The Foldkit definitions: Model, Messages, init, update and view. They run in the browser and call no runtime.
      files: ["apps/example/src/**"],
      platform: "browser",
      role: "application",
      strictness: "strict",
    },
    {
      // The library: Submodels, views and the Mounts that own the xyflow controllers. It runs in the browser and
      // never boots a runtime; the application that embeds it does.
      files: ["packages/flow/src/**"],
      platform: "browser",
      role: "effect-library",
      strictness: "strict",
    },
    {
      // The one module that boots the Foldkit runtime.
      files: ["apps/example/src/entry.ts"],
      platform: "browser",
      role: "composition-root",
      strictness: "strict",
    },
    {
      files: [
        "tools/quality/**",
        "tools/journey/journey.ts",
        "tools/journey/stats.ts",
      ],
      platform: "node",
      role: "composition-root",
      strictness: "strict",
    },
    {
      // Runs inside the page: Puppeteer serialises each function and evaluates it in Chromium.
      files: ["tools/journey/probe.ts"],
      platform: "browser",
      role: "composition-root",
      strictness: "strict",
    },
  ],
};

const effectConfigResult = effect(effectConfig);

// Ultracite's `anti-slop` preset already enables the 18 generic rules, so only the Effect rules are added here.
const effectAntiSlopRuleNames = [
  "no-manual-effect-error-tag",
  "no-manual-tag-comparison",
  "no-manual-tagged-construction",
  "no-service-constructor-imports",
  "prefer-effect-match",
];

const localAntiSlopRules: Record<string, "error"> = {};

for (const name of effectAntiSlopRuleNames) {
  localAntiSlopRules[`anti-slop-effect/${name}`] = "error";
}

const restrictedSourcePatterns = [
  {
    message:
      "Import another workspace package through its export map, not its source path.",
    regex: "^@foldkit-flow/[^/]+/src(?:/|$)",
  },
  {
    message:
      "Import another workspace package through its export map, not its source path.",
    regex: "^(?:\\./|(?:\\.\\./)+)(?:apps|packages|tools)/[^/]+/src(?:/|$)",
  },
];

export default defineConfig({
  // Prose is written by hand: Oxfmt re-wraps Markdown and joins hard line breaks, which changes meaning.
  fmt: {
    ...ultraciteFmt,
    ignorePatterns: [...(ultraciteFmt.ignorePatterns ?? []), "**/*.md"],
  },
  lint: {
    extends: [core, antiSlop, strict, effectNative],
    // The vendored anti-slop rules keep their upstream style; they are checked by their own provenance, not ours.
    ignorePatterns: [
      ...(core.ignorePatterns ?? []),
      "tools/oxlint/anti-slop/**",
    ],
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      ...effectConfigResult.jsPlugins,
      {
        name: "anti-slop-local",
        specifier: "./tools/oxlint/anti-slop/index.ts",
      },
      {
        name: "anti-slop-effect",
        specifier: "./tools/oxlint/anti-slop/effect/index.ts",
      },
      { name: "complexity", specifier: "oxlint-plugin-complexity" },
      ...foldkitRecommended.jsPlugins,
    ],
    options: { typeAware: true, typeCheck: true },
    overrides: [
      ...effectConfigResult.overrides,
      {
        // The release tooling (spec 0005) is plain TypeScript with zod, yaml and smol-toml, copied from phibkro/pg-txmode,
        // whose release tooling does not use Effect. It is repository tooling that npm never sees, and it runs as Node
        // scripts and tests: node:fs, node:child_process and process.env are its job. The Effect-first rules that
        // contradict that (native Array, String and Object methods, Node built-ins) are off for these files only;
        // `no-template-curly-in-string` fires on the `${NODE_AUTH_TOKEN}` text of the workflow fixtures.
        files: ["tools/release/**"],
        rules: {
          "effecttsgo/node-builtin-import": "off",
          "effecttsgo/prefer-effect-array": "off",
          "effecttsgo/prefer-effect-record": "off",
          "effecttsgo/prefer-effect-string": "off",
          "effecttsgo/process-env": "off",
          "eslint/no-template-curly-in-string": "off",
        },
      },
      {
        // unicorn/throw-new-error treats Schema.TaggedError class definitions as throw sites; they contain no throw.
        files: [
          "tools/quality/effectExceptions.ts",
          "tools/journey/journey.ts",
        ],
        rules: { "unicorn/throw-new-error": "off" },
      },
      {
        // The browser gate adapts Puppeteer, a Promise API, through `attempt` (Effect.tryPromise) and probe.ts runs
        // inside the page. Ultracite's promise-function-async asks for `async` on every Promise-returning arrow, and the
        // Effect diagnostics then reject that `async` (and eslint's require-await rejects an async arrow without await),
        // so the two preset rules contradict each other here. A Promise-returning arrow is the Effect.tryPromise form.
        files: ["tools/journey/journey.ts", "tools/journey/probe.ts"],
        rules: { "typescript/promise-function-async": "off" },
      },
      {
        // The Foldkit conventions (FOLDKIT.md): the framework's own rules, at the severity its recommended preset sets.
        files: ["apps/example/**", "packages/flow/**"],
        rules: foldkit.rules,
      },
      ...foldkit.overrides,
      {
        // Foldkit declares each Schema and its type under one name (`const Message` and `type Message`, as FOLDKIT.md
        // requires). Oxlint's no-redeclare does not know that TypeScript merges a value and a type of the same name;
        // the TypeScript checker still rejects a real redeclaration.
        files: ["apps/example/src/**", "packages/flow/src/**"],
        rules: { "eslint/no-redeclare": "off" },
      },
    ],
    rules: {
      ...effectConfigResult.rules,
      ...tsgoRules,
      ...localAntiSlopRules,
      // Ultracite's bundled `anti-slop/no-module-mocking` knows `vi` from `vitest` only, and this repository imports it
      // from `vite-plus/test`. The vendored copy knows both (UPSTREAM.txt, local changes); it runs under its own name.
      "anti-slop-local/no-module-mocking": "error",
      "complexity/complexity": ["error", { cognitive: 15 }],
      "no-restricted-imports": [
        "error",
        { patterns: [...restrictedSourcePatterns] },
      ],
      // Workspace modules use lower camelCase filenames.
      "unicorn/filename-case": ["error", { case: "camelCase" }],
      // Preset contradiction: effecttsgo(prefer-effect-array) requires Effect's data-first Array module
      // (`Arr.map(xs, fn)`), which unicorn/no-array-method-this-argument misreads as a native
      // `.map(fn, thisArg)` call. Native array methods are already steered to Effect Array, so the rule
      // adds only false positives here. One global switch instead of a per-file list that drifts.
      "unicorn/no-array-method-this-argument": "off",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },
  run: { cache: true },
  staged: { "*": "vp check --fix" },
});
