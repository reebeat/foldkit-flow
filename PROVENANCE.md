# Provenance

The development lifecycle (spec 0000) is copied from [`reebeat/studio`](https://github.com/reebeat/studio) at commit `b26c1cc` (`main`, 2026-10-29, the squash of its spec 0000, whose tree equals the reviewed head `643096ea`; the source repository). studio copied it from [`reebeat/reebeat`](https://github.com/reebeat/reebeat) at `f7c348877585f54b6bf00651608726dd7e5044d3`, and most of reebeat's own files were adapted from [`phibkro/vektorprogrammet-reimagined`](https://github.com/phibkro/vektorprogrammet-reimagined) at `797e9e41d96194b9479ff224ac1c40bbc0545888` (the donor); the headers that name those sources were kept. Third-party licences stay with their code.

**Identical** means the file's git blob hash equals the source's, checked with `git hash-object <file>` against `git rev-parse b26c1cc:<file>` in a studio checkout (66 files).

| File | Source (studio `b26c1cc`) | Deviation |
| --- | --- | --- |
| `.vite-hooks/pre-commit`, `commit-msg`, `pre-push` | same paths | identical |
| `commitlint.config.ts`, `.jscpd.json`, `devenv.nix`, `devenv.yaml`, `devenv.lock`, `tsconfig.json`, `CLAUDE.md` | same paths | identical |
| `.agents/skills/review-pr/record-round.sh`, `merge.sh` | same paths | identical |
| `.agents/skills/review-pr/SKILL.md`, `.agents/skills/pr-create/SKILL.md` | same paths | a new provenance header and a description that names this repository; `pr-create` drops the sentence that points at reebeat's glossary |
| `tools/quality/*.ts`, `tools/quality/effect-exceptions.json`, `tools/quality/tsconfig.json`, `tools/quality/vite.config.ts`, `tools/quality/test/*` | same paths | identical (the registry is empty in both) |
| `tools/quality/publishedEffectRange.ts`, `test/publishedEffectRange.test.ts` | new | written here (spec 0000, "The published Effect range") |
| `tools/quality/package.json` | same path | name `@foldkit-flow/quality` |
| `tools/oxlint/anti-slop/**` | same path | identical; `UPSTREAM.txt` keeps the chain (dmmulroy/anti-slop `c44ef22`, mono-web `2aa6ce9`, the donor) |
| `vite.config.ts` | same path | Effect groups and Foldkit rule overrides name `apps/example` and `packages/flow` (library role `effect-library`, browser); the restricted source-import patterns name `@foldkit-flow/` and `packages` |
| `package.json` | same path | name, workspaces (`apps/*`, `packages/*`, `tools/*`) |
| `.gitleaks.toml` | same path | title |
| `knip.json` | same path | workspaces `apps/example`, `packages/flow`, `tools/quality` |
| `.github/workflows/checks.yml` | same path | header only |
| `apps/example/vite.config.ts`, `index.html`, `package.json`, `tsconfig.json`, `src/application.ts`, `entry.ts`, `vitestSetup.ts`, `styles.css`, `boot.test.ts` | `apps/editor/` of the same names | renamed (`editorApplication` to `exampleApplication`, title), a workspace dependency on `foldkit-flow`; `boot.test.ts` follows the new view |
| `apps/example/FOLDKIT.md` | `apps/editor/FOLDKIT.md` | identical (Foldkit owns it, replaced whole on upgrade) |
| `apps/example/src/main.ts`, `story.test.ts`, `scene.test.ts`, `testModels.ts` | `apps/editor/src/` of the same names | rewritten for the scaffold: a toggle for the xyflow attribution replaces the inspector toggle |
| `AGENTS.md`, `STATE.md`, `README.md`, `apps/example/AGENTS.md` | same paths | rewritten for this repository |
| `docs/specs/0000-development-lifecycle.md` | same path | rewritten: it records what is the same, what differs and why |

Not copied: `docs/design/lenses.md` and spec 0001 of studio (studio's own), and `bun.lock` (regenerated).

## Generated, not copied

`apps/example` descends from `create-foldkit-app` 0.40.0 (`--rendering spa --example counter --package-manager bun`) through studio's `apps/editor`. Foldkit is MIT licensed; `foldkit` and `@foldkit/*` are installed from npm, not vendored.

## Third-party code this repository depends on

`@xyflow/system` (MIT, Copyright (c) 2019-2025 webkid GmbH, <https://github.com/xyflow/xyflow>) is installed from npm when spec 0001 lands; it is credited in `README.md` and `NOTICE`.
