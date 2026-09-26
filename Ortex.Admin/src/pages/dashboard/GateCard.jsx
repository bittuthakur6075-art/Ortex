import { useNavigate } from "react-router-dom"
import { ArrowDownLeft, Maximize, QrCode, RefreshCw, ShieldCheck } from "../../components/ui/Icons"
import { useGateCode } from "../../hooks/useGateCode"
import { Countdown, QrImage, scanTime } from "../attendance/gate"
import { cn } from "../../lib/cn"
import { initials } from "../../lib/format"

// The live gate code on the Dashboard, for the people who issue it (see
// canShowGateCode). The same code the gate shows: useGateCode keeps it live, and
// a scan at the gate redraws it here too.

export default function GateCard({ inToday, total }) {
  const navigate = useNavigate()
  const gate = useGateCode()
  if (gate.missing) return null
  const live = gate.state === "ok"
  const scan = gate.justScanned || gate.code?.lastScan

  return (
    <section className="squircle flex flex-col gap-4 rounded-card bg-linear-to-br from-kiosk-2 to-primary p-5 text-primary-foreground">
      <header className="flex items-center gap-3">
        <span className="squircle grid h-10 w-10 flex-none place-items-center rounded-xl bg-primary-foreground/15">
          <QrCode className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-5 tracking-[-0.01em]">Gate QR code</h2>
          {gate.stations.length > 1 ? (
            <label className="relative inline-flex items-center gap-1 text-[12.5px] font-medium text-primary-foreground/80">
              <select
                value={gate.siteId}
                onChange={(e) => gate.setSiteId(e.target.value)}
                aria-label="Station"
                className="cursor-pointer appearance-none bg-transparent pr-4 outline-none [&>option]:text-foreground"
              >
                {gate.stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ArrowDownLeft className="pointer-events-none absolute right-0 h-3.5 w-3.5" />
            </label>
          ) : (
            <p className="truncate text-[12.5px] font-medium text-primary-foreground/80">{gate.station?.name || gate.code?.siteName || "Attendance"}</p>
          )}
        </div>
        <span className={cn("squircle inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold leading-[15px]", live ? "bg-success/20" : "bg-warning/25")}>
          <span className={cn("h-2 w-2 rounded-full", live ? "bg-success" : "bg-warning")} />
          {live ? "Live" : gate.state === "loading" ? "Starting" : "Reconnecting"}
        </span>
      </header>

      <div className="squircle flex flex-col items-center gap-3.5 rounded-xl bg-card px-4 pb-3.5 pt-4 text-foreground">
        {gate.error && !gate.code ? (
          <p className="py-10 text-center text-[13px] text-muted-foreground">{gate.error}</p>
        ) : (
          <QrImage payload={gate.code?.payload} size={212} dim={!live} />
        )}
        <Countdown left={gate.left} total={gate.rotateSec} tone={live ? "primary" : "warning"} className="justify-center" segmentClassName="w-1.5 flex-none" />
        <div className="flex w-full items-center justify-between text-[12.5px] leading-[15px]">
          <span className="text-muted-foreground">
            {gate.state === "stale" ? (
              <span className="font-medium text-warning-text">Could not refresh, retrying</span>
            ) : (
              <>
                New code in <span className="font-semibold text-primary tabular">{gate.left} s</span>
              </>
            )}
          </span>
          <span className="text-xs font-medium text-subtle-foreground">Works once</span>
        </div>
      </div>

      <div className="squircle flex items-center gap-3.5 rounded-xl bg-primary-foreground/10 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-end gap-1.5">
            <span className="text-lg font-semibold leading-none tabular">{inToday}</span>
            <span className="text-xs font-medium text-primary-foreground/75">{total != null ? `of ${total} in` : "in today"}</span>
          </div>
          {total ? (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-primary-foreground/20">
              <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, (inToday / total) * 100)}%` }} />
            </div>
          ) : null}
        </div>
        <span className="h-[34px] w-px flex-none bg-primary-foreground/20" aria-hidden="true" />
        {scan ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className={cn("grid h-8 w-8 flex-none place-items-center rounded-full text-[11px] font-semibold", "bg-success text-primary-foreground")}>{initials(scan.name)}</span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">{scan.name}</div>
              <div className="text-[11.5px] leading-[14px] text-primary-foreground/75">
                {scan.kind === "out" ? "out" : "in"} at {scanTime(scan.at)}
              </div>
            </div>
          </div>
        ) : (
          <span className="flex-1 text-xs text-primary-foreground/75">No scans yet</span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => navigate("/attendance?tab=qr&full=1")}
          className="squircle inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-card text-sm font-semibold text-primary transition-opacity hover:opacity-90"
        >
          <Maximize className="h-[18px] w-[18px]" /> Open full screen
        </button>
        <button
          type="button"
          onClick={() => void gate.reload()}
          title="New code now"
          aria-label="New code now"
          className="squircle grid h-11 w-11 flex-none place-items-center rounded-xl bg-primary-foreground/15 transition-colors hover:bg-primary-foreground/25"
        >
          <RefreshCw className="h-[18px] w-[18px]" />
        </button>
      </div>

      <p className="flex items-center gap-2 text-[11.5px] text-primary-foreground/70">
        <ShieldCheck className="h-3.5 w-3.5 flex-none" /> Codes last {gate.rotateSec} s, so a photo of it will not work
      </p>
    </section>
  )
}
