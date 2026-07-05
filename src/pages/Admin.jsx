import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  FileText,
  Settings,
  Search,
  Bell,
  ChevronLeft,
  ChevronRight,
  LogOut,
  ChevronDown,
} from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import logoImg from "../assets/logo.png"

// ─── Page Components ────────────────────────────────────────────────────────────
import DashboardPage from "./admin/DashboardPage"
import OrdersPage from "./admin/OrdersPage"
import ProductsPage from "./admin/ProductsPage"
import CustomersPage from "./admin/CustomersPage"
import AnalyticsPage from "./admin/AnalyticsPage"
import InvoicesPage from "./admin/InvoicesPage"
import SettingsPage from "./admin/SettingsPage"

// ─── Navigation Config ──────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    title: "MENU",
    items: [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { key: "analytics", label: "Report", icon: BarChart3 },
      { key: "products", label: "Products", icon: Package },
      { key: "customers", label: "Consumer", icon: Users },
    ]
  },
  {
    title: "FINANCIAL",
    items: [
      { key: "orders", label: "Transactions", icon: ShoppingCart },
      { key: "invoices", label: "Invoices", icon: FileText },
    ]
  },
  {
    title: "TOOLS",
    items: [
      { key: "settings", label: "Settings", icon: Settings },
    ]
  }
]

const PAGE_MAP = {
  dashboard: DashboardPage,
  orders: OrdersPage,
  products: ProductsPage,
  customers: CustomersPage,
  analytics: AnalyticsPage,
  invoices: InvoicesPage,
  settings: SettingsPage,
}

export default function Admin() {
  useDocumentMetadata(
    "Ortex Admin Panel",
    "Admin control panel for Ortex Industries."
  )

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeNav, setActiveNav] = useState("dashboard")
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  useEffect(() => {
    const handleClick = () => setShowProfileMenu(false)
    if (showProfileMenu) {
      document.addEventListener("click", handleClick)
      return () => document.removeEventListener("click", handleClick)
    }
  }, [showProfileMenu])

  const ActivePage = PAGE_MAP[activeNav] || DashboardPage

  return (
    <div className="flex h-screen overflow-hidden font-sans bg-[#F4F6FA] text-slate-800" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Sidebar ── */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 72 : 260 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative flex flex-col h-full z-30 overflow-hidden flex-shrink-0 bg-white border-r border-slate-200"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 bg-white">
          <img
            src={logoImg}
            alt="Ortex Logo"
            className={`object-contain flex-shrink-0 transition-all duration-300 ${sidebarCollapsed ? "h-7 w-7" : "h-9"}`}
          />
          {!sidebarCollapsed && (
            <span className="font-extrabold text-base tracking-tight text-slate-900">Ortex Admin</span>
          )}
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto py-5 px-4 space-y-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1.5">
              {!sidebarCollapsed && (
                <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase px-3 pb-1">
                  {group.title}
                </p>
              )}
              {group.items.map((item) => {
                const isActive = activeNav === item.key
                const Icon = item.icon
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveNav(item.key)}
                    className={`relative flex items-center gap-3.5 w-full rounded-xl transition-all duration-200 group cursor-pointer
                      ${sidebarCollapsed ? "justify-center px-0 py-3" : "px-4.5 py-3"}
                      ${isActive ? "bg-[#3559E2] text-white font-semibold shadow-md shadow-blue-500/10" : "text-slate-500 hover:text-slate-950 hover:bg-slate-50"}`}
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    <AnimatePresence>
                      {!sidebarCollapsed && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: "auto" }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={{ duration: 0.15 }}
                          className="text-[13px] font-medium whitespace-nowrap overflow-hidden"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* User profile (sidebar bottom) */}
        <div className="border-t border-slate-100 p-4 shrink-0 bg-slate-50/50">
          <div className={`flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : ""}`}>
            <div className="w-8.5 h-8.5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-black">
              OI
            </div>
            {!sidebarCollapsed && (
              <div className="overflow-hidden whitespace-nowrap">
                <p className="text-slate-800 text-xs font-bold leading-none">Ortex Industries</p>
                <p className="text-slate-400 text-[10px] font-bold mt-1 uppercase">Owner</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Collapse Toggle Chevron */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute top-5.5 -right-3 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors z-45 shadow-sm cursor-pointer"
        >
          {sidebarCollapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
        </button>
      </motion.aside>

      {/* ── Main View Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between px-8 py-4 bg-white border-b border-slate-150/60 z-20 flex-shrink-0">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight capitalize">
              {activeNav === "dashboard" ? "Sales Report" : activeNav}
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-semibold">
              {new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Header controls (DealDeck style) */}
            <button className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all cursor-pointer border border-slate-100 text-slate-600">
              <Search size={16} />
            </button>

            <button className="relative p-2 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all group cursor-pointer border border-slate-100 text-slate-600">
              <Bell size={16} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full" />
            </button>

            {/* Profile Menu Trigger */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowProfileMenu(!showProfileMenu) }}
                className="flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer border border-slate-150 bg-white"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-[10px] font-black">
                  OI
                </div>
                <span className="text-xs font-bold text-slate-700 hidden md:block">Ortex Industries</span>
                <ChevronDown size={12} className="text-slate-400" />
              </button>

              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden z-50 py-1"
                  >
                    <button
                      onClick={() => { setActiveNav("settings"); setShowProfileMenu(false) }}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <Settings size={14} />
                      <span>Settings</span>
                    </button>
                    <div className="border-t border-slate-100" />
                    <button className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-semibold text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer">
                      <LogOut size={14} />
                      <span>Sign out</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-8 bg-[#F4F6FA] scroll-smooth">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeNav}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <ActivePage />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
