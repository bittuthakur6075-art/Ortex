// Server entry used only by scripts/prerender.mjs (built with `vite build --ssr`).
//
// Renders a route to static HTML so crawlers that do not run JavaScript (Bing,
// AI search, link previews) receive the real page: headings, copy, product
// names and internal links, not an empty <div id="root">. react-dom/static waits
// for every lazy page and Suspense boundary before it resolves. The browser
// then hydrates it (src/main.jsx).
//
// progressiveChunkSize: Infinity is load-bearing. React 19.2 "outlines" any
// Suspense boundary whose content is large, even a finished one: it writes the
// fallback where the boundary sits and the real content at the end of the
// document in a <div hidden>, moved into place by an inline script. For us that
// boundary is <main>, so every page painted as a spinner with the footer under
// it, then jumped (CLS ~0.45 on desktop), LCP waited on the script, and any
// crawler that does not run JavaScript read the whole page inside a hidden div.
// A static page has nothing to gain from streaming, so never outline.

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
    { progressiveChunkSize: Infinity },
  )
  let html = ""
  for await (const chunk of prelude) html += chunk
  // A boundary written out of order ("<!--$?-->") would put the page back in
  // a hidden div after the footer: fail the build rather than ship it.
  if (html.includes("<!--$?-->")) throw new Error(`prerender: ${url} rendered a suspended boundary`)
  return html
}
