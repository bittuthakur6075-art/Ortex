import { useRef } from "react"
import { Box, Category, Timer1 } from "iconsax-react"
import { Plus, Search, X } from "../../components/ui/Icons"
import { productImage, catIconComp, keepFocusIn } from "./helpers"
import QtyStepper from "./QtyStepper"

const chipClass = (active) => `inline-flex flex-shrink-0 items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold border whitespace-nowrap transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
  active ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-[#EBEDF3] text-foreground hover:border-foreground/40"
}`

// Step 1 catalogue column: search, category chips and the product grid.
export default function ProductPicker({
  query, setQuery, category, setCategory, categoriesList,
  isLoading, productsList, filtered, cart, addToCart, setQty, bumpQty,
}) {
  const hasFilter = query.trim() !== "" || category !== "all"
  // Each card's action slot, by product id, for moving focus.
  const slots = useRef({}).current
  const focusStepper = (id) => requestAnimationFrame(() => slots[id]?.querySelector("input")?.focus())
  const clearFilters = () => { setQuery(""); setCategory("all") }

  return (
    /* Catalogue. min-w-0 lets the 1fr grid track shrink so the
       single-row pills scroll inside it instead of blowing out the
       page width (grid tracks default to min-width:auto). */
    <div className="min-w-0">
      {/* Keeps the heading order h1 > h2 > h3 for the product cards below. */}
      <h2 className="sr-only">Choose products for your quote</h2>
      {/* Search */}
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products, e.g. keychain, trophy, badge…"
          aria-label="Search products"
          className="w-full pl-12 pr-12 py-3.5 rounded-full bg-background border border-[#EBEDF3] text-[16px] text-foreground placeholder:text-[#636c85] focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-full text-[#78829D] hover:text-foreground hover:bg-[#F4F6F8] cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Category chips: one row, centered when it fits, scrolls when it overflows (Work design language) */}
      <div className="mb-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max mx-auto gap-2.5 px-1 py-1" role="group" aria-label="Filter by category">
          <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")} className={chipClass(category === "all")}>
            <Category size={16} variant="Bulk" color={category === "all" ? "currentColor" : "#78829D"} aria-hidden="true" />
            All products
          </button>
          {categoriesList.map((c) => {
            const Icon = catIconComp(c)
            return (
              <button type="button" key={c} aria-pressed={category === c} onClick={() => setCategory(c)} className={chipClass(category === c)}>
                <Icon size={16} variant="Bulk" color={category === c ? "currentColor" : "#78829D"} aria-hidden="true" />
                {c}
              </button>
            )
          })}
        </div>
      </div>

      {/* Result count */}
      {!(isLoading && productsList.length === 0) && (
        <div className="mb-5 flex items-center justify-between gap-3 text-[14px] text-[#4B5675]" aria-live="polite">
          <span>
            Showing <strong className="font-semibold text-foreground">{filtered.length}</strong> product{filtered.length === 1 ? "" : "s"}
            {category !== "all" && <> in {category}</>}
          </span>
          {hasFilter && filtered.length > 0 && (
            <button type="button" onClick={clearFilters} className="font-semibold text-primary hover:underline cursor-pointer">Clear filters</button>
          )}
        </div>
      )}

      {/* Product grid */}
      {isLoading && productsList.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-9" aria-busy="true" aria-label="Loading products">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex flex-col animate-pulse">
              <div className="aspect-square w-full bg-muted rounded-[24px] [corner-shape:squircle]" />
              <div className="mt-3 h-4 w-4/5 rounded bg-muted" />
              <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
              <div className="mt-4 h-10 w-full rounded-full bg-muted" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-[24px] border border-dashed border-[#EBEDF3]">
          <p className="text-[16px] font-semibold text-foreground">No products match{query.trim() ? <> “{query.trim()}”</> : ""}.</p>
          <p className="mt-1 text-[14px] text-[#4B5675]">Try another word, or tell us what you need in the notes on the next step. We make custom items too.</p>
          {hasFilter && (
            <button type="button" onClick={clearFilters}
              className="mt-5 px-5 py-2.5 rounded-full border border-border hover:border-foreground/40 text-foreground font-semibold cursor-pointer">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-9">
          {filtered.map((p) => {
            const qty = cart[p.id]
            const inCart = qty != null
            return (
              <div key={p.id} className="group flex flex-col">
                {/* Image: flat tile with hover zoom (Work design language) */}
                <div className={`relative aspect-square w-full overflow-hidden bg-muted rounded-[24px] [corner-shape:squircle] ${inCart ? "ring-2 ring-primary ring-offset-2" : ""}`}>
                  <img
                    src={productImage(p)}
                    alt={p.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                  />
                  {inCart && (
                    <span className="absolute top-3 left-3 rounded-full bg-primary text-primary-foreground px-2.5 py-1 text-[12px] font-semibold">In quote</span>
                  )}
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
                    {p.leadTimeDays > 0 && (
                      <span className="inline-flex items-center gap-1.5 bg-[#F4F6F8] text-[#4B5675] rounded-full px-3 py-1.5 text-[12px] font-semibold">
                        <Timer1 size={15} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
                        {p.leadTimeDays}d dispatch
                      </span>
                    )}
                  </div>

                  {/* The button and the stepper replace each other here, so
                      focus follows into whichever one is now shown. */}
                  <div className="mt-4" ref={(el) => { slots[p.id] = el }}>
                  {inCart ? (
                    <div className="flex justify-center">
                      <QtyStepper product={p} qty={Math.max(0, Number(qty) || 0)} setQty={setQty}
                        bumpQty={(id, dir) => { bumpQty(id, dir); keepFocusIn(slots[p.id]) }} size="sm" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { if (addToCart(p) !== false) focusStepper(p.id) }}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 rounded-full font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      <Plus className="h-4 w-4" /> Add to quote
                    </button>
                  )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
