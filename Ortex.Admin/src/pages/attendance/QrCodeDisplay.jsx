import { useCallback, useEffect, useRef, useState } from "react"
import { Button, Card, CardHeader, Banner, Select, Field, EmptyState, Spinner } from "../../components/ui/Ui"
import { QrCode, Maximize, RefreshCw } from "../../components/ui/Icons"
import { showCode, listStations, watchStation } from "../../services/attendanceQr"

/**
 * The screen staff scan to mark attendance (migration 0043).
 *
 * This page is a DISPLAY, meant to be left open on a monitor or tablet at the
 * gate. Three things it has to get right:
 *
 *   1. The code on screen must always be the live one. It rotates on a timer
 *      (30s by default) AND the instant someone scans it, because the database
 *      burns a used code and issues the next in the same transaction. The page
 *      re-asks on the server's own `secondsLeft`, never on a clock of its own,
 *      and re-asks again the moment realtime says the row changed.
 *   2. It must be readable across a room. Hence the full-screen mode and a QR
 *      drawn at the largest square that fits, with a high error-correction
 *      level so a phone reads it at an angle.
 *   3. It must never leave a dead code up. If a refresh fails, the code is
 *      dimmed and the page says so, rather than showing something that will be
 *      refused at the gate.
 *
 * The token itself only ever arrives from attendance_qr_show(), which is the
 * only door: the attendance_qr table has no select policy, so even an admin
 * without the `attendance-qr` grant cannot read tomorrow's code out of it.
 */

const REFRESH_FLOOR_MS = 1500

export default function QrCodeDisplay() {
  const [stations, setStations] = useState([])
  const [siteId, setSiteId] = useState(() => localStorage.getItem("ortex.attendance.qrSite") || "")
  const [code, setCode] = useState(null)
  const [state, setState] = useState("loading")
  const [error, setError] = useState("")
  const [missing, setMissing] = useState(false)
  // The server's own words behind a "not set up". See services/attendanceQr.js.
  const [detail, setDetail] = useState("")
  const [left, setLeft] = useState(0)
  const [full, setFull] = useState(false)
  const timer = useRef(null)

  // ---- stations -----------------------------------------------------------------
  useEffect(() => {
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
  }, [])

  useEffect(() => {
    if (siteId) localStorage.setItem("ortex.attendance.qrSite", siteId)
  }, [siteId])

  // ---- the code -----------------------------------------------------------------
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
    if (!siteId) return undefined
    setState("loading")
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
  }, [siteId, load])

  // The visible countdown. Local, and only ever cosmetic: what actually decides
  // is the server, which is why a reaching-zero counter triggers nothing.
  useEffect(() => {
    const t = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [])

  const rotateSec = code?.rotateSec || 30
  const pct = Math.max(0, Math.min(100, (left / rotateSec) * 100))

  if (missing) {
    return (
      <div className="p-6">
        <Banner tone="warning">
          Attendance codes are not set up on this database yet. Push the attendance migrations to this project and
          reload. If the server&apos;s words below name a FUNCTION rather than a table, the migrations are already
          there and one of them needs replacing, which takes a NEW migration file: db push skips one it has already
          recorded, so editing an applied migration in place changes nothing.
          {detail ? <span className="mt-1 block text-xs opacity-80">Server said: {detail}</span> : null}
        </Banner>
      </div>
    )
  }

  const body = (
    <div className="flex flex-col items-center gap-4">
      <QrImage payload={code?.payload} dim={state !== "ok"} size={full ? 520 : 300} />
      <div className="w-full max-w-[420px]">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {state === "stale"
            ? "Could not refresh the code. Trying again."
            : left > 0
              ? `New code in ${left}s`
              : "Getting a new code"}
        </p>
      </div>
      <LastScan scan={code?.lastScan} />
    </div>
  )

  if (full) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-card p-8">
        <h2 className="text-2xl font-semibold">{code?.siteName || "Attendance"}</h2>
        {body}
        <Button variant="outline" onClick={() => setFull(false)}>
          Exit full screen
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-4 p-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader
          title={code?.siteName ? `Scan to mark attendance · ${code.siteName}` : "Scan to mark attendance"}
          description="Leave this open on the screen at the gate. The code changes every few seconds, and again the moment someone scans it."
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" icon onClick={() => void load()} aria-label="New code now">
                <RefreshCw className="size-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setFull(true)}>
                <Maximize className="size-4" /> Full screen
              </Button>
            </div>
          }
        />
        <div className="p-6">
          {state === "loading" && !code ? (
            <div className="flex h-[360px] items-center justify-center">
              <Spinner />
            </div>
          ) : error && !code ? (
            <EmptyState icon={QrCode} title="No code to show" description={error} />
          ) : (
            body
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Station" description="Which screen this is." />
        <div className="space-y-4 p-6">
          {stations.length > 1 ? (
            <Field label="Showing the code for">
              <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="text-sm text-muted-foreground">
              {stations[0]?.name || "No station has been added yet."}
            </p>
          )}
          <p className="text-sm text-subtle-foreground">
            A code is good for {rotateSec} seconds, and for one scan. Photographing this screen is pointless: the
            code in the photo is dead before it can be sent.
          </p>
          {error && code ? <Banner tone="warning">{error}</Banner> : null}
        </div>
      </Card>
    </div>
  )
}

function LastScan({ scan }) {
  if (!scan) return <p className="text-sm text-subtle-foreground">No one has scanned yet.</p>
  const at = new Date(scan.at)
  const time = Number.isNaN(at.getTime())
    ? ""
    : at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })
  return (
    <p className="text-sm text-muted-foreground">
      Last scan: <span className="font-medium text-foreground">{scan.name}</span>
      {scan.kind === "out" ? " clocked out" : " clocked in"}
      {time ? ` at ${time}` : ""}
    </p>
  )
}

/**
 * The code itself. `qrcode` is imported dynamically for the reason ProductImport
 * imports xlsx that way: it is dead weight in the main bundle for every page
 * that is not this one.
 */
function QrImage({ payload, dim, size }) {
  const [src, setSrc] = useState("")
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    if (!payload) {
      setSrc("")
      return undefined
    }
    void (async () => {
      try {
        const QRCode = (await import("qrcode")).default
        // H: the highest error correction, so a phone still reads it at an
        // angle, across a room, or with a fingerprint on the screen.
        const url = await QRCode.toDataURL(payload, {
          errorCorrectionLevel: "H",
          margin: 1,
          width: size * 2,
          color: { dark: "#000000", light: "#FFFFFF" },
        })
        if (alive) {
          setSrc(url)
          setFailed(false)
        }
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [payload, size])

  if (failed) {
    return (
      <Banner tone="danger">
        The QR library could not be loaded. Run npm install in Ortex.Admin and reload.
      </Banner>
    )
  }

  return (
    <div
      className="rounded-card bg-white p-4 transition-opacity duration-300"
      style={{ opacity: dim ? 0.35 : 1 }}
      aria-label="Attendance QR code"
    >
      {src ? (
        <img src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
      ) : (
        <div style={{ width: size, height: size }} className="flex items-center justify-center">
          <Spinner />
        </div>
      )}
    </div>
  )
}
