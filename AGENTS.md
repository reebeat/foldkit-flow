# foldkit-flow

A node-based graph UI for Foldkit: pan and zoom a canvas, drag nodes, connect handles, select with a box. It is a generic library (`packages/flow`, published as `foldkit-flow`) with no product logic, and an example app (`apps/example`) that is its first user. Read [`README.md`](README.md); [`STATE.md`](STATE.md) says which spec is active. This repository is **public** and MIT licensed: no secret, no personal data, ever.

The lifecycle below is specified in [`docs/specs/0000-development-lifecycle.md`](docs/specs/0000-development-lifecycle.md). This file links facts that live in scripts or in the spec; it does not copy them. It was copied from reebeat studio's `AGENTS.md` and adapted (see [`PROVENANCE.md`](PROVENANCE.md)).

## How a change travels

```text
spec → code → PR   (1:1)
```

- **One spec, one branch, one PR.** The spec is `docs/specs/NNNN-*.md`; the branch is `feat/NNNN-<slug>`. If a spec needs two PRs, it was two specs.
- **Plan and build are one step.** Write the plan (journey, constraints, falsifiers) first, then build without waiting for approval. Revise the plan as the build teaches: each change is a dated entry in the spec's Revisions section, never a silent edit. Stop only at an operator-owned fork (preference, authority, external effects), and report it.
- **The PR carries spec and code**, opens only when the whole journey is built and `bun run ready` passed on the head, and **freezes the spec**. Use skill `pr-create`; the PR body is the report.
- **Never block on a merge.** After opening a PR, start the next spec on a stacked branch.
- **Review judges three things**: the plan, the implementation, and their agreement. Use skill `review-pr`; `.agents/skills/review-pr/merge.sh` merges only a head with a passing recorded round.
- **One writer per working directory.** A second agent works in its own worktree under `.worktrees/` (`git worktree add .worktrees/<name> -b <branch>`; it is git-ignored). Commit by pathspec on a shared tree.
- `main` is protected: a pull request is required (administrators included), the status check `checks` must pass, no force push, no deletion.

## Layout and dependency direction

```text
apps/example      the Foldkit app that exercises the library; depends on packages/flow
packages/flow     foldkit-flow: Submodels, views, Mounts; peers: effect, foldkit; depends on @xyflow/system
tools/quality     repository checks (exception registry, Effect family, published Effect range, Foldkit lint adapter)
tools/journey     the browser gate: drives the built example in headless Chromium (puppeteer-core), measures the budget
tools/oxlint      vendored Oxlint rules
```

Tools depend on neither apps nor packages; the app depends on the package, never the reverse. **The library has no product logic and does not import ELK.js** (EPL-2.0 OR GPL-3.0): layout is the application's job, shown by an example only.

## Gates

Every gate is a root script in `package.json`; `bun run ready` runs them in this order. CI (`.github/workflows/checks.yml`) runs each script as its own step. Run everything inside devenv: `devenv shell -- bun run ready` (the system Bun can hang on install). Set up once with `devenv shell -- bun install`, which also installs the git hooks and patches the TypeScript server (`prepare`).

| Gate | Command | Runs where | Catches | See it fail |
| --- | --- | --- | --- | --- |
| Commit message | commitlint (`.vite-hooks/commit-msg`) | every commit | a message that is not a Conventional Commit | `git commit -m "stuff"` |
| Secrets, staged | gitleaks on staged blobs (`.vite-hooks/pre-commit`) | every commit | a secret in a staged file | stage a file with a fake key in a well-known format |
| Format and lint, staged | `vp staged` (`vp check --fix`, `.vite-hooks/pre-commit`) | every commit | format drift, lint errors | stage a file with a `console.log` and an `any` parameter |
| Tests | `bun run test` (`.vite-hooks/pre-push`) | every push, `ready`, CI | a failing test: the library's and the example's Story and Scene tests, the boot test (`Runtime.run` and `Runtime.embed` in happy-dom on effect 4.1.0), the exception check, the family check, the published Effect range check, the Foldkit lint adapter | break an assertion in `apps/example/src/story.test.ts` |
| Format, lint, types | `bun run check` (`vp check`) | `ready`, CI | Oxfmt drift; Oxlint with Ultracite, the Effect plugin and diagnostics, the Foldkit plugin, anti-slop rules, cognitive complexity above 15; type errors (type-aware via tsgolint) | a function with complexity 16; a `switch` on a Message tag in `apps/example` |
| Exception registry | `bun run check:exceptions` | `ready`, CI | a suppression directive without a registry entry; a registry entry without a live suppression | add `// oxlint-disable-next-line <rule>` with no entry |
| Effect family | `bun run test` (`tools/quality/test/effectFamily.test.ts`) | `ready`, CI | `effect` locked at two versions, or an `@effect/*` package at another version than `effect` in `bun.lock`; `@effect/tsgo` locked at two versions | change one `@effect/*` entry of `bun.lock` |
| Published Effect range | `bun run test` (`tools/quality/test/publishedEffectRange.test.ts`) | `ready`, CI | a package under `packages/` whose Effect range starts below 4.1.0, or that uses an unstable or experimental Effect API (found by `effect-tsgo diagnostics` over its `src`) and accepts the next minor | change a peer range of `packages/flow` to `^4.1.0` and use `FileSystem` from `effect` in its source |
| Build | `bun run build` (`vp build` in `apps/example`) | `ready`, CI | the example no longer bundles | import a module that does not exist |
| Browser journey | `bun run build && bun run journey` (`tools/journey`) | locally, **not** in `ready` or CI (CI has no browser). Exit codes: 0 held, 1 a check failed, **75 inconclusive**: nothing failed but the J9 timing check was not judged, because the host was busy or unreadable (load average above half the cores, memory, memory pressure or swap-in over the operator's limits, read before and after; `tools/journey/host.ts`). 75 means **not run**: it is never a pass (and a head's J9 timing is judged by the median of at least 3 admitted runs, none discarded: spec 0002, Revisions of round 1), and a caller that runs the journey (as `ready` would) must treat it as not run; the J9 memoisation check (DOM mutations, no timing) runs and counts on every host | the felt journey and the performance budget in headless Chromium: pan and zoom touch no node, drag, connect, refuse an invalid connection, reconnect, box select, keyboard only, controls, minimap, and the 500-node, 700-edge drag (spec 0001, J1 to J6, J9, J10); evidence in `~/.local/state/foldkit-flow-verify/journey/` | pass `view.ts` a viewport-dependent node argument, or remove `tabindex` from a node; run it while the host's load average is above 16 (exit 75) |
| Dead code | `bun run knip` | `ready`, CI | unused files, exports and dependencies | export a symbol nothing imports |
| Duplication | `bun run cpd` | `ready`, CI | copy-paste (threshold 0) | paste a 40-token block twice |
| Secrets, history | `bun run secrets` | `ready`, CI | a secret anywhere in the git history | commit a fake key on a scratch branch |

## Exceptions

Fix the code, not the rule. When a suppression (`oxlint-disable`, `eslint-disable`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `@effect-diagnostics`, `@effect-diagnostics-next-line`) is genuinely needed, add an entry to [`tools/quality/effect-exceptions.json`](tools/quality/effect-exceptions.json) in the same change: `id` (`EX-NNNN`), `scope` (`files`, `directives`), `reason`, `nativeAlternativesExamined`, `owner`, `versions` (the versions examined) and `retirementTrigger`. `bun run check:exceptions` fails on a suppression without an entry and on an entry without a live suppression, so an entry retires with its suppression. A published package may not carry any `@effect-diagnostics` directive in its non-test `src` at all, in any form, for any rule (the wildcard included) and at any severity, registered or not: the published Effect range check refuses it, because such a directive can hide an unstable use from that check. A rule turned off in `vite.config.ts` is not a suppression directive: it carries its reason in a comment there and in the spec's Revisions.

## Effect and Foldkit

Every agent that writes TypeScript here writes native Effect (v4, pinned in the root `catalog`) in Foldkit style.

- **Lookup order, before writing:** this file, then `node_modules/effect/AGENTS.md` and the `ai-docs/src` examples it links, then `node_modules/effect/src`, never memory or another copy. Under Bun's isolated installs the package is `apps/example/node_modules/effect`, not the root. For Foldkit, [`apps/example/FOLDKIT.md`](apps/example/FOLDKIT.md) and the JSDoc of `apps/example/node_modules/foldkit/dist/**/*.d.ts` (the `repos/foldkit` subtree is not vendored). Ready means every API used has installed guidance, or the search established that none exists (then say so in the PR).
- **Decision ladder:** native construct, composition of native constructs, a small domain abstraction built from Effect, a boundary adapter, a registered exception.
- **Pure stays pure.** `update`, `view` and every function of the Model are total functions; work leaves `update` only as a Command, a Subscription, a Mount or a ManagedResource (skill `effect-ui-lifetimes`). The library attaches every xyflow controller in a Mount and destroys it on unmount.
- **Versions of the apps.** `effect` and every `@effect/*` runtime package are one version (`tools/quality/effectFamily.ts`): 4.1.0, pinned exactly in the root `catalog`. Foldkit 0.170.0 and `@foldkit/vite-plugin` 0.29.0 (a development dependency of the example, loaded in its `vite.config.ts`) both declare `effect ~4.1.0`, so the install prints no peer warning for them. An upgrade of Effect or Foldkit is its own spec.
- **Versions of the library (operator rule, 2026-10-29).** A package we publish declares its Effect range by stability. Since 4.0.0, APIs tagged `@stability unstable` or `experimental` may break in a minor release; `stable` ones follow semver. The floor is the lowest version whose APIs the package uses (4.1.0). Whether a package uses an unstable or experimental API is not guessed from its imports: `tools/quality/publishedEffectRange.ts` runs `effect-tsgo diagnostics` over the package's `src` (tests excluded) with an empty `allowedUnstableApis` and `unstableApiUsage` and `experimentalApiUsage` at error, so a use through the `effect` barrel counts as much as one through a subpath. A package with any finding must accept nothing above the next minor (`~4.1.0`, an exact version, or `>=4.1.0 <4.2.0`); a package that uses stable APIs only may use `^4.1.0`. `@effect/*` runtime packages follow the same rule. `foldkit` is 0.x: `~0.170.0`. `tools/quality/test/publishedEffectRange.test.ts` fails otherwise. `@xyflow/system` is exempt from this rule.

## Conventions

- **Conventional Commits** (`feat(scope): …`, `fix: …`, `docs: …`, `chore: …`). Body lines at most 100 characters.
- **Never `--no-verify`.** A rejected commit can leave files staged: check `git status` after any hook failure.
- **Never set or change the git identity.**
- Python only for throwaway work; commit TypeScript. Edit files with the edit and write tools, never with a shell redirect into source.
- Copied code carries its provenance (source repository, commit, deviations) in a header or in [`PROVENANCE.md`](PROVENANCE.md); keep third-party licences in place, and keep xyflow credited in `README.md` and `NOTICE`.
- Tests prove a rule, not an implementation detail; a test fixture lives in a temporary directory the test creates, never outside the repository.
- Import `describe`, `test` and `expect` from `vite-plus/test`, not `vitest` (lint rule `vite-plus/prefer-vite-plus-imports`).

## Emergency

Branch protection includes administrators. To remove it (operator only, an external effect):

```sh
gh api -X DELETE repos/reebeat/foldkit-flow/branches/main/protection
```

Restore it afterwards as spec 0000 describes it.
