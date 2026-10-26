import { useEffect, useRef } from "react"

// While `when` is true, leaving the page asks first: closing or reloading the
// tab (beforeunload) and clicking any in-app link, the sidebar included. The
// console runs on a plain BrowserRouter, which has no navigation blocker, so
// link clicks are caught in the capture phase before the router sees them.
// Browser Back is not caught: an in-page editor keeps the URL of its list.
export default function useLeaveGuard(when, message = "Leave without saving? Your changes will be lost.") {
  const active = useRef(when)
  active.current = when

  useEffect(() => {
    const onUnload = (e) => {
      if (!active.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    const onClick = (e) => {
      if (!active.current || e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return // a new tab leaves nothing behind
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      if (!window.confirm(message)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener("beforeunload", onUnload)
    document.addEventListener("click", onClick, true)
    return () => {
      window.removeEventListener("beforeunload", onUnload)
      document.removeEventListener("click", onClick, true)
    }
  }, [message])
}
