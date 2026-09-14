// Server entry used only by scripts/prerender.mjs (built with `vite build --ssr`).
//
// Renders a route to static HTML so crawlers that do not run JavaScript (Bing,
// AI search, link previews) receive the real page: headings, copy, product
// names and internal links, not an empty <div id="root">. react-dom/static waits
// for every lazy page and Suspense boundary before it resolves, so the markup
// is complete. The browser then hydrates it (src/main.jsx).

import { StrictMode } from "react"
import { prerenderToNodeStream } from "react-dom/static"
import { StaticRouter } from "react-router-dom"
import { AppLayout } from "./App.jsx"

// Baked into /faq's static head under the id the page's useJsonLd() replaces.
export { FAQ_SCHEMA } from "./pages/FAQ.jsx"

export async function render(url, data) {
  globalThis.__ORTEX_DATA__ = data
  const { prelude } = await prerenderToNodeStream(
    <StrictMode>
      <StaticRouter location={url}>
        <AppLayout />
      </StaticRouter>
    </StrictMode>,
  )
  let html = ""
  for await (const chunk of prelude) html += chunk
  return html
}
