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
  Sparkles,
  CalendarClock,
  IndianRupee,
  MessageCircle,
} from "../ui/Icons"
import { logout, useAuth, useAuthReady, currentEmail } from "../../lib/auth"
import { useProfile } from "../../hooks/useProfile"
import { NotificationsDrawer } from "./NotificationsDrawer"
import { CommandPalette } from "./CommandPalette"
import { AnuProvider, useAnuController } from "../anu/AnuContext"
import AnuPanel from "../anu/AnuPanel"
import { AnuHeaderButton, AnuMiniCall } from "../anu/AnuLauncher"
import ChatNotifier from "../chat/ChatNotifier"
import { useChatInbox } from "../../hooks/useChat"
import { canAccess } from "../../data/domain/modules"
import { cn } from "../../lib/cn"
// The one version number: bump package.json and the sidebar follows. A named
// import lets Vite inline just this field rather than the whole manifest.
import { version as APP_VERSION } from "../../../package.json"

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
  {
    section: null,
    items: [
      { to: "/", end: true, key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/chat", key: "chat", label: "Team chat", icon: MessageCircle, badge: "chat" },
    ],
  },
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
      { to: "/insights", keys: ["growth", "automation", "attendance-team"], label: "Insights", icon: TrendingUp },
    ],
  },
  {
    section: "People",
    items: [
      { to: "/attendance", key: "attendance", label: "Attendance", icon: CalendarClock },
      { to: "/payroll", key: "payroll", label: "Payroll", icon: IndianRupee },
      { to: "/payslips", key: "payslips", label: "My payslips", icon: ReceiptIndianRupee },
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
// console shows an unmistakable badge, prevents test actions on the wrong env.
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
  // Unread chat messages, as a count on the Team chat row (muted chats excluded).
  const { unread } = useChatInbox()
  const badges = { chat: unread }
  return (
    <nav className="flex flex-col">
      {groups.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {group.section && (
            <div className="mb-[8px] mt-[18px] px-6 text-[12px] font-medium uppercase leading-none text-muted-foreground/70">{group.section}</div>
          )}
          {group.items.map(({ to, end, label, icon: Icon, badge }) => (
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
                  {badge && badges[badge] > 0 && (
                    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground" aria-label={`${badges[badge]} unread`}>
                      {badges[badge] > 99 ? "99+" : badges[badge]}
                    </span>
                  )}
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
          <NavLink to="/whats-new" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-secondary-foreground hover:bg-accent">
            <Sparkles variant="Linear" className="h-4 w-4 text-muted-foreground" /> What's new
          </NavLink>
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
  // Anu lives in the shell, so a conversation survives every route change.
  const anu = useAnuController()

  const pages = useMemo(
    () => groups.flatMap((g) => g.items.map((it) => ({ to: it.to, label: it.label, icon: it.icon, section: g.section || "General" }))),
    [groups],
  )

  useEffect(() => {
    if (ready && !authed) navigate("/login", { replace: true })
  }, [ready, authed, navigate])

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

  // Wait for the session to resolve before deciding, avoids a login flash on refresh.
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

  // Pinned under the scrolling nav, so it stays at the bottom however long the
  // menu grows.
  const sidebarFoot = (
    <div className="flex h-12 flex-none items-center border-t border-border px-6 text-xs text-muted-foreground">
      Version <span className="ml-1 font-medium text-foreground tabular">{APP_VERSION}</span>
      <Link to="/whats-new" onClick={() => setMobileOpen(false)} className="ml-auto font-medium text-primary hover:underline">
        What's new
      </Link>
    </div>
  )

  return (
    <AnuProvider value={anu}>
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className={cn("no-print fixed inset-y-0 left-0 z-20 hidden shrink-0 flex-col items-stretch bg-card lg:flex", SIDEBAR_W)}>
        <div className="flex h-[70px] flex-none items-center border-b border-border px-6">
          <Brand />
        </div>
        {sidebarBody()}
        {sidebarFoot}
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
            {sidebarFoot}
          </aside>
        </div>
      )}

      {/* Main column */}
      {/* On a wide screen the page makes room for Anu instead of hiding under her. */}
      <div className={cn("flex min-h-screen w-full flex-col transition-[padding] duration-200", SIDEBAR_PAD, anu.open && "xl:pr-[400px]")}>
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
            <AnuHeaderButton />
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
            <a href="https://bizgift.ortexindustries.in" target="_blank" rel="noreferrer" className="hover:text-primary">Website</a>
          </div>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} pages={pages} />
      <AnuPanel />
      <AnuMiniCall />
      <ChatNotifier />
    </div>
    </AnuProvider>
  )
}
