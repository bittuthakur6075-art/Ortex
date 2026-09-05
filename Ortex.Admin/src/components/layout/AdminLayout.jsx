import { useState, useEffect, useRef, useMemo } from "react"
import { NavLink, Outlet, useNavigate, useLocation, Link } from "react-router-dom"
import {
  Inbox,
  LayoutDashboard,
  Users,
  Package,
  FileText,
  ReceiptIndianRupee,
  Settings,
  UserTag,
  LogOut,
  Menu,
  X,
  TrendingUp,
  Instagram,
  PhoneOutgoing,
  Search,
} from "../ui/Icons"
import { logout, useAuth, useAuthReady, currentEmail } from "../../lib/auth"
import { useProfile } from "../../hooks/useProfile"
import { NotificationsDrawer } from "./NotificationsDrawer"
import { CommandPalette } from "./CommandPalette"
import { canAccess } from "../../data/domain/modules"
import { syncLocalToSupabase } from "../../data/store/sync"
import { cn } from "../../lib/cn"

// Metronic 9 Demo 1 shell: fixed 260px white sidebar with a right hairline
// (70px logo row, 32px menu items, uppercase section headings), a 70px white
// header carrying the breadcrumb and the icon actions + avatar, content on a
// white canvas padded 24px, and a footer line.

const ROLE_LABEL = { admin: "Admin", sales: "Sales Executive" }
const SIDEBAR_W = "w-[260px]"
const SIDEBAR_PAD = "lg:pl-[260px]"

// Grouped navigation. `key` / `keys` map each item to a module so the sidebar
// hides what a user isn't allowed to access.
const NAV = [
  { section: null, items: [{ to: "/", end: true, key: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    section: "Sales",
    items: [
      { to: "/crm", keys: ["enquiries", "voice-leads"], label: "Enquiries", icon: Inbox },
      { to: "/customers", key: "customers", label: "Customers", icon: Users },
      { to: "/catalog", keys: ["products", "categories", "work"], label: "Catalog", icon: Package },
      { to: "/quotations", key: "quotations", label: "Quotations", icon: FileText },
      { to: "/billing", keys: ["invoices", "payments"], label: "Billing", icon: ReceiptIndianRupee },
    ],
  },
  {
    section: "Marketing",
    items: [
      { to: "/social", key: "social", label: "Social", icon: Instagram },
      { to: "/telecaller", key: "telecaller", label: "Call agent", icon: PhoneOutgoing },
      { to: "/insights", keys: ["growth", "automation"], label: "Insights", icon: TrendingUp },
    ],
  },
  {
    section: "Admin",
    items: [
      { to: "/users", key: "users", label: "Users", icon: UserTag },
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

function Brand() {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-2.5 focus:outline-none">
      <img src="/img/logo.svg" alt="Ortex Industries" className="h-8 w-auto flex-none object-contain" />
      {ENV_LABEL && <span className="rounded bg-warning/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning-text">{ENV_LABEL}</span>}
    </Link>
  )
}

// Metronic menu: 32px rows, 8px radius, 14px medium; heading 12px uppercase.
function NavItems({ groups, onNavigate }) {
  return (
    <nav className="flex flex-col">
      {groups.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {group.section && (
            <div className="mb-[8px] mt-[18px] px-6 text-[12px] font-medium uppercase leading-none text-muted-foreground/70">{group.section}</div>
          )}
          {group.items.map(({ to, end, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "group relative flex h-10 items-center gap-2.5 border-r-[3px] px-6 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent text-secondary-foreground hover:bg-accent",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn("h-5 w-5 flex-none", isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
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

// Header avatar with the account popover (profile, settings, sign out).
function AccountMenu({ onSignOut }) {
  const profile = useProfile()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const email = profile?.email || currentEmail() || ""
  const name = profile?.name || email || "Account"
  const role = profile ? ROLE_LABEL[profile.role] || profile.role : ""
  const photo = profile?.avatar_url || ""

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
        className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-primary text-[13px] font-semibold text-white ring-2 ring-success ring-offset-2 ring-offset-card"
      >
        {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : (name || "?").slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 mt-2.5 w-64 rounded-card border border-border bg-card p-2 shadow-overlay-lg animate-pop-in">
          <div className="flex items-center gap-3 px-2 py-2">
            <span className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-white">
              {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : (name || "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
              {role && <span className="mt-1 inline-flex h-5 items-center rounded bg-primary/10 px-1.5 text-[11px] font-medium text-primary">{role}</span>}
            </div>
          </div>
          <div className="my-1.5 h-px bg-border" />
          <NavLink to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-secondary-foreground hover:bg-accent">
            <Users variant="Linear" className="h-4 w-4 text-muted-foreground" /> My profile
          </NavLink>
          {canAccess(profile, "settings") && (
            <NavLink to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-secondary-foreground hover:bg-accent">
              <Settings variant="Linear" className="h-4 w-4 text-muted-foreground" /> Settings
            </NavLink>
          )}
          <div className="my-1.5 h-px bg-border" />
          <button onClick={() => { setOpen(false); onSignOut() }} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-secondary-foreground hover:bg-accent">
            <LogOut variant="Linear" className="h-4 w-4 text-muted-foreground" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

// Breadcrumb for the header: "Section › Page" from the nav config.
function Breadcrumb({ groups }) {
  const { pathname } = useLocation()
  const match = useMemo(() => {
    for (const g of groups) for (const it of g.items) if (it.end ? pathname === it.to : pathname.startsWith(it.to)) return { section: g.section, item: it }
    return null
  }, [groups, pathname])
  if (!match) return null
  return (
    <nav className="hidden items-center gap-1.5 text-sm lg:flex" aria-label="Breadcrumb">
      {match.section && (
        <>
          <span className="text-muted-foreground">{match.section}</span>
          <span className="text-muted-foreground/60">›</span>
        </>
      )}
      <span className="font-medium text-foreground">{match.item.label}</span>
    </nav>
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

  const sidebarBody = (onNavigate) => (
    <div className="scroll-thin flex-1 overflow-y-auto pb-6 pt-[50px]">
      <NavItems groups={groups} onNavigate={onNavigate} />
    </div>
  )

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className={cn("no-print fixed inset-y-0 left-0 z-20 hidden shrink-0 flex-col items-stretch bg-card lg:flex", SIDEBAR_W)}>
        <div className="flex h-[70px] flex-none items-center border-b border-border px-6">
          <Brand />
        </div>
        {sidebarBody()}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className={cn("absolute inset-y-0 left-0 flex flex-col bg-card shadow-overlay-lg", SIDEBAR_W)}>
            <div className="flex h-[70px] items-center justify-between border-b border-border px-6">
              <Brand />
              <button onClick={() => setMobileOpen(false)} className="squircle grid h-[30px] w-[30px] place-items-center rounded-btn-sm text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            {sidebarBody(() => setMobileOpen(false))}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className={cn("flex min-h-screen w-full flex-col", SIDEBAR_PAD)}>
        <header className="no-print sticky top-0 z-10 flex h-[70px] flex-none items-center gap-3 border-l border-border bg-card px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="squircle grid h-10 w-10 place-items-center rounded-btn-md text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="Open menu"
          >
            <Menu variant="Linear" className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <Breadcrumb groups={groups} />

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="squircle grid h-10 w-10 place-items-center rounded-btn-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Search (Ctrl K)"
              title="Search (Ctrl K)"
            >
              <Search variant="Linear" className="h-[18px] w-[18px]" />
            </button>
            <NotificationsDrawer />
            <div className="ml-1.5">
              <AccountMenu onSignOut={handleLogout} />
            </div>
          </div>
        </header>

        <main className="w-full grow px-6 pt-5">
          <Outlet />
        </main>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 px-6 py-5 text-[13px] text-muted-foreground">
          <span>
            {new Date().getFullYear()} © <span className="text-foreground">Ortex Industries</span>
          </span>
          <div className="flex items-center gap-4">
            <Link to="/settings" className="hover:text-primary">Settings</Link>
            <Link to="/users" className="hover:text-primary">Users</Link>
            <a href="https://ortexindustries.in" target="_blank" rel="noreferrer" className="hover:text-primary">Website</a>
          </div>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} pages={pages} />
    </div>
  )
}
