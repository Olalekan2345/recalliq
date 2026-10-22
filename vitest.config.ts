import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;
const alias = {
  "@": path.resolve(root, "src"),
  // Next's `server-only` guard throws outside the react-server condition.
  "server-only": path.resolve(root, "tests/helpers/server-only-stub.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 60_000,
          hookTimeout: 60_000,
          setupFiles: ["tests/helpers/env.ts"],
          fileParallelism: false,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "live",
          include: ["tests/live/**/*.test.ts"],
          environment: "node",
          testTimeout: 120_000,
          setupFiles: ["tests/helpers/live-env.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
