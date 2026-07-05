import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus,
  Search,
  ShoppingCart,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Package,
  Clock,
  CheckCircle2,
  ChevronDown,
} from "lucide-react"

// ─── Constants & Option Lists ──────────────────────────────────────────────────

const STATUS_OPTIONS = ["All", "Pending", "In Progress", "Completed", "Cancelled"]
const DATE_RANGE_OPTIONS = ["Today", "This Week", "This Month", "All Time"]
const FORM_STATUS_OPTIONS = ["Pending", "In Progress", "Completed", "Cancelled"]

const TABLE_HEADERS = [
  { label: "Order ID", align: "text-left" },
  { label: "Customer Name", align: "text-left" },
  { label: "Product", align: "text-left hidden md:table-cell" },
  { label: "Quantity", align: "text-center hidden sm:table-cell" },
  { label: "Amount (₹)", align: "text-right" },
  { label: "Status", align: "text-center" },
  { label: "Date", align: "text-left hidden lg:table-cell" },
  { label: "Actions", align: "text-center" },
]

const INITIAL_ORDERS = [
  { id: "ORX-2847", customerName: "Tata Steel Ltd.", product: "MDF Signage Boards", quantity: 50, amount: 185000, status: "Completed", date: "May 26, 2026" },
  { id: "ORX-2846", customerName: "Infosys BPM", product: "Acrylic Name Plates", quantity: 150, amount: 92500, status: "In Progress", date: "May 25, 2026" },
  { id: "ORX-2845", customerName: "Reliance Retail", product: "Corporate Gift Hampers", quantity: 200, amount: 340000, status: "Completed", date: "May 24, 2026" },
  { id: "ORX-2844", customerName: "Wipro Technologies", product: "ID Badges & Lanyards", quantity: 1000, amount: 115000, status: "Pending", date: "May 22, 2026" },
  { id: "ORX-2843", customerName: "Mahindra & Mahindra", product: "Acrylic Trophy Set", quantity: 40, amount: 78000, status: "In Progress", date: "May 20, 2026" },
  { id: "ORX-2842", customerName: "Bajaj Finance", product: "MDF Display Units", quantity: 80, amount: 220000, status: "Completed", date: "May 18, 2026" }
]

const STATUS_BADGES = {
  "Completed": "bg-emerald-50 text-emerald-700 border-emerald-100",
  "In Progress": "bg-blue-50 text-blue-700 border-blue-100",
  "Pending": "bg-amber-50 text-amber-700 border-amber-100",
  "Cancelled": "bg-rose-50 text-rose-700 border-rose-100"
}

// ─── Animation Variants ─────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } }
}

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
}

const panelVariants = {
  hidden: { x: "100%" },
  visible: { x: 0, transition: { type: "spring", damping: 28, stiffness: 300 } },
  exit: { x: "100%", transition: { duration: 0.2, ease: "easeIn" } }
}

export default function OrdersPage() {
  const [orders, setOrders] = useState(INITIAL_ORDERS)
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [dateRange, setDateRange] = useState("All Time")

  // Form state
  const [form, setForm] = useState({
    customerName: "",
    product: "",
    quantity: "",
    amount: "",
    status: "Pending",
    notes: ""
  })

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const resetForm = () => {
    setForm({
      customerName: "",
      product: "",
      quantity: "",
      amount: "",
      status: "Pending",
      notes: ""
    })
    setShowModal(false)
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (!form.customerName || !form.product || !form.quantity || !form.amount) {
      alert("Please fill all required fields")
      return
    }

    const randomId = `ORX-${Math.floor(1000 + Math.random() * 9000)}`
    const newOrder = {
      id: randomId,
      customerName: form.customerName,
      product: form.product,
      quantity: parseInt(form.quantity, 10),
      amount: parseFloat(form.amount),
      status: form.status,
      date: new Date().toLocaleDateString("en-IN", { month: "short", day: "2-digit", year: "numeric" })
    }

    setOrders([newOrder, ...orders])
    resetForm()
  }

  const handleDelete = (id) => {
    if (confirm("Are you sure you want to delete this order?")) {
      setOrders(orders.filter(o => o.id !== id))
    }
  }

  // Calculate dynamic stats based on orders list
  const totalOrdersCount = orders.length
  const pendingOrdersCount = orders.filter(o => o.status === "Pending" || o.status === "In Progress").length
  const completedOrdersCount = orders.filter(o => o.status === "Completed").length

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          o.product.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          o.id.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "All" || o.status === statusFilter
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Orders Management</h1>
          <p className="text-sm text-slate-500 mt-1">Create, track, and manage Ortex custom manufacturing orders.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer"
        >
          <Plus size={16} />
          <span>New Order</span>
        </button>
      </div>

      {/* ── Stats Cards Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Package size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Orders</p>
            <p className="text-2xl font-extrabold text-slate-950 mt-0.5">{totalOrdersCount}</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <Clock size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Pending / In Progress</p>
            <p className="text-2xl font-extrabold text-slate-950 mt-0.5">{pendingOrdersCount}</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Completed</p>
            <p className="text-2xl font-extrabold text-slate-950 mt-0.5">{completedOrdersCount}</p>
          </div>
        </motion.div>
      </div>

      {/* ── Filter Bar ── */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search orders by ID, client, product..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "All" ? "All Status" : s}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all cursor-pointer font-semibold"
            >
              {DATE_RANGE_OPTIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </motion.div>

      {/* ── Orders Table ── */}
      <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left">
                {TABLE_HEADERS.map((h) => (
                  <th key={h.label} className={`py-3.5 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider ${h.align}`}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length > 0 ? (
                filteredOrders.map((o) => (
                  <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-4 font-bold text-slate-900">{o.id}</td>
                    <td className="py-4 px-4 font-semibold text-slate-800">{o.customerName}</td>
                    <td className="py-4 px-4 text-slate-600 hidden md:table-cell">{o.product}</td>
                    <td className="py-4 px-4 text-center text-slate-500 font-medium hidden sm:table-cell">{o.quantity}</td>
                    <td className="py-4 px-4 text-right font-bold text-slate-900">₹{o.amount.toLocaleString("en-IN")}</td>
                    <td className="py-4 px-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_BADGES[o.status]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${o.status === "Completed" ? "bg-emerald-500" : o.status === "In Progress" ? "bg-blue-500" : o.status === "Pending" ? "bg-amber-500" : "bg-rose-500"}`} />
                        {o.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-slate-500 font-medium hidden lg:table-cell">{o.date}</td>
                    <td className="py-4 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button className="p-1.5 hover:bg-slate-50 hover:text-slate-700 rounded-lg text-slate-400 transition-colors cursor-pointer" title="View details">
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(o.id)}
                          className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-400 transition-colors cursor-pointer"
                          title="Delete order"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={TABLE_HEADERS.length} className="py-16 text-center text-slate-400 font-semibold">
                    No orders found. Add a new order or try adjusting filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50/10">
          <p className="text-xs text-slate-400 font-medium">
            Showing <span className="font-semibold text-slate-600">{filteredOrders.length}</span> of{" "}
            <span className="font-semibold text-slate-600">{orders.length}</span> orders
          </p>
          <div className="flex items-center gap-1">
            <button className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 text-xs font-bold text-slate-400 transition-all cursor-not-allowed" disabled>
              Previous
            </button>
            <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-md shadow-indigo-600/20">1</span>
            <button className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 text-xs font-bold text-slate-400 transition-all cursor-not-allowed" disabled>
              Next
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── New Order Modal Slide-Over ── */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              variants={overlayVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={resetForm}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/20">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">New Order</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Add a new custom manufacturing job</p>
                </div>
                <button onClick={resetForm} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSave} className="flex-1 flex flex-col justify-between overflow-hidden">
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Customer Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={form.customerName}
                      onChange={e => updateForm("customerName", e.target.value)}
                      placeholder="e.g. Tata Steel Ltd."
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Product Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={form.product}
                      onChange={e => updateForm("product", e.target.value)}
                      placeholder="e.g. Custom MDF Signage Board"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                        Quantity <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={form.quantity}
                        onChange={e => updateForm("quantity", e.target.value)}
                        placeholder="0"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                        Amount (₹) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={form.amount}
                        onChange={e => updateForm("amount", e.target.value)}
                        placeholder="0"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Status
                    </label>
                    <div className="relative">
                      <select
                        value={form.status}
                        onChange={e => updateForm("status", e.target.value)}
                        className="w-full appearance-none px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all cursor-pointer"
                      >
                        {FORM_STATUS_OPTIONS.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Notes
                    </label>
                    <textarea
                      rows={3}
                      value={form.notes}
                      onChange={e => updateForm("notes", e.target.value)}
                      placeholder="Add specific dimensions, printing colors, MDF/acrylic thickness, layout requests..."
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
                  <button type="button" onClick={resetForm} className="px-5 py-2 text-sm font-semibold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer">
                    Save Order
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
