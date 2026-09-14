import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import 'lenis/dist/lenis.css'
import './index.css'
import App from './App.jsx'

const root = document.getElementById('root')
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// A prerendered page (scripts/prerender.mjs) already carries the markup, so
// hydrate it in place. Hydrate only when that markup is for THIS address:
// 404.html is served for every unknown URL (including a product added in the
// console since the last build), and hydrating its not-found markup as some
// other route is a guaranteed mismatch. Those, and the dev server, render fresh.
const path = window.location.pathname.replace(/\/+$/, "") || "/"
if (root.hasChildNodes() && root.dataset.route === path) {
  hydrateRoot(root, app)
} else {
  root.replaceChildren()
  createRoot(root).render(app)
}
