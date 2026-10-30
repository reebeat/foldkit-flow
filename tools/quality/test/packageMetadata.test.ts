// The metadata that a published `@tsukuri/flow` carries about where it lives (spec 0004). The package is private until the
// operator publishes it; its manifest already says where the code and the product are, so the first publish needs no edit.
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Path, Schema } from "effect";

const Manifest = Schema.fromJsonString(
  Schema.Struct({
    homepage: Schema.String,
    name: Schema.String,
    repository: Schema.Struct({
      directory: Schema.String,
      type: Schema.String,
      url: Schema.String,
    }),
  })
);

describe("packages/flow metadata", () => {
  it.effect("names the product site and the directory of its repository", () =>
    Effect.gen(function* metadata() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const top = yield* path.fromFileUrl(new URL("../../..", import.meta.url));

      const manifest = yield* Schema.decodeEffect(Manifest)(
        yield* fs.readFileString(
          path.join(top, "packages", "flow", "package.json")
        )
      );

      assert.strictEqual(manifest.name, "@tsukuri/flow");
      assert.strictEqual(manifest.homepage, "https://tsukuri.dev");
      assert.deepStrictEqual(manifest.repository, {
        directory: "packages/flow",
        type: "git",
        url: "git+https://github.com/tsukuri-labs/foldkit-flow.git",
      });
    }).pipe(Effect.provide(NodeServices.layer))
  );
});
