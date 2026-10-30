# Evidence for spec 0005

Sections 1, 3, 4 and 6 were **regenerated on commit `f2cb3e7`**, the last commit that changes content (code, workflow, `NOTICE`, READMEs): every later commit of this branch changes only this directory. Each section says the commit it was measured on. Environment: Node 24.21.0, npm 11.19.0, Bun 1.4.2, TypeScript 7.0.2 and `@changesets/cli` 3.0.3. **Nothing here touched the npm registry for a write**: every publish went to a local [Verdaccio](https://verdaccio.org/) 6.11.1 on `127.0.0.1:4873` with a throwaway user (a 116-character token in `NODE_AUTH_TOKEN`, never printed; `NPM_CONFIG_USERCONFIG` pointed at a file that holds `//127.0.0.1:4873/:_authToken=${NODE_AUTH_TOKEN}`). The registry had an uplink to `registry.npmjs.org` for reads, so a consumer project could install `foldkit`, `effect` and `vite`; `@tsukuri/*` had none. The raw output is copied from the terminal.

## 1. The tarball that would ship (`tarball.txt`, measured on `f2cb3e7`)

`devenv shell -- bun run release:stage`, then, in a copy of `packages/flow/dist` outside the repository, `npm pack --dry-run --json`:

```text
@tsukuri/flow@0.0.0 files=9 size=24714 unpacked=100470
   1075 LICENSE
   2124 NOTICE
   2493 README.md
   2946 flow.css
  29640 index.d.mts
  60157 index.mjs
    973 package.json
    502 testing.d.mts
    560 testing.mjs
```

Nine files: the built library and its declarations, the stylesheet, the generated manifest, the MIT `LICENSE`, `NOTICE` and `README.md`. No source, no test, no map, no `.github`, no `tools`, no `LICENSES/Apache-2.0.txt`. The registry served the same nine files back (section 3). The byte sizes depend only on content: they change when `NOTICE` or a README changes (an earlier version of this file listed 1845, 2136 and 24428 from before the last edits).

## 2. A control the consumer check and the import check catch (`control-missing-peer.txt`, measured on `ed6b9cb`)

`foldkit` removed from `peerDependencies` of `packages/flow/package.json` (and restored afterwards), then `bun run release:stage`: exit 1, one finding per source file that imports `foldkit` (`src/view.ts imports foldkit, which is not in dependencies or peerDependencies`, and the built `index.mjs`). Without the peer the bundler also **inlined** Foldkit into `index.mjs` (275 kB against 60 kB), which is why the scratch consumer alone would not have caught it and `importFindings` reads the sources too (the lesson of pg-txmode spec 0006, Revisions 1 and its evidence M1). The scratch consumer has its own controls in `tools/release/test/consumer.test.ts`. The code under test is unchanged since, except the import scans of section 8, which only add findings.

## 3. The `Publish` step against a registry (`registry-rehearsal.txt`, measured on `f2cb3e7`)

The real `Publish` step of `.github/workflows/release.yml` (its `run:` text read out of the file, so the `grep -qx "npm error code E404"` of Revisions 9; `devenv` stubbed to `exec "$@"`), with the real `npm`, in a scratch tree that holds `packages/flow/dist` (the staged one, version set to `0.1.0-alpha.0`, then `0.1.0-alpha.1`) and the repository's `.changeset/pre.json` (`{ "mode": "pre", "tag": "alpha" }`):

| Step | What the log shows |
| --- | --- |
| 0 | `npm view @tsukuri/flow@0.1.0-alpha.0 version`: `npm error code E404`, exit 1 (the only answer that lets the step publish) |
| 1 | `is not on the registry: publishing`, `Publishing ... with tag alpha and public access`, `+ @tsukuri/flow@0.1.0-alpha.0`; dist-tags `{latest: 0.1.0-alpha.0, alpha: 0.1.0-alpha.0}` |
| 2 | the same step again: `0.1.0-alpha.0 is on the registry: skipped`, nothing published, exit 0 |
| 3 | `0.1.0-alpha.1`: published with `--tag alpha`; dist-tags `{latest: 0.1.0-alpha.0, alpha: 0.1.0-alpha.1}`: **`alpha` follows every release; `latest` stays on the first** (the registry set it on the first publish; nothing moves it. On Verdaccio. What real npm does on a first publish with `--tag alpha` was observed for `@pg-txmode/*` (pg-txmode spec 0006, Revisions, "the first publish is observed": `latest` is set); for a later publish with `--tag alpha` it was not observed on npm) |
| 4 | `npm pack @tsukuri/flow@0.1.0-alpha.1` from the registry: the same nine files, 24712 bytes (section 1 packs the staged `0.0.0` manifest at 24714; the version string is the only difference between the two manifests), and the generated `package.json` |

## 4. A consumer project that installs the registry tarball (`consumer-install.txt`, measured on `f2cb3e7`)

A fresh project with `npm i @tsukuri/flow@alpha foldkit@0.170.0 effect@4.1.0 @effect/platform-browser@4.1.0 typescript@7.0.2 vite@7` (no peer conflict, no `ERESOLVE`): `tsc` of a file that imports `@tsukuri/flow`, `@tsukuri/flow/testing` and `@tsukuri/flow/flow.css` with `strict` and **without** `skipLibCheck`: exit 0; `vite build`: the stylesheet export reached the bundle (one `foldkit-flow` rule file) and the JavaScript bundled (439 modules); `node -e 'import("@tsukuri/flow")'` lists the 24 runtime exports. **One finding, not fixed here:** TypeScript 7 checks side-effect imports, so `import "@tsukuri/flow/flow.css"` fails with `TS2882` in a project that has no `*.css` declaration (Vite's `vite/client` types are one; the first run's project has them; the log's last block runs without them and fails). The README says so.

## 5. `changeset version` on this configuration (measured on `ed6b9cb`; `.changeset` and the manifest are unchanged since)

In a scratch directory outside the repository (a copy of the root `package.json`, `bun.lock`, `.changeset/config.json`, `.changeset/pre.json` and `packages/flow/package.json`, plus one changeset file `"@tsukuri/flow": minor`), `changeset version` printed the pre-release notice and wrote `"version": "0.1.0-alpha.0"` and a `packages/flow/CHANGELOG.md` (`## 0.1.0-alpha.0`, `### Minor Changes`, `- The first alpha.`); `.changeset/pre.json` stayed `{ "mode": "pre", "tag": "alpha" }`. Without `bun.lock` in the scratch directory the tool did not find the workspace package (`"@tsukuri/flow" does not match any package`): the workspace discovery needs the lock file, which the repository has. This is the next PR's command; nothing was versioned in the repository.

## 6. The browser journey on `f2cb3e7` (`~/.local/state/foldkit-flow-verify/0005/journey-f2cb3e7/run-{1,2,3}.log`)

`bun run release:stage`, `bun run ready` (exit 0) and then `bun run journey` three times on `f2cb3e7`; nothing under `packages/flow/src`, `apps/example` or `tools/journey` differs from `main`. Host admission passed in every run (load average 6.52, 7.80, 9.66 before; the limit is 16). The head's J9 timing is judged by the median of its **first 3 admitted runs**, all logged (spec 0002, Revisions of round 2):

| Run | Exit | J1 to J6, J0, J9 memoisation | J9 per-run p95 scripting (three drags) | Gate value (median of the three) |
| --- | --- | --- | --- | --- |
| 1 | 0 | all PASS | 6.29, 5.05, 4.31 ms | 5.05 ms |
| 2 | 0 | all PASS | 7.13, 4.13, 4.97 ms | 4.97 ms |
| 3 | 1 | all PASS except the J9 timing | 13.59, 3.84, 9.63 ms | 9.63 ms |

**The median of the three gate values is 5.05 ms, under the 8 ms line: J9's timing holds for this head by the declared rule.** Run 3 failed on its own gate value (9.63 ms), as the third run did in the earlier set of runs on `ed6b9cb` (gate values 3.59, 4.62, 9.50 ms; median 4.62 ms): two sets, the third run slow both times. The cause was not isolated (load average before run 3 was 9.66 against 6.52 and 7.80, below the admission limit; no per-process attribution was taken; the run itself is the third consecutive journey on a host whose load average was rising). Both sets are logged, none discarded, and the rule does not ask a head to pass every run. The memoisation check passed in all three runs of both sets (a drag mutates 2 nodes and 2 edges of 500 and 700, ten wheel steps 0).

## 7. Negative controls on the real files (`controls-real-files.txt`, `control-f11-apache-header.txt`, measured on `8c5fd11`)

Beside the fixture controls inside the tests, the real files were mutated **in memory** by a throwaway script (the same functions the tests call; nothing in the repository was edited; the script is not kept, the log is): the unmutated files give no finding from the token, mode and hold rules; then each of these is caught with the first finding shown in the log: a second step of the `check` job that reads `NPM_TOKEN`; `secretspec.toml` naming another secret; the token echoed in `Publish`; the `check` job without `--dry-run`; the `publish` job without its mode condition; the `Release hold` step deleted; `continue-on-error` on it; the real manifest with `effect ^4.1.0`, with `foldkit >=0.170.0`, with licence `Apache-2.0`, with an export `./index.js`, without `publishConfig`; a listing with `LICENSES/Apache-2.0.txt`, a source file and a map. One control edited a real file: a line `Licensed under the Apache License` at the top of `packages/flow/src/xyflow.ts` made `release.test.ts` fail (`expected ... not to match /Apache|Copied from|Provenance: .../`, 1 failed, 59 passed); the line was removed afterwards (`git status` clean). Between `8c5fd11` and `f2cb3e7` the only change to the files these controls read is the E404 line of the `Publish` step, which none of them reads (the token, mode and hold rules are text rules over other steps); the controls were not re-run.

## 8. Round 1 fixes (`control-side-effect-import.txt`, measured on the working tree before `f2cb3e7`)

- **Side-effect imports.** `import "happy-dom";` (a development dependency) added to line 1 of `packages/flow/src/selection.ts`, then `bun run release:stage`: exit 1, and among the findings of the inlined code the one that names the package: `@tsukuri/flow: src/selection.ts imports happy-dom, which is not in dependencies or peerDependencies`. Before the fix no finding named it. The line was removed afterwards. Unit controls: `import "left-pad"` and `import "@types/node"` fail, `import "zod"` and `import "peerlib/sub"` pass (`release.test.ts`).
- **The E404 line.** An `npm view` error whose text only mentions `E404` (`npm error 503 proxy said: upstream returned E404 in a body`) stops the step with nothing published (`releaseWorkflow.test.ts`, with the real step and a stubbed `npm`).
