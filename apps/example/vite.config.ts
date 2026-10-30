// Copied from tsukuri-labs/studio @ b26c1cc (main; apps/editor/vite.config.ts), which generated it
// with `create-foldkit-app` 0.40.0 (counter example) and moved it onto Vite+: `defineConfig` comes from `vite-plus` and
// the Vitest options live in the `test` block (Vite+ bundles Vitest).
// Deviation: `@foldkit/vite-plugin` 0.29.0 is on (Model preservation across reloads, dev tools); studio's copy leaves it
// off while 0.28.0 pins effect 4.0.0 (spec 0002 here, Revisions).
import { foldkit } from "@foldkit/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  optimizeDeps: { entries: ["src/entry.ts"] },
  plugins: [foldkit(), tailwindcss()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.ts"],
    server: { deps: { inline: ["foldkit", "@foldkit/ui"] } },
    setupFiles: ["./src/vitestSetup.ts"],
  },
});
