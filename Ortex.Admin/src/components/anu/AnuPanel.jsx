import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle, ArrowRight, ArrowUp, CheckCircle2, Clock, FileText, Headset, Inbox, IndianRupee, Mic, MicOff,
  Minus, Package, RefreshCw, Search, Sparkles, TrendingUp, Users,
} from "../ui/Icons"
import { Badge, Button, CloseButton, Kbd } from "../ui/Ui"
import { useCollections } from "../../hooks/useCollection"
import { attentionCounts } from "../../lib/anu"
import { cn } from "../../lib/cn"
import AnuFace from "./AnuFace"
import { useAnu } from "./AnuContext"
import { clock, moodOf, statusText } from "./status"

/* ============================================================
   AnuPanel: the team's voice assistant, docked to the right of the console.

   DESIGN, from Mobbin references (2026-09-14):
   · Asana's AI panel: docked beside the work rather than over it, opening on
     a greeting and a "For you" list built from the person's own data, so the
     first question costs one click and teaches what she can do.
   · Apollo "Ask Apollo" and HoneyBook: a full-height side panel with the
     answer beside the page it is about; on a wide screen the page makes room
     instead of hiding under it.
   · ElevenLabs and Hume voice agents: one reactive visual at the head of the
     conversation, the transcript as the content, a type-instead box, and a
     compact mute/end control pair.
   · Fireflies AskFred: an assistant's work shown as steps ("Searched
     quotations · 4 found") with the records as rows you can open.
   Ortex's own additions: records Anu finds are cards that open the page
   WITHOUT ending the conversation; a write she proposes waits on a Confirm /
   Cancel card; and a minimised live call keeps a small pill on screen.
   Flat, hairline-edged surfaces; no drop shadow except the overlay token.
   ============================================================ */

const PANEL_W = "sm:w-[400px]"

const KIND = {
  quotation: { icon: FileText, label: "Quotation" },
  customer: { icon: Users, label: "Customer" },
  enquiry: { icon: Inbox, label: "Enquiry" },
  voice_call: { icon: Headset, label: "Anu call" },
  product: { icon: Package, label: "Product" },
}

const TOOL_ICON = {
  get_briefing: Clock,
  find_customers: Users,
  find_enquiries: Inbox,
  find_quotations: FileText,
  get_quotation: FileText,
  find_products: Package,
  sales_summary: TrendingUp,
  set_enquiry_status: CheckCircle2,
  start_quotation: FileText,
  open_record: ArrowRight,
}

// General questions, always offered. Hinglish, as she speaks.
const ASK = [
  { icon: TrendingUp, label: "Is mahine ki sales", ask: "Is mahine sales kaisi chal rahi hai?" },
  { icon: FileText, label: "Pending quotations", ask: "Kaunse quotations decision ka wait kar rahe hain?" },
  { icon: Users, label: "Customer dhoondo", ask: "Mujhe ek customer dhoondna hai." },
  { icon: IndianRupee, label: "Price check karo", ask: "Mujhe ek product ka price check karna hai." },
]

export default function AnuPanel() {
  const anu = useAnu()
  const { open, setOpen, session, profile } = anu
  const first = (profile?.name || "").trim().split(/\s+/)[0]
  const live = session.status === "connecting" || session.status === "live"
  const started = session.status !== "idle"

  // Escape minimises the panel; a live conversation carries on in the pill.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog], .fixed.inset-0.z-50")) setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, setOpen])

  if (!open) return null

  const closePanel = () => {
    if (live) session.hangUp()
    setOpen(false)
  }

  return (
    <aside
      className={cn(
        "no-print fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l border-border bg-card animate-drawer-in",
        PANEL_W,
      )}
      aria-label="Anu, voice assistant"
    >
      {/* Head: aligned with the console's 70px header */}
      <div className="flex h-[70px] flex-none items-center gap-3 border-b border-border px-5">
        <div className="relative">
          <AnuFace size={36} ring={false} />
          <span
            className={cn(
              "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-card",
              session.status === "live" ? "bg-success" : session.status === "connecting" ? "bg-warning" : session.status === "error" ? "bg-destructive" : "bg-border-strong",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-foreground">Anu</p>
          <p className="truncate text-xs text-muted-foreground" aria-live="polite">
            {statusText(session)}
            {(session.status === "live" || session.status === "ended") && session.seconds > 0 && (
              <span className="tabular"> · {clock(session.seconds)}</span>
            )}
          </p>
        </div>
        <Kbd className="hidden sm:inline-flex">Ctrl J</Kbd>
        {live && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Minimise, keep talking"
            title="Minimise, keep talking"
            className="squircle grid h-[30px] w-[30px] flex-none place-items-center rounded-btn-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Minus variant="Linear" className="h-[18px] w-[18px]" />
          </button>
        )}
        <CloseButton onClick={closePanel} label={live ? "End and close" : "Close"} />
      </div>

      {started ? <Conversation first={first} /> : <Welcome first={first} />}
    </aside>
  )
}

// ---- idle ----------------------------------------------------------------------

function Welcome({ first }) {
  const { ask, session } = useAnu()
  const a = session.access
  const wantsData = a.enquiries || a.voice || a.quotations
  const { data, loading } = useCollections(wantsData ? ["enquiries", "quotations"] : [])
  const counts = useMemo(
    () => attentionCounts({ enquiries: data.enquiries || [], quotations: data.quotations || [] }, {
      ...a,
      enquiries: a.enquiries && !!data.enquiries,
      voice: a.voice && !!data.enquiries,
      quotations: a.quotations && !!data.quotations,
    }),
    [data, a],
  )

  // "For you": only questions with something behind them, most urgent first.
  const forYou = [
    counts.support > 0 && { tone: "danger", icon: AlertTriangle, text: `${counts.support} support ${counts.support === 1 ? "call" : "calls"} to return`, ask: "Kaunse support calls return karne hain?" },
    counts.callsToReturn > 0 && { tone: "primary", icon: Headset, text: `${counts.callsToReturn} Anu ${counts.callsToReturn === 1 ? "call" : "calls"} nobody has returned`, ask: "Anu ki kaunsi calls abhi tak return nahi hui?" },
    counts.newEnquiries > 0 && { tone: "primary", icon: Inbox, text: `${counts.newEnquiries} new ${counts.newEnquiries === 1 ? "enquiry" : "enquiries"} waiting`, ask: "Mere new enquiries batao." },
    counts.expiring > 0 && { tone: "warning", icon: Clock, text: `${counts.expiring} ${counts.expiring === 1 ? "quotation" : "quotations"} expiring or lapsed`, ask: "Kaunse quotations expire hone wale hain ya ho chuke hain?" },
    counts.waiting > 0 && { tone: "muted", icon: FileText, text: `${counts.waiting} sent a week ago, no decision`, ask: "Kaunse quotations ek hafte se decision ka wait kar rahe hain?" },
  ].filter(Boolean)

  return (
    <>
      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center animate-card-in">
          <AnuFace size={104} mood="idle" />
          <h2 className="mt-3 text-[22px] font-semibold leading-tight tracking-tight text-foreground">
            Namaste{first ? `, ${first}` : ""}
          </h2>
          <p className="mt-1.5 max-w-[300px] text-sm text-muted-foreground">
            Leads, quotations, customers ya prices: bas poochiye. Main dhoondh ke yahin khol dungi.
          </p>
        </div>

        {wantsData && (
          <Section title="For you">
            {loading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => <div key={i} className="h-[52px] animate-pulse rounded-2xl bg-well" />)}
              </div>
            ) : forYou.length ? (
              <div className="space-y-2">
                {forYou.map((item, i) => (
                  <SuggestionRow key={item.text} item={item} index={i} onClick={() => ask(item.ask)} />
                ))}
                <button
                  type="button"
                  onClick={() => ask("Aaj mere liye kya pending hai? Poora briefing do.")}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-medium text-primary transition-colors hover:bg-primary/5"
                >
                  <Sparkles className="h-4 w-4" /> Full briefing for today
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-well px-3.5 py-3">
                <CheckCircle2 className="h-5 w-5 flex-none text-success" />
                <p className="text-[13px] text-muted-foreground">Nothing waiting on you right now.</p>
              </div>
            )}
          </Section>
        )}

        <Section title="Ask Anu">
          <div className="grid grid-cols-2 gap-2">
            {ASK.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => ask(q.ask)}
                className="group flex min-h-[72px] flex-col items-start justify-between gap-2 rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
              >
                <q.icon className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                <span className="text-[13px] font-medium leading-tight text-foreground">{q.label}</span>
              </button>
            ))}
          </div>
        </Section>

        <p className="px-6 pb-6 pt-1 text-center text-xs text-subtle-foreground">
          Anu reads only what your access allows, and asks before changing anything.
        </p>
      </div>

      <Composer idle />
    </>
  )
}

function Section({ title, children }) {
  return (
    <section className="px-5 pb-5">
      <h3 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-subtle-foreground">{title}</h3>
      {children}
    </section>
  )
}

const ROW_TONE = {
  danger: "bg-destructive/10 text-destructive-text",
  warning: "bg-warning/12 text-warning-text",
  primary: "bg-primary/10 text-primary",
  muted: "bg-well text-muted-foreground",
}

function SuggestionRow({ item, index, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${index * 40}ms` }}
      className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left transition-colors animate-row-in hover:border-primary/30 hover:bg-primary/5"
    >
      <span className={cn("grid h-8 w-8 flex-none place-items-center rounded-xl", ROW_TONE[item.tone])}>
        <item.icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">{item.text}</span>
      <ArrowRight variant="Linear" className="h-4 w-4 flex-none text-subtle-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  )
}

// ---- conversation ------------------------------------------------------------

function Conversation({ first }) {
  const { session } = useAnu()
  const scrollRef = useRef(null)
  const stickRef = useRef(true)
  const mood = moodOf(session)

  // Follow the conversation unless the person has scrolled up to read.
  const onScroll = () => {
    const el = scrollRef.current
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [session.turns, session.partial, session.pendingAction])

  return (
    <>
      <div ref={scrollRef} onScroll={onScroll} className="scroll-thin flex-1 overflow-y-auto">
        {/* Stage */}
        <div className="flex flex-col items-center border-b border-border px-6 pb-5 pt-6">
          <AnuFace size={76} mood={mood} readLevel={session.readLevel} />
          <p className={cn("mt-1 text-sm font-medium", mood === "error" ? "text-destructive-text" : "text-foreground")}>
            {statusText(session)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {session.status === "connecting" && "Mic aur Anu ko jod rahe hain"}
            {session.status === "live" && (session.muted ? "Mic off hai. Type karke poochiye." : "Boliye, ya neeche type kijiye")}
            {session.status === "ended" && `${clock(session.seconds)} ki baat-cheet`}
            {session.status === "error" && "Neeche dekhiye"}
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          {session.turns.map((turn) => <Turn key={turn.id} turn={turn} />)}
          {session.partial.user && <UserBubble text={session.partial.user} partial />}
          {session.partial.anu && <AnuLine text={session.partial.anu} partial />}
          {session.thinking && !session.partial.anu && session.status === "live" && <Thinking />}
          {session.status === "live" && !session.turns.length && !session.partial.anu && !session.thinking && (
            <p className="text-center text-[13px] text-subtle-foreground">Anu {first ? `${first} ji` : "aap"} ko greet kar rahi hai…</p>
          )}
        </div>
      </div>

      {session.pendingAction && <PendingAction />}
      {session.status === "error" && <ErrorBar />}
      {session.status === "ended" ? <EndedBar /> : session.status !== "error" && <Composer />}
    </>
  )
}

function Turn({ turn }) {
  if (turn.role === "user") return <UserBubble text={turn.text} typed={turn.typed} />
  if (turn.role === "anu") return <AnuLine text={turn.text} />
  return <ToolStep turn={turn} />
}

function UserBubble({ text, partial, typed }) {
  return (
    <div className="flex justify-end animate-row-in">
      <div
        className={cn(
          "max-w-[85%] rounded-[18px] rounded-br-md bg-primary/10 px-3.5 py-2 text-sm text-foreground",
          partial && "opacity-60",
        )}
      >
        {text}
        {typed && <span className="sr-only"> (typed)</span>}
      </div>
    </div>
  )
}

function AnuLine({ text, partial }) {
  return (
    <div className="flex gap-2.5 animate-row-in">
      <AnuFace size={24} ring={false} className="mt-0.5" />
      <p className={cn("min-w-0 flex-1 text-sm leading-relaxed text-foreground", partial && "text-muted-foreground")}>
        {text}
        {partial && <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-primary" />}
      </p>
    </div>
  )
}

function Thinking() {
  return (
    <div className="flex items-center gap-2.5 pl-[34px] text-[13px] text-muted-foreground animate-fade-in">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </span>
      Dekh rahi hoon
    </div>
  )
}

function ToolStep({ turn }) {
  const { session } = useAnu()
  const Icon = TOOL_ICON[turn.tool] || (turn.tool === "cancel" ? MinusIconSafe : Search)
  const [expanded, setExpanded] = useState(false)
  const cards = turn.cards || []
  const shown = expanded ? cards : cards.slice(0, 3)
  return (
    <div className="pl-[34px] animate-row-in">
      <div className={cn("flex items-center gap-1.5 text-xs", turn.failed ? "text-destructive-text" : "text-muted-foreground")}>
        <Icon className="h-3.5 w-3.5" />
        <span>{turn.text}</span>
        {typeof turn.count === "number" && <span className="text-subtle-foreground">· {turn.count} found</span>}
      </div>

      {turn.stats?.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {turn.stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-well px-3 py-2">
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
              <p className="tabular text-sm font-semibold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {cards.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-2xl border border-border">
          {shown.map((card, i) => (
            <RecordCard key={card.key} card={card} onOpen={() => session.openCard(card)} first={i === 0} />
          ))}
          {cards.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="w-full border-t border-border py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
            >
              {expanded ? "Show fewer" : `Show ${cards.length - 3} more`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function MinusIconSafe(props) {
  return <Minus variant="Linear" {...props} />
}

function RecordCard({ card, onOpen, first }) {
  const meta = KIND[card.kind] || { icon: Search, label: "Record" }
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Open ${meta.label.toLowerCase()}`}
      className={cn(
        "group flex w-full items-center gap-3 bg-card px-3 py-2.5 text-left transition-colors hover:bg-primary/5",
        !first && "border-t border-border",
      )}
    >
      <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-well text-muted-foreground group-hover:text-primary">
        <meta.icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-foreground">{card.title}</span>
          {card.flag === "support" && <Badge tone="rose">Support</Badge>}
          {card.flag === "urgent" && <Badge tone="amber">Urgent</Badge>}
        </span>
        {card.subtitle && <span className="block truncate text-xs text-muted-foreground">{card.subtitle}</span>}
      </span>
      <ArrowRight variant="Linear" className="h-4 w-4 flex-none text-subtle-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  )
}

function PendingAction() {
  const { session } = useAnu()
  const p = session.pendingAction
  return (
    <div className="flex-none border-t border-border bg-warning/8 px-5 py-3.5 animate-row-in" role="alert">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-warning/15 text-warning-text">
          <AlertTriangle className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">Anu wants to: {p.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.detail}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={session.confirmAction} className="flex-1">Confirm</Button>
        <Button size="sm" variant="outline" onClick={session.cancelAction} className="flex-1">Cancel</Button>
      </div>
    </div>
  )
}

function ErrorBar() {
  const { session } = useAnu()
  return (
    <div className="flex-none space-y-3 border-t border-border px-5 py-4">
      <div className="flex items-start gap-2.5 rounded-xl bg-destructive/10 px-3.5 py-2.5 text-[13px] text-destructive-text">
        <AlertTriangle className="mt-px h-4 w-4 flex-none" />
        <span>{session.error || "Something went wrong."}</span>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => session.start()} className="flex-1"><RefreshCw className="h-4 w-4" /> Try again</Button>
        <Button variant="outline" onClick={session.reset}>Back</Button>
      </div>
    </div>
  )
}

function EndedBar() {
  const { session } = useAnu()
  const found = session.turns.reduce((n, t) => n + (t.cards?.length || 0), 0)
  return (
    <div className="flex-none border-t border-border px-5 py-4">
      <p className="mb-3 text-center text-xs text-muted-foreground">
        Conversation ended{found ? ` · ${found} ${found === 1 ? "record" : "records"} found above` : ""}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => session.start()} className="flex-1"><Mic className="h-4 w-4" /> Talk again</Button>
        <Button variant="outline" onClick={session.reset}>New</Button>
      </div>
    </div>
  )
}

// ---- composer --------------------------------------------------------------

function Composer({ idle = false }) {
  const { session, ask } = useAnu()
  const [text, setText] = useState("")
  const inputRef = useRef(null)
  const live = session.status === "live"
  const connecting = session.status === "connecting"

  const submit = (e) => {
    e?.preventDefault()
    const t = text.trim()
    if (!t) return
    if (idle) ask(t)
    else if (!session.sendText(t)) return
    setText("")
  }

  return (
    <form onSubmit={submit} className="flex-none border-t border-border p-4">
      <div className="flex items-center gap-2 rounded-[20px] border border-border bg-well p-1.5 pl-4 transition-colors focus-within:border-primary/40 focus-within:bg-card">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={idle ? "Type a question, or tap the mic" : connecting ? "Connecting…" : "Type instead of speaking"}
          disabled={connecting}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle-foreground disabled:opacity-60"
          aria-label="Message Anu"
        />
        {text.trim() ? (
          <Button type="submit" icon size="sm" aria-label="Send" className="rounded-full">
            <ArrowUp variant="Linear" className="h-4 w-4" />
          </Button>
        ) : idle ? (
          <Button type="button" size="sm" onClick={() => session.start()} className="rounded-full">
            <Mic variant="Bold" className="h-4 w-4" /> Talk
          </Button>
        ) : null}
      </div>

      {!idle && (
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={session.toggleMute}
            disabled={!live}
            squircle={false}
            // Light purple while the mic is open; light red while muted, so a
            // closed mic cannot be missed.
            className={cn(
              "flex-1 !rounded-[999px]",
              session.muted
                ? "!bg-destructive/10 !text-destructive-text hover:!bg-destructive/15"
                : "!bg-info/10 !text-info-text hover:!bg-info/15",
            )}
            aria-pressed={session.muted}
          >
            {session.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {session.muted ? "Unmute" : "Mute"}
          </Button>
          {/* Done ends the conversation, so it is red (owner's call, 2026-09-14). Both
              controls are pills rather than the kit's squircle. */}
          <Button type="button" variant="danger" onClick={session.hangUp} squircle={false} className="flex-1 !rounded-[999px]">
            Done
          </Button>
        </div>
      )}
    </form>
  )
}
