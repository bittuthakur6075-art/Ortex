import { Component } from "react"
import { isChunkError, reloadForNewBuild } from "../../lib/lazyWithRetry"

/**
 * Catches a page that fails to load (a stale chunk after a deploy, a dropped
 * connection) or throws while rendering, so the visitor gets a way forward
 * instead of a blank page or a spinner that never stops. App.jsx keys it on
 * the pathname, so going to another page clears it. Renders nothing of its
 * own until something fails, so the prerendered markup is unchanged.
 */
export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error("Page failed to load:", error)
    // A stale chunk that slipped past lazyWithRetry: one guarded reload.
    if (!this.props.silent && isChunkError(error)) reloadForNewBuild()
  }

  render() {
    if (!this.state.error) return this.props.children
    // `silent` guards optional extras (the voice widget, the cookie banner):
    // if one fails, the page simply goes on without it.
    if (this.props.silent) return null
    return (
      <section className="min-h-[60vh] flex items-center justify-center px-4 py-24" role="alert">
        <div className="max-w-md text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">This page didn't load</h1>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Something interrupted it, often a weak connection or a site update made while the page was open.
            Reloading usually fixes it.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
            >
              Reload page
            </button>
            <a
              href="/"
              className="px-5 py-2.5 border border-border text-foreground rounded-lg font-semibold hover:bg-muted transition-colors"
            >
              Go to home
            </a>
          </div>
        </div>
      </section>
    )
  }
}
