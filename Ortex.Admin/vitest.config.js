// Standalone Vitest config — deliberately NOT the app's vite.config.js, so the
// React/Tailwind plugins never load for pure-function tests. Node environment:
// the analytics layer is pure and its import chain touches no browser global at
// module scope (localStorage/window are only used inside functions never called
// by tests).
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
  },
})
