import { defineConfig } from "vitest/config";

// Root Vitest config: discovers *.test.ts across all workspaces.
export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
    ],
    environment: "node",
  },
});
