import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.jsx"
import { reloadForNewBuild } from "./lib/lazyWithRetry"

// Vite reports a chunk it could not preload (usually a stale build after a
// deploy). Reload once to pick up the current build; the guard in
// reloadForNewBuild() stops a loop.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewBuild()) event.preventDefault()
})

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
