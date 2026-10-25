import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts") } },
  test: { include: ["tests/integration/**/*.test.ts"], environment: "node", fileParallelism: false, testTimeout: 60_000, hookTimeout: 60_000 },
});
