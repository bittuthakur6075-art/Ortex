import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendor libs into separate, independently-cacheable chunks
        // so the main app chunk shrinks and vendor code isn't re-downloaded on
        // every app deploy.
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          if (id.includes("framer-motion")) return "framer-motion"
          if (id.includes("@supabase")) return "supabase"
          if (id.includes("react-router")) return "router"
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react"
        },
      },
    },
  },
})

