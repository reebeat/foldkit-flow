# 0008: Token-free trusted publishing

Status: plan (frozen at PR open). Date: 2026-10-30.

## Journey

After a version PR merges and checks pass, the operator dispatches Release and approves the `npm-release` environment. npm exchanges GitHub OIDC identity for publishing authority and records provenance. Check mode remains a token-free package dry run; it does not prove authentication. The operator watches the first actual publish after this change.

## Constraints

Spec 0005's removal checklist is amended: trusted publishing has already succeeded in run 41088987019, so keep the useful token-free dry run rather than deleting check mode. Remove the environment token, npmrc and secretspec; never read npm tokens in workflows. Preserve publish's `id-token: write`, provenance, environment approval, hold, main and checks gates, and E404-only publication. No dispatch, publish, credential deletion or revocation is performed by this change.

## Falsifiers

- Any workflow reads an npm token or configures token authentication; controls inject token references and npm auth configuration.
- Publish lacks `id-token: write`, provenance or `npm-release`; controls remove each requirement.
- Check can publish or publish escapes its hold, main, checks, or E404-only guards; existing release tests remain.
- The first token-free publish fails: only a real subsequent publish can establish this, so it must be watched.

## Revisions

- 2026-10-30: plan written; retained token-free check mode under the operator's revised checklist.
- 2026-10-30, review round 1: check mode also retains the npm-release approval deliberately; the dry run and registry reads run only after the same environment gate. Reject all stored secret references except GitHub’s built-in token, and npm auth/password configuration, including renamed tokens.
