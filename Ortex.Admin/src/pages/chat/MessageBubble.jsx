import { useNavigate } from "react-router-dom"
import { Badge } from "../../components/ui/Ui"
import { ArrowRight, Pencil, Trash2, RefreshCw, X, Search, Users, FileText, Package, Inbox, Headset, Sparkles } from "../../components/ui/Icons"
import { cn } from "../../lib/cn"
import { clock, firstName, linkSegments, tickState } from "../../lib/chat"
import { routeFor } from "../../lib/anu"
import { Attachment, PersonAvatar, Ticks } from "./parts"

const EDIT_WINDOW_MS = 15 * 60 * 1000

const CARD_ICON = { customer: Users, quotation: FileText, product: Package, enquiry: Inbox, voice_call: Headset, page: Sparkles }

// One message. Mine sit right in the brand colour, everyone else's left on
// white, system lines centred, Anu's answers carry their record cards.
export default function MessageBubble({ item, conv, meId, members, replied, onReply, onEdit, onDelete, onRetry, onDiscard }) {
  const { message: m, runStart, runEnd } = item
  const mine = m.sender_id === meId && m.kind !== "assistant"
  const sender = members.get(m.sender_id)
  const isGroup = conv.kind === "group"

  if (m.kind === "system") {
    return (
      <div className="flex justify-center py-1.5">
        <span className="max-w-[80%] rounded-full bg-card/80 px-3 py-1 text-center text-xs text-muted-foreground">{m.body}</span>
      </div>
    )
  }

  const deleted = Boolean(m.deleted_at)
  const canEdit = mine && !deleted && !m.local && m.kind === "text" && m.body && Date.now() - Date.parse(m.created_at) < EDIT_WINDOW_MS
  const canDelete = mine && !deleted && !m.local

  return (
    <div className={cn("group flex items-end gap-2", mine ? "justify-end" : "justify-start", runStart ? "mt-3" : "mt-0.5")}>
      {!mine && isGroup && (
        <span className="w-8 flex-none">{runEnd && <PersonAvatar person={sender} size="h-8 w-8" />}</span>
      )}

      {mine && !deleted && !m.local && <Actions onReply={() => onReply(m)} onEdit={canEdit ? () => onEdit(m) : null} onDelete={canDelete ? () => onDelete(m) : null} />}

      <div
        className={cn(
          "relative max-w-[min(78%,560px)] rounded-2xl px-3 pb-1.5 pt-2 text-sm leading-relaxed",
          mine ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground",
          runEnd && (mine ? "rounded-br-md" : "rounded-bl-md"),
          m.local === "failed" && "opacity-80 ring-2 ring-destructive/40",
        )}
      >
        {!mine && isGroup && runStart && (
          <p className="mb-0.5 text-xs font-semibold text-primary">{sender ? firstName(sender.name) : "Former colleague"}</p>
        )}

        {replied && !deleted && (
          <div className={cn("mb-1.5 rounded-lg border-l-[3px] px-2.5 py-1.5 text-xs", mine ? "border-white/70 bg-white/15" : "border-primary bg-well")}>
            <p className={cn("font-semibold", mine ? "text-primary-foreground" : "text-primary")}>
              {replied.sender_id === meId ? "You" : firstName(members.get(replied.sender_id)?.name)}
            </p>
            <p className={cn("line-clamp-2", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {replied.deleted_at ? "This message was deleted" : replied.body || (replied.attachment ? replied.attachment.name || "Attachment" : "")}
            </p>
          </div>
        )}

        {deleted ? (
          <p className={cn("italic", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
            {mine ? "You deleted this message" : "This message was deleted"}
          </p>
        ) : (
          <>
            {m.attachment && <div className="mb-1"><Attachment att={m.attachment} mine={mine} /></div>}
            {m.body && <Body text={m.body} mine={mine} />}
            {m.kind === "assistant" && <AssistantExtras meta={m.meta} />}
          </>
        )}

        <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[11px]", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
          {m.edited_at && !deleted && <span>Edited</span>}
          <span className="tabular">{clock(m.created_at)}</span>
          {/* On the brand bubble "read" is full-strength white (two ticks), "sent" stays dimmed (one). */}
          {mine && !deleted && <Ticks state={tickState(m, conv, meId)} className={cn(tickState(m, conv, meId) === "read" && "text-primary-foreground")} />}
        </div>

        {m.local === "failed" && (
          <div className="mt-1.5 flex items-center gap-3 border-t border-white/20 pt-1.5 text-xs">
            <span className="flex-1">{m.error || "Not sent."}</span>
            <button type="button" onClick={() => onRetry(m)} className="inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="h-3.5 w-3.5" /> Retry</button>
            <button type="button" onClick={() => onDiscard(m)} className="inline-flex items-center gap-1 hover:underline"><X className="h-3.5 w-3.5" /> Discard</button>
          </div>
        )}
      </div>

      {!mine && !deleted && !m.local && <Actions onReply={() => onReply(m)} />}
    </div>
  )
}

function Body({ text, mine }) {
  return (
    <p className="whitespace-pre-wrap break-words">
      {linkSegments(text).map((s, i) =>
        s.href ? (
          <a key={i} href={s.href} target="_blank" rel="noreferrer noopener" className={cn("underline underline-offset-2", mine ? "text-primary-foreground" : "text-primary")}>
            {s.text}
          </a>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  )
}

function AssistantExtras({ meta }) {
  const navigate = useNavigate()
  const cards = meta?.cards || []
  const stats = meta?.stats || []
  if (!cards.length && !stats.length) return null
  const open = (card) => {
    if (card.kind === "page") return navigate(card.to)
    const target = routeFor(card.kind, card.id)
    if (target) navigate(target.to, target.state ? { state: target.state } : undefined)
  }
  return (
    <div className="mt-2 space-y-2">
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-well px-2.5 py-1.5">
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
              <p className="text-[13px] font-semibold tabular text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      )}
      {cards.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          {cards.map((card, i) => {
            const Icon = CARD_ICON[card.kind] || Search
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => open(card)}
                className={cn("group/card flex w-full items-center gap-2.5 bg-card px-3 py-2 text-left transition-colors hover:bg-primary/5", i > 0 && "border-t border-border")}
              >
                <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-well text-muted-foreground group-hover/card:text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-foreground">{card.title}</span>
                    {card.flag === "support" && <Badge tone="rose">Support</Badge>}
                    {card.flag === "urgent" && <Badge tone="amber">Urgent</Badge>}
                  </span>
                  {card.subtitle && <span className="block truncate text-xs text-muted-foreground">{card.subtitle}</span>}
                </span>
                <ArrowRight variant="Linear" className="h-4 w-4 flex-none text-subtle-foreground group-hover/card:text-primary" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Hover actions beside a bubble: reply for any message, edit and delete for mine.
function Actions({ onReply, onEdit, onDelete }) {
  const btn = "grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-primary"
  return (
    <div className="flex flex-none items-center gap-0.5 self-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      <button type="button" className={btn} onClick={onReply} title="Reply" aria-label="Reply">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></svg>
      </button>
      {onEdit && <button type="button" className={btn} onClick={onEdit} title="Edit" aria-label="Edit"><Pencil className="h-4 w-4" /></button>}
      {onDelete && <button type="button" className={cn(btn, "hover:text-destructive")} onClick={onDelete} title="Delete for everyone" aria-label="Delete for everyone"><Trash2 className="h-4 w-4" /></button>}
    </div>
  )
}
