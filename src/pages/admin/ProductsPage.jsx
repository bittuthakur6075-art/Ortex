import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Package,
  Plus,
  Search,
  Grid3X3,
  List,
  X,
  ChevronDown,
  Archive,
  Layers,
  AlertTriangle,
  Trash2,
} from "lucide-react"

const CATEGORIES = [
  "All",
  "MDF Products",
  "Acrylic Products",
  "Lanyards & ID",
  "Corporate Gifts",
  "Badges",
  "Trophies",
]

const INITIAL_PRODUCTS = [
  { id: 1, name: "Premium MDF Exam Board", category: "MDF Products", price: 140, stock: 1200, sku: "MDF-EXM-001", desc: "Custom printed heavy-duty wood clipboard." },
  { id: 2, name: "Custom Acrylic Magnet Fridge", category: "Acrylic Products", price: 35, stock: 5000, sku: "ACR-MGT-022", desc: "Laser cut transparent fridge magnets." },
  { id: 3, name: "Satin Polyester Lanyard (20mm)", category: "Lanyards & ID", price: 25, stock: 8000, sku: "LYD-STN-020", desc: "20mm premium sub-printed identity neck ribbon." },
  { id: 4, name: "Branded Metal Rollerball Pen", category: "Corporate Gifts", price: 120, stock: 5, sku: "CG-PEN-044", desc: "Premium engraved metal pen with gift case." },
  { id: 5, name: "Magnetic Acrylic Name Badge", category: "Badges", price: 65, stock: 450, sku: "ACR-BDG-090", desc: "Office name tag with high-power double magnet." },
  { id: 6, name: "Laser Cut Glass Trophy Award", category: "Trophies", price: 850, stock: 2, sku: "TRP-GLS-005", desc: "Custom shape desktop acrylic award." }
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } }
}

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
}

export default function ProductsPage() {
  const [products, setProducts] = useState(INITIAL_PRODUCTS)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("All")
  const [view, setView] = useState("grid")
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    name: "",
    category: "MDF Products",
    description: "",
    price: "",
    stock: "",
    sku: ""
  })

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (!form.name || !form.price || !form.stock || !form.sku) {
      alert("Please fill in all fields")
      return
    }

    const newProduct = {
      id: Date.now(),
      name: form.name,
      category: form.category,
      price: parseFloat(form.price),
      stock: parseInt(form.stock, 10),
      sku: form.sku,
      desc: form.description
    }

    setProducts([newProduct, ...products])
    setShowModal(false)
    setForm({ name: "", category: "MDF Products", description: "", price: "", stock: "", sku: "" })
  }

  const handleDelete = (id) => {
    if (confirm("Are you sure you want to delete this product?")) {
      setProducts(products.filter(p => p.id !== id))
    }
  }

  // Calculate dynamic stats
  const totalProducts = products.length
  const uniqueCategories = new Set(products.map(p => p.category)).size
  const lowStockCount = products.filter(p => p.stock <= 10).length

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === "All" || p.category === category
    return matchesSearch && matchesCategory
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Product Catalog</h1>
          <p className="text-sm text-slate-500 mt-1">Manage Ortex manufacturing inventory, catalog items, and stock status.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer"
        >
          <Plus size={16} />
          <span>Add Product</span>
        </button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Archive size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Products</p>
            <p className="text-2xl font-extrabold text-slate-950 mt-0.5">{totalProducts}</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Layers size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Categories</p>
            <p className="text-2xl font-extrabold text-slate-950 mt-0.5">{uniqueCategories}</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
            <AlertTriangle size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Low Stock (≤ 10)</p>
            <p className="text-2xl font-extrabold text-slate-950 mt-0.5">{lowStockCount}</p>
          </div>
        </motion.div>
      </div>

      {/* ── Filter Bar ── */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search products by SKU or Name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all cursor-pointer font-semibold"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c === "All" ? "All Categories" : c}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 overflow-hidden shrink-0">
            <button
              onClick={() => setView("grid")}
              className={`p-2 transition-colors cursor-pointer ${view === "grid" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              <Grid3X3 size={16} />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-2 transition-colors cursor-pointer ${view === "list" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Product List/Grid View ── */}
      {filteredProducts.length > 0 ? (
        view === "grid" ? (
          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map(p => (
              <div key={p.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative group">
                <div>
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
                      {p.category}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{p.sku}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 mt-2.5 text-base">{p.name}</h3>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed">{p.desc}</p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-50 flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Unit Price</p>
                    <p className="text-lg font-black text-slate-950 mt-0.5">₹{p.price}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">In Stock</p>
                    <p className={`text-sm font-bold mt-0.5 ${p.stock <= 10 ? 'text-rose-600 font-extrabold animate-pulse' : 'text-slate-800'}`}>
                      {p.stock} units
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(p.id)}
                  className="absolute top-4 right-4 p-1.5 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="Delete item"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-left">
                    <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">SKU</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Price</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Stock</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(p => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-xs">{p.sku}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-850">{p.name}</td>
                      <td className="py-3.5 px-4 text-slate-500 font-semibold">{p.category}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-950">₹{p.price}</td>
                      <td className={`py-3.5 px-4 text-right font-semibold ${p.stock <= 10 ? 'text-rose-600 font-extrabold' : 'text-slate-650'}`}>
                        {p.stock}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="p-1.5 hover:bg-rose-50 hover:text-rose-600 text-slate-400 rounded-lg transition-colors cursor-pointer"
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
        )
      ) : (
        <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl p-16 shadow-sm text-center">
          <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-base font-bold text-slate-800">No products found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Try adjusting your filters or search queries.</p>
        </motion.div>
      )}

      {/* ── Add Product Modal ── */}
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
                  <h2 className="text-lg font-bold text-slate-900">Add Product</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Define new Ortex catalog items</p>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Product Name</label>
                  <input
                    type="text"
                    required
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Laser Engraved Wooden Shield"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Category</label>
                    <div className="relative">
                      <select
                        name="category"
                        value={form.category}
                        onChange={handleChange}
                        className="w-full appearance-none px-4 py-2 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all cursor-pointer"
                      >
                        {CATEGORIES.filter(c => c !== "All").map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">SKU Code</label>
                    <input
                      type="text"
                      required
                      name="sku"
                      value={form.sku}
                      onChange={handleChange}
                      placeholder="e.g. ACR-TRP-09"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Price (₹)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      name="price"
                      value={form.price}
                      onChange={handleChange}
                      placeholder="0"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Stock Count</label>
                    <input
                      type="number"
                      required
                      min="0"
                      name="stock"
                      value={form.stock}
                      onChange={handleChange}
                      placeholder="0"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Description</label>
                  <textarea
                    name="description"
                    rows={2}
                    value={form.description}
                    onChange={handleChange}
                    placeholder="Describe custom features, raw materials used..."
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 text-sm font-semibold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all cursor-pointer">Cancel</button>
                  <button type="submit" className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer">Save Product</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
