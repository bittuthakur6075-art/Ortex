import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Plus, Pencil, X, Users } from "../ui/Icons"
import { Avatar, Button, Input } from "../ui/Ui"
import { newCustomer } from "../../data/domain/schema"
import CustomerFields from "./CustomerFields"
import { cn } from "../../lib/cn"
import { stateName } from "../../lib/gstStates"
import { cleanPhoneInput } from "../../lib/validateCustomer"

// Customer selection for quotations and invoices (Acctual / Xero / Square
// pattern): one searchable combobox with "Create new customer" as the first
// option, then matches by name, company, email, phone or GSTIN. A chosen
// customer collapses to a compact card with Edit / Change; the full field
// grid is shown only for a new customer or when editing details.
//
// `value` is the document's customer snapshot; `onChange(customer)`.
// `errors` / `warnings` (validateDocument's, keyed name, phone, ...) keep the
// field grid open while a detail needs fixing.
export default function CustomerPicker({ value, onChange, customers = [], errors = {}, warnings = {} }) {
  const hasCustomer = Boolean(value?.name || value?.company)
  const hasErrors = Object.keys(errors).length > 0
  const [editing, setEditing] = useState(!hasCustomer && Boolean(value?.email || value?.phone || value?.gstin))
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [cursor, setCursor] = useState(0)
  const ref = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const MAX_MATCHES = 200

  const { matches, totalCount } = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = [...customers].sort((a, b) => (a.company || a.name || "").localeCompare(b.company || b.name || ""))
    if (!s) {
      return { matches: list.slice(0, MAX_MATCHES), totalCount: list.length }
    }
    const filtered = list.filter((c) =>
      [c.name, c.company, c.email, c.phone, c.gstin].filter(Boolean).some((v) => v.toLowerCase().includes(s))
    )
    return { matches: filtered.slice(0, MAX_MATCHES), totalCount: filtered.length }
  }, [customers, q])

  // Option 0 is always "Create new customer"; options 1..n are matches.
  const optionCount = matches.length + 1

  const pick = (c) => {
    onChange({
      name: c.name || "",
      company: c.company || "",
      email: c.email || "",
      phone: c.phone || "",
      gstin: c.gstin || "",
      stateCode: c.stateCode || "",
      address: c.address || "",
    })
    setEditing(false)
    setOpen(false)
    setQ("")
  }

  const createNew = () => {
    const base = newCustomer()
    // Carry the typed text into the most likely field so nothing is retyped.
    const typed = q.trim()
    if (typed) {
      if (typed.includes("@")) base.email = typed.replace(/\s/g, "")
      else if (/^\+?\d[\d\s-]*$/.test(typed)) base.phone = cleanPhoneInput(typed)
      else if (/^[0-9]{2}[A-Za-z0-9]{13}$/.test(typed)) base.gstin = typed.toUpperCase()
      else base.name = typed
    }
    onChange(base)
    setEditing(true)
    setOpen(false)
    setQ("")
  }

  const clear = () => {
    onChange(newCustomer())
    setEditing(false)
    setQ("")
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const onKey = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true)
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setCursor((c) => Math.min(optionCount - 1, c + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (cursor === 0) createNew()
      else pick(matches[cursor - 1])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  useEffect(() => setCursor(matches.length ? 1 : 0), [q, matches.length])

  useEffect(() => {
    if (!open || !listRef.current) return
    const activeEl = listRef.current.querySelector('[data-active="true"]')
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" })
    }
  }, [cursor, open])

  // ---- Selected customer: compact card ------------------------------------
  if (hasCustomer && !editing && !hasErrors) {
    const title = value.company || value.name
    const sub = [value.company && value.name ? value.name : null, value.email || value.phone].filter(Boolean).join(" · ")
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-subtle/60 p-3">
        <Avatar name={title} className="h-10 w-10 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-foreground">{title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {sub || "No contact details"}
            {value.gstin && <> · GSTIN {value.gstin}</>}
            {value.stateCode && <> · {stateName(value.stateCode)}</>}
          </div>
          {value.address && <div className="mt-0.5 truncate text-xs text-muted-foreground">{value.address}</div>}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
        <Button type="button" variant="ghost" size="sm" icon onClick={clear} aria-label="Change customer" title="Change customer" className="text-muted-foreground">
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  // ---- New customer / editing details: full grid --------------------------
  if (editing || (hasCustomer && hasErrors)) {
    return (
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">{hasCustomer ? "Editing details for this document only." : "New customer - details are saved with the document."}</p>
          <button type="button" onClick={hasCustomer ? () => setEditing(false) : clear} className="text-[13px] font-medium text-primary hover:underline">
            {hasCustomer ? "Done" : "Choose existing instead"}
          </button>
        </div>
        <CustomerFields value={value} onChange={onChange} errors={errors} warnings={warnings} />
      </div>
    )
  }

  // ---- Empty: combobox ---------------------------------------------------
  return (
    <div ref={ref} className="relative" data-path="customer.name">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search customers by name, company, email, phone or GSTIN…"
          className="h-10 pl-8"
          role="combobox"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          name="customer_search_query"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "customer-picker-error" : undefined}
        />
      </div>
      {errors.name && (
        <p id="customer-picker-error" className="mt-1 text-xs text-destructive-text">
          Choose a customer, or create a new one
        </p>
      )}
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-lg border border-border bg-card shadow-overlay-lg animate-pop-in">
          <ul ref={listRef} className="max-h-80 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                data-active={cursor === 0 ? "true" : undefined}
                onMouseEnter={() => setCursor(0)}
                onClick={createNew}
                className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] font-medium text-primary", cursor === 0 && "bg-muted")}
              >
                <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-primary/10"><Plus className="h-4 w-4" /></span>
                {q.trim() ? <>Create “{q.trim()}” as a new customer</> : "Create new customer"}
              </button>
            </li>
            {matches.length > 0 && (
              <li className="flex items-center justify-between px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-subtle-foreground">
                <span>{q.trim() ? "Matches" : "Customers"}</span>
                <span className="font-normal lowercase tracking-normal text-muted-foreground">
                  {matches.length === totalCount
                    ? `${totalCount} ${totalCount === 1 ? "customer" : "customers"}`
                    : `${matches.length} of ${totalCount}`}
                </span>
              </li>
            )}
            {matches.map((c, i) => {
              const title = c.company || c.name
              const active = cursor === i + 1
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    data-active={active ? "true" : undefined}
                    onMouseEnter={() => setCursor(i + 1)}
                    onClick={() => pick(c)}
                    className={cn("flex w-full items-center gap-3 px-3 py-2 text-left", active && "bg-muted")}
                  >
                    <Avatar name={title} className="h-7 w-7 text-[11px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">{title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[c.company && c.name ? c.name : null, c.email || c.phone, c.gstin ? `GSTIN ${c.gstin}` : null].filter(Boolean).join(" · ")}</span>
                    </span>
                  </button>
                </li>
              )
            })}
            {totalCount > matches.length && (
              <li className="border-t border-border bg-subtle/40 px-3 py-2 text-center text-xs text-muted-foreground">
                Showing first {matches.length} of {totalCount} customers. Type to narrow down.
              </li>
            )}
            {matches.length === 0 && q.trim() && (
              <li className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground"><Users className="h-4 w-4" /> No customers match “{q.trim()}”.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
