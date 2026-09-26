import { useCallback, useEffect, useRef, useState } from "react"
import { listStations, showCode, watchStation } from "../services/attendanceQr"

/**
 * The live attendance code for one station (migration 0043), shared by the QR
 * page, its full-screen gate display and the Dashboard's gate card.
 *
 * Three things it has to get right:
 *   1. The code must always be the live one. It rotates on a timer (30s by
 *      default) AND the instant someone scans it, because the database burns a
 *      used code and issues the next in the same transaction. This re-asks on
 *      the server's own `secondsLeft`, never on a clock of its own, and again
 *      the moment realtime says the row changed.
 *   2. It must never leave a dead code up. A failed refresh turns the state to
 *      "stale" (the screens dim the code) and retries shortly.
 *   3. The token only ever arrives from attendance_qr_show(): the table has no
 *      select policy, so realtime carries the FACT of a change, never the code.
 *
 * `justScanned` is the last scan when it arrived while the screen was open, for
 * a few seconds, so the gate can say "you are in" to the person in front of it.
 */

const REFRESH_FLOOR_MS = 1500
const SCAN_FLASH_MS = 6000
const SITE_KEY = "ortex.attendance.qrSite"

const readSite = () => {
  try {
    return localStorage.getItem(SITE_KEY) || ""
  } catch {
    return ""
  }
}

export function useGateCode({ enabled = true } = {}) {
  const [stations, setStations] = useState([])
  const [siteId, setSiteId] = useState(readSite)
  const [code, setCode] = useState(null)
  const [state, setState] = useState("loading")
  const [error, setError] = useState("")
  const [missing, setMissing] = useState(false)
  // The server's own words behind a "not set up". See services/attendanceQr.js.
  const [detail, setDetail] = useState("")
  const [left, setLeft] = useState(0)
  const [justScanned, setJustScanned] = useState(null)
  const timer = useRef(null)
  const lastScanAt = useRef(undefined)

  // ---- stations ---------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    void listStations().then((r) => {
      if (!alive) return
      if (r.missing) {
        setMissing(true)
        setDetail(r.detail || "")
      } else if (r.error) setError(r.error)
      setStations(r.rows || [])
      setSiteId((cur) => cur || r.rows?.[0]?.id || "")
    })
    return () => {
      alive = false
    }
  }, [enabled])

  useEffect(() => {
    if (!siteId) return
    try {
      localStorage.setItem(SITE_KEY, siteId)
    } catch {
      // Private window: the picker simply forgets.
    }
  }, [siteId])

  // ---- the code ---------------------------------------------------------------
  const load = useCallback(async () => {
    const r = await showCode(siteId)
    if (r.missing) {
      setMissing(true)
      setDetail(r.detail || "")
      setState("error")
      return
    }
    if (r.error) {
      setError(r.error)
      // Keep the last code on screen but dimmed: see the header note.
      setState("stale")
      return
    }
    if (r.code?.status === "no_site") {
      setCode(null)
      setError(r.code.message)
      setState("error")
      return
    }
    setError("")
    setCode(r.code)
    setState("ok")
    setLeft(r.code.secondsLeft ?? 0)
  }, [siteId])

  // Re-ask when this code runs out, using the server's own countdown.
  useEffect(() => {
    clearTimeout(timer.current)
    if (state !== "ok" || !code) return undefined
    const ms = Math.max(REFRESH_FLOOR_MS, (code.secondsLeft ?? 0) * 1000)
    timer.current = setTimeout(() => void load(), ms)
    return () => clearTimeout(timer.current)
  }, [code, state, load])

  // A failed refresh should not abandon the screen; try again shortly.
  useEffect(() => {
    if (state !== "stale") return undefined
    const t = setTimeout(() => void load(), 4000)
    return () => clearTimeout(t)
  }, [state, load])

  useEffect(() => {
    if (!enabled || !siteId) return undefined
    setState("loading")
    lastScanAt.current = undefined
    void load()
    let debounce = null
    const off = watchStation(siteId, () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void load(), 150)
    })
    return () => {
      clearTimeout(debounce)
      off()
    }
  }, [enabled, siteId, load])

  // The visible countdown. Local, and only ever cosmetic: what actually decides
  // is the server, which is why a reaching-zero counter triggers nothing.
  useEffect(() => {
    if (!enabled) return undefined
    const t = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [enabled])

  // A scan that lands while the screen is up. The first code read only records
  // where we are, so opening the page never greets an old scan.
  useEffect(() => {
    const at = code?.lastScan?.at || null
    if (lastScanAt.current === undefined) {
      if (code) lastScanAt.current = at
      return undefined
    }
    if (!at || at === lastScanAt.current) return undefined
    lastScanAt.current = at
    setJustScanned(code.lastScan)
    const t = setTimeout(() => setJustScanned(null), SCAN_FLASH_MS)
    return () => clearTimeout(t)
  }, [code])

  const rotateSec = code?.rotateSec || 30
  return {
    stations,
    siteId,
    setSiteId,
    station: stations.find((s) => s.id === siteId) || null,
    code,
    state,
    error,
    missing,
    detail,
    left,
    rotateSec,
    pct: Math.max(0, Math.min(100, (left / rotateSec) * 100)),
    justScanned,
    reload: load,
  }
}
