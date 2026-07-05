import { useState } from "react"
import { motion } from "framer-motion"
import {
  BarChart3,
  TrendingUp,
  ShoppingCart,
  Users,
  IndianRupee,
  Download,
  Calendar,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
}

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
}

const kpis = [
  { label: "Revenue", value: "₹24,50,000", change: "+12.5%", icon: IndianRupee, color: "text-emerald-600", bg: "bg-emerald-50", up: true },
  { label: "Orders Placed", value: "1,284", change: "+23.1%", icon: ShoppingCart, color: "text-blue-600", bg: "bg-blue-50", up: true },
  { label: "Active Customers", value: "156", change: "+8.3%", icon: Users, color: "text-violet-600", bg: "bg-violet-50", up: true },
  { label: "Avg Order Value", value: "₹19,081", change: "-2.4%", icon: TrendingUp, color: "text-rose-600", bg: "bg-rose-50", up: false },
]

const COMPARISONS = [
  { month: "June 2025", revenue: 510000, orders: 285, newCust: 14, growth: "+6.2%" },
  { month: "May 2025", revenue: 480000, orders: 250, newCust: 11, growth: "+14.3%" },
  { month: "April 2025", revenue: 420000, orders: 210, newCust: 9, growth: "+20.0%" },
  { month: "March 2025", revenue: 350000, orders: 185, newCust: 8, growth: "-7.8%" },
  { month: "February 2025", revenue: 380000, orders: 200, newCust: 12, growth: "+18.7%" },
  { month: "January 2025", revenue: 320000, orders: 154, newCust: 6, growth: "+0.0%" }
]

const dateRanges = ["Last 7 Days", "Last 30 Days", "Last 90 Days", "This Year"]

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState("Last 30 Days")
  const [showDateDropdown, setShowDateDropdown] = useState(false)

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-[1600px] mx-auto text-slate-800"
    >
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Business Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Track factory outputs, monthly sales, customer signups, and growth reports.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date Range Selector */}
          <div className="relative">
            <button
              onClick={() => setShowDateDropdown(!showDateDropdown)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-slate-450" />
              <span>{dateRange}</span>
              <ChevronDown className="w-4 h-4 text-slate-450" />
            </button>
            {showDateDropdown && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200/80 py-1.5 z-20">
                {dateRanges.map((r) => (
                  <button
                    key={r}
                    onClick={() => { setDateRange(r); setShowDateDropdown(false) }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors cursor-pointer ${
                      dateRange === r ? "bg-blue-50 text-blue-600 font-bold" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 text-slate-600 font-semibold text-sm transition-all cursor-pointer">
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ── KPI Summary Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpis.map((k, index) => {
          const Icon = k.icon
          return (
            <motion.div key={index} variants={item} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center ${k.color}`}>
                  <Icon size={20} />
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-0.5 border ${
                  k.up ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                }`}>
                  {k.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {k.change}
                </span>
              </div>
              <p className="text-slate-400 text-sm font-semibold mt-3.5">{k.label}</p>
              <p className="text-2xl font-extrabold text-slate-950 mt-1">{k.value}</p>
            </motion.div>
          )
        })}
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trends Chart Card */}
        <motion.div variants={item} className="lg:col-span-2 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-5">Revenue Performance Trends</h3>
          
          <div className="relative h-60 w-full flex items-center justify-center">
            <svg viewBox="0 0 500 200" className="w-full h-full">
              <defs>
                <linearGradient id="analAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Gridlines */}
              <line x1="40" y1="20" x2="480" y2="20" stroke="#f8fafc" strokeWidth="1" />
              <line x1="40" y1="60" x2="480" y2="60" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="40" y1="100" x2="480" y2="100" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="40" y1="140" x2="480" y2="140" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="40" y1="180" x2="480" y2="180" stroke="#cbd5e1" strokeWidth="1" />

              {/* Y Axis labels */}
              <text x="30" y="24" textAnchor="end" className="text-[10px] font-bold fill-slate-400">₹6L</text>
              <text x="30" y="64" textAnchor="end" className="text-[10px] font-bold fill-slate-400">₹4.5L</text>
              <text x="30" y="104" textAnchor="end" className="text-[10px] font-bold fill-slate-400">₹3L</text>
              <text x="30" y="144" textAnchor="end" className="text-[10px] font-bold fill-slate-400">₹1.5L</text>
              <text x="30" y="184" textAnchor="end" className="text-[10px] font-bold fill-slate-400">0</text>
              
              {/* Area Under Curve */}
              <path d="M 45 180 Q 115 150 185 130 T 325 90 T 465 60 L 465 180 Z" fill="url(#analAreaGrad)" />
              
              {/* Line Curve */}
              <path d="M 45 180 Q 115 150 185 130 T 325 90 T 465 60" fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
              
              {/* Highlights */}
              <circle cx="465" cy="60" r="6" fill="#2563eb" stroke="#ffffff" strokeWidth="2.5" />
            </svg>
            <div className="absolute top-[35px] right-[25px] bg-slate-950 text-white text-[10px] font-black px-2.5 py-1.5 rounded-lg shadow-xl">
              Jun: ₹5.1 Lakhs
            </div>
          </div>
          {/* X Axis Months */}
          <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-2 px-10">
            <span>Jan</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Apr</span>
            <span>May</span>
            <span>Jun</span>
          </div>
        </motion.div>

        {/* Product Performance Bar Chart */}
        <motion.div variants={item} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 mb-4">Category Outputs</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">Quantity items produced and shipped by product class.</p>
          </div>

          <div className="space-y-3.5">
            {[
              { name: "MDF Products", count: "342 units", percent: 92, color: "bg-blue-600" },
              { name: "Acrylic Products", count: "287 units", percent: 77, color: "bg-indigo-500" },
              { name: "Lanyards & ID Accessories", count: "234 units", percent: 63, color: "bg-emerald-500" },
              { name: "Corporate Gifting", count: "198 units", percent: 53, color: "bg-amber-500" },
              { name: "Acrylic Trophies", count: "156 units", percent: 42, color: "bg-rose-500" }
            ].map(p => (
              <div key={p.name} className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold text-slate-650">
                  <span>{p.name}</span>
                  <span>{p.count}</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${p.color}`} style={{ width: `${p.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Bottom Section: Monthly Comparison Table ── */}
      <motion.div variants={item} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/20">
          <h3 className="font-bold text-slate-900 text-lg">Monthly Performance Comparison</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left">
                <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Month</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Revenue</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Orders Processed</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">New Customers</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Growth Rate</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISONS.map(c => (
                <tr key={c.month} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-850">{c.month}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-slate-950">₹{c.revenue.toLocaleString("en-IN")}</td>
                  <td className="py-3.5 px-4 text-right font-semibold text-slate-700">{c.orders} orders</td>
                  <td className="py-3.5 px-4 text-right font-semibold text-slate-700">+{c.newCust} clients</td>
                  <td className={`py-3.5 px-4 text-right font-black ${
                    c.growth.startsWith("+") ? 'text-emerald-600' : c.growth === "+0.0%" ? 'text-slate-500' : 'text-rose-600'
                  }`}>
                    {c.growth}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  )
}
