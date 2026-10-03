import { useFocusEffect } from "@react-navigation/native"
import React from "react"

/**
 * How a card that reads on its own reaches Home: `report` puts its failure in
 * the page's DataNotice, and a change of `reloadKey` (DataNotice's retry, a
 * pull to refresh) reads it again. Outside a provider both are inert.
 */
export const HomeCardLoad = React.createContext<{
  reloadKey: number
  report: (card: string, error: string | null) => void
}>({ reloadKey: 0, report: () => {} })

/** Read on focus and on every reload; a failure is kept and reported, never swallowed. */
export function useCardLoad<T>(card: string, load: () => Promise<T>) {
  const { reloadKey, report } = React.useContext(HomeCardLoad)
  const [data, setData] = React.useState<T | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [tries, setTries] = React.useState(0)
  useFocusEffect(
    React.useCallback(() => {
      let alive = true
      load().then(
        (v) => {
          if (!alive) return
          setData(v)
          setError(null)
          report(card, null)
        },
        (e) => {
          if (!alive) return
          const message = (e as Error)?.message || "Couldn't load"
          setError(message)
          report(card, message)
        },
      )
      return () => {
        alive = false
      }
      // `load` is a fresh closure each render; the card, the key and a retry are what re-read.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [card, reloadKey, tries, report]),
  )
  return { data, error, retry: () => setTries((n) => n + 1) }
}
