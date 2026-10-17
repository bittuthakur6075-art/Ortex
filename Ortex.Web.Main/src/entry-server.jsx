// Server entry used only by scripts/prerender.mjs (built with `vite build --ssr`).
//
// Renders a route to static HTML so crawlers that do not run JavaScript and
// link previews receive the real page. react-dom/static waits for every lazy
// page and Suspense boundary before it resolves; the browser then hydrates it
// (src/main.jsx).
//
// progressiveChunkSize: Infinity is load-bearing (see Ortex.Web/CLAUDE.md):
// without it React 19.2 "outlines" the large Suspense boundary around <main>,
// writing a spinner in its place and the page in a hidden div after the footer.

import { StrictMode } from "react"
import { prerenderToNodeStream } from "react-dom/static"
import { StaticRouter } from "react-router-dom"
import { AppLayout } from "./App.jsx"

export async function render(url) {
  const { prelude } = await prerenderToNodeStream(
    <StrictMode>
      <StaticRouter location={url}>
        <AppLayout />
      </StaticRouter>
    </StrictMode>,
    { progressiveChunkSize: Infinity },
  )
  let html = ""
  for await (const chunk of prelude) html += chunk
  if (html.includes("<!--$?-->")) throw new Error(`prerender: ${url} rendered a suspended boundary`)
  return html
}
