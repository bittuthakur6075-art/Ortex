import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Toaster } from "sonner"
import AdminLayout from "./components/layout/AdminLayout"
import Login from "./pages/Login"
import Dashboard from "./pages/Dashboard"
import Crm, { CRM_MODULE_KEYS } from "./pages/Crm"
import CustomerDetail from "./pages/CustomerDetail"
import EnquiryDetail from "./pages/EnquiryDetail"
import Catalog, { CATALOG_MODULE_KEYS } from "./pages/Catalog"
import Billing, { BILLING_MODULE_KEYS } from "./pages/Billing"
import Insights, { INSIGHTS_MODULE_KEYS } from "./pages/Insights"
import Customers from "./pages/Customers"
import Social from "./pages/Social"
import Telecaller from "./pages/Telecaller"
import Quotations from "./pages/Quotations"
import SettingsPage from "./pages/Settings"
import Users from "./pages/Users"
import UserDetail from "./pages/users/UserDetail"
import Profile from "./pages/Profile"
import WhatsNew from "./pages/WhatsNew"
import Attendance from "./pages/Attendance"
import PayRun from "./pages/payroll/PayRun"
import EmployeeProfile from "./pages/payroll/EmployeeProfile"
import Chat from "./pages/Chat"
import { useProfile } from "./hooks/useProfile"
import { canAccess } from "./data/domain/modules"

// Route-level access gate, mirrors the sidebar filtering so a blocked module
// can't be reached by typing its URL. Redirects home while the profile loads
// or when access is denied.
function Guard({ moduleKey, children }) {
  const profile = useProfile()
  if (profile === null) return null
  if (!canAccess(profile, moduleKey)) return <Navigate to="/" replace />
  return children
}

const guard = (key, el) => <Guard moduleKey={key}>{el}</Guard>

// A hub page is reachable when any of its tabs is; the page hides the rest.
function HubGuard({ keys, children }) {
  const profile = useProfile()
  if (profile === null) return null
  if (!keys.some((k) => canAccess(profile, k))) return <Navigate to="/" replace />
  return children
}

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
  approvals: "/payroll?tab=approvals",
  loans: "/payroll?tab=loans",
  reports: "/payroll?tab=reports",
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
          <Route path="crm" element={<HubGuard keys={CRM_MODULE_KEYS}><Crm /></HubGuard>} />
          <Route path="leads" element={<Redirect to="/crm?tab=enquiries" />} />
          <Route path="voice-leads" element={<Redirect to="/crm?tab=voice" />} />
          <Route path="enquiries" element={<Redirect to="/crm?tab=enquiries" />} />
          <Route path="enquiries/:id" element={guard("enquiries", <EnquiryDetail />)} />
          <Route path="customers" element={guard("customers", <Customers />)} />
          <Route path="customers/:id" element={guard("customers", <CustomerDetail />)} />
          <Route path="catalog" element={<HubGuard keys={CATALOG_MODULE_KEYS}><Catalog /></HubGuard>} />
          <Route path="products" element={<Redirect to="/catalog?tab=products" />} />
          <Route path="categories" element={<Redirect to="/catalog?tab=categories" />} />
          <Route path="work" element={<Redirect to="/catalog?tab=work" />} />
          <Route path="marketing" element={guard("social", <Social />)} />
          {/* Renamed to Marketing in 1.48.0; the stored key is still `social`. */}
          <Route path="social" element={<Redirect to="/marketing" />} />
          <Route path="telecaller" element={guard("telecaller", <Telecaller />)} />
          <Route path="quotations" element={guard("quotations", <Quotations />)} />
          <Route path="billing" element={<HubGuard keys={BILLING_MODULE_KEYS}><Billing /></HubGuard>} />
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
          <Route path="insights" element={<HubGuard keys={INSIGHTS_MODULE_KEYS}><Insights /></HubGuard>} />
          <Route path="growth" element={<Redirect to="/insights?tab=growth" />} />
          <Route path="automation" element={<Redirect to="/insights?tab=events" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  )
}
