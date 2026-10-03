import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Badge, Banner, Button, Card, CardHeader, EmptyState, Select, Field, Spinner } from "../../components/ui/Ui"
import { AlertTriangle, CheckCircle2, Maximize, QrCode, RefreshCw, ShieldCheck } from "../../components/ui/Icons"
import { useGateCode } from "../../hooks/useGateCode"
import { listPunches, todayIST } from "../../services/attendance"
import { listProfiles } from "../../services/users"
import { repo } from "../../data/store/repository"
import { loadExpectations } from "../../services/dashboard"
import { cn } from "../../lib/cn"
import { initials } from "../../lib/format"
import { Countdown, QrImage, scanTime } from "./gate"

/**
 * The screen staff scan to mark attendance (migration 0043). A DISPLAY, meant
 * to be left open on a monitor or tablet at the gate: the code logic (always
 * the live code, never a dead one left up) is useGateCode's.
 *
 * Full screen is a navy kiosk so the white code is the brightest thing on the
 * wall, with the time, three steps and who has just come in. `?full=1` opens
 * straight into it (the Dashboard's gate card links there).
 */

export default function QrCodeDisplay() {
  const [params, setParams] = useSearchParams()
  const gate = useGateCode()
  const [full, setFull] = useState(params.get("full") === "1")

  const enter = useCallback(() => {
    setFull(true)
    // The browser's own full screen when it allows it; the overlay works without.
    document.documentElement.requestFullscreen?.().catch(() => {})
  }, [])
  const leave = useCallback(() => {
    setFull(false)
    if (params.get("full")) {
      params.delete("full")
      setParams(params, { replace: true })
    }
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }, [params, setParams])

  // Esc leaves; so does the browser leaving its own full screen.
  useEffect(() => {
    if (!full) return undefined
    const onKey = (e) => e.key === "Escape" && leave()
    const onFs = () => !document.fullscreenElement && leave()
    window.addEventListener("keydown", onKey)
    document.addEventListener("fullscreenchange", onFs)
    return () => {
      window.removeEventListener("keydown", onKey)
      document.removeEventListener("fullscreenchange", onFs)
    }
  }, [full, leave])

  if (gate.missing) {
    return (
      <div>
        <Banner tone="warning">
          Attendance codes are not set up on this database yet. Push the attendance migrations to this project and reload. If the server&apos;s words below name a FUNCTION rather
          than a table, the migrations are already there and one of them needs replacing, which takes a NEW migration file: db push skips one it has already recorded, so
          editing an applied migration in place changes nothing.
          {gate.detail ? <span className="mt-1 block text-xs opacity-80">Server said: {gate.detail}</span> : null}
        </Banner>
      </div>
    )
  }

  if (full) return <GateDisplay gate={gate} onExit={leave} />

  return <GateTab gate={gate} onFull={enter} />
}

// ---- the tab --------------------------------------------------------------------

/** The code as a tab: the code and its countdown on the left, the station and today at the gate on the right. */
function GateTab({ gate, onFull }) {
  const scans = useScansToday(gate.siteId, gate.code?.lastScan?.at)
  const live = gate.state === "ok"
  const stale = gate.state === "stale" || gate.state === "error"
  const station = gate.code?.siteName || gate.station?.name || gate.stations[0]?.name

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="overflow-hidden">
        <CardHeader
          title="Gate code"
          description={station ? `Showing at ${station}` : "No station has been added yet"}
          action={
            <>
              <LiveChip stale={stale} />
              <Button size="sm" variant="outline" icon onClick={() => void gate.reload()} aria-label="New code now" title="New code now">
                <RefreshCw className="size-4" />
              </Button>
              <Button size="sm" onClick={onFull}>
                <Maximize className="size-4" /> Full screen
              </Button>
            </>
          }
        />
        <div className="flex flex-col items-center gap-4 bg-subtle px-5 py-8">
          {gate.state === "loading" && !gate.code ? (
            <div className="grid h-[292px] place-items-center">
              <Spinner />
            </div>
          ) : gate.error && !gate.code ? (
            <EmptyState icon={QrCode} title="No code to show" description={<span title={gate.errorDetail || undefined}>{gate.error}</span>} />
          ) : (
            <>
              <div className={cn("squircle rounded-card bg-card p-4 ring-1 transition-shadow", gate.justScanned ? "ring-4 ring-success" : stale ? "ring-2 ring-warning" : "ring-border")}>
                <QrImage payload={gate.code?.payload} size={260} dim={!live} />
              </div>
              <div className="w-[292px] space-y-2">
                <Countdown left={gate.left} total={gate.rotateSec} tone={live ? "primary" : "warning"} />
                <p className={cn("text-center text-[13px]", live ? "text-muted-foreground" : "font-medium text-warning-text")}>
                  {stale ? "Could not refresh the code. Trying again." : gate.left > 0 ? `New code in ${gate.left} s` : "Getting a new code"}
                </p>
              </div>
              <LastScan scan={gate.justScanned || gate.code?.lastScan} fresh={Boolean(gate.justScanned)} />
            </>
          )}
        </div>
        <p className="flex items-start gap-2 border-t border-border px-5 py-3 text-[12.5px] text-muted-foreground">
          <ShieldCheck className="mt-px h-4 w-4 flex-none text-success-text" />
          Leave this open on the screen at the gate. Each code works once, for {gate.rotateSec} seconds, so a photo of it will not mark anyone present.
        </p>
      </Card>

      <div className="space-y-5">
        {gate.stations.length > 1 && (
          <Card className="p-5">
            <Field label="Station">
              <Select value={gate.siteId} onChange={(e) => gate.setSiteId(e.target.value)}>
                {gate.stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
        )}
        {gate.error && gate.code ? (
          <Banner tone="warning">
            <span title={gate.errorDetail || undefined}>{gate.error}</span>
          </Banner>
        ) : null}

        <Card className="overflow-hidden">
          <CardHeader title="Today at the gate" />
          <div className="px-5 pt-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-semibold leading-none tracking-tight text-foreground tabular">{scans.inToday}</span>
              <span className="text-[13px] text-muted-foreground">{scans.total != null ? `of ${scans.total} in today` : "in today"}</span>
            </div>
            {scans.total ? (
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, (scans.inToday / scans.total) * 100)}%` }} />
              </div>
            ) : null}
          </div>
          {scans.recent.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-muted-foreground">No one has scanned yet today.</p>
          ) : (
            <ul className="mt-3 border-t border-border">
              {scans.recent.map((p) => (
                <li key={p.id} className="flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-b-0">
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-primary/10 text-[12px] font-semibold text-primary">{initials(p.name)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{p.name}</span>
                  <Badge tone={p.kind === "out" ? "slate" : "emerald"}>{p.kind === "out" ? "Out" : "In"}</Badge>
                  <span className="w-[62px] text-right text-[13px] text-muted-foreground tabular">{scanTime(p.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function LiveChip({ stale }) {
  return (
    <span className={cn("inline-flex h-[30px] items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium", stale ? "bg-warning/12 text-warning-text" : "bg-success/12 text-success-text")}>
      <span className={cn("h-2 w-2 rounded-full", stale ? "bg-warning" : "animate-pulse bg-success")} />
      {stale ? "Reconnecting" : "Live"}
    </span>
  )
}

function LastScan({ scan, fresh }) {
  if (!scan) return <p className="text-[13px] text-subtle-foreground">No one has scanned yet.</p>
  return (
    <p className={cn("squircle inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px]", fresh ? "bg-success/12 text-success-text" : "text-muted-foreground")}>
      {fresh && <CheckCircle2 className="h-4 w-4" />}
      <span>
        <span className="font-semibold text-foreground">{scan.name}</span> {scan.kind === "out" ? "clocked out" : "clocked in"}
        {scanTime(scan.at) ? ` at ${scanTime(scan.at)}` : ""}
      </span>
    </p>
  )
}

// ---- the gate display (full screen) --------------------------------------------

/**
 * Today's scans AT THIS STATION (qr_site_id) for the "Just now" feed and the
 * "in today" count, leaving out punches an admin did not accept. "Of N" is
 * everyone expected in today (attendanceExpectations: not autoPresent, not on
 * leave, nobody on a day off), plus anyone who scanned here anyway. The IST day
 * is re-read every 30s, so a screen left up overnight starts again at midnight.
 */
function useScansToday(siteId, lastScanAt) {
  const [state, setState] = useState({ rows: [], names: {}, expected: null })
  const [day, setDay] = useState(todayIST)
  useEffect(() => {
    const t = setInterval(() => setDay(todayIST()), 30000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    let alive = true
    void Promise.all([
      listPunches({ from: day, to: day }).catch(() => ({ rows: [] })),
      repo.staffDirectory ? repo.staffDirectory().catch(() => ({})) : {},
      listProfiles().catch(() => null),
      loadExpectations(day),
    ]).then(([punches, names, profiles, expect]) => {
      if (!alive) return
      const rows = (punches.rows || []).filter((p) => p.qr_site_id === siteId && p.review !== "rejected")
      setState({ rows, names: names || {}, expected: profiles ? profiles.filter(expect.expects).map((p) => p.id) : null })
    })
    return () => {
      alive = false
    }
  }, [siteId, lastScanAt, day])
  return useMemo(() => {
    const recent = [...state.rows].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5)
    const inIds = new Set(state.rows.filter((p) => p.kind === "in").map((p) => p.user_id))
    // No total at all on a day nobody is expected and nobody came.
    const total = state.expected ? new Set([...state.expected, ...inIds]).size || null : null
    return { recent: recent.map((p) => ({ ...p, name: state.names[p.user_id]?.name || "Someone" })), inToday: inIds.size, total }
  }, [state])
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000)
    return () => clearInterval(t)
  }, [])
  return now
}

function useCodeSize() {
  // Landscape: beside the text. Portrait (a tablet on the wall): above it, most of the width.
  const pick = () => {
    const { innerWidth: w, innerHeight: h } = window
    const fit = h > w ? Math.min(h * 0.42, w * 0.72) : Math.min(h * 0.58, w * 0.36)
    return Math.max(220, Math.min(640, Math.floor(fit)))
  }
  const [size, setSize] = useState(pick)
  useEffect(() => {
    const on = () => setSize(pick())
    window.addEventListener("resize", on)
    return () => window.removeEventListener("resize", on)
  }, [])
  return size
}

/** Keeps the screen awake while the kiosk is up, where the browser allows it. */
function useWakeLock() {
  useEffect(() => {
    let lock = null
    const take = () => navigator.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {})
    // The browser drops the lock when the tab is hidden; take it again on return.
    const onVisible = () => document.visibilityState === "visible" && take()
    take()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      lock?.release().catch(() => {})
    }
  }, [])
}

function GateDisplay({ gate, onExit }) {
  useWakeLock()
  const now = useClock()
  const size = useCodeSize()
  const scans = useScansToday(gate.siteId, gate.code?.lastScan?.at)
  const live = gate.state === "ok"
  const stale = gate.state === "stale" || gate.state === "error"
  const hit = gate.justScanned
  const station = gate.code?.siteName || gate.station?.name || "Attendance"
  const time = now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })
  const [clock, meridiem] = time.split(" ")
  const date = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })
  const share = scans.total ? Math.min(100, (scans.inToday / scans.total) * 100) : 0

  // Read from across a corridor: the code is the biggest thing, with its one
  // instruction on the card itself. The time never moves; only the panel under
  // it changes (the steps, a welcome for whoever just scanned, or a warning).
  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-[3vh] overflow-y-auto bg-linear-to-br from-kiosk to-kiosk-2 px-6 py-5 text-primary-foreground sm:px-10 xl:px-14 xl:py-8">
      <header className="flex flex-wrap items-center gap-3.5">
        <span className="squircle grid h-12 w-12 flex-none place-items-center rounded-xl bg-primary-foreground p-1.5">
          <img src="/icons/app-icon-192.png" alt="" className="h-full w-full object-contain" />
        </span>
        <div className="mr-auto min-w-0">
          <div className="truncate text-xl font-semibold leading-tight">{station}</div>
          <div className="text-sm text-primary-foreground/60">Ortex Industries · Attendance</div>
        </div>
        <span className={cn("squircle inline-flex h-11 items-center gap-2.5 rounded-xl px-4 text-[15px] font-semibold", stale ? "bg-warning/25 text-warning" : "bg-success/20 text-success")}>
          <span className={cn("h-2.5 w-2.5 rounded-full", stale ? "bg-warning" : "animate-pulse bg-success")} /> {stale ? "Reconnecting" : "Live"}
        </span>
        <button type="button" onClick={onExit} className="squircle inline-flex h-11 items-center gap-2.5 rounded-xl border border-primary-foreground/25 px-4 text-[15px] font-medium transition-colors hover:bg-primary-foreground/10">
          Exit <kbd className="rounded-md bg-primary-foreground/15 px-2 py-0.5 text-xs font-medium">Esc</kbd>
        </button>
      </header>

      <main className="flex min-h-0 flex-1 items-center gap-[4vw] portrait:flex-col portrait:justify-center portrait:gap-[3vh]">
        {/* the code */}
        <div
          className={cn(
            "squircle flex flex-none flex-col items-center gap-[2vh] rounded-card bg-card p-[clamp(16px,3vh,32px)] text-foreground outline-solid outline-[6px] -outline-offset-[6px] transition-[outline-color]",
            hit ? "outline-success" : stale ? "outline-warning" : "outline-transparent",
          )}
        >
          <div className="flex items-center gap-2.5 text-[clamp(17px,2.4vh,24px)] font-semibold">
            <QrCode className="h-[1.2em] w-[1.2em] text-primary" /> Scan with the Ortex app
          </div>
          <QrImage payload={gate.code?.payload} size={size} dim={!live} />
          <div className="w-full space-y-2.5">
            <Countdown left={hit ? gate.rotateSec : gate.left} total={gate.rotateSec} tone={stale ? "warning" : "primary"} segmentClassName="h-2" />
            <div className="flex items-center justify-between text-[clamp(15px,2vh,18px)]">
              {stale ? (
                <span className="font-semibold text-warning-text">Refreshing the code</span>
              ) : (
                <span className="text-muted-foreground">
                  New code in <span className="font-semibold text-primary tabular">{!hit && gate.left > 0 ? `${gate.left} s` : "a moment"}</span>
                </span>
              )}
              <span className="font-medium text-subtle-foreground">Works once</span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[3.5vh] portrait:w-full portrait:flex-none">
          {/* the time */}
          <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
            <div className="flex items-end gap-2 leading-none">
              <span className="text-[clamp(52px,9vh,96px)] font-semibold tracking-[-0.04em] tabular">{clock}</span>
              <span className="mb-[0.6vh] text-[clamp(20px,3vh,30px)] font-medium text-primary-foreground/65">{meridiem}</span>
            </div>
            <span className="mb-[0.8vh] text-[clamp(16px,2.4vh,22px)] text-primary-foreground/65">{date}</span>
          </div>

          {/* the one panel that changes */}
          {hit ? (
            <div role="status" className="squircle flex items-center gap-6 rounded-card bg-success-text p-[clamp(18px,3vh,32px)] text-primary-foreground">
              <span className="grid h-[clamp(64px,10vh,96px)] w-[clamp(64px,10vh,96px)] flex-none place-items-center rounded-full bg-primary-foreground text-[clamp(22px,3.4vh,32px)] font-semibold text-success-text">
                {initials(hit.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[clamp(28px,5vh,48px)] font-semibold leading-tight tracking-tight">
                  {hit.kind === "out" ? "Goodbye" : "Welcome"}, {(hit.name || "").split(" ")[0]}
                </div>
                <div className="mt-1 text-[clamp(16px,2.4vh,22px)] text-primary-foreground/85">
                  {hit.kind === "out" ? "Clocked out" : "Clocked in"} at {scanTime(hit.at)}. {hit.kind === "out" ? "See you tomorrow." : "Have a good day."}
                </div>
              </div>
              <CheckCircle2 className="h-[clamp(40px,6vh,56px)] w-[clamp(40px,6vh,56px)] flex-none" />
            </div>
          ) : stale ? (
            <div role="status" className="squircle flex items-center gap-5 rounded-card bg-warning/20 p-[clamp(18px,3vh,32px)]">
              <AlertTriangle className="h-12 w-12 flex-none text-warning" />
              <div>
                <div className="text-[clamp(26px,4.4vh,40px)] font-semibold leading-tight text-warning">Please wait a moment</div>
                <div className="mt-1 text-[clamp(15px,2.2vh,20px)] text-primary-foreground/80">The code is dimmed because it may already be used. The screen reconnects on its own.</div>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-[clamp(34px,6vh,64px)] font-semibold leading-[1.05] tracking-tight">Scan to clock in or out</h1>
              {/* One step a line, so a narrow screen never strands a step on its own. */}
              <ol className="mt-[2.5vh] space-y-[1.4vh] text-[clamp(16px,2.3vh,21px)]">
                {["Open the Ortex app", "Tap Attendance, then Scan", "Point your phone at the code"].map((step, i) => (
                  <li key={step} className="flex items-center gap-3.5">
                    <span className="grid h-[1.7em] w-[1.7em] flex-none place-items-center rounded-full bg-primary-foreground/15 text-[0.85em] font-semibold tabular">{i + 1}</span>
                    <span className="font-medium">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* today */}
          <section className="squircle rounded-card bg-primary-foreground/[0.07] p-[clamp(16px,2.6vh,24px)]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="mr-auto text-lg font-semibold">Today</span>
              <span className="text-[15px] text-primary-foreground/70">
                <span className="text-2xl font-semibold text-success tabular">{scans.inToday}</span>
                {scans.total != null ? ` of ${scans.total} in` : " in"}
              </span>
            </div>
            {scans.total ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary-foreground/15">
                <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${share}%` }} />
              </div>
            ) : null}
            {scans.recent.length === 0 ? (
              <p className="mt-4 text-base text-primary-foreground/60">No one has scanned yet today.</p>
            ) : (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {scans.recent.slice(0, 4).map((p, i) => (
                  <li key={p.id} className={cn("squircle flex items-center gap-3 rounded-xl px-3 py-2.5", i === 0 ? "bg-primary-foreground/12" : "bg-primary-foreground/[0.04]")}>
                    <span className={cn("grid h-10 w-10 flex-none place-items-center rounded-full text-[14px] font-semibold", p.kind === "out" ? "bg-primary-foreground/15" : "bg-success text-primary-foreground")}>
                      {initials(p.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[17px] font-semibold">{p.name}</div>
                      <div className="text-sm text-primary-foreground/60">
                        {p.kind === "out" ? "Out" : "In"} at {scanTime(p.at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <footer className="flex items-center gap-2.5 text-[15px] text-primary-foreground/60 [@media(max-height:700px)]:hidden">
        <ShieldCheck className="h-[18px] w-[18px] flex-none" />
        Each code works once, for {gate.rotateSec} seconds, so a photo of this screen will not mark anyone present.
      </footer>
    </div>
  )
}
