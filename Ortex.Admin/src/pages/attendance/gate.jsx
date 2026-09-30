import { useEffect, useState } from "react"
import { Banner, Spinner } from "../../components/ui/Ui"
import { canAccess } from "../../data/domain/modules"
import { cn } from "../../lib/cn"

// The pieces the gate code is drawn with, shared by Attendance → QR code, its
// full-screen display and the Dashboard's gate card.

/**
 * Who is shown the code: whoever may open the attendance-qr module (every Admin
 * by default; the Super Admin changes it on the Modules page). The same rule as
 * the database's attendance_qr_issuer() since migration 0055, so the code
 * appears for precisely the people the server will serve.
 */
export const canShowGateCode = (p) => canAccess(p, "attendance-qr")

/**
 * The code itself. `qrcode` is imported dynamically for the reason
 * ProductImport imports xlsx that way: it is dead weight in the main bundle for
 * every page that is not this one. H is the highest error correction, so a
 * phone still reads it at an angle, across a room, or through a fingerprint.
 */
export function QrImage({ payload, size, dim = false, className }) {
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
        const url = await QRCode.toDataURL(payload, {
          errorCorrectionLevel: "H",
          margin: 0,
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
    return <Banner tone="danger">The QR library could not be loaded. Run npm install in Ortex.Admin and reload.</Banner>
  }
  return (
    <div className={cn("transition-opacity duration-300", dim && "opacity-25", className)} style={{ width: size, height: size }} aria-label="Attendance QR code" role="img">
      {src ? <img src={src} alt="" width={size} height={size} className="h-full w-full [image-rendering:pixelated]" /> : <div className="grid h-full w-full place-items-center"><Spinner /></div>}
    </div>
  )
}

/**
 * The countdown as a row of segments, one per second of the code's life. A
 * bar would do; segments read at a glance from across a room.
 */
export function Countdown({ left, total = 30, tone = "primary", className, segmentClassName }) {
  const n = Math.max(1, Math.min(60, total))
  const lit = Math.round((Math.max(0, left) / total) * n)
  const fill = { primary: "bg-primary", warning: "bg-warning-text", success: "bg-success" }[tone] || "bg-primary"
  return (
    <div className={cn("flex w-full gap-[3px]", className)} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-500", i < lit ? fill : "bg-primary/15", segmentClassName)} />
      ))}
    </div>
  )
}

/** "9:42 am" in IST, for a scan time. */
export function scanTime(at) {
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })
}
