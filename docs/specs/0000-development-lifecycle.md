# Spec 0000: development lifecycle and scaffold

Status: **spec** (frozen when its PR opens). Date: 2026-10-29. Decided by: the operator's assignment of 2026-10-29 (build `reebeat/foldkit-flow`, its own public repository, MIT licence, a generic library with no reebeat product logic; copy the development lifecycle from reebeat studio; branch protection like reebeat's).
Binding for: every later PR in this repository. Implemented by the PR that carries this file.
Mirrors: [reebeat studio spec 0000](https://github.com/reebeat/studio/blob/main/docs/specs/0000-development-lifecycle.md) at `b26c1cc`, which mirrors [reebeat spec 0000](https://github.com/reebeat/reebeat/blob/main/docs/specs/0000-development-lifecycle.md) at `f7c348877585f54b6bf00651608726dd7e5044d3`. Read them for the reasons; this file records what is the same, what is different and why.

## Goal

Every change to foldkit-flow travels one road: **spec → code → PR**, strictly 1:1, and no change reaches `main` without passing the same gates locally, in CI and in a recorded review round. The road is studio's (Vite+, Oxlint, Oxfmt, Ultracite, `@effect/tsgo`, gitleaks, commitlint, knip, jscpd, `gh`), copied with provenance, not rewritten. On that road stand three things: the workspace shape (`packages/flow`, `apps/example`, `tools/`), the one piece of the library that exists before any canvas does (the xyflow attribution, an option that is visible by default), and an example shell that proves the toolchain end to end. The canvas is spec 0001.

## Journey

```text
contributor (human or agent)
  1. write or pick a spec        docs/specs/NNNN-*.md          the plan, its falsifiers, its dated Revisions
  2. branch                      feat/NNNN-<slug>              one spec, one branch, one PR
  3. commit                      pre-commit: gitleaks on the staged blobs, then `vp staged` (format and lint --fix)
                                 commit-msg: commitlint (Conventional Commits)
  4. push                        pre-push: the test suite
  5. open the PR                 skill pr-create: the PR body is the report
  6. CI                          .github/workflows/checks.yml runs the same gates as `bun run ready`
  7. review round(s)             skill review-pr: independent reviewers, severity, recorded on the PR
  8. merge                       .agents/skills/review-pr/merge.sh: refuses without a passing record on the head
```

A reader who clones the repository, runs `devenv shell -- bun install` and then `devenv shell -- bun run ready`, sees every gate pass on a clean tree. To see the shell: `devenv shell -- bun run build`, then `devenv shell -- bunx vp preview` in `apps/example`, and open <http://localhost:4173/>: the title "foldkit-flow", a "Canvas" region, a link "Built with xyflow" and a button that hides and shows that link.

## Constraints and values

- Correctness by construction: a gate that can be made structural is structural. `main` cannot be pushed to, a PR cannot be merged without a passing recorded round on its head, an Effect package cannot drift from the `effect` version, a suppression cannot exist without a registry entry, a published package cannot accept an Effect release that may break its unstable imports.
- One source per fact. The gate list lives in `package.json` scripts (`ready`) and the table in `AGENTS.md` names each script; CI calls the same scripts and never repeats their commands.
- Reuse, do not hand-roll. Every copied file names its source (repository, commit, deviation) in a header or in `PROVENANCE.md`; scripts are copied byte for byte so `git hash-object` proves it.
- Default stack as the operator's (TypeScript 7.0.2, Bun, Effect 4.1.0, Oxfmt, Oxlint with the Effect plugin, `@effect/tsgo` 0.63.0, Vite+ 1.2.0, devenv, Foldkit 0.169.0).
- Public repository, MIT licence (`LICENSE`, `Copyright 2026 Philip Bjørknes Krogh`, the verbatim MIT text). xyflow is credited in `README.md` and `NOTICE`.
- A generic library: no reebeat product logic. ELK.js (EPL-2.0 OR GPL-3.0) stays out of the library; layout is the application's.

## What is built

| Part | Content | Reused from |
|---|---|---|
| Repository | `reebeat/foldkit-flow`, public; first commit `0a7d2c1` (README, `LICENSE`, `.gitignore`) pushed to `main` because the repository had no commit and `main` did not exist; every later change by PR | assignment |
| Toolchain | `package.json` (workspaces `apps/*`, `packages/*`, `tools/*`; `catalog` pins), `tsconfig.json`, `devenv.nix` (Bun, Node 24, gitleaks), `devenv.yaml`, `devenv.lock` | studio `b26c1cc`; the toolchain files byte for byte, `package.json` adapted |
| Lint and format | root `vite.config.ts`: Oxfmt (Ultracite), Oxlint with Ultracite `core`, `@effect/tsgo` presets, the Effect plugin, the anti-slop Effect rules, cognitive complexity at most 15, type-aware, the Foldkit plugin's recommended rules for `apps/example` and `packages/flow` | studio `vite.config.ts`, adapted (groups and overrides) |
| Hooks | `.vite-hooks/pre-commit`, `commit-msg`, `pre-push`; `commitlint.config.ts` | studio, byte for byte |
| Exceptions registry | `tools/quality/effect-exceptions.json` (empty), `checkEffectExceptions.ts`, `effectExceptions.ts` and their test | studio, byte for byte |
| Family check | `tools/quality/effectFamily.ts`, `diagnosticRules.ts` and their tests | studio, byte for byte |
| Published Effect range | `tools/quality/publishedEffectRange.ts` and its test (see below) | new |
| Anti-slop rules | `tools/oxlint/anti-slop/` | studio, byte for byte |
| Secrets, dead code, duplication | `.gitleaks.toml`, `knip.json`, `.jscpd.json` | studio, adapted (title, workspaces) / unchanged |
| CI | `.github/workflows/checks.yml`: pull requests and push to `main`; pinned devenv; one step per gate; actions pinned by commit | studio, header only |
| Skills | `.agents/skills/review-pr/` (`SKILL.md`, `record-round.sh`, `merge.sh`), `.agents/skills/pr-create/SKILL.md` | studio; the two scripts byte for byte |
| Agent docs | `AGENTS.md`, `CLAUDE.md` (`@AGENTS.md` only), `STATE.md`, `PROVENANCE.md`, `NOTICE`, `README.md` | studio's `AGENTS.md`, adapted |
| Library | `packages/flow` (`foldkit-flow`): `src/attribution.ts` (the `Attribution` tagged union `Visible` or `Hidden`, visible by default, and its view) with Scene tests; peers `effect ~4.1.0` and `foldkit ~0.169.0` | new |
| Example shell | `apps/example`: a Foldkit app whose Model holds the `Attribution`; `main.ts`, `application.ts`, `entry.ts`, `story.test.ts`, `scene.test.ts`, `boot.test.ts`, `FOLDKIT.md` | studio's `apps/editor`, rewritten for the scaffold |
| One command | `bun run ready` = `check`, `check:exceptions`, `test`, `build`, `knip`, `cpd`, `secrets` | studio |
| Branch protection | `main`: pull request required (administrators included, no approving reviews), required status check `checks`, no force push, no deletion | `gh api -X PUT repos/reebeat/foldkit-flow/branches/main/protection`, the same body as reebeat's |

### The published Effect range

Effect 4.0.2 tagged every export `@stability stable`, `unstable` or `experimental`. An unstable or experimental API may break in a minor release; a stable one follows semver (`effect` 4.1.0 removed `effect/Crypto`, which was unstable). So a package that publishes code must state its Effect range by what it uses:

- **floor:** the lowest version whose APIs it uses; this repository's floor is 4.1.0;
- **ceiling:** a package whose published sources use an unstable or experimental API (the diagnostics `unstableApiUsage` and `experimentalApiUsage` of `@effect/tsgo`, run with an empty allowlist) must accept nothing above the next minor (`~4.1.0`, an exact version, or `>=4.1.0 <4.2.0`); a package that uses stable APIs only may use `^4.1.0`; `@effect/*` runtime packages follow the same rule as `effect`; `@effect/tsgo` and `@effect/vitest` are tooling and exempt.

`tools/quality/publishedEffectRange.ts` reads every `packages/*/package.json`, asks `effect-tsgo diagnostics` which unstable or experimental APIs the package's non-test `src` uses, and `test/publishedEffectRange.test.ts` fails the repository when a package breaks the rule. `packages/flow` declares `effect ~4.1.0` (the conservative choice while Foldkit's own peer is 4.0.0) and `foldkit ~0.169.0` (0.x: a minor may break). `@xyflow/system` is exempt.

## The scaffold

A scaffold, by design: it names the canvas that spec 0001 fills and shows no graph. `Attribution = Visible | Hidden` is a tagged union, not a boolean (FOLDKIT.md: encode state in unions); `update` is a total function and returns no Command, so nothing runs outside the runtime; the Story tests say so with `Command.expectNone()`. The attribution is a real feature of the library (xyflow asks users to keep it or to support the project; React Flow offers `proOptions.hideAttribution`): `attributionView` renders `<a href="https://xyflow.com" rel="noopener noreferrer" target="_blank">Built with xyflow</a>` unless the option is `Hidden`.

## Falsifiers

Each falsifier has a negative control that is run and observed to fail, with the output recorded in the PR body. A control is a deliberate defect applied to a scratch copy or a throwaway branch and never committed to `main`.

| # | Falsifier (must hold) | Gate | Negative control (must fail) |
|---|---|---|---|
| F1 | `bun run ready` exits 0 on a clean tree of the PR head | `ready` | F2 to F5, F7, F10 to F13 each make `ready` or a hook exit non-zero where it is the gate |
| F2 | A commit message that is not a Conventional Commit is rejected | `commit-msg` | `git commit -m "stuff"` is refused with the commitlint reason; `git commit -m "chore: x"` is accepted |
| F3 | A lint error in a staged file blocks the commit | `pre-commit` (`vp staged`) | Stage a file with `console.log` and an `any` parameter; the commit is refused |
| F4 | A secret in a staged file blocks the commit | `pre-commit` (gitleaks) | Stage a file holding a synthetic key in a well-known format (written only to the scratch copy); the commit is refused |
| F5 | An `oxlint-disable` without a registry entry fails `check:exceptions` | `check:exceptions` | Add `// oxlint-disable-next-line <rule>` without an entry: exits non-zero and names the file and line; remove the directive again: exits 0 |
| F6 | CI runs the gates on every PR and fails when one fails | `checks.yml` | This PR shows a green `checks` run; a throwaway PR with a lint violation shows a red one (closed, not merged) |
| F7 | `effect` and every `@effect/*` package share one version | family test | In a scratch copy, change one `@effect/*` entry of `bun.lock`: the test fails and names the package |
| F8 | A PR cannot be merged without a passing recorded round on its current head | `merge.sh` | On the throwaway PR: `merge.sh` before recording exits 4; after a `changes` round exits 4; after a `pass` round and one more commit exits 4 (head moved). The final merge is not run: this assignment does not merge |
| F9 | `main` cannot be pushed to directly | branch protection | `git push origin HEAD:main` from a scratch clone is rejected by GitHub |
| F10 | Cognitive complexity above 15 and a floating Effect fail `vp check` | Oxlint | A scratch function with complexity 16 fails; `Effect.succeed(1);` as a statement fails |
| F11 | The scaffold's behaviour is pinned by tests that run through the Foldkit runtime's own test harness | `bun run test` (Story, Scene, boot) | Make `update` return the model unchanged: the Story tests, the Scene test and the boot test for the toggle fail. Make `attributionView` return `h.empty` for `Visible`: the library's Scene test fails |
| F12 | The Foldkit conventions are enforced, not read | `vp check` (Foldkit plugin) | A `switch` on `message._tag` in `apps/example/src` and one in `packages/flow/src` fail with `foldkit/no-switch-on-message-tag` |
| F13 | A published package that uses an unstable or experimental Effect API, however imported, cannot accept the next Effect minor | `bun run test` (`publishedEffectRange.test.ts`, which runs `effect-tsgo diagnostics`) | Change `peerDependencies.effect` of `packages/flow` to `^4.1.0` and add `import { FileSystem } from "effect"` with `export const fileSystemTag = FileSystem.FileSystem` to `packages/flow/src/attribution.ts` (scratch), then the same with `import { FileSystem } from "effect/FileSystem"`: the test fails and names the package and the range |
| F14 | The xyflow attribution is visible by default, can be turned off, and is credited | Scene and boot tests; `NOTICE`, `README.md` | The Scene test fails when the default is `Hidden`; `grep -c xyflow README.md NOTICE` is non-zero for both |

Not gated, observed once (recorded in the PR body): the built example, served by `vp preview` and loaded in headless Chromium, renders the heading, the Canvas region and the attribution on Effect 4.1.0 with Foldkit 0.169.0. CI has no Chromium; spec 0001 adds the browser journey and performance measurement as a local gate.

## Constraints on the implementation

- Free on mechanism, specific on behaviour: the scripts may be arranged differently as long as `ready`, `check`, `test`, `build`, `check:exceptions`, `knip`, `cpd` and `secrets` exist and the journey above holds.
- Tests use fixtures written to temporary directories; none reads a file outside the repository.

## Risks

| Risk | Mitigation |
|---|---|
| Foldkit 0.169.0 targets `effect@4.0.0` and this repository runs 4.1.0 | Story and Scene tests, the build, the boot test and a browser smoke on 4.1.0; bun's peer warnings are expected until a Foldkit release lists 4.1.0; the family check keeps `effect` and `@effect/*` at one version |
| `@foldkit/vite-plugin` is unusable on 4.1.0 (it imports `Crypto` from the `effect` root) | Not installed; the app builds with Vite+ and Tailwind; its dev tools and hot model preservation are off (reebeat studio issue #4; agent FoldkitUpstream has an upstream fix in flight) |
| devenv in CI is slow (Nix install, cache misses) | Reuse studio's pinned devenv and the `devenv` Cachix cache |
| The exception registry becomes a rubber stamp | Each entry needs a retirement trigger and the conformance reviewer checks new entries |
| Branch protection with administrators included blocks the operator in an emergency | The command that removes it is in `AGENTS.md` |

## Open questions for the operator

1. Offer the library to Foldkit as `@foldkit/flow` (recorded as a later option in `STATE.md`): when, and under which package name and licence header?
2. Vendor the Foldkit repository as a subtree (`repos/foldkit`, as `FOLDKIT.md` offers)? Not done; the installed package's JSDoc was enough.
3. A required human approval, signed commits, Renovate: deferred, as in reebeat and studio.

## Revisions

Dated entries. A spec is revised only here; its text above is never edited silently after the PR opens. Before the PR opens, the plan may change freely as the build teaches; a change that alters the journey, scope or a falsifier gets an entry anyway.

- **2026-10-29, plan written** with the build: studio's lifecycle copied at `b26c1cc`, the workspace shaped, the attribution and the example shell written.
- **2026-10-29, the source is studio's merged `main`.** The build started from studio's head `643096ea`; studio's PR #1 was squash-merged as `b26c1cc` with an identical tree, so provenance names `b26c1cc`.
- **2026-10-29, the published Effect range (lead rule of the same date; adds F13).** `tools/quality/publishedEffectRange.ts` and its test are new in this repository; `AGENTS.md` states the rule. `packages/flow` is not yet published and carries `private: true`; the check applies to every directory under `packages/` regardless.
- **2026-10-29, no `@foldkit/vite-plugin`.** Inherited from studio (its spec 0000, Revisions): the plugin 0.28.0 imports `Crypto` from the `effect` root, which 4.1.0 lacks. The example's Vite config is Vite+ with Tailwind only.
- **2026-10-29, paused (the lead asked the agent load to be lightened; the PR is not open).** Where the build stands: the three commits on `feat/0000-development-lifecycle` are written, and `bun run ready` exited 0 on `454e806`-era content (check, exceptions, tests, build, knip, cpd, secrets), before the docs commit `7dd0ebc`, which changes no code. Falsifier controls shown so far, on a throwaway branch (deleted): F2 (`git commit -m "stuff"` refused with `subject may not be empty`, `type may not be empty`; `chore: x` accepted), F3 (a staged file with `console.log` and an `any` parameter refused by `vp staged`, rule `typescript(no-explicit-any)`), F4 (a staged synthetic token refused by gitleaks, `leaks found: 1`). Controls not yet run: F5, F6, F7, F8, F9, F10, F11 (mutations), F12, F13, F14. The branch protection of `main` is set (checked with the API). Spec 0001 is not started. Next three steps: (1) run the remaining controls on a throwaway branch (F5, F7, F10 to F14 are local and cheap; F6, F8 and F9 need a throwaway PR and a scratch clone), re-run `devenv shell -- bun run ready` on the final head, only when memory PSI `full` avg10 is under 1%, then open PR 0000 with skill `pr-create`; (2) write spec 0001 on a stacked branch `feat/0001-first-journey` and prototype its riskiest part first, the render cost of one pointer move over 500 nodes and 700 edges in headless Chromium (Foldkit `createKeyedLazy` for nodes and edges; fix, if it is over 16 ms: apply the viewport transform in the Mount and update the Model on end); (3) build the library against that spec. Design decisions so far (not yet in a spec): the Flow Submodel owns nodes, edges, viewport, selection and interaction in its Model; xyflow controllers (`XYPanZoom` on the pane, `XYDrag` per node, `XYHandle` per handle, `XYMinimap`) attach in `Mount.defineStream` Mounts that dispatch Messages; Mount args are captured at mount (not refreshed), so a controller reads the current store snapshot from a DOM property the pure view sets with `Prop` (no Command per Message); box select and keyboard are pure Elm (Model state plus a Subscription for document pointer events while selecting); layout stays out of the library.
- **2026-10-29, resumed; the remaining controls ran and PR 1 opened.** F5, F7 and F9 to F14 ran on throwaway branches and a scratch clone, F6 and F8 on throwaway PR #2 (closed, never merged), `bun run ready` exited 0 on `01e5635`, and the PR body carries the outputs. This entry supersedes the "not run" list of the paused entry above.
- **2026-10-29, review round 1 (changes) and its fixes.** (1) *High.* The published-range check guessed "unstable" from import specifiers, so `import { FileSystem } from "effect"` (the barrel) was missed. It now asks `effect-tsgo diagnostics` over each package's `src` (tests excluded), with an empty `allowedUnstableApis` and `unstableApiUsage` and `experimentalApiUsage` at error, which resolves the API however it was imported; the sections "The published Effect range" and F13 above were edited to say so, and F13's control now has two forms, a barrel import and a subpath import, each with `^4.1.0`. The check takes two roots (the packages' and the one `effect-tsgo` is installed in) so fixture packages in a temporary directory are checked too. (2) *Low.* The `>=` range form is anchored (`>=x.y.z` or `>=x.y.z <a.b.c`), so `>=4.1.0 || ^3.0.0` is reported; it is a test. (3) *Low.* `PROVENANCE.md` counts 70 identical files and lists `tsconfig.json`, `vitestSetup.ts` and `styles.css` of the example as identical. (4) *Low.* The example's `init` uses the library's `defaultAttribution`, so a changed default fails the example's tests too. (5) *Low.* This entry and the one above record the resume.
