import { useState, useEffect, useRef, useMemo } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  UserSearch,
  Users,
  Package,
  FileText,
  ReceiptIndianRupee,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  TrendingUp,
  Instagram,
  Phone,
  Search,
} from "../ui/Icons"
import { Kbd } from "../ui/Ui"
import { logout, useAuth, useAuthReady, currentEmail } from "../../lib/auth"
import { useProfile } from "../../hooks/useProfile"
import { NotificationsDrawer } from "./NotificationsDrawer"
import { CommandPalette } from "./CommandPalette"
import { canAccess } from "../../data/domain/modules"
import { syncLocalToSupabase } from "../../data/store/sync"
import { cn } from "../../lib/cn"

const ROLE_LABEL = { admin: "Admin", sales: "Sales Executive" }
const SIDEBAR_W = "w-[240px]"
const SIDEBAR_PAD = "lg:pl-[240px]"

// Grouped navigation. `key` / `keys` map each item to a module so the sidebar
// hides what a user isn't allowed to access.
const NAV = [
  { section: null, items: [{ to: "/", end: true, key: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    section: "CRM",
    items: [
      { to: "/crm", keys: ["leads", "enquiries", "voice-leads"], label: "CRM", icon: UserSearch },
      { to: "/customers", key: "customers", label: "Customers", icon: Users },
    ],
  },
  {
    section: "Catalog",
    items: [
      { to: "/catalog", keys: ["products", "categories", "work"], label: "Catalog", icon: Package },
    ],
  },
  {
    section: "Sales",
    items: [
      { to: "/quotations", key: "quotations", label: "Quotations", icon: FileText },
      { to: "/billing", keys: ["invoices", "payments"], label: "Billing", icon: ReceiptIndianRupee },
    ],
  },
  {
    section: "Automation",
    items: [
      { to: "/social", key: "social", label: "Social", icon: Instagram },
      { to: "/telecaller", key: "telecaller", label: "Telecaller", icon: Phone },
      { to: "/insights", keys: ["growth", "automation"], label: "Growth", icon: TrendingUp },
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

// Non-production environments (e.g. Staging on Vercel) set VITE_ENV_LABEL so the
// console shows an unmistakable badge — prevents test actions on the wrong env.
const ENV_LABEL = import.meta.env.VITE_ENV_LABEL || ""

function useDarkMode() {
  useEffect(() => {
    document.documentElement.classList.remove("dark")
    localStorage.setItem("ortex_admin_theme", "light")
  }, [])
}

function useAllowedNav() {
  const profile = useProfile()
  return useMemo(() => {
    const allowed = (it) => (it.keys ? it.keys.some((k) => canAccess(profile, k)) : canAccess(profile, it.key))
    return NAV.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length)
  }, [profile])
}

function Brand({ compact = false }) {
  return (
    <NavLink to="/" className="flex min-w-0 items-center gap-2.5 focus:outline-none">
      <img src="/img/logo.svg" alt="Ortex Industries" className="h-7 w-auto flex-none object-contain" />
      {!compact && (
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle-foreground">Console</span>
      )}
      {ENV_LABEL && (
        <span className="rounded-md bg-warning/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning-text">{ENV_LABEL}</span>
      )}
    </NavLink>
  )
}

function NavItems({ groups, onNavigate }) {
  return (
    <nav className="flex flex-col gap-4">
      {groups.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {group.section && (
            <span className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle-foreground">{group.section}</span>
          )}
          {group.items.map(({ to, end, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "group relative flex h-[34px] items-center gap-2.5 rounded-nav px-2.5 text-[13.5px] font-medium transition-colors duration-[100ms]",
                  isActive ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn("h-[18px] w-[18px] flex-none", isActive ? "text-primary" : "text-subtle-foreground group-hover:text-foreground")} />
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

// Pinned to the sidebar foot: avatar, name, role, with a popover for profile,
// settings and sign out (Fibery / GitBook pattern).
function UserCard({ onSignOut }) {
  const profile = useProfile()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const email = profile?.email || currentEmail() || ""
  const name = profile?.name || email || "Account"
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
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-full rounded-lg border border-border bg-card p-1 shadow-overlay-lg animate-pop-in">
          <div className="px-2.5 py-2">
            <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
            {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
          </div>
          <div className="my-1 h-px bg-border" />
          <NavLink to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-foreground hover:bg-muted">
            <Users className="h-4 w-4 text-muted-foreground" /> Profile
          </NavLink>
          {canAccess(profile, "settings") && (
            <NavLink to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-foreground hover:bg-muted">
              <Settings className="h-4 w-4 text-muted-foreground" /> Settings
            </NavLink>
          )}
          <div className="my-1 h-px bg-border" />
          <button onClick={() => { setOpen(false); onSignOut() }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-destructive-text hover:bg-destructive/10">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-card/70",
          open && "bg-card shadow-sm ring-1 ring-border",
        )}
      >
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-primary text-xs font-semibold text-white">
          {(name || "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">{name}</span>
          {role && <span className="block truncate text-[11px] text-muted-foreground">{role}</span>}
        </span>
      </button>
    </div>
  )
}

function SidebarBody({ groups, onNavigate, onSignOut }) {
  return (
    <>
      <div className="scroll-thin flex-1 overflow-y-auto px-3 pb-4 pt-2">
        <NavItems groups={groups} onNavigate={onNavigate} />
      </div>
      <div className="border-t border-border p-2">
        <UserCard onSignOut={onSignOut} />
      </div>
    </>
  )
}

export default function AdminLayout() {
  const authed = useAuth()
  const navigate = useNavigate()
  useDarkMode()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const groups = useAllowedNav()
  const ready = useAuthReady()

  const pages = useMemo(
    () => groups.flatMap((g) => g.items.map((it) => ({ to: it.to, label: it.label, icon: it.icon, section: g.section || "General" }))),
    [groups],
  )

  useEffect(() => {
    if (ready && !authed) navigate("/login", { replace: true })
  }, [ready, authed, navigate])

  useEffect(() => {
    if (authed) syncLocalToSupabase()
  }, [authed])

  // Ctrl/⌘ K opens global search from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Wait for the session to resolve before deciding — avoids a login flash on refresh.
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
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
      <aside className={cn("no-print fixed inset-y-0 left-0 z-30 hidden flex-col bg-card lg:flex", SIDEBAR_W)}>
        <div className="flex h-14 items-center px-4">
          <Brand />
        </div>
        <SidebarBody groups={groups} onSignOut={handleLogout} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[rgb(15_23_42/0.45)] animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className={cn("absolute inset-y-0 left-0 flex flex-col bg-card shadow-overlay-lg", SIDEBAR_W)}>
            <div className="flex h-14 items-center justify-between px-4">
              <Brand />
              <button onClick={() => setMobileOpen(false)} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarBody groups={groups} onNavigate={() => setMobileOpen(false)} onSignOut={handleLogout} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className={SIDEBAR_PAD}>
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <Brand compact />
          </div>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-subtle-foreground shadow-sm transition-colors hover:border-border-strong hover:text-foreground sm:ml-0 sm:w-[300px] sm:justify-start sm:gap-2.5 sm:px-3 lg:w-[360px]"
            aria-label="Search"
          >
            <Search className="h-4 w-4 flex-none" />
            <span className="hidden flex-1 text-left text-[13px] sm:block">Search customers, quotes, invoices…</span>
            <span className="hidden items-center gap-0.5 sm:flex"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
          </button>

          <div className="flex items-center gap-1 sm:ml-auto">
            <NotificationsDrawer />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} pages={pages} />
    </div>
  )
}
