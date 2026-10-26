import { Component } from "react"
import { Button } from "../ui/Ui"
import { isChunkError, reloadForNewBuild } from "../../lib/lazyWithRetry"

/**
 * Catches a page that fails to load (a stale chunk after a deploy, a dropped
 * connection) or throws while rendering, so the person gets a way forward
 * instead of a blank console. AdminLayout keys it on the pathname, so going to
 * another page clears it; the sidebar and header stay usable throughout.
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
    if (isChunkError(error)) reloadForNewBuild()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <section role="alert" className="flex min-h-[50vh] items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <h1 className="text-title font-semibold text-foreground">This page didn't load</h1>
          <p className="mt-2 text-ui text-muted-foreground">
            Something interrupted it, usually a weak connection or a console update made while this tab was open.
            Reloading usually fixes it. Nothing you saved is lost.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button onClick={() => window.location.reload()}>Reload page</Button>
            <Button variant="outline" onClick={() => window.location.assign("/")}>Go to Dashboard</Button>
          </div>
        </div>
      </section>
    )
  }
}
