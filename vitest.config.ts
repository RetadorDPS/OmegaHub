import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    globals: true,
    coverage: { reporter: ["text", "html"], include: ["src/lib/**"] },
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      // Los tests no son server components: server-only
      // se convierte en un módulo vacío.
      "server-only": path.resolve(process.cwd(), "src/test-stubs/server-only.ts"),
    },
  },
});
