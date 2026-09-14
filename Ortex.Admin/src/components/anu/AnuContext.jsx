import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useProfile } from "../../hooks/useProfile"
import { useAnuSession } from "./useAnuSession"

// One Anu for the whole console. AdminLayout owns the controller, so the
// conversation outlives every route change, and anything in the shell can open
// the panel or ask her a question (header button, Ctrl/⌘ J, Dashboard).

const AnuContext = createContext(null)

const PANEL_KEY = "ortex.admin.anu.open"

export function useAnuController() {
  const profile = useProfile()
  const navigate = useNavigate()
  const session = useAnuSession({ profile, navigate })
  const [open, setOpenState] = useState(() => {
    try { return localStorage.getItem(PANEL_KEY) === "1" } catch { return false }
  })

  const setOpen = useCallback((next) => {
    setOpenState((prev) => {
      const value = typeof next === "function" ? next(prev) : next
      try { localStorage.setItem(PANEL_KEY, value ? "1" : "0") } catch { /* convenience only */ }
      return value
    })
  }, [])

  const toggle = useCallback(() => setOpen((o) => !o), [setOpen])

  /** Open the panel and put a question to Anu, starting the conversation if needed. */
  const ask = useCallback((question) => {
    setOpen(true)
    session.start(question)
  }, [session, setOpen])

  // Ctrl/⌘ J opens and closes Anu from anywhere, as Ctrl/⌘ K opens search.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "j") {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggle])

  return useMemo(() => ({ open, setOpen, toggle, ask, session, profile }), [open, setOpen, toggle, ask, session, profile])
}

export function AnuProvider({ value, children }) {
  return <AnuContext.Provider value={value}>{children}</AnuContext.Provider>
}

/** The console's Anu: `{ open, setOpen, toggle, ask, session, profile }`. Null outside the shell. */
export function useAnu() {
  return useContext(AnuContext)
}
