import AsyncStorage from "@react-native-async-storage/async-storage"
import React from "react"
import { useColorScheme } from "react-native"

import { darkTheme, lightTheme, type Colors, type Theme } from "@/theme/theme"

// Colours are the only part of the design system that depends on state, so they
// are the only part behind a hook: `useTheme()` hands back the live palette.
// Geometry, rhythm and motion are static and are imported straight from
// `@/theme/tokens`, which keeps them out of every render.
//
// The provider holds nothing but the preference, so a screen re-render is never
// triggered by unrelated app state.

export type ThemePref = "system" | "light" | "dark"

const STORAGE_KEY = "@ortex/theme"

type ThemeContextValue = {
  theme: Theme
  pref: ThemePref
  setPref: (pref: ThemePref) => void
  ready: boolean
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme()
  const [pref, setPrefState] = React.useState<ThemePref>("system")
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (alive && (saved === "light" || saved === "dark" || saved === "system")) setPrefState(saved)
      })
      // A failed read just means the default: never block the app on storage.
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const setPref = React.useCallback((next: ThemePref) => {
    setPrefState(next)
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {})
  }, [])

  const value = React.useMemo<ThemeContextValue>(() => {
    const isDark = pref === "system" ? scheme === "dark" : pref === "dark"
    return { theme: isDark ? darkTheme : lightTheme, pref, setPref, ready }
  }, [pref, scheme, setPref, ready])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemePref() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error("useThemePref must be used inside <ThemeProvider>")
  return ctx
}

/** The live palette. Geometry comes from `@/theme/tokens`, not from here. */
export function useTheme(): Colors {
  return useThemePref().theme.colors
}

/** True when the dark palette is active — for the status bar and blur tint. */
export function useIsDark(): boolean {
  return useThemePref().theme.dark
}
