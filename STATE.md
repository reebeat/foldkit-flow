# State

Lifecycle: build

## Now

@tsukuri/flow 0.1.0-alpha.1 was published with trusted publishing (run 41088987019). Spec 0008 removes the fallback npm token; the publish environment approval remains.

## Next

- After merge, the operator deletes the npm-release environment secret and revokes the old token, then watches the next real publish (spec 0008).
- Pick the next journey: keyboard connect, node resizing, or an ELK.js example.
- Add the browser journey gate to CI once Chromium is available.
- Offer the library to Foldkit as @foldkit/flow when its API has settled.

## Blocked

- Nothing.
