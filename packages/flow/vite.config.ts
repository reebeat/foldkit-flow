import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.ts"],
    server: { deps: { inline: ["foldkit"] } },
    setupFiles: ["./src/vitestSetup.ts"],
  },
});
