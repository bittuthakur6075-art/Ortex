import { lazyWithRetry } from "./lib/lazyWithRetry"
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Toaster } from "sonner"
import AdminLayout from "./components/layout/AdminLayout"
import Login from "./pages/Login"
import { useProfile } from "./hooks/useProfile"
import { canAccess, MODULES } from "./data/domain/modules"
import { EmptyState } from "./components/ui/Ui"

// Every page is its own chunk, fetched the first time it is opened. The shell
// and Login stay in the main bundle, so signing in never waits on a download.
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"))
const NotFound = lazyWithRetry(() => import("./pages/NotFound"))
const CustomerDetail = lazyWithRetry(() => import("./pages/CustomerDetail"))
const EnquiryDetail = lazyWithRetry(() => import("./pages/EnquiryDetail"))
const Customers = lazyWithRetry(() => import("./pages/Customers"))
const Social = lazyWithRetry(() => import("./pages/Social"))
const Telecaller = lazyWithRetry(() => import("./pages/Telecaller"))
const Quotations = lazyWithRetry(() => import("./pages/Quotations"))
const SettingsPage = lazyWithRetry(() => import("./pages/Settings"))
const Users = lazyWithRetry(() => import("./pages/Users"))
const UserDetail = lazyWithRetry(() => import("./pages/users/UserDetail"))
const Profile = lazyWithRetry(() => import("./pages/Profile"))
const WhatsNew = lazyWithRetry(() => import("./pages/WhatsNew"))
const Attendance = lazyWithRetry(() => import("./pages/Attendance"))
const PayRun = lazyWithRetry(() => import("./pages/payroll/PayRun"))
const EmployeeProfile = lazyWithRetry(() => import("./pages/payroll/EmployeeProfile"))
const Chat = lazyWithRetry(() => import("./pages/Chat"))

// Route-level access gate, mirrors the sidebar filtering so a blocked module
// can't be reached by typing its URL. Redirects home while the profile loads
// or when access is denied.
function Guard({ moduleKey, children }) {
  const profile = useProfile()
  if (profile === null) return null
  if (!canAccess(profile, moduleKey)) return <NoAccess keys={[moduleKey]} />
  return children
}

// Said, not a silent bounce to the Dashboard: a bookmark or a shared link names
// the module it needs and who can turn it on.
function NoAccess({ keys }) {
  const names = keys.map((k) => MODULES.find((m) => m.key === k)?.label || k).join(" or ")
  return (
    <EmptyState
      className="m-6"
      title="You do not have access to this page"
      description={`It needs ${names}. Ask the Super Admin to turn it on for you.`}
    />
  )
}

const guard = (key, el) => <Guard moduleKey={key}>{el}</Guard>

// A hub page is reachable when any of its tabs is; the page hides the rest.
function HubGuard({ keys, children }) {
  const profile = useProfile()
  if (profile === null) return null
  if (!keys.some((k) => canAccess(profile, k))) return <NoAccess keys={keys} />
  return children
}

// A hub loads together with its HubGuard: the module keys live in the hub's own
// file, and importing them statically would pull the whole hub into the main
// bundle.
const lazyHub = (load, keysExport) =>
  lazyWithRetry(() =>
    load().then((m) => {
      const Page = m.default
      const keys = m[keysExport]
      return {
        default: function GuardedHub() {
          return (
            <HubGuard keys={keys}>
              <Page />
            </HubGuard>
          )
        },
      }
    }),
  )
const Crm = lazyHub(() => import("./pages/Crm"), "CRM_MODULE_KEYS")
const Catalog = lazyHub(() => import("./pages/Catalog"), "CATALOG_MODULE_KEYS")
const Billing = lazyHub(() => import("./pages/Billing"), "BILLING_MODULE_KEYS")
const Insights = lazyHub(() => import("./pages/Insights"), "INSIGHTS_MODULE_KEYS")

// Old CRM URLs live on as redirects (bookmarks, Dashboard links, navigate()
// calls carrying state such as the lead to open).
function Redirect({ to }) {
  const location = useLocation()
  return <Navigate to={to} state={location.state} replace />
}

// The Attendance hub's own tabs moved to three pages in 1.55.0. An old
// /attendance?tab=… link lands on whichever page now holds that tab, so a
// bookmark, a push notification or a link in a chat message still works.
const MOVED_TAB = {
  mine: "/my-records?tab=mine",
  leave: "/my-records?tab=leave",
  payslips: "/my-records?tab=payslips",
  payroll: "/payroll?tab=payroll",
  runs: "/payroll?tab=runs",
  employees: "/payroll?tab=employees",
  // Approvals (claims) and Reports were removed with the statutory payroll (2026-10-03).
  approvals: "/payroll?tab=runs",
  loans: "/payroll?tab=loans",
  reports: "/payroll?tab=runs",
  settings: "/control?section=attendance",
  "payroll-settings": "/control?section=payroll",
}
function AttendanceTabRoute() {
  const { search } = useLocation()
  const to = MOVED_TAB[new URLSearchParams(search).get("tab")]
  return to ? <Redirect to={to} /> : <Attendance scope="team" />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="whats-new" element={<WhatsNew />} />
          <Route path="chat" element={<Chat />} />
          <Route path="crm" element={<Crm />} />
          <Route path="leads" element={<Redirect to="/crm?tab=enquiries" />} />
          <Route path="voice-leads" element={<Redirect to="/crm?tab=voice" />} />
          <Route path="enquiries" element={<Redirect to="/crm?tab=enquiries" />} />
          <Route path="enquiries/:id" element={guard("enquiries", <EnquiryDetail />)} />
          <Route path="customers" element={guard("customers", <Customers />)} />
          <Route path="customers/:id" element={guard("customers", <CustomerDetail />)} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="products" element={<Redirect to="/catalog?tab=products" />} />
          <Route path="categories" element={<Redirect to="/catalog?tab=categories" />} />
          <Route path="work" element={<Redirect to="/catalog?tab=work" />} />
          <Route path="marketing" element={guard("social", <Social />)} />
          {/* Renamed to Marketing in 1.48.0; the stored key is still `social`. */}
          <Route path="social" element={<Redirect to="/marketing" />} />
          <Route path="telecaller" element={guard("telecaller", <Telecaller />)} />
          <Route path="quotations" element={guard("quotations", <Quotations />)} />
          <Route path="billing" element={<Billing />} />
          <Route path="invoices" element={<Redirect to="/billing?tab=invoices" />} />
          <Route path="payments" element={<Redirect to="/billing?tab=payments" />} />
          {/* One shell, three pages: everyone's attendance, the pay run, your
              own records. They were sections of a single hub until 1.55.0. */}
          <Route path="attendance" element={guard("attendance", <AttendanceTabRoute />)} />
          <Route path="my-records" element={guard("attendance", <Attendance scope="me" />)} />
          <Route path="payroll" element={guard("payroll", <Attendance scope="payroll" />)} />
          <Route path="payroll/runs/:id" element={guard("payroll", <PayRun />)} />
          <Route path="payroll/employees/:id" element={guard("payroll", <EmployeeProfile />)} />
          <Route path="payslips" element={<Redirect to="/my-records?tab=payslips" />} />
          <Route path="users" element={guard("users", <Users />)} />
          <Route path="users/:id" element={guard("users", <UserDetail />)} />
          {/* The Control centre absorbed Settings and Modules (1.55.0). Both
              old addresses still land, and so do the two settings tabs that
              used to live inside the Attendance hub. */}
          <Route path="control" element={guard("settings", <SettingsPage />)} />
          <Route path="settings" element={<Redirect to="/control" />} />
          <Route path="modules" element={<Redirect to="/control?section=access" />} />
          <Route path="insights" element={<Insights />} />
          <Route path="growth" element={<Redirect to="/insights?tab=growth" />} />
          <Route path="automation" element={<Redirect to="/insights?tab=events" />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  )
}
