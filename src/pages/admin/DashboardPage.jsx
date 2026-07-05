import { useState } from "react"
import { motion } from "framer-motion"
import {
  Palette,
  Scissors,
  Printer,
  Cpu,
  Layers,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Boxes,
  Zap,
} from "lucide-react"

// ─── Constants & Custom Ortex Factory Data ──────────────────────────────────────

const INITIAL_PIPELINE = [
  { stage: "Artwork Design", count: 12, icon: Palette, color: "text-amber-500", bg: "bg-amber-50 border-amber-100", desc: "Mockups being prepared or awaiting client approval" },
  { stage: "Laser Cutting", count: 8, icon: Scissors, color: "text-blue-500", bg: "bg-blue-50 border-blue-100", desc: "MDF and Acrylic sheets being laser cut to shape" },
  { stage: "UV Printing / Sub", count: 15, icon: Printer, color: "text-indigo-500", bg: "bg-indigo-50 border-indigo-100", desc: "Printing graphics on keychains, badges, or lanyards" },
  { stage: "Assembly & QC", count: 6, icon: Layers, color: "text-emerald-500", bg: "bg-emerald-50 border-emerald-100", desc: "Adding keyrings, pins, hooks, and checking quality" },
  { stage: "Ready to Dispatch", count: 6, icon: Boxes, color: "text-purple-500", bg: "bg-purple-50 border-purple-100", desc: "Packed in carton boxes and ready for courier pickup" }
]

const MACHINES = [
  { name: "CO2 Laser Engraver (1390)", type: "Cutting", load: 94, temp: "38°C", status: "Running", color: "from-blue-500 to-indigo-500" },
  { name: "Mimaki UV Flatbed Printer", type: "Printing", load: 82, temp: "26°C", status: "Running", color: "from-purple-500 to-pink-500" },
  { name: "Satin Lanyard Heat Press", type: "Sublimation", load: 20, temp: "185°C", status: "Setup", color: "from-amber-500 to-orange-500" }
]

const INVENTORY_ALERTS = [
  { item: "2mm Clear Acrylic Sheet (8x4ft)", qty: "4 sheets", status: "Critical", color: "text-rose-600 bg-rose-50 border-rose-100" },
  { item: "20mm Royal Blue Satin Ribbon Roll", qty: "3 rolls", status: "Warning", color: "text-amber-600 bg-amber-50 border-amber-100" },
  { item: "3mm Premium MDF Board (8x4ft)", qty: "140 sheets", status: "Healthy", color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  { item: "Metal D-Shaped Lanyard Hooks", qty: "450 pcs", status: "Warning", color: "text-amber-600 bg-amber-50 border-amber-100" }
]

const PRODUCTION_QUEUE = [
  { orderId: "ORX-2846", client: "Infosys BPM", item: "Acrylic Name Plates", qty: "150 pcs", deadline: "Today", progress: 85, status: "Assembly" },
  { orderId: "ORX-2847", client: "Tata Steel Ltd.", item: "MDF Signage Boards", qty: "50 pcs", deadline: "Jul 12", progress: 60, status: "Laser Cutting" },
  { orderId: "ORX-2844", client: "Wipro Technologies", item: "ID Badges & Lanyards", qty: "1000 pcs", deadline: "Jul 18", progress: 25, status: "Printing" },
  { orderId: "ORX-2843", client: "Mahindra & Mahindra", item: "Acrylic Trophy Set", qty: "40 pcs", deadline: "Jul 25", progress: 10, status: "Design Approval" }
]

// ─── Smooth Scroll Reveal Props ────────────────────────────────────────────────

const scrollReveal = {
  initial: { opacity: 0, y: 25 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-20px" },
  transition: { duration: 0.5, ease: [0.215, 0.610, 0.355, 1.000] }
}

export default function DashboardPage() {
  const [selectedStage, setSelectedStage] = useState(0)

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto text-slate-800">
      {/* ── Factory Command Banner ── */}
      <motion.div
        {...scrollReveal}
        className="relative overflow-hidden rounded-3xl p-6 md:p-8 text-white shadow-lg"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #1d4ed8 100%)" }}
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 bg-white/10 rounded-full border border-white/20">
              ⚡ Factory Control Center
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-3.5 tracking-tight">Ortex Industries</h1>
            <p className="text-sm text-slate-300 mt-2 max-w-xl leading-relaxed">
              Real-time monitoring of custom manufacturing lines. Daily factory throughput is currently running at <span className="text-white font-bold">84% efficiency</span>.
            </p>
          </div>
          
          {/* Daily Goal Gauge */}
          <div className="flex items-center gap-4 shrink-0 bg-white/5 border border-white/15 p-4 rounded-2xl backdrop-blur-sm">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                <circle cx="18" cy="18" r="16" fill="none" stroke="#60a5fa" strokeWidth="3" strokeDasharray="84 100" strokeLinecap="round" />
              </svg>
              <span className="absolute text-xs font-black text-white">84%</span>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Daily Output Goal</p>
              <p className="text-lg font-black text-white mt-0.5">840 / 1,000</p>
              <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">Custom items dispatched today</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Command KPI stat cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Stat 1 */}
        <motion.div {...scrollReveal} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
          <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100">
            <Palette size={20} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Design Approvals</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">14 mockups</p>
            <p className="text-[10px] text-amber-600 font-bold mt-0.5">Awaiting customer sign-off</p>
          </div>
        </motion.div>

        {/* Stat 2 */}
        <motion.div {...scrollReveal} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Active Floor Jobs</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">47 orders</p>
            <p className="text-[10px] text-blue-650 font-bold mt-0.5">Currently in manufacturing</p>
          </div>
        </motion.div>

        {/* Stat 3 */}
        <motion.div {...scrollReveal} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100">
            <Layers size={20} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Production Volume</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">842 items</p>
            <p className="text-[10px] text-indigo-650 font-bold mt-0.5">Processing across machines</p>
          </div>
        </motion.div>

        {/* Stat 4 */}
        <motion.div {...scrollReveal} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Dispatched Month</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">12,840 units</p>
            <p className="text-[10px] text-emerald-600 font-bold mt-0.5">↑ 23.1% growth over May</p>
          </div>
        </motion.div>
      </div>

      {/* ── Custom Production Pipeline Step Tracker ── */}
      <motion.div
        {...scrollReveal}
        className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm"
      >
        <h3 className="font-extrabold text-slate-900 text-base mb-1">Live Factory Production Pipeline</h3>
        <p className="text-xs text-slate-400 font-semibold mb-6">Select a stage below to view active workloads and queue status.</p>

        {/* Pipeline horizontal steps row */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {INITIAL_PIPELINE.map((p, i) => {
            const Icon = p.icon
            const isSelected = selectedStage === i
            return (
              <div
                key={p.stage}
                onClick={() => setSelectedStage(i)}
                className={`p-4 rounded-2xl border transition-all duration-300 cursor-pointer select-none flex flex-col justify-between h-[110px] ${
                  isSelected ? 'border-blue-500 bg-blue-50/20 shadow-md scale-[1.02]' : 'border-slate-100 hover:border-slate-200 bg-white hover:-translate-y-0.5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${p.bg}`}>
                    <Icon size={16} className={p.color} />
                  </div>
                  <span className="text-xs font-black text-slate-900 bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded-md">
                    {p.count}
                  </span>
                </div>
                <div className="mt-3.5">
                  <p className="text-xs font-bold text-slate-950 truncate">{p.stage}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Selected stage details container */}
        <div className="mt-5 p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
          <Zap size={16} className="text-blue-600 flex-shrink-0" />
          <p className="text-xs font-medium text-slate-600 leading-relaxed">
            <span className="font-bold text-slate-900">{INITIAL_PIPELINE[selectedStage].stage}: </span>
            {INITIAL_PIPELINE[selectedStage].desc}
          </p>
        </div>
      </motion.div>

      {/* ── Middle grid column: Machine Load + Material Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Machine Status Load Panel */}
        <motion.div {...scrollReveal} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow duration-300">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">Factory Equipment Load</h3>
            <p className="text-xs text-slate-400 font-semibold mt-1">Real-time load of key fabrication assets.</p>
          </div>

          <div className="space-y-4 my-auto pt-4">
            {MACHINES.map(m => (
              <div key={m.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <div>
                    <p className="text-slate-800">{m.name}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-wider">{m.type} • Temp: {m.temp}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-950 font-black">{m.load}% load</span>
                    <span className={`block text-[9px] font-black uppercase mt-0.5 ${m.status === "Running" ? 'text-emerald-500':'text-amber-500'}`}>{m.status}</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${m.color}`} style={{ width: `${m.load}%` }} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Low Stock alerts */}
        <motion.div {...scrollReveal} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow duration-300">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">Raw Materials Status</h3>
            <p className="text-xs text-slate-400 font-semibold mt-1">Inventory triggers for custom items stock.</p>
          </div>

          <div className="space-y-3.5 my-auto pt-4">
            {INVENTORY_ALERTS.map(a => (
              <div key={a.item} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl hover:-translate-y-0.5 transition-transform duration-200">
                <div>
                  <p className="text-xs font-bold text-slate-800 truncate max-w-[200px]">{a.item}</p>
                  <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Remaining Stock: <span className="font-bold text-slate-700">{a.qty}</span></p>
                </div>
                <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border shrink-0 ${a.color}`}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Lead time statistics */}
        <motion.div {...scrollReveal} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow duration-300">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">Weekly Production Cycle</h3>
            <p className="text-xs text-slate-400 font-semibold mt-1">Average manufacturing time to dispatch (days).</p>
          </div>

          <div className="relative h-44 w-full flex items-center justify-center my-auto">
            <svg viewBox="0 0 200 100" className="w-full h-full">
              {/* Curve representing cycle time */}
              <path d="M 10 90 Q 50 40 90 70 T 170 30" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="170" cy="30" r="4.5" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.5" />
            </svg>
            <div className="absolute top-[18px] right-[25px] bg-[#0f172a] text-white text-[9px] font-bold px-2 py-1 rounded shadow">
              Avg: 3.4 Days
            </div>
          </div>
          
          <div className="flex justify-between text-[9px] font-bold text-slate-400 px-2 mt-1">
            <span>Acrylic Products</span>
            <span>MDF Boards</span>
            <span>Custom Lanyards</span>
          </div>
        </motion.div>
      </div>

      {/* ── Floor Production Queue Table ── */}
      <motion.div {...scrollReveal} className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/20">
          <h3 className="font-extrabold text-slate-900 text-base">Active Floor Job Queue</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Job ID</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Custom Item Description</th>
                <th className="py-3 px-4 text-center">Batch Size</th>
                <th className="py-3 px-4">Target Date</th>
                <th className="py-3 px-4">Job Progress</th>
                <th className="py-3 px-4">Current Stage</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTION_QUEUE.map(q => (
                <tr key={q.orderId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-900">{q.orderId}</td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">{q.client}</td>
                  <td className="py-3.5 px-4 text-slate-600 font-semibold">{q.item}</td>
                  <td className="py-3.5 px-4 text-center text-slate-700 font-bold">{q.qty}</td>
                  <td className="py-3.5 px-4 text-slate-500 font-semibold">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                      q.deadline === "Today" ? 'bg-rose-50 text-rose-600 border border-rose-100 font-extrabold animate-pulse' : 'bg-slate-50 text-slate-500 border border-slate-200/60'
                    }`}>
                      <Clock size={10} /> {q.deadline}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 w-40">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-slate-700">
                        <span>{q.progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${q.progress}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-black text-slate-600">
                      {q.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  )
}
