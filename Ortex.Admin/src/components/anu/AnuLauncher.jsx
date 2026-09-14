import { Mic, MicOff } from "../ui/Icons"
import { Kbd } from "../ui/Ui"
import { cn } from "../../lib/cn"
import AnuFace from "./AnuFace"
import { useAnu } from "./AnuContext"
import { clock, moodOf, statusText } from "./status"

// The header's way in: Anu's face and "Ask Anu", with the shortcut beside it.
// While a conversation is live the face carries a green dot, so a person who
// minimised her can see at a glance that the mic is still open.
export function AnuHeaderButton() {
  const anu = useAnu()
  if (!anu) return null
  const { open, toggle, session } = anu
  const live = session.status === "live" || session.status === "connecting"
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={open}
      aria-label="Ask Anu (Ctrl J)"
      title="Ask Anu (Ctrl J)"
      className={cn(
        "squircle mr-1 flex h-10 items-center gap-2 rounded-btn-md pl-1.5 pr-1.5 text-sm font-semibold transition-colors sm:pr-3",
        open ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
      )}
    >
      <span className="relative">
        <AnuFace size={28} ring={false} />
        {live && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-success ring-2 ring-card" />}
      </span>
      <span className="hidden sm:inline">Ask Anu</span>
      <Kbd className="hidden xl:inline-flex">Ctrl J</Kbd>
    </button>
  )
}

// A live conversation with the panel minimised: a small pill bottom-right with
// her reacting face, what she is doing, the clock, mute and Done. Clicking the
// pill brings the panel back.
export function AnuMiniCall() {
  const anu = useAnu()
  if (!anu) return null
  const { open, setOpen, session } = anu
  const live = session.status === "live" || session.status === "connecting"
  if (open || !live) return null
  const mood = moodOf(session)
  return (
    <div className="no-print fixed bottom-6 right-6 z-30 flex items-center gap-1 rounded-full border border-border bg-card p-1.5 pr-2 shadow-overlay-lg animate-pop-in">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full pr-2 text-left transition-colors hover:bg-accent"
        aria-label="Open Anu"
      >
        <AnuFace size={30} mood={mood} readLevel={session.readLevel} />
        <span className="leading-tight">
          <span className="block text-[13px] font-semibold text-foreground">{statusText(session)}</span>
          <span className="tabular block text-xs text-muted-foreground">Anu · {clock(session.seconds)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={session.toggleMute}
        aria-pressed={session.muted}
        aria-label={session.muted ? "Unmute" : "Mute"}
        title={session.muted ? "Unmute" : "Mute"}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full transition-colors",
          session.muted ? "bg-destructive/10 text-destructive-text hover:bg-destructive/15" : "bg-info/10 text-info-text hover:bg-info/15",
        )}
      >
        {session.muted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
      </button>
      <button
        type="button"
        onClick={session.hangUp}
        className="h-9 rounded-full bg-destructive-strong px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-destructive-text"
      >
        Done
      </button>
    </div>
  )
}
