# Provenance

> Since the rename to tsukuri (formerly the working name `reebeat`) a file listed here as identical to its source may differ from it in that word alone, and the names of the source's own files and packages are written with the current brand although the cited commit carries the old name.

The development lifecycle (spec 0000) is copied from [`tsukuri-labs/studio`](https://github.com/tsukuri-labs/studio) at commit `b26c1cc` (`main`, 2026-10-29, the squash of its spec 0000, whose tree equals the reviewed head `643096ea`; the source repository). studio copied it from [`tsukuri-labs/tsukuri`](https://github.com/tsukuri-labs/tsukuri) at `f7c348877585f54b6bf00651608726dd7e5044d3`, and most of tsukuri's own files were adapted from [`phibkro/vektorprogrammet-reimagined`](https://github.com/phibkro/vektorprogrammet-reimagined) at `797e9e41d96194b9479ff224ac1c40bbc0545888` (the donor); the headers that name those sources were kept. Third-party licences stay with their code.

**Identical** means the file's git blob hash equals the source's, checked with `git hash-object <file>` against `git rev-parse b26c1cc:<file>` (or `b26c1cc:apps/editor/...` for `apps/example/`) in a studio checkout. **63 files are identical at spec 0002**: 12 repository-root and skill files, 9 under `tools/quality/`, 40 under `tools/oxlint/anti-slop/` and 2 under `apps/example/` (`tsconfig.json`, `src/vitestSetup.ts`). This count was taken by comparing the blob hash of every tracked file against `git ls-tree -r b26c1cc` (not derived by subtraction); `.gitignore` also matches studio's blob but is not a copied file of this table, and is not counted. It was 67 when spec 0000 merged; since then spec 0001 changed `apps/example/src/styles.css`, and spec 0002 changes `rules/no-module-mocking.ts`, `UPSTREAM.txt` and `apps/example/FOLDKIT.md`.

| File | Source (studio `b26c1cc`) | Deviation |
| --- | --- | --- |
| `.vite-hooks/pre-commit`, `commit-msg`, `pre-push` | same paths | identical |
| `commitlint.config.ts`, `.jscpd.json`, `devenv.nix`, `devenv.yaml`, `devenv.lock`, `tsconfig.json`, `CLAUDE.md` | same paths | identical |
| `.agents/skills/review-pr/record-round.sh`, `merge.sh` | same paths | identical |
| `.agents/skills/review-pr/SKILL.md`, `.agents/skills/pr-create/SKILL.md` | same paths | a new provenance header and a description that names this repository; `pr-create` drops the sentence that points at tsukuri's glossary |
| `tools/quality/*.ts` except `effectExceptions.ts`, `tools/quality/tsconfig.json`, `tools/quality/vite.config.ts`, `tools/quality/test/*` except `effectExceptions.test.ts` | same paths | identical |
| `tools/quality/effectExceptions.ts`, `test/effectExceptions.test.ts`, `effect-exceptions.json` | same paths | `@effect-diagnostics` and `@effect-diagnostics-next-line` join the suppression directives the checker registers (`directivePattern`), with two tests; the registry's `description` lists `@effect-diagnostics` and says a published package may not carry one (the registry is empty in both); in `tsukuri-labs/studio` and `tsukuri-labs/tsukuri` the checker does not know them, so an in-source switch-off of `unstableApiUsage` there is unregistered and unseen (the lead filed the issues) |
| `tools/quality/publishedEffectRange.ts`, `test/publishedEffectRange.test.ts` | new | written here (spec 0000, "The published Effect range") |
| `tools/quality/package.json` | same path | name `@foldkit-flow/quality` |
| `tools/oxlint/anti-slop/**` | same path | identical except `rules/no-module-mocking.ts` and `UPSTREAM.txt` (spec 0002: `vi` from `vite-plus/test`; the local change is recorded in `UPSTREAM.txt`); `UPSTREAM.txt` keeps the chain (dmmulroy/anti-slop `c44ef22`, mono-web `2aa6ce9`, the donor) |
| `vite.config.ts` | same path | Effect groups and Foldkit rule overrides name `apps/example` and `packages/flow` (library role `effect-library`, browser) and `tools/quality`, `tools/journey` (node; `probe.ts` browser); `typescript/promise-function-async` is off for the two journey files (reason in the file); the vendored anti-slop copy is loaded as plugin `anti-slop-local` for `no-module-mocking` (see its `UPSTREAM.txt`); the restricted source-import patterns name `@foldkit-flow/` and `packages` |
| `package.json` | same path | name, workspaces (`apps/*`, `packages/*`, `tools/*`) |
| `.gitleaks.toml` | same path | title |
| `knip.json` | same path | workspaces `apps/example`, `packages/flow`, `tools/quality`, `tools/journey` |
| `.github/workflows/checks.yml` | same path | header only |
| `apps/example/vite.config.ts`, `index.html`, `package.json`, `src/application.ts`, `entry.ts`, `boot.test.ts` | `apps/editor/` of the same names | renamed (`editorApplication` to `exampleApplication`, title), a workspace dependency on `@tsukuri/flow`; `boot.test.ts` follows the new view; `vite.config.ts` loads `@foldkit/vite-plugin` 0.29.0 (studio's copy leaves it off while 0.28.0 pins effect 4.0.0) |
| `apps/example/tsconfig.json`, `src/vitestSetup.ts` | `apps/editor/` of the same names | identical |
| `apps/example/src/styles.css` | `apps/editor/src/styles.css` | the example's styles added in spec 0001 (22 lines: the canvas, the log); no longer identical |
| `apps/example/FOLDKIT.md` | `create-foldkit-app` 0.41.0, `dist/templates/base/FOLDKIT.md` | identical to the template (Foldkit's file, replaced whole on upgrade); no longer identical to studio's 0.40.0 copy |
| `apps/example/src/main.ts`, `story.test.ts`, `testModels.ts`; `graphs.ts` (new) | `apps/editor/src/` of the same names | rewritten for the Flow: the Flow Submodel with graph, attribution toggle and an event log; `scene.test.ts` is dropped (the Scene harness stubs Mounts: the view is tested with a real runtime in `packages/flow/src/runtime.test.ts`) |
| `AGENTS.md`, `STATE.md`, `README.md`, `apps/example/AGENTS.md` | same paths | rewritten for this repository |
| `docs/specs/0000-development-lifecycle.md` | same path | rewritten: it records what is the same, what differs and why |

Not copied: `docs/design/lenses.md` and spec 0001 of studio (studio's own), and `bun.lock` (regenerated).

## Generated, not copied

`apps/example` descends from `create-foldkit-app` 0.40.0 (`--rendering spa --example counter --package-manager bun`) through studio's `apps/editor`; its `FOLDKIT.md` was replaced whole from the 0.41.0 template (`dist/templates/base/FOLDKIT.md`, which pins Foldkit 0.170.0; one line differs from 0.40.0: `SecureRandom` from `effect/crypto` instead of `Crypto.Crypto`). Foldkit is MIT licensed; `foldkit` and `@foldkit/*` are installed from npm, not vendored.

## Third-party code this repository depends on

`@xyflow/system` 0.0.83 (MIT, Copyright (c) 2019-2025 webkid GmbH, <https://github.com/xyflow/xyflow>) is installed from npm and drives the pan and zoom, drag, handle and minimap controllers and the edge-path and graph utilities; the handle DOM contract (class `foldkit-flow__handle`, `data-nodeid`, `data-handleid`, `data-id`) and the controller calls follow the package's own types and source (`dist/esm`), which is the only xyflow code read; no xyflow source file is copied. Its d3 dependencies (`d3-zoom`, `d3-drag`, `d3-selection`, `d3-interpolate`; ISC, Copyright Mike Bostock) come with it; `packages/flow` lists `d3-selection` 3.0.0 itself, to remove the d3-zoom bindings a controller leaves on an element. It is credited in `README.md` and `NOTICE`.

`puppeteer-core` 25.16.0 (Apache-2.0, <https://github.com/puppeteer/puppeteer>) is a dependency of `tools/journey` only (the browser gate); it is not part of the library and is not shipped.
