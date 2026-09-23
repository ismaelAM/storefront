import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "server-only": resolve(__dirname, "./node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.tsx"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
