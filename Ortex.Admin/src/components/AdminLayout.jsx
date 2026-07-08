import { useState, useEffect } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  Target,
  Inbox,
  Users,
  Package,
  Tags,
  FileText,
  ReceiptIndianRupee,
  Wallet,
  Settings,
  ShieldCheck,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  Flame,
} from "./icons"
import { logout, useAuth, useAuthReady, currentEmail } from "../lib/auth"
import { useProfile } from "../data/profile"
import { canAccess } from "../data/modules"
import { cn } from "../lib/cn"

const ROLE_LABEL = { admin: "Admin", sales: "Sales Executive" }

// Signed-in user chip in the sidebar footer — links to the profile page.
function ProfileLink({ onNavigate }) {
  const profile = useProfile()
  const email = profile?.email || currentEmail() || ""
  const name = profile?.name || email
  return (
    <NavLink
      to="/profile"
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "mb-2 flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
          isActive ? "bg-primary/10" : "hover:bg-muted",
        )
      }
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {(name || "?").slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{name || "My Profile"}</span>
        <span className="block truncate text-xs text-muted-foreground">{profile ? ROLE_LABEL[profile.role] || profile.role : ""}</span>
      </span>
    </NavLink>
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
      { to: "/automation", key: "automation", label: "Automation", icon: Flame },
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
  const [dark, setDark] = useState(() => {
    if (localStorage.getItem("ortex_admin_theme") === "dark") return true
    if (localStorage.getItem("ortex_admin_theme") === "light") return false
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("ortex_admin_theme", dark ? "dark" : "light")
  }, [dark])
  return [dark, () => setDark((d) => !d)]
}

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5 focus:outline-none">
      <img src="/img/logo.svg" alt="Ortex Industries" className="h-8 w-auto object-contain" />
      <div className="flex flex-col leading-none border-l border-border pl-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Admin console</span>
      </div>
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
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="h-4.5 w-4.5" />
              {label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

export default function AdminLayout() {
  const authed = useAuth()
  const navigate = useNavigate()
  const [dark, toggleDark] = useDarkMode()
  const [mobileOpen, setMobileOpen] = useState(false)

  const ready = useAuthReady()

  useEffect(() => {
    if (ready && !authed) navigate("/login", { replace: true })
  }, [ready, authed, navigate])

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
        <div className="flex h-16 items-center border-b border-border px-5">
          <Brand />
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto p-4">
          <NavItems />
        </div>
        <div className="border-t border-border p-4">
          <ProfileLink />
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4.5 w-4.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-card">
            <div className="flex h-16 items-center justify-between border-b border-border px-5">
              <Brand />
              <button onClick={() => setMobileOpen(false)} className="text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto p-4">
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="border-t border-border p-4">
              <ProfileLink onNavigate={() => setMobileOpen(false)} />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4.5 w-4.5" />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-md sm:px-6">
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
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleDark}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
              aria-label="Toggle theme"
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
