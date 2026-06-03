import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "server",
          environment: "node",
          include: ["packages/server/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "client",
          environment: "jsdom",
          include: ["packages/client/test/**/*.test.ts"],
        },
      },
    ],
  },
});
