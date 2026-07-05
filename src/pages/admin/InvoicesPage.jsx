import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  FileText,
  Plus,
  Search,
  ChevronDown,
  Eye,
  Download,
  X,
  IndianRupee,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Trash2,
} from "lucide-react"

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
}

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
}

const statusFilters = ["All", "Paid", "Unpaid", "Overdue", "Cancelled"]
const tableHeaders = ["Invoice #", "Customer", "Amount", "Issue Date", "Due Date", "Status", "Actions"]

const INITIAL_INVOICES = [
  { id: "INV-2026-001", customer: "Tata Steel Ltd.", amount: 218300, issueDate: "May 26, 2026", dueDate: "Jun 26, 2026", status: "Paid" },
  { id: "INV-2026-002", customer: "Infosys BPM", amount: 109150, issueDate: "May 25, 2026", dueDate: "Jun 25, 2026", status: "Unpaid" },
  { id: "INV-2026-003", customer: "Reliance Retail", amount: 401200, issueDate: "May 24, 2026", dueDate: "Jun 24, 2026", status: "Paid" },
  { id: "INV-2026-004", customer: "Wipro Technologies", amount: 135700, issueDate: "May 22, 2026", dueDate: "Jun 22, 2026", status: "Overdue" },
  { id: "INV-2026-005", customer: "Mahindra & Mahindra", amount: 92040, issueDate: "May 20, 2026", dueDate: "Jun 20, 2026", status: "Unpaid" }
]

const STATUS_COLORS = {
  "Paid": "bg-emerald-50 text-emerald-700 border-emerald-100",
  "Unpaid": "bg-blue-50 text-blue-700 border-blue-100",
  "Overdue": "bg-rose-50 text-rose-700 border-rose-100",
  "Cancelled": "bg-slate-100 text-slate-500 border-slate-200"
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState(INITIAL_INVOICES)
  const [activeStatus, setActiveStatus] = useState("All")
  const [search, setSearch] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [customerName, setCustomerName] = useState("")
  const [amount, setAmount] = useState("")
  const [dueDate, setDueDate] = useState("")

  const handleSave = (e) => {
    e.preventDefault()
    if (!customerName || !amount || !dueDate) {
      alert("Please fill all details")
      return
    }

    const newInvoice = {
      id: `INV-2026-0${invoices.length + 1}`,
      customer: customerName,
      amount: parseFloat(amount),
      issueDate: new Date().toLocaleDateString("en-IN", { month: "short", day: "2-digit", year: "numeric" }),
      dueDate: new Date(dueDate).toLocaleDateString("en-IN", { month: "short", day: "2-digit", year: "numeric" }),
      status: "Unpaid"
    }

    setInvoices([newInvoice, ...invoices])
    setShowModal(false)
    setCustomerName("")
    setAmount("")
    setDueDate("")
  }

  const handleDelete = (id) => {
    if (confirm("Are you sure you want to delete this invoice?")) {
      setInvoices(invoices.filter(inv => inv.id !== id))
    }
  }

  // Calculate stats
  const totalInvoiced = invoices.reduce((acc, inv) => acc + inv.amount, 0)
  const totalPaid = invoices.filter(inv => inv.status === "Paid").reduce((acc, inv) => acc + inv.amount, 0)
  const totalOverdue = invoices.filter(inv => inv.status === "Overdue").reduce((acc, inv) => acc + inv.amount, 0)

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.customer.toLowerCase().includes(search.toLowerCase()) || inv.id.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = activeStatus === "All" || inv.status === activeStatus
    return matchesSearch && matchesStatus
  })

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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">Generate customer tax invoices, track due dates, and monitor payment collections.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer"
        >
          <Plus size={16} />
          <span>Create Invoice</span>
        </button>
      </div>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <motion.div variants={item} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <IndianRupee size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Invoiced</p>
            <p className="text-2xl font-extrabold text-slate-950 mt-0.5">₹{totalInvoiced.toLocaleString("en-IN")}</p>
          </div>
        </motion.div>

        <motion.div variants={item} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Paid Invoices</p>
            <p className="text-2xl font-extrabold text-slate-950 mt-0.5">₹{totalPaid.toLocaleString("en-IN")}</p>
          </div>
        </motion.div>

        <motion.div variants={item} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
            <AlertTriangle size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Overdue Collections</p>
            <p className="text-2xl font-extrabold text-slate-950 mt-0.5">₹{totalOverdue.toLocaleString("en-IN")}</p>
          </div>
        </motion.div>
      </div>

      {/* ── Filter Bar ── */}
      <motion.div variants={item} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search invoices by code or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={activeStatus}
              onChange={(e) => setActiveStatus(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all cursor-pointer font-semibold"
            >
              {statusFilters.map((s) => (
                <option key={s} value={s}>{s === "All" ? "All Invoices" : `${s} Invoices`}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </motion.div>

      {/* ── Invoices Table ── */}
      <motion.div variants={item} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left">
                {tableHeaders.map((h) => (
                  <th key={h} className="py-3.5 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length > 0 ? (
                filteredInvoices.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-4 font-bold text-slate-900">{inv.id}</td>
                    <td className="py-4 px-4 font-semibold text-slate-850">{inv.customer}</td>
                    <td className="py-4 px-4 font-extrabold text-slate-950">₹{inv.amount.toLocaleString("en-IN")}</td>
                    <td className="py-4 px-4 text-slate-500 font-medium">{inv.issueDate}</td>
                    <td className="py-4 px-4 text-slate-500 font-medium">{inv.dueDate}</td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[inv.status]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          inv.status === "Paid" ? "bg-emerald-500" : inv.status === "Unpaid" ? "bg-blue-500" : inv.status === "Overdue" ? "bg-rose-500" : "bg-slate-450"
                        }`} />
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1.5">
                        <button className="p-1.5 hover:bg-slate-50 hover:text-slate-700 text-slate-400 rounded-lg transition-colors cursor-pointer" title="View PDF">
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(inv.id)}
                          className="p-1.5 hover:bg-rose-50 hover:text-rose-600 text-slate-400 rounded-lg transition-colors cursor-pointer"
                          title="Delete invoice"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={tableHeaders.length} className="py-16 text-center text-slate-400 font-semibold">
                    No invoices found. Create a new invoice or adjust filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* ── Create Invoice Modal ── */}
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
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden z-10 flex flex-col"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/20">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Create Tax Invoice</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Register a billing statement</p>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Customer Name</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="e.g. Infosys BPM"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Invoice Amount (₹)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Payment Due Date</label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 text-sm font-semibold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all cursor-pointer">Cancel</button>
                  <button type="submit" className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer">Save Invoice</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
