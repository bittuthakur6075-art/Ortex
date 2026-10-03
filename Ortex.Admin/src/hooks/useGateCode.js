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
 * `live: false` reads only the stations (attendance_qr_sites, read-only) and
 * never calls attendance_qr_show(), which rotates the token and records who
 * viewed it: the Dashboard card starts the code only when someone asks.
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

export function useGateCode({ enabled = true, live = true } = {}) {
  const [stations, setStations] = useState([])
  const [siteId, setSiteId] = useState(readSite)
  const [code, setCode] = useState(null)
  const [state, setState] = useState("loading")
  const [error, setError] = useState("")
  // The browser's own words behind `error` (a dropped connection), for a tooltip only.
  const [errorDetail, setErrorDetail] = useState("")
  const [missing, setMissing] = useState(false)
  // The server's own words behind a "not set up". See services/attendanceQr.js.
  const [detail, setDetail] = useState("")
  const [left, setLeft] = useState(0)
  const [justScanned, setJustScanned] = useState(null)
  const timer = useRef(null)
  const flash = useRef(null)
  const lastScanAt = useRef(undefined)
  const alive = useRef(true)

  // ---- stations ---------------------------------------------------------------
  // A station remembered in this browser that is no longer in the list (removed,
  // switched off) falls back to the first one. Returns the id it settled on.
  const readStations = useCallback(async (current) => {
    const r = await listStations()
    if (!alive.current) return current
    if (r.missing) {
      setMissing(true)
      setDetail(r.detail || "")
    } else if (r.error) {
      setError(r.error)
      setErrorDetail(r.errorDetail || "")
      return current
    }
    const rows = r.rows || []
    setStations(rows)
    const next = rows.some((x) => x.id === current) ? current : rows[0]?.id || ""
    setSiteId(next)
    return next
  }, [])

  useEffect(() => {
    alive.current = true
    if (enabled) void readStations(readSite())
    return () => {
      alive.current = false
      clearTimeout(flash.current)
    }
  }, [enabled, readStations])

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
      setErrorDetail(r.errorDetail || "")
      // Keep the last code on screen but dimmed: see the header note.
      setState("stale")
      return
    }
    if (r.code?.status === "no_site") {
      // The station went away under us: read the list again and move to one
      // that exists (the siteId change reloads the code). Only when there is no
      // other station does it stay an error.
      const next = await readStations(siteId)
      if (next && next !== siteId) return
      setCode(null)
      setError(r.code.message)
      setState("error")
      return
    }
    setError("")
    setErrorDetail("")
    setCode(r.code)
    setState("ok")
    setLeft(r.code.secondsLeft ?? 0)
  }, [siteId, readStations])

  // Re-ask when this code runs out, using the server's own countdown.
  useEffect(() => {
    clearTimeout(timer.current)
    if (!live || state !== "ok" || !code) return undefined
    const ms = Math.max(REFRESH_FLOOR_MS, (code.secondsLeft ?? 0) * 1000)
    timer.current = setTimeout(() => void load(), ms)
    return () => clearTimeout(timer.current)
  }, [live, code, state, load])

  // A failed refresh should not abandon the screen; try again shortly.
  useEffect(() => {
    if (!live || state !== "stale") return undefined
    const t = setTimeout(() => void load(), 4000)
    return () => clearTimeout(t)
  }, [live, state, load])

  useEffect(() => {
    if (!enabled || !live || !siteId) return undefined
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
  }, [enabled, live, siteId, load])

  // The visible countdown. Local, and only ever cosmetic: what actually decides
  // is the server, which is why a reaching-zero counter triggers nothing.
  useEffect(() => {
    if (!enabled || !live) return undefined
    const t = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [enabled, live])

  // A scan that lands while the screen is up. The first code read only records
  // where we are, so opening the page never greets an old scan. The 6s clear
  // lives in a ref keyed on the scan, NOT in this effect's cleanup: the code
  // refetches right after a scan, and a cleanup here cancelled the clear and
  // left "Welcome" on screen.
  const scanAt = code?.lastScan?.at || null
  useEffect(() => {
    if (lastScanAt.current === undefined) {
      if (code) lastScanAt.current = scanAt
      return
    }
    if (!scanAt || scanAt === lastScanAt.current) return
    lastScanAt.current = scanAt
    setJustScanned(code.lastScan)
    clearTimeout(flash.current)
    flash.current = setTimeout(() => setJustScanned(null), SCAN_FLASH_MS)
  }, [scanAt, code])

  const rotateSec = code?.rotateSec || 30
  return {
    stations,
    siteId,
    setSiteId,
    station: stations.find((s) => s.id === siteId) || null,
    code,
    state,
    error,
    errorDetail,
    missing,
    detail,
    left,
    rotateSec,
    pct: Math.max(0, Math.min(100, (left / rotateSec) * 100)),
    justScanned,
    reload: load,
  }
}
