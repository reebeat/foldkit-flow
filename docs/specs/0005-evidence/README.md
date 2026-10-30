# Evidence for spec 0005

Measured on 2026-10-30 on the head of `feat/0005-npm-release`, with Node 24.21.0, npm 11.19.0, Bun 1.4.2, TypeScript 7.0.2 and `@changesets/cli` 3.0.3. **Nothing here touched the npm registry for a write**: every publish went to a local [Verdaccio](https://verdaccio.org/) 6.11.1 on `127.0.0.1:4873` with a throwaway user (a 116-character token in `NODE_AUTH_TOKEN`, never printed; `NPM_CONFIG_USERCONFIG` pointed at a file that holds `//127.0.0.1:4873/:_authToken=${NODE_AUTH_TOKEN}`). The registry had an uplink to `registry.npmjs.org` for reads, so a consumer project could install `foldkit`, `effect` and `vite`; `@tsukuri/*` had none. The raw output is copied from the terminal.

## 1. The tarball that would ship

`devenv shell -- bun run release:stage`, then, in a copy of `packages/flow/dist` outside the repository, `npm pack --dry-run --json`:

```text
@tsukuri/flow@0.0.0 files=9 size=24428 unpacked=99834
   1075 LICENSE
   1845 NOTICE
   2136 README.md
   2946 flow.css
  29640 index.d.mts
  60157 index.mjs
    973 package.json
    502 testing.d.mts
    560 testing.mjs
```

Nine files: the built library and its declarations, the stylesheet, the generated manifest, the MIT `LICENSE`, `NOTICE` and `README.md`. No source, no test, no map, no `.github`, no `tools`, no `LICENSES/Apache-2.0.txt`. The registry served the same nine files back (section 3).

## 2. A control the consumer check and the import check catch (`control-missing-peer.log`)

`foldkit` removed from `peerDependencies` of `packages/flow/package.json` (and restored afterwards), then `bun run release:stage`: exit 1, one finding per source file that imports `foldkit` (`src/view.ts imports foldkit, which is not in dependencies or peerDependencies`, and the built `index.mjs`). Without the peer the bundler also **inlined** Foldkit into `index.mjs` (275 kB against 60 kB), which is why the scratch consumer alone would not have caught it and `importFindings` reads the sources too (the lesson of pg-txmode spec 0006, Revisions 1 and its evidence M1). The scratch consumer has its own controls in `tools/release/test/consumer.test.ts`.

## 3. The `Publish` step against a registry (`registry-rehearsal.log`)

The real `Publish` step of `.github/workflows/release.yml` (its `run:` text read out of the file, `devenv` stubbed to `exec "$@"`), with the real `npm`, in a scratch tree that holds `packages/flow/dist` (the staged one, version set to `0.1.0-alpha.0`, then `0.1.0-alpha.1`) and `.changeset/pre.json` (`{ "mode": "pre", "tag": "alpha" }`):

| Step | What the log shows |
| --- | --- |
| 0 | `npm view @tsukuri/flow@0.1.0-alpha.0 version`: `E404`, exit 1 (the only answer that lets the step publish) |
| 1 | `is not on the registry: publishing`, `Publishing ... with tag alpha and public access`, `+ @tsukuri/flow@0.1.0-alpha.0`; dist-tags `{latest: 0.1.0-alpha.0, alpha: 0.1.0-alpha.0}` |
| 2 | the same step again: `0.1.0-alpha.0 is on the registry: skipped`, nothing published, exit 0 |
| 3 | `0.1.0-alpha.1`: published with `--tag alpha`; dist-tags `{latest: 0.1.0-alpha.0, alpha: 0.1.0-alpha.1}`: **`alpha` follows every release; `latest` stays on the first** (the registry set it on the first publish; nothing moves it. On Verdaccio. What real npm does on a first publish with `--tag alpha` was observed for `@pg-txmode/*` (pg-txmode spec 0006, Revisions, "the first publish is observed": `latest` is set); for a later publish with `--tag alpha` it was not observed on npm) |
| 4 | `npm pack @tsukuri/flow@0.1.0-alpha.1` from the registry: the same nine files, 24428 bytes, and the generated `package.json` |

## 4. A consumer project that installs the registry tarball (`consumer-install.log`)

A fresh project with `npm i @tsukuri/flow@alpha foldkit@0.170.0 effect@4.1.0 @effect/platform-browser@4.1.0 typescript@7.0.2 vite@7` (no peer conflict, no `ERESOLVE`): `tsc` of a file that imports `@tsukuri/flow`, `@tsukuri/flow/testing` and `@tsukuri/flow/flow.css` with `strict` and **without** `skipLibCheck`: exit 0; `vite build`: the stylesheet export reached the bundle (one `foldkit-flow` rule file) and the JavaScript bundled (439 modules); `node -e 'import("@tsukuri/flow")'` lists the 24 runtime exports. **One finding, not fixed here:** TypeScript 7 checks side-effect imports, so `import "@tsukuri/flow/flow.css"` fails with `TS2882` in a project that has no `*.css` declaration (Vite's `vite/client` types are one; the log's project has them). The README says so.

## 5. `changeset version` on this configuration

In a scratch directory outside the repository (a copy of the root `package.json`, `bun.lock`, `.changeset/config.json`, `.changeset/pre.json` and `packages/flow/package.json`, plus one changeset file `"@tsukuri/flow": minor`), `changeset version` printed the pre-release notice and wrote `"version": "0.1.0-alpha.0"` and a `packages/flow/CHANGELOG.md` (`## 0.1.0-alpha.0`, `### Minor Changes`, `- The first alpha.`); `.changeset/pre.json` stayed `{ "mode": "pre", "tag": "alpha" }`. Without `bun.lock` in the scratch directory the tool did not find the workspace package (`"@tsukuri/flow" does not match any package`): the workspace discovery needs the lock file, which the repository has. This is the next PR's command; nothing was versioned in the repository.
