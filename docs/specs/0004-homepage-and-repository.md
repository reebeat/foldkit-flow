# 0004 `@tsukuri/flow` says where it lives

Status: **plan** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-30. Decided by: the operator (decision log line 123, 2026-10-30: `tsukuri.dev` is registered; line 105 / flow-D1: `@tsukuri/flow` is to be published) and the lead's request of the same day: `homepage` and `repository` only; do not flip `private`.
Process: [spec 0000](0000-development-lifecycle.md).
Verify skill: none, package metadata only (this repository has no verify skill).

## Goal

`packages/flow/package.json` carries `"homepage": "https://tsukuri.dev"` and `"repository": { "type": "git", "url": "git+https://github.com/tsukuri-labs/foldkit-flow.git", "directory": "packages/flow" }`, so the first publish of `@tsukuri/flow` needs no manifest edit and npm checks the repository URL against the workflow's repository. `private` stays `true` and the version `0.0.0`: publishing is the operator's step. No `bugs` field, no change to the example app or the root manifest.

## Journey

```text
a maintainer
  1. jq '[.homepage,.repository]' packages/flow/package.json
  2. bun run ready            the metadata test passes with the others
```

## Falsifiers

| # | Falsifier | Gate | Fails when |
| --- | --- | --- | --- |
| F1 | the manifest names the product site and the repository directory | `tools/quality/test/packageMetadata.test.ts`, in `bun run ready` | a field is missing or another URL (control: `docs/specs/0004-evidence/control.txt`: without the fields the test fails with `SchemaError: Missing key`) |
| F2 | nothing else changes | `git diff --stat origin/main`: `packages/flow/package.json`, the test, this spec and its evidence | another file appears |
| F3 | the gates pass | `bun run ready` | any gate fails |

## Revisions

(none yet)
