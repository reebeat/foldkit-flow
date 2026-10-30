# 0005 Publish `@tsukuri/flow` to npm: the published shape and the release path

Status: **plan** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-30. Decided by: the operator (publish approved; the GitHub environment `npm-release` exists on this repository, reviewer `phibkro`, `main` only; the operator sets the secret `NPM_TOKEN`) and the lead's approval of the design (stage shape, peers, exports, hold gate kept, no hold file) relayed to the agent the same day.
Process: [spec 0000](0000-development-lifecycle.md). Based on `main` at `114bcfb` (specs 0000 to 0004 merged). Copies the final release path of `phibkro/pg-txmode` (specs [0006](https://github.com/phibkro/pg-txmode/blob/23be53c0c66a129540350697253b5c19abde3171/docs/specs/0006-release.md) and 0007, head `23be53c0c66a129540350697253b5c19abde3171`), which followed `tsukuri-labs/tsukuri` spec 0009. [`PROVENANCE.md`](../../PROVENANCE.md) lists every copied file.
Verify skill: none (this repository has none); the evidence is [`0005-evidence/`](0005-evidence/README.md) and `~/.local/state/foldkit-flow-verify/0005/`.

## Problem

`@tsukuri/flow` exists only in this repository: its manifest says `private`, its `exports` point at `.ts` sources, nothing builds what a consumer installs, no workflow can publish it, and the licence story of a published package is not written down: which files are original MIT code, which were copied under Apache-2.0, and what exactly an npm tarball would hold.

## Goal

A maintainer runs one workflow on `main`, after a version commit, and `@tsukuri/flow@0.1.0-alpha.N` appears on npm under the dist-tag `alpha`: built (ESM and declarations), with a provenance attestation, published by GitHub Actions, containing only the library's own MIT code and its attributions. **This PR publishes nothing, bumps no version, and does not set the secret.** It builds the path and proves every part that can be proved without the registry; the version commit is the next PR.

```text
bun run release:stage            builds packages/flow/dist and refuses anything that should not ship
bun run release:version          changeset version: 0.1.0-alpha.N, a CHANGELOG.md                              (the next PR)
Actions > Release > Run workflow  mode=check    dry-run publish, the token's identity and reach; publishes nothing
                                  mode=publish  npm publish ./packages/flow/dist --tag alpha, only when `npm view` says E404
npm i @tsukuri/flow@alpha foldkit@0.170.0 effect@4.1.0 @effect/platform-browser@4.1.0
```

## Journey

```sh
git checkout feat/0005-npm-release
devenv shell -- bun install
devenv shell -- bun run release:stage                    # packages/flow/dist, nine files, a clean tarball listing, a consumer that type-checks
cd /tmp && npm pack --dry-run <repo>/packages/flow/dist  # outside the repository, see "Decisions"
cd tools/release && devenv shell -- bunx vp test run     # the token, mode, hold, manifest, tarball and licence rules and their controls
```

Then read [`0005-evidence/README.md`](0005-evidence/README.md): the tarball listing, a control, the real `Publish` step against a local registry (publish, skip, second release, tag), and a fresh project that installs the registry tarball, type-checks it, bundles it and imports it.

## Decisions

### 1. The published shape

| Question | Decision |
| --- | --- |
| Published set | `@tsukuri/flow` only: a package is published when its manifest has no `"private": true` (the Changesets rule). `apps/example` and the tools are private. |
| Source manifest | `exports` keep pointing at `./src/*.ts` and `./src/flow.css` (the workspace, the example and the journey are unchanged; J9 and every gate keep working). It gains `publishConfig: { access: "public", directory: "dist" }` and a `prepublishOnly` that exits 1 with the instruction, so `npm publish` in the source directory cannot ship sources. `private` is removed. Version stays `0.0.0` in this PR. |
| Built output | `vp pack src/index.ts src/testing.ts --dts --out-dir dist`: `index.mjs`, `index.d.mts`, `testing.mjs`, `testing.d.mts`. Dependencies and peers stay external. `flow.css` is copied as it is. |
| Shipped manifest | **Generated** from the source manifest (`releaseManifest`): `exports` as `{ types, default }` for `.` and `./testing` (`types` first: TypeScript takes the first condition that matches) and `{ default }` for `./flow.css`; `main` and `types` for tools that do not read `exports`; `type: module`; `sideEffects: ["./flow.css"]` (nothing else in the package has a side effect: it is the stylesheet a bundler must keep); `repository`, `homepage` from the package manifest (spec 0004), `bugs` and `license` from the root, `publishConfig: { access: "public" }`. `devDependencies` and `scripts` do not ship. No `engines`: nothing here was shown to need it. |
| Exports | `.`, `./flow.css`, `./testing`. `./testing` is the 12-line `eventually` helper that the example's boot test uses to wait for DOM state in happy-dom. It ships (operator-approved design); the README says it is a test helper and not for the application. |
| Dependencies | `@xyflow/system` 0.0.83 and `d3-selection` 3.0.0 (exact, as today). **`@types/d3-selection` moves to `devDependencies`**: no declaration file of the package imports `d3-selection` (read from `index.d.mts`), and the scratch consumer below proves a consumer needs nothing more. |
| Peers | `foldkit` `~0.170.0` (0.x: a minor may break) and `effect` `~4.1.0`. See "The Effect peer". |
| No diagnostics directive | `tools/quality/publishedEffectRange.ts` already fails any `@effect-diagnostics` in non-test `src` of a published package; `packages/flow/src` has none. The exception registry stays empty. |
| Attribution | The xyflow link stays on by default (`Attribution` default, spec 0000); the README of the package and `NOTICE` credit xyflow. Unchanged by this spec; `packages/flow/src/attribution.test.ts` keeps it. |

**The Effect peer.** The operator rule (AGENTS.md, "Versions of the library") gives `^4.1.0` to a package that uses stable Effect APIs only and `>=4.1.0 <4.2.0` to one that uses unstable ones. Measured, not assumed: with `effect` set to `^4.1.0` the published-range test (`effect-tsgo diagnostics` over `packages/flow/src`, empty `allowedUnstableApis`) still passes, so `packages/flow/src` uses stable APIs only. **The peer is nevertheless `~4.1.0`**, the same bound, because Foldkit 0.170.0 itself declares `effect ~4.1.0` and `@effect/platform-browser ~4.1.0` (read from its `package.json`): a caret on flow would promise an Effect 4.2 that no install satisfies while Foldkit is at 0.170. The published-range test keeps judging stability on every run, so the day a use becomes unstable nothing changes, and the day Foldkit widens its range the caret becomes available (a revision, not a surprise).

**The stage step** (`bun run release:stage`, `tools/release/stagePackages.ts`, rules in `release.ts`, `consumer.ts`), for each published package:

1. `vp pack` of the TypeScript exports with declarations, then the CSS exports copied.
2. The generated `package.json`, the repository's `LICENSE` (MIT) and `NOTICE`, the package's `README.md`, and `CHANGELOG.md` when Changesets wrote one.
3. `npm pack --dry-run --json` of a copy outside the repository, and a failure on any file that is not `*.mjs`, `*.d.mts`, `*.css`, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE` or `NOTICE` (`strayFiles`).
4. A failure when a built file or a source file the bundler reads (the entries and what they import, tests excluded) imports a package the manifest neither depends on nor has as a peer, or a declaration file imports a package whose types are a development-only `@types/*` (`importFindings`).
5. **The scratch consumer** (new here): the staged package copied into an empty project's `node_modules`, with **only** what its manifest declares linked next to it, and `tsc` over one file that re-exports every typed entry, with `strict` and **without** `skipLibCheck`. A declaration that imports something that does not ship fails there as it would for the first user (the finding of pg-txmode spec 0006, Revisions 1: `@types/pg` had to ship). The module `consumer.ts` takes its inputs as parameters, so `consumer.test.ts` runs it on fixtures.

`npm` stops in any directory below a root `package.json` whose `devEngines.packageManager` names another tool (`EBADDEVENGINES`; this root names Bun). The `check` job therefore runs its dry run from `$RUNNER_TEMP`, and the `publish` job removes `devEngines` from the runner's own checkout with `jq` before it publishes (the checkout is discarded). The repository's `devEngines` stays.

### 2. The release path (copied from pg-txmode's final form)

**Versioning: Changesets 3.0.3, versions only, pre mode `alpha`.** `@changesets/cli` is pinned exactly and only runs `changeset version`; it does not publish (see "The Tag lesson"). `.changeset/config.json`: `access: public`, one `fixed` group (`@tsukuri/flow`), `privatePackages: { tag: false, version: false }`, no git tags. `.changeset/pre.json` is committed here as `{ "mode": "pre", "tag": "alpha" }` (as in pg-txmode), so the `Publish` step and the `check` job already read tag `alpha`: a dispatch before the version commit could not publish to `latest`. The first version **`0.1.0-alpha.0`** arrives in a **separate version PR** after this one: one changeset, `bun run release:version`. This PR leaves the version at `0.0.0`.

**The workflow `.github/workflows/release.yml`** (unchanged in structure from pg-txmode's): `workflow_dispatch` only, input `mode` (`choice`: `check` or `publish`, default `check`), concurrency group `release`, `permissions: contents: read`. Both jobs run in the environment `npm-release` and only on `refs/heads/main`.

- **`check`**: checkout, the pinned Nix, Cachix and devenv steps of `checks.yml`, `bun install --frozen-lockfile`, `bun run release:stage`, then `npm publish <dist> --dry-run --tag <tag> --access public` from outside the checkout (the tag is read from `.changeset/pre.json`), the registry's `dist-tags` for the package, a user npm config file, and **one** step with the token: `npm whoami`, `npm access list packages @tsukuri --json`, `npm org ls tsukuri --json`, `result: pass|fail`. It prints no value of the token and says what it cannot show (expiry, write access: only the first publish proves it). **A dry run does not authenticate.**
- **`publish`**: `id-token: write`, `NPM_CONFIG_PROVENANCE=true` (a publish that cannot produce provenance fails instead of publishing without it); checkout, **Release hold**, the `checks` check-run of the commit must be `success`, Nix and devenv, `bun install --frozen-lockfile`, npm at least 11.5.1 (trusted publishing needs it), `release:stage`, the npm config file, removal of `devEngines`, then **`Publish`**.

**The `Publish` step.** For each `packages/*/dist/package.json` in order: `npm view <name>@<version> version`; **success means the version is on the registry: skipped**; output containing `E404` means it is not: `npm publish ./packages/<name>/dist --tag <tag> --access public`; **anything else** (network, 5xx, auth) prints the output and stops with nothing published. `<tag>` is the tag of `.changeset/pre.json` while its mode is `pre`, else `latest`. A re-run after a partial release skips what is there.

**The Tag lesson (why Changesets only versions).** `changeset publish` gives `alpha` to the first publish of a package only: `getReleaseTag` returns `latest` for a package whose registry entry already has a `latest` dist-tag and only alpha versions, and `changeset publish --tag alpha` is refused in pre mode (pg-txmode spec 0006, Revisions 5, reproduced there twice against a local registry). After the second release `npm i @tsukuri/flow@alpha` would install the first alpha. Therefore the `Publish` step passes `--tag` itself and never calls `changeset publish`; a test fails the step if it does or hard-codes `latest`. The rehearsal in the evidence (section 3) shows `alpha` following each release on a local registry.

**The token path.** One granular npm token, the environment secret `NPM_TOKEN` of `npm-release` (declared by name in `secretspec.toml`; **no value is anywhere in the repository and the agent never read it**), given as `NODE_AUTH_TOKEN` to **one** step of one job. It reaches npm through `$RUNNER_TEMP/npmrc`, which holds `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` (single-quoted: the shell does not expand it, npm does). OIDC stays the target: npm tries trusted publishing first and uses the token only when the package has no trusted publisher, so configuring one needs no workflow change ([npm: trusted publishing](https://docs.npmjs.com/trusted-publishers): npm CLI 11.5.1 or later, Node 22.14.0 or later). The workflow file name `release.yml`, the environment name `npm-release` and the `repository.url` of the shipped manifest (npm requires it to match the repository exactly) are what npm matches. **A deadline:** [npm: about access tokens](https://docs.npmjs.com/about-access-tokens) says direct publishing with a granular token ends in January 2027; the token is a bridge of weeks, and trusted publishing is the end state.

**The release hold: the gate stays, the file does not exist.** `.github/release-hold` holds the release while it exists; the `Release hold` step of `publish` follows the checkout, fails with the file's text, and every later step is skipped. Publishing is approved, so **no hold file is added**; the mechanism and its controls (the step exists, nothing but the checkout precedes it, no `continue-on-error`, no `if` on it or later, and the real step's script run in two temporary directories exits 0 without the file and 1 with it) stay, so a hold can be put back by adding the file. Merging a PR publishes nothing: only a `workflow_dispatch` in `publish` mode does, and it waits for the reviewer of `npm-release`.

### 3. Licence hygiene

- **GitHub detects MIT**: `gh api repos/tsukuri-labs/foldkit-flow/license` returns `spdx_id: MIT`, `path: LICENSE` and `gh repo view --json licenseInfo` returns `key: mit` (observed 2026-10-30 on `main`). The lead's note that it showed none was not reproduced; the `LICENSE` text is the standard MIT text with the holder line `Copyright 2026 Philip Bjørknes Krogh` and is unchanged. A test pins its first lines and the permission sentence.
- **What ships, exactly** (the tarball listing is in the evidence): `index.mjs`, `index.d.mts`, `testing.mjs`, `testing.d.mts`, `flow.css` (flow's own source, built; original MIT code), `package.json` (generated), `LICENSE` (MIT), `NOTICE` (the third-party attributions: `@xyflow/system` MIT, Copyright (c) 2019-2025 webkid GmbH; `d3-selection` ISC, Copyright Mike Bostock; the Foldkit template credit for two repository files; and the statement that Apache-2.0 copies stay in the repository), `README.md`. **No third-party code is bundled**: `@xyflow/system` and `d3-selection` are dependencies, installed under their own licences.
- **What is copied, and under what licence** is in [`PROVENANCE.md`](../../PROVENANCE.md), "Licence of every file, and what ships": files copied from `tsukuri-labs/tsukuri`, `studio`, `vektorprogrammet-reimagined` and `pg-txmode` are **Apache-2.0** and keep their headers; **publishing under MIT relicenses none of them**; `LICENSES/Apache-2.0.txt` (the apache.org text, byte for byte) is in the repository and none of them is in the tarball. **Flagged, not verified:** the GitHub licence API answers 404 for `tsukuri-labs/studio` and `phibkro/vektorprogrammet-reimagined` from here, so their Apache-2.0 is the operator's statement for this spec, not something checked.
- **The proof**: `strayFiles` refuses everything but the nine names (its control fails `LICENSES/Apache-2.0.txt`, `src/`, maps, tests); a test fails when a non-test source file of `packages/flow/src` carries an Apache or copied-code header; a test fails when a file copied from pg-txmode loses its header or its row in `PROVENANCE.md`.

### 4. Journey J9 and the gates

Nothing in `packages/flow/src`, `apps/example` or `tools/journey` changes, so J9's timing and memoisation judgement is untouched; the journey is not part of `ready` and was not part of this change. `release:stage` joins `ready` and CI (`checks.yml` step `Stage release package`).

## Falsifiers

| # | Falsifier | Gate | Control that must fail it |
| --- | --- | --- | --- |
| F1 | The package yields a complete manifest: no `workspace:` or `catalog:` left, MIT, public access, built exports with `types` before `default`, `main`, `types`, `sideEffects: ["./flow.css"]` | `release.test.ts`, `release:stage` | `workspace:*` to a package that is not published, an unknown catalog name, `workspace:^`, `catalog:default`, a licence that is not the root's, a missing description, homepage, repository or access, an export `./index.js`, two exports that build to `index.mjs`, a version `workspace:*` |
| F2 | Only built output and the documents ship | `release:stage` (`npm pack --dry-run --json`), `strayFiles` | source, tests, maps, build info, nested files, `.npmrc`, `LICENSES/Apache-2.0.txt` in a listing |
| F3 | Every import of a built or bundled source file resolves for a consumer | `importFindings` in `release:stage`; `consumerFindings` in `release:stage` | an undeclared `left-pad`; a declaration importing a package whose `@types` is a dev dependency; on the real tree, `foldkit` removed from the peers (evidence 2); on fixtures, a declaration that imports an undeclared package, a declared package that is not installed, and a type error inside a declaration (`skipLibCheck` really off) |
| F4 | Changesets versions exactly the published set; no published package depends on a private one; `.changeset/pre.json` is `{ mode: pre, tag: alpha }` | `release.test.ts` | a private package as a dependency (fixture); a missing or different `pre.json` fails the test |
| F5 | The peers are bounded below the next minor | `release.test.ts`; `publishedEffectRange.test.ts` keeps judging Effect stability | `^4.1.0`, `>=0.170.0` (fixtures) |
| F6 | The package cannot be published from its source directory | `release.test.ts` runs `prepublishOnly` | n/a (the script exits 1) |
| F7 | The token rule: `secretspec.toml` declares one secret and the workflows read exactly that name; only in a job of environment `npm-release`; only as `NODE_AUTH_TOKEN` in **one** step; never at workflow or job level, in `run` or `with`, as a literal token, or printed | `releaseWorkflow.test.ts`, on fixtures and on the real files | a renamed secret, a second declaration, a second step, a `printenv`, `echo $NODE_AUTH_TOKEN`, `set -x`, and the other controls of that file |
| F8 | Only `mode=publish` on `main` reaches a publish; `check` never does (a bare `--dry-run` is a dry run; `--dry-run=false` is not; the script is split at `;`, `&&`, `\|\|`, `\|`) | `releaseWorkflow.test.ts` | no mode condition, `npm publish` in `check`, `npm publish && npm publish --dry-run`, `--dry-run=false`, and the others |
| F9 | The hold stops the publish | `releaseWorkflow.test.ts` (the real step run with and without the file) | no hold step, a step before it, `continue-on-error`, `if: always()` |
| F10 | Every release goes to the tag of pre mode, skips what the registry has, publishes only on `E404`, stops at the first failure, never calls `changeset publish` | `releaseWorkflow.test.ts` runs the real step with stubs for `devenv` and `npm`; evidence 3 runs it with the real `npm` | no `pre.json`; `mode: exit`; a failing publish; an `npm view` error that is not `E404`; the step edited back to `changeset publish` or `--tag latest` |
| F11 | What ships is original MIT code plus attributions; the Apache copies keep headers and rows and stay out of the tarball | `release.test.ts` (licence hygiene) | a source with an Apache or copied-code header; a copy without its header or its `PROVENANCE.md` row; `NOTICE` without xyflow or d3 |
| F12 | The registry tarball installs, type-checks (no `skipLibCheck`), bundles and imports in a project that is not this repository | evidence 4 (needs a registry: not a gate) | `tsc` without a `*.css` declaration fails with `TS2882` (observed: the README says so) |
| F13 | The gates pass; J9 is untouched | `bun run ready` | any gate fails |

## Constraints and values

- No publish, no dispatch, no secret read, no `NPM_TOKEN` value anywhere; the repository is public. The agent set no secret and no environment.
- Plain TypeScript for `tools/release` (zod, yaml, smol-toml), as in pg-txmode: it is repository tooling that npm never sees. `vite.config.ts` carries one override for `tools/release/**` that switches off six Effect-first rules (native `Array`, `String`, `Object` methods, Node built-ins, `process.env`, and `no-template-curly-in-string` for the `${NODE_AUTH_TOKEN}` fixture text) with its reason in a comment; it is not a suppression directive, and the exception registry stays empty.
- One source per fact: the published set from `private`; the token name from `secretspec.toml`; the licence and the bugs URL from the root; homepage and repository from the package.
- Dependencies added: `@changesets/cli` 3.0.3 (MIT, root, build time); `zod` 4.6.7 (MIT), `yaml` 2.9.1 (ISC), `smol-toml` 1.9.1 (BSD-3-Clause) in `tools/release`. None ships.

## Operator steps (external effects: not done here)

1. Merge this PR. Nothing is published.
2. Set the environment secret `NPM_TOKEN` of `npm-release` (granular, read and write, scope `@tsukuri`, expiring). Check that the npm organisation or user `tsukuri` exists and the token may create packages in it: that has not been checked and only the first publish proves it.
3. The version PR (next): one changeset, `bun run release:version`: `0.1.0-alpha.0`, a CHANGELOG.
4. Dispatch **Release, `mode=check`**. Read the dry-run listing, the token's user, and whether `npm access list packages @tsukuri` and `npm org ls tsukuri` can read.
5. Dispatch `mode=publish`. The first publish creates the name and is permanent. If it fails with E403 or E404 the token lacks permission to create packages in the scope. Afterwards read `npm view @tsukuri/flow dist-tags` (the `check` mode prints it too).
6. Later: trusted publisher, then the checklist below.

## Not claimed

- Anything about the real registry: that the scope `@tsukuri` exists or the token may create in it; that provenance and OIDC work for this repository; what real npm does to `latest` on a **later** publish with `--tag alpha` (on the real registry a first publish with `--tag alpha` set `latest` for `@pg-txmode/*`; that is observed in pg-txmode, not here).
- That Node versions, Bun or workerd consumers other than the ones in the evidence work (Node 24.21.0, npm 11.19.0, Vite 7.3.7).
- Stable (`latest`) releases and `changeset pre exit`.
- That `phibkro/vektorprogrammet-reimagined` and `tsukuri-labs/studio` are Apache-2.0 (the GitHub API cannot show it from here).
- A fix for `TS2882` on `import "@tsukuri/flow/flow.css"` without a `*.css` declaration: a typed stub export could remove it; not built, the README documents it.

## Risks

- **The first publish is the only proof of the token's reach**; a re-run after a fix skips what is on the registry.
- **`latest` is not ours** until a stable release: the registry decides it on a first publish.
- **The token is a bridge**: it expires and direct token publishing ends in January 2027.
- **A repository secret `NPM_TOKEN`** would be shadowed by the environment secret only inside jobs that name the environment; no file shows it: `gh secret list --repo tsukuri-labs/foldkit-flow` must list none.
- **`vp pack` is young**: the declarations come from the experimental TypeScript 7 declaration emit; the scratch consumer is the guard.
- **Foldkit 0.x**: every Foldkit minor can break the peer `~0.170.0`; an upgrade is its own spec.

## Removal checklist, when trusted publishing is set up

Order matters: npm's rule is that a new trusted-publisher configuration must complete its first successful publish within 2 days or it expires and cannot be used or edited ([docs](https://docs.npmjs.com/trusted-publishers#trusted-publisher-configuration-expiry)). (1) Merge the removal PR first (after it no workflow uses the token, so no publish can happen until step 2: the intended pause): delete the `check` job (without a token it fails at `npm whoami`, and `npm whoami` is no check of trusted publishing), the `npm credentials file` and token env of `publish`, the `mode` input or its `check` option with the mode rules adjusted, `secretspec.toml`, and the token rules of `releaseWorkflow.ts` that go with them. (2) Configure a trusted publisher on npmjs.com for `@tsukuri/flow` (organisation `tsukuri-labs`, repository `foldkit-flow`, workflow `release.yml`, environment `npm-release`). (3) Publish a new version with `mode=publish` within 2 days: the first successful publish validates it. (4) Set the package to "Require two-factor authentication and disallow tokens", delete the environment secret, and revoke the token on npmjs.com.

## Revisions

- **2026-10-30, token removal:** spec [0008](0008-trusted-publishing.md) supersedes the token path and removal order above after successful trusted publishing; it retains the token-free dry-run check.

- **2026-10-30, plan written** with the build.
- **2026-10-30, found while building.**
  1. **The first reading of the licence state was stale.** GitHub reports `MIT` for the repository today (section 3); no `LICENSE` change was needed. The test and the `PROVENANCE.md` section make the text and the claim checkable.
  2. **Without the `foldkit` peer the bundler inlines Foldkit** (275 kB against 60 kB) and the scratch consumer passes; only the source scan sees the missing peer. Both checks stay (evidence 2).
  3. **The Foldkit template needed an attribution.** `apps/example/FOLDKIT.md` and the two-line vitest setup come from the Foldkit template (MIT, Copyright (c) 2025 Devin Jameson); `NOTICE` and `PROVENANCE.md` now say so (neither ships).
  4. **`TS2882` on the stylesheet import** is a consumer-side finding (evidence 4), documented in the package README.
  5. **`@effect/platform-browser` is a Foldkit peer**, not flow's: the README names it so a consumer installs it.
  6. **`pre.json` is committed here, not in the version PR** (as in pg-txmode): the tag the `check` job and the `Publish` step read is then `alpha` from the first dispatch. A scratch copy of `package.json`, `.changeset/{config,pre}.json`, `bun.lock` and `packages/flow/package.json` with one changeset file (`"@tsukuri/flow": minor`) and `changeset version` gave `0.1.0-alpha.0` and a `CHANGELOG.md` (evidence 5); the version PR is that run in the repository.
- **2026-10-30, after review round 1 of PR #9 (recorded by `RevFlow1` at `8c5fd11`).**
  7. **The evidence was measured on earlier commits (medium).** Sections 1, 3, 4, 6 and 7 of the evidence README named figures (NOTICE 1845, README 2136, 24428 bytes packed) from before the last content edits. They are regenerated on the final content head, and the README records the sha each section was measured on.
  8. **The import scans read side-effect imports (low).** `importSpecifier` (`release.ts`) and `relativeImport` (`stagePackages.ts`) matched `from`, `import(` and `declare module` only, so `import "pkg";` was never scanned. Both now match the bare `import "x"` form; controls in `release.test.ts` (`import "left-pad"`, `import "@types/node"`) and on the real tree (`import "happy-dom"` added to `src/selection.ts`, evidence 8).
  9. **The `Publish` step matches the error code line, not the text (low).** `grep -qx "npm error code E404"` replaces `grep -q "E404"`: an error that only mentions `E404` in its text no longer leads to a publish. Control in `releaseWorkflow.test.ts`. (The copy in `phibkro/pg-txmode` has the weaker form; PROVENANCE lists this as a deviation.)
  10. **The Effect-first override for `tools/release/**` is recorded here (low).** `vite.config.ts` turns off six rules for those files (`prefer-effect-array`, `prefer-effect-record`, `prefer-effect-string`, `node-builtin-import`, `process-env`, `eslint/no-template-curly-in-string`), with its reason in a comment: the release tooling is copied plain TypeScript (zod, yaml, smol-toml) that npm never sees. Whether copied tooling may stay non-Effect is the lead's decision; it is declared here and in "Constraints and values".
