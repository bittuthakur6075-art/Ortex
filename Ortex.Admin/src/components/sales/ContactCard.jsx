import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { toast } from "sonner"
import { PhoneOutgoing, MessageCircle, Mail, Copy, X } from "../ui/Icons"
import { initials } from "../../lib/format"
import { waNumber, prettyPhone } from "../../pages/voice-leads/helpers"

// "Call" on a laptop: a tel: link there only asks the browser to pick an app,
// which nobody at a desk wants. So on a mouse-driven screen Call opens this
// card with the number to dial from a phone (big, copyable), the alternate
// number, WhatsApp and email. A touch device still dials straight away.
//
//   callContact(event, { name, company, phone, altPhone, email })

const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches

let host = null
let root = null

export function callContact(event, contact) {
  const phone = contact?.phone
  if (isTouch() && phone) {
    window.location.href = `tel:${String(phone).replace(/[^\d+]/g, "")}`
    return
  }
  event?.preventDefault?.()
  event?.stopPropagation?.()
  const rect = event?.currentTarget?.getBoundingClientRect?.() || null
  if (!host) {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  }
  root.render(<Card key={Date.now()} contact={contact} rect={rect} onClose={() => root.render(null)} />)
}

const WIDTH = 300

function Card({ contact, rect, onClose }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  const c = contact || {}
  const numbers = [c.phone, c.altPhone].filter(Boolean)

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight || 260
    if (!rect) return setPos({ top: Math.max(16, (window.innerHeight - h) / 2), left: Math.max(16, (window.innerWidth - WIDTH) / 2) })
    const below = rect.bottom + 8
    setPos({
      top: below + h > window.innerHeight - 8 ? Math.max(8, rect.top - 8 - h) : below,
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8)),
    })
  }, [rect])

  useEffect(() => {
    const down = (e) => ref.current && !ref.current.contains(e.target) && onClose()
    const key = (e) => e.key === "Escape" && onClose()
    // Let the click that opened the card finish before listening for outside clicks.
    const t = setTimeout(() => document.addEventListener("mousedown", down), 0)
    window.addEventListener("keydown", key)
    return () => {
      clearTimeout(t)
      document.removeEventListener("mousedown", down)
      window.removeEventListener("keydown", key)
    }
  }, [onClose])

  const copy = (n) =>
    navigator.clipboard?.writeText(String(n)).then(
      () => toast.success("Number copied"),
      () => toast.error("Could not copy"),
    )

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Call ${c.name || "contact"}`}
      className="squircle fixed z-[60] rounded-2xl border border-line bg-card p-4 shadow-overlay-lg animate-pop-in"
      style={{ width: WIDTH, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-primary/10 text-[13px] font-semibold text-primary">{initials(c.name || c.company)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-foreground">{c.name || "Unnamed contact"}</div>
          {c.company && <div className="truncate text-xs text-muted-foreground">{c.company}</div>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-7 w-7 flex-none place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
          <X variant="Linear" className="h-4 w-4" />
        </button>
      </div>

      {numbers.length ? (
        <ul className="mt-3 space-y-2">
          {numbers.map((n, i) => (
            <li key={n} className="squircle flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{i === 0 ? "Mobile" : "Alternate"}</div>
                <a href={`tel:${String(n).replace(/[^\d+]/g, "")}`} className="block select-all text-lg font-semibold tracking-[0.01em] text-foreground tabular hover:text-primary">
                  {prettyPhone(n)}
                </a>
              </div>
              <button type="button" onClick={() => copy(n)} title="Copy number" aria-label="Copy number" className="grid h-8 w-8 flex-none place-items-center rounded-full border border-line bg-card text-muted-foreground hover:text-primary">
                <Copy className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">No phone number on this record.</p>
      )}

      {c.email && (
        <a href={`mailto:${c.email}`} className="mt-2 flex items-center gap-2 truncate px-1 text-[12.5px] text-muted-foreground hover:text-primary">
          <Mail className="h-3.5 w-3.5 flex-none" /> {c.email}
        </a>
      )}

      <p className="mt-3 text-[11px] leading-4 text-muted-foreground">Dial it from your phone, or open it in a calling app on this computer.</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <a
          href={c.phone ? `tel:${String(c.phone).replace(/[^\d+]/g, "")}` : undefined}
          onClick={onClose}
          className="squircle flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-line text-[13px] font-medium text-foreground hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-40"
          aria-disabled={!c.phone}
        >
          <PhoneOutgoing className="h-4 w-4 text-muted-foreground" /> Calling app
        </a>
        <a
          href={c.phone ? `https://wa.me/${waNumber(c.phone)}` : undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="squircle flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-success-text text-[13px] font-medium text-white hover:opacity-90 aria-disabled:pointer-events-none aria-disabled:opacity-40"
          aria-disabled={!c.phone}
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
      </div>
    </div>
  )
}
