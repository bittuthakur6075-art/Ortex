import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Standalone admin app. Runs independently of the marketing site (its own
// origin/dev server). `base: "./"` keeps built asset paths relative so the
// dist/ can be dropped under any sub-path (e.g. /admin) when co-hosted.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    // "@/…" resolves to src/ (mirrored in jsconfig.json for editor intellisense).
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5180,
  },
})
