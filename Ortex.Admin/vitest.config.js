// Standalone Vitest config — deliberately NOT the app's vite.config.js, so the
// React/Tailwind plugins never load for pure-function tests. Node environment:
// the analytics layer is pure and its import chain touches no browser global at
// module scope (localStorage/window are only used inside functions never called
// by tests).
import { defineConfig } from "vitest/config"

export default defineConfig({
  // The parity tests import the phone's own TypeScript (Ortex.Mobile/src/domain).
  // Its tsconfig extends expo/tsconfig.base, which exists only after npm ci in
  // Ortex.Mobile; CI's Admin jobs never install it. Type-only syntax needs no
  // tsconfig to strip, so none is looked up.
  oxc: { tsconfig: false },
  test: {
    environment: "node",
    // scripts/ is included as well as src/ so the backup retention logic is
    // covered: it is the only code here that deletes files unattended.
    include: ["src/**/*.test.js", "scripts/**/*.test.js"],
  },
})
