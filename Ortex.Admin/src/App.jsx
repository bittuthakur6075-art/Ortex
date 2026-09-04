import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Toaster } from "sonner"
import AdminLayout from "./components/layout/AdminLayout"
import Login from "./pages/Login"
import Dashboard from "./pages/Dashboard"
import Crm, { CRM_MODULE_KEYS } from "./pages/Crm"
import Catalog, { CATALOG_MODULE_KEYS } from "./pages/Catalog"
import Billing, { BILLING_MODULE_KEYS } from "./pages/Billing"
import Insights, { INSIGHTS_MODULE_KEYS } from "./pages/Insights"
import Customers from "./pages/Customers"
import Social from "./pages/Social"
import Telecaller from "./pages/Telecaller"
import Quotations from "./pages/Quotations"
import SettingsPage from "./pages/Settings"
import Users from "./pages/Users"
import Profile from "./pages/Profile"
import { useProfile } from "./hooks/useProfile"
import { canAccess } from "./data/domain/modules"

// Route-level access gate — mirrors the sidebar filtering so a blocked module
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="crm" element={<HubGuard keys={CRM_MODULE_KEYS}><Crm /></HubGuard>} />
          <Route path="leads" element={<Redirect to="/crm?tab=leads" />} />
          <Route path="voice-leads" element={<Redirect to="/crm?tab=voice" />} />
          <Route path="enquiries" element={<Redirect to="/crm?tab=enquiries" />} />
          <Route path="customers" element={guard("customers", <Customers />)} />
          <Route path="catalog" element={<HubGuard keys={CATALOG_MODULE_KEYS}><Catalog /></HubGuard>} />
          <Route path="products" element={<Redirect to="/catalog?tab=products" />} />
          <Route path="categories" element={<Redirect to="/catalog?tab=categories" />} />
          <Route path="work" element={<Redirect to="/catalog?tab=work" />} />
          <Route path="social" element={guard("social", <Social />)} />
          <Route path="telecaller" element={guard("telecaller", <Telecaller />)} />
          <Route path="quotations" element={guard("quotations", <Quotations />)} />
          <Route path="billing" element={<HubGuard keys={BILLING_MODULE_KEYS}><Billing /></HubGuard>} />
          <Route path="invoices" element={<Redirect to="/billing?tab=invoices" />} />
          <Route path="payments" element={<Redirect to="/billing?tab=payments" />} />
          <Route path="users" element={guard("users", <Users />)} />
          <Route path="settings" element={guard("settings", <SettingsPage />)} />
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
