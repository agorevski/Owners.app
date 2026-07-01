import { defineConfig } from "vitest/config";

// Root Vitest config: discovers *.test.ts across all workspaces.
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
  },
});
