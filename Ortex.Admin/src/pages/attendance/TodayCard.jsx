import { useEffect, useMemo, useState } from "react"
import { Smartphone } from "../../components/ui/Icons"
import { Card } from "../../components/ui/Ui"
import { clockIST, counted, durationWords, onDutySince } from "../../lib/attendance"
import { cn } from "../../lib/cn"

// My attendance → Today: the live view of the person's own day (Zoho People
// style, the owner's request). A ring of time worked against the shift, a
// running HH:MM:SS clock while on duty, the state in words, and the day as a
// bar from shift start to shift end with the worked stretches filled and a
// marker for now. Read-only: clocking in happens only in the phone app.

const MIN = 60000
const IST = 330 * MIN

/** "09:30" on the IST day `day` → epoch ms. */
function atIST(day, hhmm) {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number)
  return Date.parse(`${day}T00:00:00Z`) - IST + (h * 60 + (m || 0)) * MIN
}

/** Worked stretches [start, end] in ms from counted punches; an open one runs to `now`. */
function stretches(punches, now) {
  const list = counted(punches).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const out = []
  let open = null
  for (const p of list) {
    const t = Date.parse(p.at)
    if (p.kind === "in") {
      if (open === null) open = t
    } else if (open !== null) {
      out.push([open, t])
      open = null
    }
  }
  if (open !== null) out.push([open, now])
  return out
}

const pad = (n) => String(n).padStart(2, "0")
function hms(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

export default function TodayCard({ day, punches, settings }) {
  const onDuty = Boolean(onDutySince(punches || []))
  const [now, setNow] = useState(Date.now())

  // One interval, only while the clock is actually running.
  useEffect(() => {
    if (!onDuty) {
      setNow(Date.now())
      return undefined
    }
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [onDuty])

  const model = useMemo(() => {
    const cfg = settings || {}
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay()
    const off = (cfg.weeklyOff || [0]).includes(dow)
    let start = atIST(day, cfg.shift?.start || "09:30")
    let end = atIST(day, cfg.shift?.end || "18:30")
    if (end <= start) end += 24 * 60 * MIN
    if (dow === 6 && cfg.saturday === "half") end = start + (end - start) / 2
    const target = off ? 0 : end - start
    const segs = stretches(punches || [], now)
    const worked = segs.reduce((s, [a, b]) => s + (b - a), 0)
    const valid = counted(punches || []).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    const firstIn = valid.find((p) => p.kind === "in")
    const lastOut = [...valid].reverse().find((p) => p.kind === "out")
    // The bar spans the shift, stretched to cover anything worked outside it.
    const lo = Math.min(start, ...segs.map((s) => s[0]))
    const hi = Math.max(end, ...segs.map((s) => s[1]), onDuty ? now : 0)
    return { off, start, end, target, segs, worked, firstIn, lastOut, lo, hi }
  }, [day, punches, settings, now, onDuty])

  const { off, target, worked, firstIn, lastOut } = model
  const ratio = target ? worked / target : 0
  const overtime = target && worked > target + MIN
  const done = target && worked >= target && !overtime
  const tone = overtime ? "warning" : done ? "success" : "primary"

  let words
  if (!firstIn) words = off ? "Weekly off" : "Not started"
  else if (off) words = `${durationWords(worked / MIN)} on a day off`
  else if (overtime) words = `Overtime ${durationWords((worked - target) / MIN)}`
  else if (done) words = "Shift complete"
  else words = `${durationWords((target - worked) / MIN)} to go`

  let line
  if (!firstIn) line = "Not clocked in yet. Clock in from the Ortex phone app."
  else if (onDuty) line = `Clocked in at ${clockIST(firstIn.at)} · ${firstIn.mode === "field" ? "Field visit" : firstIn.site_name || "Office"}`
  else line = `Clocked in at ${clockIST(firstIn.at)}, out at ${lastOut ? clockIST(lastOut.at) : "-"}`

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <Ring ratio={ratio} tone={tone} label={hms(worked)} sub={target ? `of ${durationWords(target / MIN)}` : "worked"} live={onDuty} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Today</p>
            <p
              className={cn(
                "text-xl font-semibold",
                tone === "warning" ? "text-warning-text" : tone === "success" ? "text-success-text" : "text-foreground",
              )}
            >
              {words}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              {!firstIn && <Smartphone className="h-4 w-4 flex-none" />}
              {line}
            </p>
          </div>
          <Timeline model={model} now={now} onDuty={onDuty} tone={tone} />
        </div>
      </div>
    </Card>
  )
}

const STROKE = { primary: "stroke-primary", success: "stroke-success", warning: "stroke-warning" }
const FILL = { primary: "fill-primary", success: "fill-success", warning: "fill-warning" }

function Ring({ ratio, tone, label, sub, live }) {
  const r = 52
  const c = 2 * Math.PI * r
  const shown = Math.max(0, Math.min(1, ratio))
  return (
    <div className="relative mx-auto h-[132px] w-[132px] flex-none md:mx-0" role="img" aria-label={`${label} worked ${sub}`}>
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
        <circle cx="66" cy="66" r={r} className="fill-none stroke-secondary" strokeWidth="10" />
        <circle
          cx="66"
          cy="66"
          r={r}
          className={cn("fill-none transition-[stroke-dashoffset] duration-700", STROKE[tone])}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold tabular text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{sub}</span>
        {live && (
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-success-text">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success motion-reduce:animate-none" /> On duty
          </span>
        )}
      </div>
    </div>
  )
}

function Timeline({ model, now, onDuty, tone }) {
  const { start, end, segs, lo, hi } = model
  const W = 1000
  const x = (t) => ((t - lo) / Math.max(1, hi - lo)) * W
  const showNow = onDuty || (now >= lo && now <= hi)
  return (
    <div>
      <svg viewBox={`0 0 ${W} 28`} preserveAspectRatio="none" className="h-7 w-full" role="img" aria-label="Today's worked time against the shift">
        <rect x="0" y="8" width={W} height="12" rx="6" className="fill-secondary" />
        <rect x={x(start)} y="8" width={Math.max(0, x(end) - x(start))} height="12" rx="6" className="fill-primary/15" />
        {segs.map(([a, b], i) => (
          <rect key={i} x={x(a)} y="8" width={Math.max(2, x(b) - x(a))} height="12" rx="6" className={FILL[tone]} />
        ))}
        {showNow && <rect x={Math.min(W - 3, Math.max(0, x(now) - 1.5))} y="2" width="3" height="24" rx="1.5" className="fill-foreground" />}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] tabular text-muted-foreground">
        <span>{clockIST(lo)}</span>
        <span>Shift {clockIST(start)} to {clockIST(end)}</span>
        <span>{clockIST(hi)}</span>
      </div>
    </div>
  )
}
