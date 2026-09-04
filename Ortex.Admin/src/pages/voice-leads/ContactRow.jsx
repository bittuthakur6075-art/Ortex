import { MessageCircle, Phone } from "../../components/ui/Icons"
import { cn } from "../../lib/cn"
import { prettyPhone, waNumber } from "./helpers"

export default function ContactRow({ call, size = "md" }) {
  const phone = call.customer.phone
  if (!phone) {
    return (
      <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        No number captured, this lead cannot be called back
      </div>
    )
  }
  const wa = waNumber(phone)
  const pad = size === "sm" ? "px-3 py-1.5 text-xs" : "px-3 py-2 text-sm"
  return (
    <div className="flex gap-2">
      <a
        href={`https://wa.me/${wa}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`Message ${call.customer.name || "caller"} on WhatsApp`}
        className={cn(
          "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/12 font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/20",
          pad,
        )}
      >
        <MessageCircle className="h-4 w-4" /> WhatsApp
      </a>
      <a
        href={`tel:+${wa}`}
        aria-label={`Call ${call.customer.name || "caller"}`}
        className={cn(
          "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-muted font-semibold text-foreground transition-colors hover:bg-muted/70",
          pad,
        )}
      >
        <Phone className="h-4 w-4" /> {prettyPhone(phone)}
      </a>
    </div>
  )
}
