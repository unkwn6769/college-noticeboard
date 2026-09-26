import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Mirrors the "@/*" -> "./*" path mapping from tsconfig.json so tests can
  // import application modules through the same specifiers the app uses.
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: { environment: "node", globals: false, exclude: ["node_modules/**", ".next/**", "legacy-ui-reference/**"] },
});
