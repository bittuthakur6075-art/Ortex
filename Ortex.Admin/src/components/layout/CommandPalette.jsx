import { useState, useEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { Search, ArrowRight, Users, FileText, ReceiptIndianRupee } from "../ui/Icons"
import { Kbd } from "../ui/Ui"
import { useCollections } from "../../hooks/useCollection"
import { cn } from "../../lib/cn"

// Global search (Ctrl/⌘ K): jumps to a module, or straight to a customer,
// quotation or invoice by name / number. Results are grouped and keyboard
// navigable, in the style of Linear / Attio quick-open.

const MAX_PER_GROUP = 5

function score(hay, needle) {
  const h = (hay || "").toLowerCase()
  if (!h) return 0
  if (h.startsWith(needle)) return 3
  if (h.includes(` ${needle}`)) return 2
  if (h.includes(needle)) return 1
  return 0
}

export function CommandPalette({ open, onClose, pages }) {
  const navigate = useNavigate()
  const { data } = useCollections(open ? ["customers", "quotations", "invoices"] : [])
  const [q, setQ] = useState("")
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setQ("")
    setCursor(0)
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = []

    const pageHits = pages
      .map((p) => ({ ...p, s: needle ? score(p.label, needle) + score(p.section, needle) : 1 }))
      .filter((p) => p.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, needle ? MAX_PER_GROUP : 8)
    if (pageHits.length) out.push({ label: "Go to", items: pageHits.map((p) => ({ id: `page-${p.to}`, icon: p.icon, title: p.label, meta: p.section, to: p.to })) })

    if (needle.length >= 2) {
      const cust = (data.customers || [])
        .map((c) => ({ c, s: Math.max(score(c.name, needle), score(c.company, needle), score(c.email, needle), score(c.phone, needle)) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, MAX_PER_GROUP)
      if (cust.length) out.push({ label: "Customers", items: cust.map(({ c }) => ({ id: `cust-${c.id}`, icon: Users, title: c.name || c.company, meta: c.company && c.company !== c.name ? c.company : c.email, to: "/customers" })) })

      const docs = (list, kind, to, Icon) =>
        (list || [])
          .map((d) => ({ d, s: Math.max(score(d.number, needle), score(d.customer?.name, needle), score(d.customer?.company, needle)) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, MAX_PER_GROUP)
          .map(({ d }) => ({ id: `${kind}-${d.id}`, icon: Icon, title: d.number, meta: `${d.customer?.company || d.customer?.name || ""} · ${d.status}`, to }))
      const qh = docs(data.quotations, "qtn", "/quotations", FileText)
      const ih = docs(data.invoices, "inv", "/billing?tab=invoices", ReceiptIndianRupee)
      if (qh.length) out.push({ label: "Quotations", items: qh })
      if (ih.length) out.push({ label: "Invoices", items: ih })
    }
    return out
  }, [q, pages, data])

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useEffect(() => setCursor(0), [q])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${cursor}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [cursor])

  if (!open) return null

  const go = (item) => {
    onClose()
    navigate(item.to)
  }

  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setCursor((c) => Math.min(flat.length - 1, c + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === "Enter" && flat[cursor]) {
      e.preventDefault()
      go(flat[cursor])
    } else if (e.key === "Escape") {
      onClose()
    }
  }

  let index = -1

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-[rgb(15_23_42/0.45)] animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-overlay-lg animate-pop-in">
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 flex-none text-subtle-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search pages, customers, quotations, invoices…"
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-subtle-foreground"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} className="scroll-thin max-h-[52vh] overflow-y-auto py-2">
          {flat.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No matches for “{q}”.</p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="px-2 pb-1">
                <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-subtle-foreground">{g.label}</p>
                {g.items.map((it) => {
                  index += 1
                  const i = index
                  const Icon = it.icon
                  return (
                    <button
                      key={it.id}
                      type="button"
                      data-index={i}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => go(it)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
                        i === cursor ? "bg-muted text-foreground" : "text-foreground",
                      )}
                    >
                      {Icon && (
                        <span className="grid h-7 w-7 flex-none place-items-center rounded-md border border-border bg-card text-muted-foreground">
                          <Icon className="h-4 w-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{it.title}</span>
                        {it.meta && <span className="block truncate text-xs text-muted-foreground">{it.meta}</span>}
                      </span>
                      {i === cursor && <ArrowRight className="h-4 w-4 flex-none text-subtle-foreground" />}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-border bg-subtle/60 px-4 py-2 text-[11px] text-subtle-foreground">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
