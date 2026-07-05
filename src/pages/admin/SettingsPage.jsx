import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Building2,
  Bell,
  Users,
  Shield,
  Upload,
  Save,
  Plus,
  X,
  Mail,
  Phone,
  Globe,
  MapPin,
  FileText,
  Lock,
  Trash2,
  UserPlus,
  ChevronDown,
} from "lucide-react"

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
}

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
}

const tabs = [
  { id: "general", label: "General Settings", icon: Building2 },
  { id: "notifications", label: "Alerts & Notifications", icon: Bell },
  { id: "team", label: "Team Members", icon: Users },
  { id: "security", label: "Security & Access", icon: Shield },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general")
  const [showModal, setShowModal] = useState(false)
  const [companyName, setCompanyName] = useState("Ortex Industries Private Limited")
  const [email, setEmail] = useState("sales@ortexindustries.in")
  const [phone, setPhone] = useState("+91-9211947188")
  const [address, setAddress] = useState("Industrial Area, New Delhi, India")
  
  // Notification states
  const [notifs, setNotifs] = useState({
    emailOrder: true,
    smsDispatch: true,
    paymentAlert: true,
    reportWeekly: false
  })

  // Team states
  const [team, setTeam] = useState([
    { id: 1, name: "Priya Patel", email: "priya@ortexindustries.in", role: "Editor", status: "Active" },
    { id: 2, name: "Amit Verma", email: "amit@ortexindustries.in", role: "Viewer", status: "Active" },
    { id: 3, name: "Sneha Gupta", email: "sneha@ortexindustries.in", role: "Editor", status: "Active" }
  ])

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("Editor")

  const handleInvite = (e) => {
    e.preventDefault()
    if (!inviteEmail) return
    const newMember = {
      id: Date.now(),
      name: inviteEmail.split("@")[0].toUpperCase(),
      email: inviteEmail,
      role: inviteRole,
      status: "Invited"
    }
    setTeam([...team, newMember])
    setInviteEmail("")
    setShowModal(false)
  }

  const handleRemove = (id) => {
    if (confirm("Are you sure you want to remove this team member?")) {
      setTeam(team.filter(t => t.id !== id))
    }
  }

  const handleSaveGeneral = (e) => {
    e.preventDefault()
    alert("General settings saved successfully!")
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-[1600px] mx-auto text-slate-800"
    >
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Configure company profiles, control notification channels, and manage staff roles.</p>
        </div>
      </div>

      {/* ── Tabs Header Row ── */}
      <div className="flex border-b border-slate-200 gap-6 overflow-x-auto pb-1 shrink-0">
        {tabs.map((t) => {
          const Icon = t.icon
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2.5 pb-3 text-sm font-semibold transition-all border-b-2 cursor-pointer whitespace-nowrap ${
                isActive ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab Panels ── */}
      <AnimatePresence mode="wait">
        {activeTab === "general" && (
          <motion.div
            key="general"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Left Col: Edit Form */}
            <div className="lg:col-span-2 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 text-base mb-2">Company Profile</h3>
              <form onSubmit={handleSaveGeneral} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Registered Name</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Support Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-450 w-4 h-4" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-450 w-4 h-4" />
                      <input
                        type="text"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Office Address</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-slate-450 w-4 h-4" />
                    <textarea
                      rows={3}
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <button type="submit" className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer">
                    <Save size={16} />
                    <span>Save Profile Changes</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Right Col: Branding / Logo */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base mb-2">Company Branding</h3>
                <p className="text-xs text-slate-450 leading-relaxed mb-4">Upload high resolution files for custom invoices and purchase headers.</p>
              </div>

              <div className="w-full border-2 border-dashed border-slate-200 rounded-2xl py-12 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer">
                <Upload className="w-8 h-8 text-slate-400 mb-3" />
                <span className="text-sm font-semibold text-slate-700">Upload Corporate Logo</span>
                <span className="text-[10px] text-slate-400 mt-1">PNG, JPG up to 5MB (min 500x500px)</span>
              </div>

              <div className="mt-4 text-xs text-slate-400">
                Current file: <span className="font-bold text-slate-600">logo.png</span> (405.4 KB)
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "notifications" && (
          <motion.div
            key="notifications"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm max-w-3xl space-y-5"
          >
            <h3 className="font-bold text-slate-900 text-base">Alert Preferences</h3>
            
            <div className="space-y-4">
              {[
                { key: "emailOrder", title: "New Orders (Email)", desc: "Send an instant confirmation email whenever a customer creates an order." },
                { key: "smsDispatch", title: "Dispatch Alerts (SMS)", desc: "Ping warehouse staff with delivery tracking links on item dispatch." },
                { key: "paymentAlert", title: "Invoice Paid Notices", desc: "Notify managers on collection approvals." },
                { key: "reportWeekly", title: "Weekly Growth Summary", desc: "Compile orders and revenue comparison graphs every Sunday morning." }
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-3.5 bg-slate-50/50 rounded-xl border border-slate-100">
                  <div className="pr-4">
                    <p className="font-bold text-sm text-slate-850">{item.title}</p>
                    <p className="text-xs text-slate-450 mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => setNotifs(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                      notifs[item.key] ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      notifs[item.key] ? 'left-[22px]' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => alert("Notification settings saved!")}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow cursor-pointer"
              >
                Save Preferences
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === "team" && (
          <motion.div
            key="team"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/20">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Authorized Administrators</h3>
                <p className="text-xs text-slate-450 mt-0.5">Control staff dashboard permissions</p>
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-semibold shadow hover:shadow-md cursor-pointer"
              >
                <UserPlus size={14} />
                <span>Add Member</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/30 text-left">
                    <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">User</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Email Address</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Permission Role</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map(member => (
                    <tr key={member.id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-850">{member.name}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-600">{member.email}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-600">{member.role}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${
                          member.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-blue-50 text-blue-700 border-blue-100"
                        }`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleRemove(member.id)}
                          className="p-1 hover:bg-rose-50 hover:text-rose-600 rounded text-slate-400 transition-colors cursor-pointer"
                          title="Remove user"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {activeTab === "security" && (
          <motion.div
            key="security"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm max-w-xl space-y-5"
          >
            <h3 className="font-bold text-slate-900 text-base">Change Administrator Password</h3>
            
            <form onSubmit={e => { e.preventDefault(); alert("Password updated successfully!") }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Current Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-450 w-4 h-4" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-705 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-450 w-4 h-4" />
                  <input
                    type="password"
                    required
                    placeholder="At least 8 characters"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-705 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button type="submit" className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow cursor-pointer">
                  Update Password
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Invite Modal ── */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden z-10 flex flex-col"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/20">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Invite Team Member</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Send a workspace access invitation</p>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleInvite} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="e.g. rahul@ortexindustries.in"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-750 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Role Permission</label>
                  <div className="relative">
                    <select
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value)}
                      className="w-full appearance-none px-4 py-2 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-750 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all cursor-pointer font-semibold"
                    >
                      <option value="Editor">Editor (Create, Edit entries)</option>
                      <option value="Viewer">Viewer (Read-only access)</option>
                      <option value="Admin">Co-Administrator (Full privileges)</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-450 pointer-events-none" />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 text-sm font-semibold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all cursor-pointer">Cancel</button>
                  <button type="submit" className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer">Send Invite</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
