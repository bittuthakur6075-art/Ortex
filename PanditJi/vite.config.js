import { existsSync } from "node:fs"
import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// In dev, serve /api/<name> from api/<name>.js, the same Web-standard handlers
// Vercel runs in production, so the Gemini key stays on the server in both.
function devApi() {
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const name = req.url?.match(/^\/api\/([a-z-]+)(?:\?|$)/)?.[1]
        if (!name) return next()
        if (!existsSync(`api/${name}.js`)) {
          res.statusCode = 404
          return res.end()
        }
        try {
          // Re-read .env on every call, so a key saved while the server runs works at once.
          Object.assign(process.env, loadEnv(server.config.mode, server.config.envDir || process.cwd(), ""))
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          const handler = mod[req.method]
          if (!handler) {
            res.statusCode = 405
            return res.end()
          }
          const chunks = []
          for await (const c of req) chunks.push(c)
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v)
          const response = await handler(new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          }))
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          if (response.body) for await (const part of response.body) res.write(part)
          res.end()
        } catch (err) {
          server.config.logger.error(String(err?.stack || err))
          res.statusCode = 500
          res.end("Server error")
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Server-only variables (GEMINI_API_KEY) for the dev API. Only VITE_* ever
  // reaches the browser bundle.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""))
  return { plugins: [react(), tailwindcss(), devApi()] }
})
