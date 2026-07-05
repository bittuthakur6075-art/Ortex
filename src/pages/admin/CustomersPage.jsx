import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Users,
  Plus,
  Search,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserPlus,
  Trash2,
  Phone,
  Mail,
  MapPin,
} from "lucide-react"

const STATUS_FILTERS = ["All", "Active", "Inactive"]

const TABLE_HEADERS = [
  "Customer Name",
  "Company",
  "Email",
  "Phone",
  "Total Orders",
  "Status",
  "Joined Date",
  "Actions",
]

const INITIAL_CUSTOMERS = [
  { id: 1, name: "Harish Chandra", company: "Tata Steel Ltd.", email: "h.chandra@tatasteel.com", phone: "+91-9876543210", ordersCount: 15, status: "Active", joined: "Jan 12, 2025" },
  { id: 2, name: "Neeta Deshmukh", company: "Infosys BPM", email: "neeta_d@infosys.com", phone: "+91-9922334455", ordersCount: 8, status: "Active", joined: "Feb 18, 2025" },
  { id: 3, name: "Ramesh Kumar", company: "Reliance Retail", email: "ramesh.k@ril.com", phone: "+91-9111222333", ordersCount: 22, status: "Active", joined: "Oct 05, 2024" },
  { id: 4, name: "Suresh Raina", company: "Wipro Technologies", email: "suresh.raina@wipro.com", phone: "+91-8877665544", ordersCount: 3, status: "Active", joined: "Apr 02, 2025" },
  { id: 5, name: "Vikram Singh", company: "Mahindra & Mahindra", email: "singh.vikram@mahindra.com", phone: "+91-9566778899", ordersCount: 5, status: "Inactive", joined: "Nov 22, 2024" },
  { id: 6, name: "Ananya Sen", company: "Bajaj Finance", email: "ananya.sen@bajaj.com", phone: "+91-9000111222", ordersCount: 11, status: "Active", joined: "Dec 15, 2024" }
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } }
}

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState(INITIAL_CUSTOMERS)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    address: ""
  })

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (!form.name || !form.company || !form.email || !form.phone) {
      alert("Please fill all required fields")
      return
    }

    const newCustomer = {
      id: Date.now(),
      name: form.name,
      company: form.company,
      email: form.email,
      phone: form.phone,
      ordersCount: 0,
      status: "Active",
      joined: new Date().toLocaleDateString("en-IN", { month: "short", day: "2-digit", year: "numeric" })
    }

    setCustomers([newCustomer, ...customers])
    setShowModal(false)
    setForm({ name: "", company: "", email: "", phone: "", address: "" })
  }

  const handleDelete = (id) => {
    if (confirm("Are you sure you want to delete this customer?")) {
      setCustomers(customers.filter(c => c.id !== id))
    }
  }

  // Stats Calculations
  const totalCustomers = customers.length
  const activeCustomers = customers.filter(c => c.status === "Active").length
  const newThisMonth = customers.filter(c => c.joined.includes("May") || c.joined.includes("Jun") || c.joined.includes("Jul")).length

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || 
                          c.company.toLowerCase().includes(search.toLowerCase()) ||
                          c.email.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "All" || c.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 max-w-[1600px] mx-auto text-slate-800"
    >
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Customers</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your customer accounts, active companies, and corporate records.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer"
        >
          <Plus size={16} />
          <span>Add Customer</span>
        </button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center text-violet-650">
            <Users size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Customers</p>
            <p className="text-2xl font-extrabold text-slate-950 mt-0.5">{totalCustomers}</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <UserCheck size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Active Accounts</p>
            <p className="text-2xl font-extrabold text-slate-950 mt-0.5">{activeCustomers}</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <UserPlus size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">New This Quarter</p>
            <p className="text-2xl font-extrabold text-slate-950 mt-0.5">{newThisMonth}</p>
          </div>
        </motion.div>
      </div>

      {/* ── Filter Bar ── */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search customers by name, company, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all cursor-pointer font-semibold"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>{s === "All" ? "All Accounts" : `${s} Accounts`}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </motion.div>

      {/* ── Customers Table ── */}
      <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left">
                {TABLE_HEADERS.map((h) => (
                  <th key={h} className="py-3.5 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map(c => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    {/* Customer Name */}
                    <td className="py-4 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white text-xs font-extrabold font-mono">
                          {c.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{c.name}</p>
                          <p className="text-[10px] text-slate-400">ID: ORX-CUST-{c.id.toString().substring(0, 4)}</p>
                        </div>
                      </div>
                    </td>
                    {/* Company */}
                    <td className="py-4 px-4 font-semibold text-slate-800">{c.company}</td>
                    {/* Email */}
                    <td className="py-4 px-4 text-slate-600 font-medium">
                      <span className="flex items-center gap-1.5"><Mail size={13} className="text-slate-450" /> {c.email}</span>
                    </td>
                    {/* Phone */}
                    <td className="py-4 px-4 text-slate-600 font-medium">
                      <span className="flex items-center gap-1.5"><Phone size={13} className="text-slate-450" /> {c.phone}</span>
                    </td>
                    {/* Total Orders */}
                    <td className="py-4 px-4 text-center font-bold text-slate-700">{c.ordersCount} jobs</td>
                    {/* Status */}
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${c.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.status === "Active" ? "bg-emerald-500" : "bg-slate-400"}`} />
                        {c.status}
                      </span>
                    </td>
                    {/* Joined Date */}
                    <td className="py-4 px-4 text-slate-500 font-medium">{c.joined}</td>
                    {/* Action buttons */}
                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1.5 hover:bg-rose-50 hover:text-rose-600 text-slate-400 rounded-lg transition-colors cursor-pointer"
                        title="Delete client"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={TABLE_HEADERS.length} className="py-16 text-center text-slate-400 font-semibold">
                    No customers found. Try creating a customer or clear filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50/10">
          <p className="text-xs text-slate-400 font-medium">
            Showing <span className="font-semibold text-slate-600">{filteredCustomers.length}</span> of{" "}
            <span className="font-semibold text-slate-600">{customers.length}</span> customers
          </p>
          <div className="flex items-center gap-1">
            <button className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 text-xs font-bold text-slate-450 transition-all cursor-not-allowed" disabled>
              Previous
            </button>
            <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-md shadow-indigo-600/20">1</span>
            <button className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 text-xs font-bold text-slate-450 transition-all cursor-not-allowed" disabled>
              Next
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Add Customer Modal ── */}
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
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden z-10 flex flex-col"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/20">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Add New Customer</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Register a new client company account</p>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Contact Name</label>
                  <input
                    type="text"
                    required
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Company Name</label>
                  <input
                    type="text"
                    required
                    name="company"
                    value={form.company}
                    onChange={handleChange}
                    placeholder="e.g. Reliance Retail"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Email Address</label>
                    <input
                      type="email"
                      required
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="e.g. ramesh.k@ril.com"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Phone Number</label>
                    <input
                      type="text"
                      required
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="e.g. +91-9876543210"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Shipping/Billing Address</label>
                  <textarea
                    name="address"
                    rows={2.5}
                    value={form.address}
                    onChange={handleChange}
                    placeholder="Enter full office or factory address..."
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 text-sm font-semibold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all cursor-pointer">Cancel</button>
                  <button type="submit" className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer">Save Customer</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
