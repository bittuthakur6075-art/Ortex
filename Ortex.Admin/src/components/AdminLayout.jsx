import { useState, useEffect, useRef, useMemo } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  Target,
  Inbox,
  Users,
  Package,
  Tags,
  LayoutGrid,
  FileText,
  ReceiptIndianRupee,
  Wallet,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  Flame,
  TrendingUp,
  Bell,
  Instagram,
} from "./icons"
import { logout, useAuth, useAuthReady, currentEmail } from "../lib/auth"
import { useProfile } from "../data/profile"
import { canAccess } from "../data/modules"
import { useCollections } from "../data/hooks"
import { OPEN_LEAD_STAGES } from "../data/schema"
import { daysUntil } from "../lib/format"
import { cn } from "../lib/cn"

const ROLE_LABEL = { admin: "Admin", sales: "Sales Executive" }

// Top-right account menu (Minimal-style popover): avatar → profile card + links.
function AccountMenu({ onSignOut }) {
  const profile = useProfile()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const email = profile?.email || currentEmail() || ""
  const name = profile?.name || email
  const role = profile ? ROLE_LABEL[profile.role] || profile.role : ""

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className={cn(
          "flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary ring-2 transition-all hover:bg-primary/15",
          open ? "ring-primary/40" : "ring-transparent",
        )}
      >
        {(name || "?").slice(0, 1).toUpperCase()}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 origin-top-right rounded-2xl border border-border bg-card p-1.5 shadow-xl shadow-black/10">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-foreground">{name || "My Profile"}</p>
            {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
            {role && (
              <span className="mt-2 inline-flex items-center rounded-md bg-primary/12 px-2 py-0.5 text-[11px] font-semibold leading-5 text-primary">
                {role}
              </span>
            )}
          </div>
          <div className="my-1 h-px bg-border" />
          <NavLink
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Users className="h-4 w-4 text-muted-foreground" /> Profile
          </NavLink>
          {canAccess(profile, "settings") && (
            <NavLink
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Settings className="h-4 w-4 text-muted-foreground" /> Settings
            </NavLink>
          )}
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => { setOpen(false); onSignOut() }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

// Top-nav notifications: a bell + Minimal popover, driven by real signals
// (new website enquiries and overdue lead follow-ups).
function Notifications() {
  const { data } = useCollections(["enquiries", "leads"])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const items = useMemo(() => {
    const out = []
    for (const e of data.enquiries || []) {
      if (e.status === "new") {
        out.push({
          id: `enq-${e.id}`,
          to: "/enquiries",
          title: "New enquiry",
          body: e.customer?.name || e.customer?.company || "New website enquiry",
          when: e.createdAt,
        })
      }
    }
    for (const l of data.leads || []) {
      if (OPEN_LEAD_STAGES.includes(l.stage) && l.nextFollowUp && daysUntil(l.nextFollowUp) < 0) {
        out.push({
          id: `lead-${l.id}`,
          to: "/leads",
          title: "Follow-up overdue",
          body: l.customer?.name || l.customer?.company || "Lead follow-up is overdue",
          when: l.nextFollowUp,
        })
      }
    }
    return out.sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0)).slice(0, 8)
  }, [data])

  const count = items.length

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${count ? ` (${count})` : ""}`}
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 origin-top-right rounded-2xl border border-border bg-card p-1.5 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {count > 0 && (
              <span className="inline-flex items-center rounded-md bg-primary/12 px-2 py-0.5 text-[11px] font-semibold leading-5 text-primary">
                {count} new
              </span>
            )}
          </div>
          <div className="my-1 h-px bg-border" />
          {count === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">You're all caught up.</div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {items.map((n) => (
                <NavLink
                  key={n.id}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className="flex gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted"
                >
                  <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-primary" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{n.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{n.body}</span>
                  </span>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Grouped navigation — the console spans CRM, catalog and sales, so section
// labels keep the growing sidebar scannable. `key` maps each item to a module
// so the sidebar can hide what a user isn't allowed to access.
const NAV = [
  { section: null, items: [{ to: "/", end: true, key: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    section: "CRM",
    items: [
      { to: "/leads", key: "leads", label: "Leads", icon: Target },
      { to: "/enquiries", key: "enquiries", label: "Enquiries", icon: Inbox },
      { to: "/customers", key: "customers", label: "Customers", icon: Users },
    ],
  },
  {
    section: "Catalog",
    items: [
      { to: "/products", key: "products", label: "Products", icon: Package },
      { to: "/categories", key: "categories", label: "Categories", icon: Tags },
      { to: "/work", key: "work", label: "Work", icon: LayoutGrid },
    ],
  },
  {
    section: "Sales",
    items: [
      { to: "/quotations", key: "quotations", label: "Quotations", icon: FileText },
      { to: "/invoices", key: "invoices", label: "Invoices", icon: ReceiptIndianRupee },
      { to: "/payments", key: "payments", label: "Payments", icon: Wallet },
    ],
  },
  {
    section: "Automation",
    items: [
      { to: "/social", key: "social", label: "Social", icon: Instagram },
      { to: "/automation", key: "automation", label: "Automation", icon: Flame },
      { to: "/growth", key: "growth", label: "Growth", icon: TrendingUp },
    ],
  },
  {
    section: "System",
    items: [
      { to: "/users", key: "users", label: "Users", icon: ShieldCheck },
      { to: "/settings", key: "settings", label: "Settings", icon: Settings },
    ],
  },
]

function useDarkMode() {
  useEffect(() => {
    document.documentElement.classList.remove("dark")
    localStorage.setItem("ortex_admin_theme", "light")
  }, [])
  return [false, () => {}]
}

// Non-production environments (e.g. Staging on Vercel) set VITE_ENV_LABEL so the
// console shows an unmistakable badge — prevents test actions on the wrong env.
const ENV_LABEL = import.meta.env.VITE_ENV_LABEL || ""

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5 focus:outline-none">
      <img src="/img/logo.svg" alt="Ortex Industries" className="h-8 w-auto object-contain" />
      <div className="flex flex-col leading-none border-l border-border pl-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Admin console</span>
      </div>
      {ENV_LABEL && (
        <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-300">
          {ENV_LABEL}
        </span>
      )}
    </NavLink>
  )
}

function NavItems({ onNavigate }) {
  const profile = useProfile()
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((it) => canAccess(profile, it.key)) })).filter(
    (g) => g.items.length,
  )
  return (
    <nav className="flex flex-col gap-4">
      {groups.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-1">
          {group.section && (
            <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{group.section}</span>
          )}
          {group.items.map(({ to, end, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" aria-hidden="true" />
                  )}
                  <Icon className={cn("h-5 w-5 flex-none", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

import { syncLocalToSupabase } from "../data/sync"

export default function AdminLayout() {
  const authed = useAuth()
  const navigate = useNavigate()
  useDarkMode()
  const [mobileOpen, setMobileOpen] = useState(false)

  const ready = useAuthReady()

  useEffect(() => {
    if (ready && !authed) navigate("/login", { replace: true })
  }, [ready, authed, navigate])

  useEffect(() => {
    if (authed) {
      syncLocalToSupabase()
    }
  }, [authed])

  // Wait for the session to resolve before deciding — avoids a login flash on refresh.
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }
  if (!authed) return null

  const handleLogout = () => {
    logout()
    navigate("/login", { replace: true })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-[60px] items-center border-b border-border px-5">
          <Brand />
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto p-4">
          <NavItems />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-card">
            <div className="flex h-[60px] items-center justify-between border-b border-border px-5">
              <Brand />
              <button onClick={() => setMobileOpen(false)} className="text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto p-4">
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-border bg-white px-4 sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Notifications />
            <AccountMenu onSignOut={handleLogout} />
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
