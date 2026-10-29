# Spec 0002: Foldkit 0.170.0 and the Vite plugin, and a J9 that always checks memoisation

Status: **spec** (frozen when its PR opens). Date: 2026-10-29. Decided by: the lead's assignment of 2026-10-29 (Foldkit 0.170.0 and `@foldkit/vite-plugin` 0.29.0 were published that day with peer `effect ~4.1.0`, which ends the wait recorded in spec 0000 and `AGENTS.md`), and a low finding of the review of PR 4.
Binding for: `package.json` (catalog), `packages/flow/package.json`, `apps/example`, `tools/journey`, `AGENTS.md`, `STATE.md`. Based on `main` after spec 0001.

## Goal

The repository runs on a Foldkit release that declares the Effect version it is built and tested on, the example uses the Foldkit Vite plugin (hot Model preservation and dev tools), and no document still says "waiting for a release". The felt journey of spec 0001 is unchanged: a person opens the example and pans, zooms, drags, connects and box-selects, and the keyboard works. One journey step is made stricter: the J9 check that the DOM stays untouched by pan and zoom runs on any host.

## Journey

```text
cd apps/example && devenv shell -- bunx vp dev     the dev server starts WITH the Foldkit plugin: no "No response from @foldkit/vite-plugin" notice,
                                                    editing a view file keeps the Model (the flow stays where it was)
devenv shell -- bun run build && bun run journey   the journey of spec 0001 passes on the build (J9 timing only on a quiet host, exit 75 otherwise)
```

## Constraints and values

- **Versions follow the rule of `AGENTS.md`.** `packages/flow` is published: `effect` stays `~4.1.0` (the diagnostics find unstable APIs in its `src`; the published-range test decides), `foldkit` becomes `~0.170.0` (0.x, a minor may break). Tools and the example are not published: they use the catalog. `@foldkit/vite-plugin` is a development dependency of `apps/example` only, pinned in the catalog like Foldkit.
- **Declared peers must now be true.** Foldkit 0.170.0 declares `effect ~4.1.0` and `@effect/platform-browser ~4.1.0`: the install prints no "incorrect peer dependency" warning for Foldkit, and the notes about it are removed. If a warning remains, it is named where it is kept.
- **No behaviour change in the library** beyond what the new Foldkit release forces; anything it forces is a dated Revision.
- **J9 is two checks and only one needs a quiet host.** The timing check is gated on `admitted` (spec 0001, round 3). The DOM-mutation check (a drag touches the dragged node and its own edges only, a zoom touches nothing) measures no time: it runs on every host, and a busy host yields only the timing as inconclusive.
- **No suppressions** unless registered; the exception registry stays empty.

## Falsifiers

| # | Falsifier (must hold) | Gate | Negative control (must fail) |
|---|---|---|---|
| K1 | The lockfile has Foldkit 0.170.0 and the plugin 0.29.0, one Effect 4.1.0, and `packages/flow` peers `effect ~4.1.0`, `foldkit ~0.170.0` | `bun run test` (family and published-range tests) | peer `foldkit ~0.169.0` against an installed 0.170.0 is a documented mismatch; the published-range test fails for a `^4.1.0` Effect range |
| K2 | The example's Vite config loads the plugin; the dev server starts and serves the app without the "No response from @foldkit/vite-plugin" notice | `bun run build`, a dev-server run observed in Chromium (the page renders, no error) | remove the plugin from the config: the notice returns |
| K3 | The tests that boot a runtime no longer print the "No response from @foldkit/vite-plugin" notice, or the notice is explained where it stays | `bun run test` output | n/a (observation) |
| K4 | No document says the repository waits for a Foldkit or plugin release | `grep` for `waiting`, `4.0.0 peer`, `issues/4` in `AGENTS.md`, `README.md`, `STATE.md`, `apps/example/AGENTS.md`, `vite.config.ts` | n/a |
| K5 | On a busy host the journey reports the J9 timing as inconclusive (exit 75) AND still runs and reports the mutation check; a failed mutation check exits 1 even on a busy host | `tools/journey` tests with injected readings and an injected measurement | gate both checks on `admitted` again: the test that expects the mutation check to run on a busy host fails |
| K6 | `bun run ready` exits 0; the journey passes on a quiet host | `ready`, `journey` | as spec 0000 |
| K7 | A `vi.mock` imported from `vite-plus/test` fails lint (issue #5) | `bun run check` | the same file before the change: it passed |

## Risks

| Risk | Mitigation |
|---|---|
| Foldkit 0.170.0 changes an API the library uses (`Mount`, `html`, `submodel`, `customElement`, `Update.foldChild`, `story`) | `vp check` and the library's tests are the gate; every forced change is a Revision |
| The plugin changes how the example builds or tests (it injects into Vite) | `bun run build`, the example tests and a dev-server run |
| The plugin depends on `@effect/platform-node` and a second Effect copy appears in the lockfile | the family test (`effectFamily.ts`) fails on two Effect versions |
| `@foldkit/oxlint-plugin` is behind Foldkit | read its release notes; bump only if needed, and say so |

## Revisions

Dated entries. A spec is revised only here after its PR opens.

- **2026-10-29, plan written.**
- **2026-10-29, built; what the build taught.**
  - *Versions.* Catalog: `foldkit` 0.170.0, `@foldkit/vite-plugin` 0.29.0 (new; development dependency of `apps/example` only), `@foldkit/oxlint-plugin` 0.15.4 (0.15.3 before; it is the current release and `vp check` is clean on it). `packages/flow` peers: `effect ~4.1.0` (unchanged: the diagnostics still find unstable APIs in its `src`), `foldkit ~0.170.0`. `bun install` prints no peer warning. The family and published-range tests pass unchanged.
  - *K2, observed.* The dev server (`vp dev`) started with the plugin (`[foldkit:devTools] MCP relay listening`), the page rendered five nodes with no console notice after 2.5 s (the bridge waits 500 ms), and a Model-preservation check passed: a node was dragged, `src/main.ts` was edited (the heading text), Vite hot-updated it, and the node kept the dragged position (the edit was reverted). The built example is 439 kB (417 kB without the plugin).
  - *K3.* The notice no longer appears in the test output of the example or of `packages/flow`.
  - *K7 added: issue #5, the `vite-plus/test` gap of `no-module-mocking`.* Ultracite's bundled build of the rule is what runs (the vendored copy was not loaded), so editing the copy alone changes nothing. The vendored rule now also knows `vi` from `vite-plus/test`, and the root config loads the vendored `index.ts` as plugin `anti-slop-local` and enables only `anti-slop-local/no-module-mocking`; `UPSTREAM.txt` records it and its retirement trigger. Control, observed: a scratch test file `vi.mock(...)` imported from `vite-plus/test` fails `vp check` with `anti-slop-local(no-module-mocking)`; before the change the same file passed (round 2 of PR 4). Issue #3 (`vp run` uses a downloaded Bun) is not touched by this spec.
  - *K5 built so it is testable.* `tools/journey/checks.ts` holds the check type and the rules (`outcome`: a failure beats an inconclusive check; `performanceChecks`: the timing check is `inconclusive` on a busy host, the memoisation check is reported as measured). `host.ts`'s `admitted` (which skipped the measurement on a busy host) became `judged`: the measurement always runs, and the host verdict is read before and after to judge only the timing. `checks.test.ts` and `host.test.ts` cover it with injected readings and checks. Control: making `performanceChecks` report the memoisation check as inconclusive on a busy host fails `checks.test.ts`.
