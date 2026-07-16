import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { Toaster } from "sonner"
import AdminLayout from "./components/AdminLayout"
import Login from "./components/Login"
import Dashboard from "./modules/Dashboard"
import Leads from "./modules/Leads"
import Enquiries from "./modules/Enquiries"
import VoiceLeads from "./modules/VoiceLeads"
import Customers from "./modules/Customers"
import Products from "./modules/Products"
import Categories from "./modules/Categories"
import Work from "./modules/Work"
import Social from "./modules/Social"
import Quotations from "./modules/Quotations"
import Invoices from "./modules/Invoices"
import Payments from "./modules/Payments"
import SettingsPage from "./modules/Settings"
import Users from "./modules/Users"
import Profile from "./modules/Profile"
import AutomationPage from "./modules/Automation"
import Growth from "./modules/Growth"
import { useProfile } from "./data/profile"
import { canAccess } from "./data/modules"

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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="leads" element={guard("leads", <Leads />)} />
          <Route path="voice-leads" element={guard("voice-leads", <VoiceLeads />)} />
          <Route path="enquiries" element={guard("enquiries", <Enquiries />)} />
          <Route path="customers" element={guard("customers", <Customers />)} />
          <Route path="products" element={guard("products", <Products />)} />
          <Route path="categories" element={guard("categories", <Categories />)} />
          <Route path="work" element={guard("work", <Work />)} />
          <Route path="social" element={guard("social", <Social />)} />
          <Route path="quotations" element={guard("quotations", <Quotations />)} />
          <Route path="invoices" element={guard("invoices", <Invoices />)} />
          <Route path="payments" element={guard("payments", <Payments />)} />
          <Route path="users" element={guard("users", <Users />)} />
          <Route path="settings" element={guard("settings", <SettingsPage />)} />
          <Route path="growth" element={guard("growth", <Growth />)} />
          <Route path="automation" element={guard("automation", <AutomationPage />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  )
}
