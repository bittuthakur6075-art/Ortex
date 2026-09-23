import { useEffect, useState } from "react"
import { Avatar } from "../../components/ui/Ui"
import { Users, FileText, Download } from "../../components/ui/Icons"
import { cn } from "../../lib/cn"
import { fileSize, isImage, peerOf } from "../../lib/chat"
import { fileUrl } from "../../services/chat"

export const ANU_PHOTO = "/img/anu.jpg"

// The round picture a conversation is known by: a colleague's photo (with a
// live dot when they are online), a group's glyph, or Anu's portrait.
export function ConversationAvatar({ conv, meId, online, size = "h-11 w-11" }) {
  if (conv?.kind === "assistant") {
    return (
      <span className={cn("relative inline-block flex-none", size)}>
        <img src={ANU_PHOTO} alt="Anu" className="h-full w-full rounded-full bg-primary/10 object-cover" />
        <span className="absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground ring-2 ring-card">AI</span>
      </span>
    )
  }
  if (conv?.kind === "group") {
    return (
      <span className={cn("grid flex-none place-items-center rounded-full bg-primary/10 text-primary", size)}>
        <Users className="h-1/2 w-1/2" />
      </span>
    )
  }
  const peer = peerOf(conv, meId)
  return <PersonAvatar person={peer} online={online?.has(peer?.id)} size={size} />
}

export function PersonAvatar({ person, online, size = "h-11 w-11" }) {
  return (
    <span className={cn("relative inline-block flex-none", size)}>
      <Avatar name={person?.name || "?"} src={person?.avatar_url} className="h-full w-full" />
      {online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-success ring-2 ring-card" aria-label="Online" />}
    </span>
  )
}

// WhatsApp's ticks: one grey (sent), two blue (read by everyone), a clock
// while sending. Drawn inline so their colour follows the bubble's text.
export function Ticks({ state, className }) {
  if (state === "pending") {
    return (
      <svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5", className)} aria-label="Sending">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (state === "failed") return null
  const read = state === "read"
  return (
    <svg viewBox="0 0 20 12" className={cn("h-3 w-[18px]", read && "text-info", className)} aria-label={read ? "Read" : "Sent"}>
      <path d="M1 6.5l3.5 3.5L11 2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {read && <path d="M8.5 9.5l.5.5L15.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

// A photo or file on a message. Stored files are private, so every view asks
// for a short-lived signed URL (cached in services/chat.js).
export function Attachment({ att, mine }) {
  const [url, setUrl] = useState(att?.localUrl || "")
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    if (!att?.path || !isImage(att)) return
    fileUrl(att.path).then((u) => alive && setUrl(u)).catch(() => alive && setFailed(true))
    return () => { alive = false }
  }, [att?.path, att])

  const open = async () => {
    if (!att?.path) return
    try {
      window.open(await fileUrl(att.path), "_blank", "noopener")
    } catch {
      setFailed(true)
    }
  }

  if (isImage(att) && !failed) {
    const ratio = att.width && att.height ? att.width / att.height : 4 / 3
    return (
      <button type="button" onClick={open} className="block overflow-hidden rounded-xl bg-muted" style={{ width: 280, maxWidth: "100%", aspectRatio: String(Math.min(2, Math.max(0.6, ratio))) }}>
        {url ? <img src={url} alt={att.name || "Photo"} className={cn("h-full w-full object-cover", att.uploading && "opacity-60")} /> : <span className="block h-full w-full animate-pulse bg-muted" />}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={!att?.path}
      className={cn(
        "flex w-[260px] max-w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
        mine ? "bg-white/15 hover:bg-white/25" : "bg-well hover:bg-muted",
      )}
    >
      <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg", mine ? "bg-white/20" : "bg-card text-primary")}>
        <FileText className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{att?.name || "File"}</span>
        <span className={cn("block text-xs", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
          {failed ? "Not available" : att?.uploading ? "Uploading…" : fileSize(att?.size)}
        </span>
      </span>
      {att?.path && <Download className="h-4 w-4 flex-none opacity-70" />}
    </button>
  )
}
