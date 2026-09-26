import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Banner, Button, EmptyState, Select, Field, Spinner } from "../../components/ui/Ui"
import { AlertTriangle, CheckCircle2, Maximize, QrCode, RefreshCw, ShieldCheck } from "../../components/ui/Icons"
import { useGateCode } from "../../hooks/useGateCode"
import { listPunches, todayIST } from "../../services/attendance"
import { listProfiles } from "../../services/users"
import { repo } from "../../data/store/repository"
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
      <div className="p-6">
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

  const live = gate.state === "ok"
  return (
    <div className="grid gap-6 p-6 lg:grid-cols-[1fr_340px]">
      <section className="squircle flex flex-col gap-6 rounded-card bg-card p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Scan to mark attendance{gate.code?.siteName ? ` · ${gate.code.siteName}` : ""}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">Leave this open on the screen at the gate. The code changes every {gate.rotateSec} seconds, and again the moment someone scans it.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" icon onClick={() => void gate.reload()} aria-label="New code now" title="New code now">
              <RefreshCw className="size-4" />
            </Button>
            <Button size="sm" onClick={enter}>
              <Maximize className="size-4" /> Full screen
            </Button>
          </div>
        </header>

        {gate.state === "loading" && !gate.code ? (
          <div className="grid h-[380px] place-items-center">
            <Spinner />
          </div>
        ) : gate.error && !gate.code ? (
          <EmptyState icon={QrCode} title="No code to show" description={gate.error} />
        ) : (
          <div className="flex flex-col items-center gap-5">
            <div className={cn("squircle rounded-card border-4 bg-card p-5", live ? "border-primary" : "border-warning")}>
              <QrImage payload={gate.code?.payload} size={300} dim={!live} />
            </div>
            <div className="w-full max-w-[340px] space-y-2.5">
              <Countdown left={gate.left} total={gate.rotateSec} tone={live ? "primary" : "warning"} />
              <p className={cn("text-center text-sm", live ? "text-muted-foreground" : "font-medium text-warning-text")}>
                {gate.state === "stale" ? "Could not refresh the code. Trying again." : gate.left > 0 ? `New code in ${gate.left} s` : "Getting a new code"}
              </p>
            </div>
            <LastScan scan={gate.justScanned || gate.code?.lastScan} fresh={Boolean(gate.justScanned)} />
          </div>
        )}
      </section>

      <section className="squircle flex flex-col gap-4 self-start rounded-card bg-card p-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Station</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Which screen this is.</p>
        </div>
        {gate.stations.length > 1 ? (
          <Field label="Showing the code for">
            <Select value={gate.siteId} onChange={(e) => gate.setSiteId(e.target.value)}>
              {gate.stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="text-sm font-medium text-foreground">{gate.stations[0]?.name || "No station has been added yet."}</p>
        )}
        <p className="squircle flex gap-2.5 rounded-xl bg-subtle px-3.5 py-3 text-[13px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-success-text" />
          A code is good for {gate.rotateSec} seconds and one scan. Photographing this screen is pointless: the code in the photo is dead before it can be sent.
        </p>
        {gate.error && gate.code ? <Banner tone="warning">{gate.error}</Banner> : null}
      </section>
    </div>
  )
}

function LastScan({ scan, fresh }) {
  if (!scan) return <p className="text-sm text-subtle-foreground">No one has scanned yet.</p>
  return (
    <p className={cn("squircle inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm", fresh ? "bg-success/12 text-success-text" : "text-muted-foreground")}>
      {fresh && <CheckCircle2 className="h-4 w-4" />}
      <span>
        <span className="font-semibold text-foreground">{scan.name}</span> {scan.kind === "out" ? "clocked out" : "clocked in"}
        {scanTime(scan.at) ? ` at ${scanTime(scan.at)}` : ""}
      </span>
    </p>
  )
}

// ---- the gate display (full screen) --------------------------------------------

/** Today's scans for the "Just now" feed and the "in today" count. */
function useScansToday(trigger) {
  const [state, setState] = useState({ rows: [], names: {}, total: null })
  useEffect(() => {
    let alive = true
    const day = todayIST()
    void Promise.all([
      listPunches({ from: day, to: day }).catch(() => ({ rows: [] })),
      repo.staffDirectory ? repo.staffDirectory().catch(() => ({})) : {},
      listProfiles().catch(() => null),
    ]).then(([punches, names, profiles]) => {
      if (!alive) return
      setState({ rows: punches.rows || [], names: names || {}, total: profiles ? profiles.filter((p) => p.active !== false).length : null })
    })
    return () => {
      alive = false
    }
  }, [trigger])
  return useMemo(() => {
    const recent = [...state.rows].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5)
    const inToday = new Set(state.rows.filter((p) => p.kind === "in").map((p) => p.user_id)).size
    return { recent: recent.map((p) => ({ ...p, name: state.names[p.user_id]?.name || "Someone" })), inToday, total: state.total }
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
  const pick = () => Math.max(260, Math.min(640, Math.floor(Math.min(window.innerHeight * 0.58, window.innerWidth * 0.36))))
  const [size, setSize] = useState(pick)
  useEffect(() => {
    const on = () => setSize(pick())
    window.addEventListener("resize", on)
    return () => window.removeEventListener("resize", on)
  }, [])
  return size
}

function GateDisplay({ gate, onExit }) {
  const now = useClock()
  const size = useCodeSize()
  const scans = useScansToday(gate.code?.lastScan?.at || gate.siteId)
  const live = gate.state === "ok"
  const stale = gate.state === "stale" || gate.state === "error"
  const hit = gate.justScanned
  const station = gate.code?.siteName || gate.station?.name || "Attendance"
  const time = now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })
  const [clock, meridiem] = time.split(" ")
  const date = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })

  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-8 overflow-hidden bg-linear-to-br from-kiosk to-kiosk-2 px-8 py-8 text-primary-foreground xl:px-16 xl:py-12">
      {/* top bar */}
      <header className="flex flex-wrap items-center gap-3.5">
        <span className="squircle grid h-12 w-12 place-items-center rounded-xl bg-primary-foreground p-1.5">
          <img src="/icons/app-icon-192.png" alt="" className="h-full w-full object-contain" />
        </span>
        <div className="mr-auto">
          <div className="text-lg font-semibold">Ortex Industries</div>
          <div className="text-sm text-primary-foreground/60">Attendance</div>
        </div>
        <Chip>
          <QrCode className="h-5 w-5" /> {station}
        </Chip>
        <Chip className={stale ? "bg-warning/25 text-warning" : "bg-success/20 text-success"}>
          <span className={cn("h-2.5 w-2.5 rounded-full", stale ? "bg-warning" : "animate-pulse bg-success")} /> {stale ? "Reconnecting" : "Live"}
        </Chip>
        <button type="button" onClick={onExit} className="squircle inline-flex h-11 items-center gap-2.5 rounded-xl border border-primary-foreground/25 px-4 text-[15px] font-medium transition-colors hover:bg-primary-foreground/10">
          Exit <kbd className="rounded-md bg-primary-foreground/15 px-2 py-0.5 text-xs font-medium">Esc</kbd>
        </button>
      </header>

      {/* body */}
      <main className="flex min-h-0 flex-1 items-center gap-10 xl:gap-16">
        <div className={cn("squircle flex flex-none flex-col items-center gap-6 rounded-card bg-card p-8 text-foreground outline-solid outline-[6px] -outline-offset-[6px] transition-[outline-color]", hit ? "outline-success" : stale ? "outline-warning" : "outline-transparent")}>
          <QrImage payload={gate.code?.payload} size={size} dim={!live} />
          <div className="w-full space-y-3">
            <Countdown left={hit ? gate.rotateSec : gate.left} total={gate.rotateSec} tone={stale ? "warning" : "primary"} segmentClassName="h-2.5" />
            <div className="flex items-center justify-between text-lg">
              {hit ? (
                <span className="font-semibold text-success-text">A fresh code is up. Next person, please</span>
              ) : stale ? (
                <span className="font-semibold text-warning-text">Could not refresh the code. Trying again</span>
              ) : (
                <span className="text-muted-foreground">
                  New code in <span className="font-semibold text-primary tabular">{gate.left > 0 ? `${gate.left} s` : "a moment"}</span>
                </span>
              )}
              <span className="text-base font-medium text-subtle-foreground">Works once</span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-8">
          {hit ? (
            <div className="squircle flex items-center gap-6 rounded-card bg-success-text p-7 text-primary-foreground">
              <span className="grid h-24 w-24 flex-none place-items-center rounded-full bg-primary-foreground text-3xl font-semibold text-success-text">{initials(hit.name)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[44px] font-semibold leading-tight tracking-tight">{hit.name}, you are {hit.kind === "out" ? "out" : "in"}</div>
                <div className="mt-1 text-xl text-primary-foreground/85">
                  {hit.kind === "out" ? "Clocked out" : "Clocked in"} at {scanTime(hit.at)}. {hit.kind === "out" ? "See you tomorrow." : "Have a good day."}
                </div>
              </div>
              <CheckCircle2 className="h-14 w-14 flex-none" />
            </div>
          ) : stale ? (
            // A light amber panel: white under a warning tint, as in the Figma frame.
            <div className="squircle overflow-hidden rounded-card bg-card">
              <div className="flex items-center gap-5 bg-warning/20 p-7">
                <AlertTriangle className="h-12 w-12 flex-none text-warning-text" />
                <div>
                  <div className="text-[34px] font-semibold leading-tight text-warning-text">Please wait a moment</div>
                  <div className="mt-1 text-lg text-warning-text/85">The code is dimmed because it may already be dead. The screen reconnects on its own.</div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-end gap-3 leading-none">
                <span className="text-[112px] font-semibold tracking-[-0.04em] tabular">{clock}</span>
                <span className="mb-3 text-3xl font-medium text-primary-foreground/70">{meridiem}</span>
              </div>
              <div className="mt-2 text-xl text-primary-foreground/65">{date}</div>
            </div>
          )}

          <div className="space-y-5">
            <h1 className="text-[52px] font-semibold leading-none tracking-tight">Scan to clock in or out</h1>
            <ol className="grid grid-cols-3 gap-4">
              {[
                ["Open the Ortex app", "On your own phone"],
                ["Tap Attendance, then Scan", "In when you arrive, out when you leave"],
                ["Point at the code", "Done in a second"],
              ].map(([title, sub], i) => (
                <li key={title} className="squircle rounded-card bg-primary-foreground/[0.07] p-5">
                  <span className="squircle grid h-10 w-10 place-items-center rounded-xl bg-primary-foreground/12 text-lg font-semibold">{i + 1}</span>
                  <div className="mt-3.5 text-xl font-semibold leading-snug">{title}</div>
                  <div className="mt-1 text-[15px] text-primary-foreground/60">{sub}</div>
                </li>
              ))}
            </ol>
          </div>

          <section className="squircle rounded-card bg-primary-foreground/[0.07] p-5">
            <div className="mb-2 flex items-center gap-3 px-1">
              <span className="mr-auto text-lg font-semibold">Just now</span>
              <span className="text-xl font-semibold text-success tabular">{scans.inToday}</span>
              <span className="text-[15px] text-primary-foreground/65">{scans.total != null ? `of ${scans.total} in today` : "in today"}</span>
              {scans.total ? (
                <span className="h-1.5 w-28 overflow-hidden rounded-full bg-primary-foreground/15">
                  <span className="block h-full rounded-full bg-success" style={{ width: `${Math.min(100, (scans.inToday / scans.total) * 100)}%` }} />
                </span>
              ) : null}
            </div>
            {scans.recent.length === 0 ? (
              <p className="px-1 py-3 text-base text-primary-foreground/60">No one has scanned yet today.</p>
            ) : (
              <ul>
                {scans.recent.slice(0, 3).map((p, i) => (
                  <li key={p.id} className={cn("squircle flex items-center gap-4 rounded-xl px-3 py-2.5", i === 0 && "bg-primary-foreground/10")}>
                    <span className={cn("grid h-11 w-11 flex-none place-items-center rounded-full text-[15px] font-semibold", i === 0 ? "bg-success text-primary-foreground" : "bg-primary-foreground/15")}>{initials(p.name)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-semibold">{p.name}</div>
                      <div className="text-sm text-primary-foreground/60">{p.kind === "out" ? "Clocked out" : "Clocked in"}</div>
                    </div>
                    <span className="text-lg font-medium text-primary-foreground/80 tabular">{scanTime(p.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <footer className="flex items-center gap-2.5 text-[15px] text-primary-foreground/55">
        <ShieldCheck className="h-[18px] w-[18px] flex-none" />
        Each code works once, for {gate.rotateSec} seconds, so a photo of this screen will not mark anyone present. Field staff clock in from the app and are flagged for review.
      </footer>
    </div>
  )
}

const Chip = ({ className, children }) => (
  <span className={cn("squircle inline-flex h-11 items-center gap-2.5 rounded-xl bg-primary-foreground/10 px-4 text-[15px] font-semibold", className)}>{children}</span>
)
