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
  IndianRupee,
  Instagram,
  PhoneOutgoing,
  Search,
  Sparkles,
  CalendarClock,
  MessageCircle,
  Plus,
  ArrowDownLeft,
  Wallet,
  UserCheck,
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
import { roleLabel } from "../../lib/roles"
import { cn } from "../../lib/cn"
// The one version number: bump package.json and the sidebar follows. A named
// import lets Vite inline just this field rather than the whole manifest.
import { version as APP_VERSION } from "../../../package.json"

// The shell (Figma "V3 · Settings, minimal sidebar and slim top bar"): a 232px
// sidebar with Dashboard and Team chat, the modules under section headings,
// and Settings plus the account at the bottom; a 56px top bar
// with search (Ctrl K), "+ New", Anu and notifications. A person only ever sees
// the modules they can open.

const SIDEBAR_W = "w-[232px]"
const SIDEBAR_PAD = "lg:pl-[232px]"

// `key` / `keys` map each item to a module so the sidebar hides what a user
// isn't allowed to open, and a section with nothing left loses its heading.
// Ordered by use: what everyone opens first, then quote-to-cash in the order
// the work flows (lead, quote, bill, customer, and the call agent that works
// the leads), then marketing, people and admin.
const PRIMARY = [
  { to: "/", end: true, key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/chat", key: "chat", label: "Team chat", icon: MessageCircle, badge: "chat" },
]
// A section holds ONE kind of thing, so a person looking for something knows
// which heading to open before they read the items. Selling, then what we sell,
// then how we reach people, then people, then who administers it.
const SECTIONS = [
  {
    section: "Sales",
    items: [
      { to: "/crm", keys: ["enquiries", "voice-leads"], label: "Leads", icon: Inbox, also: ["/enquiries/"] },
      { to: "/quotations", key: "quotations", label: "Quotations", icon: FileText },
      { to: "/billing", keys: ["invoices", "payments"], label: "Billing", icon: ReceiptIndianRupee },
      { to: "/customers", key: "customers", label: "Customers", icon: Users },
    ],
  },
  // The catalogue is product data, not marketing. It used to sit under a
  // "Marketing" heading beside the Instagram page, which is where nobody looked
  // for a product.
  {
    section: "Catalogue",
    items: [{ to: "/catalog", keys: ["products", "categories", "work"], label: "Products & work", icon: Package }],
  },
  // Reaching people, and what came of it. The call agent worked leads from under
  // "Sales" while marketing sat elsewhere; both are outbound, and Insights is
  // what they are judged by, so the three belong together.
  {
    section: "Growth",
    items: [
      { to: "/telecaller", key: "telecaller", label: "Call agent", icon: PhoneOutgoing },
      { to: "/marketing", key: "social", label: "Marketing", icon: Instagram },
      { to: "/insights", keys: ["insights", "attendance-team"], label: "Insights", icon: TrendingUp },
    ],
  },
  // Three items, not one hub: everyone's attendance, the pay run (a different
  // permission entirely, is_payroll(), never implied by admin), and your own
  // records. They were stacked in one page where a person hunting their own
  // payslip walked past the whole company's register.
  {
    section: "People",
    items: [
      { to: "/attendance", key: "attendance", label: "Attendance", icon: CalendarClock },
      { to: "/payroll", key: "payroll", label: "Payroll", icon: IndianRupee },
      { to: "/my-records", key: "attendance", label: "My records", icon: UserCheck },
    ],
  },
  {
    section: "Admin",
    items: [{ to: "/users", key: "users", label: "Users", icon: UserTag }],
  },
]
// Everything the Super Admin configures, in one place (was /settings plus
// /modules plus two tabs inside Attendance).
const SETTINGS_ITEM = { to: "/control", key: "settings", label: "Control centre", icon: Settings }
// Not in the sidebar, but still found by search (Ctrl K).
const SEARCH_ONLY = [{ to: "/my-records?tab=payslips", key: "payslips", label: "My payslips", icon: ReceiptIndianRupee }]

// "+ New": what the person can create, each opening that page's editor.
const NEW_ITEMS = [
  { label: "Quotation", key: "quotations", to: "/quotations", icon: FileText, hotkey: "q" },
  { label: "Invoice", key: "invoices", to: "/billing?tab=invoices", icon: ReceiptIndianRupee, hotkey: "i" },
  { label: "Payment", key: "payments", to: "/billing?tab=payments", icon: Wallet, hotkey: "p" },
  { label: "Customer", key: "customers", to: "/customers", icon: Users, hotkey: "c" },
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
    return {
      primary: PRIMARY.filter(allowed),
      sections: SECTIONS.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length),
      settings: allowed(SETTINGS_ITEM) ? SETTINGS_ITEM : null,
      searchOnly: SEARCH_ONLY.filter(allowed),
    }
  }, [profile])
}

function Brand() {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Link to="/" className="flex min-w-0 items-center focus:outline-none">
        <img src="/img/logo.svg" alt="Ortex Industries" className="h-7 w-auto flex-none object-contain" />
      </Link>
      {ENV_LABEL && <span className="rounded bg-warning/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning-text">{ENV_LABEL}</span>}
      <Link
        to="/whats-new"
        title="What's new"
        className="squircle ml-auto rounded-[10px] bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular hover:text-primary"
      >
        {APP_VERSION.replace(/\.0$/, "")}
      </Link>
    </div>
  )
}

// One 38px row, 10px radius; active is a soft primary tint. `also` lists other
// path prefixes that belong to the same item (a lead's own page under Leads).
function NavRow({ to, end, label, icon: Icon, count = 0, also, onNavigate }) {
  const { pathname } = useLocation()
  const alsoActive = Boolean(also?.some((p) => pathname.startsWith(p)))
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive: hit }) =>
        cn(
          "squircle group flex h-[38px] items-center gap-[11px] rounded-[10px] px-2.5 text-[13.5px] transition-colors",
          hit || alsoActive ? "bg-primary/10 font-semibold text-primary" : "font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
        )
      }
    >
      {({ isActive: hit }) => (
        <>
          <Icon className={cn("h-[19px] w-[19px] flex-none", hit || alsoActive ? "text-primary" : "text-subtle-foreground group-hover:text-foreground")} />
          <span className="flex-1 truncate">{label}</span>
          {count > 0 && (
            <span
              className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1.5 text-[10.5px] font-semibold text-primary-foreground"
              aria-label={`${count} unread`}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function NavList({ nav, onNavigate }) {
  // Unread chat messages, as a count on the Team chat row (muted chats excluded).
  const { unread } = useChatInbox()

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {nav.primary.map((it) => (
        <NavRow key={it.to} to={it.to} end={it.end} label={it.label} icon={it.icon} count={it.badge === "chat" ? unread : 0} also={it.also} onNavigate={onNavigate} />
      ))}
      {nav.sections.map((g) => (
        <div key={g.section} className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-subtle-foreground">{g.section}</div>
          {g.items.map((it) => (
            <NavRow key={it.to} to={it.to} end={it.end} label={it.label} icon={it.icon} also={it.also} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  )
}

// Close a popover on an outside click or Escape.
function useDismiss(open, setOpen, ref, onKey) {
  useEffect(() => {
    if (!open) return undefined
    const down = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const key = (e) => {
      if (e.key === "Escape") setOpen(false)
      else onKey?.(e)
    }
    document.addEventListener("mousedown", down)
    document.addEventListener("keydown", key)
    return () => {
      document.removeEventListener("mousedown", down)
      document.removeEventListener("keydown", key)
    }
  }, [open, setOpen, ref, onKey])
}

// "+ New": a small menu of what this person can create. Each item opens the
// page with { create: true }, which the page answers by opening its editor.
function NewMenu() {
  const profile = useProfile()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const items = useMemo(() => NEW_ITEMS.filter((it) => canAccess(profile, it.key)), [profile])
  const go = (it) => {
    setOpen(false)
    navigate(it.to, { state: { create: true } })
  }
  // While open, the item's letter picks it.
  const onKey = (e) => {
    const hit = items.find((it) => it.hotkey === e.key.toLowerCase())
    if (hit) {
      e.preventDefault()
      go(hit)
    }
  }
  useDismiss(open, setOpen, ref, onKey)
  if (!items.length) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="squircle flex h-9 items-center gap-1.5 rounded-xl bg-primary pl-2.5 pr-2 text-[13.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        <Plus variant="Linear" className="h-4 w-4" />
        <span className="hidden sm:inline">New</span>
        <ArrowDownLeft className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="squircle absolute right-0 z-30 mt-2 w-60 rounded-xl border border-border bg-card p-1.5 shadow-overlay-lg animate-pop-in">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => go(it)}
              className="squircle flex h-[38px] w-full items-center gap-[11px] rounded-[10px] px-2.5 text-left text-[13.5px] font-medium text-foreground hover:bg-accent"
            >
              <it.icon className="h-[18px] w-[18px] flex-none text-primary" />
              <span className="flex-1">{it.label}</span>
              <kbd className="rounded-md bg-secondary px-1.5 text-[11px] font-semibold uppercase text-subtle-foreground">{it.hotkey}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// The account card at the foot of the sidebar, with its popover (profile,
// what's new, sign out) opening upwards.
function AccountMenu({ onSignOut, onNavigate }) {
  const profile = useProfile()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const email = profile?.email || currentEmail() || ""
  const name = profile?.name || email || "Account"
  const role = profile ? roleLabel(profile.role) : ""
  const photo = profile?.avatar_url || ""
  useDismiss(open, setOpen, ref)
  const close = () => {
    setOpen(false)
    onNavigate?.()
  }
  const initial = (name || "?").slice(0, 1).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="squircle flex w-full items-center gap-2.5 rounded-xl bg-subtle p-2.5 text-left transition-colors hover:bg-accent"
      >
        <span className="grid h-[34px] w-[34px] flex-none place-items-center overflow-hidden rounded-full bg-primary text-[12px] font-semibold text-white">
          {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-foreground">{name}</span>
          {role && <span className="block truncate text-[11.5px] font-medium text-info-text">{role}</span>}
        </span>
        <ArrowDownLeft className={cn("h-3.5 w-3.5 flex-none text-subtle-foreground transition-transform", !open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-card border border-border bg-card p-2 shadow-overlay-lg animate-pop-in">
          {email && <p className="truncate px-2 pb-1.5 pt-1 text-xs text-muted-foreground">{email}</p>}
          <NavLink to="/profile" onClick={close} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-secondary-foreground hover:bg-accent">
            <Users variant="Linear" className="h-4 w-4 text-muted-foreground" /> My profile
          </NavLink>
          <NavLink to="/whats-new" onClick={close} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-secondary-foreground hover:bg-accent">
            <Sparkles variant="Linear" className="h-4 w-4 text-muted-foreground" /> What's new
          </NavLink>
          <div className="my-1.5 h-px bg-border" />
          <button
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-secondary-foreground hover:bg-accent"
          >
            <LogOut variant="Linear" className="h-4 w-4 text-muted-foreground" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default function AdminLayout() {
  const authed = useAuth()
  const navigate = useNavigate()
  useDarkMode()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const nav = useAllowedNav()
  const ready = useAuthReady()
  // Anu lives in the shell, so a conversation survives every route change.
  const anu = useAnuController()

  // Search reaches every page this person can open, including those under More.
  const pages = useMemo(
    () => [
      ...nav.primary.map((it) => ({ to: it.to, label: it.label, icon: it.icon, section: "General" })),
      ...nav.sections.flatMap((g) => g.items.map((it) => ({ to: it.to, label: it.label, icon: it.icon, section: g.section }))),
      ...nav.searchOnly.map((it) => ({ to: it.to, label: it.label, icon: it.icon, section: "General" })),
      ...(nav.settings ? [{ to: nav.settings.to, label: nav.settings.label, icon: nav.settings.icon, section: "Admin" }] : []),
    ],
    [nav],
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
    <div className="scroll-thin flex-1 overflow-y-auto px-3 pb-4 pt-2">
      <NavList nav={nav} onNavigate={onNavigate} />
    </div>
  )

  // Pinned under the scrolling nav: Settings (Super Admin) and the account.
  const sidebarFoot = (onNavigate) => (
    <div className="flex flex-none flex-col gap-1.5 px-3 pb-3 pt-1">
      {nav.settings && <NavRow to={nav.settings.to} label={nav.settings.label} icon={nav.settings.icon} onNavigate={onNavigate} />}
      <AccountMenu onSignOut={handleLogout} onNavigate={onNavigate} />
    </div>
  )

  return (
    <AnuProvider value={anu}>
      <div className="flex min-h-screen bg-background text-foreground">
        {/* Desktop sidebar */}
        <aside className={cn("no-print fixed inset-y-0 left-0 z-20 hidden shrink-0 flex-col items-stretch border-r border-border bg-card lg:flex", SIDEBAR_W)}>
          <div className="flex h-14 flex-none items-center px-5">
            <Brand />
          </div>
          {sidebarBody()}
          {sidebarFoot()}
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setMobileOpen(false)} />
            <aside className={cn("absolute inset-y-0 left-0 flex flex-col bg-card shadow-overlay-lg", SIDEBAR_W)}>
              <div className="flex h-14 items-center gap-2 px-5">
                <Brand />
                <button
                  onClick={() => setMobileOpen(false)}
                  className="squircle grid h-[30px] w-[30px] flex-none place-items-center rounded-btn-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {sidebarBody(() => setMobileOpen(false))}
              {sidebarFoot(() => setMobileOpen(false))}
            </aside>
          </div>
        )}

        {/* Main column */}
        {/* On a wide screen the page makes room for Anu instead of hiding under her. */}
        <div className={cn("flex min-h-screen w-full flex-col transition-[padding] duration-200", SIDEBAR_PAD, anu.open && "xl:pr-[400px]")}>
          <header className="no-print sticky top-0 z-10 flex h-14 flex-none items-center gap-2.5 border-b border-border bg-card px-4 lg:px-6">
            <button
              onClick={() => setMobileOpen(true)}
              className="squircle grid h-10 w-10 flex-none place-items-center rounded-btn-md text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
              aria-label="Open menu"
            >
              <Menu variant="Linear" className="h-5 w-5" />
            </button>

            {/* Search looks like a field, so every page stays one keystroke away
                while the sidebar shows only the everyday modules. */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="squircle flex h-[38px] min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-background px-3 text-left text-[13.5px] text-subtle-foreground transition-colors hover:bg-accent sm:max-w-[420px]"
              aria-label="Search (Ctrl K)"
            >
              <Search variant="Linear" className="h-[17px] w-[17px] flex-none" />
              <span className="flex-1 truncate">Search customers, quotes, pages…</span>
              <kbd className="hidden rounded-md bg-card px-1.5 py-0.5 text-[11px] font-medium sm:inline">Ctrl K</kbd>
            </button>

            <div className="ml-auto flex items-center gap-1.5">
              <NewMenu />
              <AnuHeaderButton />
              <NotificationsDrawer />
            </div>
          </header>

          <main className="w-full grow px-6 pt-5">
            <Outlet />
          </main>

          {/* Hidden (html.own-footer) while a page shows its own StickyActionBar. */}
          <footer className="site-footer mt-10 flex flex-wrap items-center justify-between gap-3 px-6 py-5 text-[13px] text-muted-foreground">
            <span>
              {new Date().getFullYear()} © <span className="text-foreground">Ortex Industries</span>
            </span>
            <a href="https://bizgift.ortexindustries.in" target="_blank" rel="noreferrer" className="hover:text-primary">
              Website
            </a>
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
