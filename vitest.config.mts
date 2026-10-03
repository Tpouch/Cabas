import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: { "server-only": fileURLToPath(new URL("./tests/setup/empty.ts", import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/domain/**/*.test.ts", "src/lib/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/server/**/*.test.ts"],
          globalSetup: ["./tests/setup/integration-global.ts"],
          setupFiles: ["./tests/setup/integration.ts"],
          fileParallelism: false,
          hookTimeout: 120_000,
          testTimeout: 20_000,
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/components/**/*.test.tsx"],
          setupFiles: ["./tests/setup/components.ts"],
        },
      },
    ],
  },
});
