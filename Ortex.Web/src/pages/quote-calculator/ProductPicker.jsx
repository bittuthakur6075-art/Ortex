import { Box, Category, Timer1 } from "iconsax-react"
import { Plus, Check, Search } from "../../components/ui/Icons"
import { productImage, catIconComp } from "./helpers"

// Step 1 catalogue column: search, category chips and the product grid.
export default function ProductPicker({
  query, setQuery, category, setCategory, categoriesList,
  isLoading, productsList, filtered, cart, addToCart,
}) {
  return (
    /* Catalogue. min-w-0 lets the 1fr grid track shrink so the
       single-row pills scroll inside it instead of blowing out the
       page width (grid tracks default to min-width:auto). */
    <div className="min-w-0">
      {/* Search */}
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products, e.g. keychain, trophy, badge…"
          aria-label="Search products"
          className="w-full pl-12 pr-5 py-3.5 rounded-full bg-background border border-[#EBEDF3] text-[16px] text-foreground placeholder:text-[#78829D] focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
        />
      </div>

      {/* Category chips — one row: centered when it fits, scrolls when it overflows (Work design language) */}
      <div className="mb-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max mx-auto gap-2.5 px-1">
          <button
            onClick={() => setCategory("all")}
            className={`inline-flex flex-shrink-0 items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold border whitespace-nowrap transition-colors duration-200 cursor-pointer ${
              category === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-[#EBEDF3] text-foreground hover:border-foreground/40"
            }`}
          >
            <Category size={16} variant="Bulk" color={category === "all" ? "currentColor" : "#78829D"} aria-hidden="true" />
            All products
          </button>
          {categoriesList.map((c) => {
            const Icon = catIconComp(c)
            return (
              <button
                key={c} onClick={() => setCategory(c)}
                className={`inline-flex flex-shrink-0 items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold border whitespace-nowrap transition-colors duration-200 cursor-pointer ${
                  category === c ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-[#EBEDF3] text-foreground hover:border-foreground/40"
                }`}
              >
                <Icon size={16} variant="Bulk" color={category === c ? "currentColor" : "#78829D"} aria-hidden="true" />
                {c}
              </button>
            )
          })}
        </div>
      </div>

      {/* Product grid */}
      {isLoading && productsList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <div className="w-8 h-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <span>Loading catalogue...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No products match your search.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-9">
          {filtered.map((p) => {
            const inCart = cart[p.id] != null
            return (
              <div key={p.id} className="group flex flex-col">
                {/* Image — flat tile with hover zoom (Work design language) */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted rounded-[24px] [corner-shape:squircle]">
                  <img
                    src={productImage(p)}
                    alt={p.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                  />
                </div>

                {/* Caption */}
                <div className="pt-3 flex flex-col flex-1">
                  <h3 className="text-[16px] font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors duration-200">
                    {p.name}
                  </h3>
                  <p className="mt-1 text-[14px] font-medium text-[#4b5675] line-clamp-1">
                    {p.material || "Standard specification"}
                  </p>
                  <div className="flex-1" />

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 bg-[#F4F6F8] text-[#4B5675] rounded-full px-3 py-1.5 text-[12px] font-semibold">
                      <Box size={15} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
                      MOQ {p.moq} {p.unit}
                    </span>
                    <span className="inline-flex items-center gap-1.5 bg-[#F4F6F8] text-[#4B5675] rounded-full px-3 py-1.5 text-[12px] font-semibold">
                      <Timer1 size={15} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
                      {p.leadTimeDays}d dispatch
                    </span>
                  </div>

                  {inCart ? (
                    <div className="mt-4 w-full bg-[#E8FAEE] text-[#04B440] border border-[#BAEECC] py-2.5 rounded-full font-semibold flex items-center justify-center gap-1.5 text-[13px]">
                      <Check className="h-4 w-4" /> Added to quote
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(p)}
                      className="mt-4 w-full bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 rounded-full font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-[13px]"
                    >
                      <Plus className="h-4 w-4" /> Add to quote
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
