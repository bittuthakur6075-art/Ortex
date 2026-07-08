import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, ChevronLeft, ChevronRight, MessageSquare, Tag, Grid } from "lucide-react"
import { Link } from "react-router-dom"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { photosData } from "../constants/photos"

const categories = ["All", "Keychain", "Wall Clock", "Exam Board", "Badges", "Fridge Magnet", "Flag", "Custom Promotional"]

export default function Photos() {
  useDocumentMetadata(
    "Product Photo Gallery - Ortex Industries",
    "View the high-definition product gallery of Ortex Industries. Browse our customized keychains, wall clocks, exam boards, badges, fridge magnets, flags, and promotional gifts.",
    { path: "/photos" }
  )

  const [activeCategory, setActiveCategory] = useState("All")
  const [lightboxIndex, setLightboxIndex] = useState(null)

  const filteredPhotos = activeCategory === "All"
    ? photosData
    : photosData.filter(p => p.category === activeCategory)

  const openLightbox = (index) => {
    setLightboxIndex(index)
  }

  const closeLightbox = () => {
    setLightboxIndex(null)
  }

  const handlePrev = (e) => {
    e.stopPropagation()
    setLightboxIndex((prev) => (prev === 0 ? filteredPhotos.length - 1 : prev - 1))
  }

  const handleNext = (e) => {
    e.stopPropagation()
    setLightboxIndex((prev) => (prev === filteredPhotos.length - 1 ? 0 : prev + 1))
  }

  return (
    <div className="bg-background min-h-screen py-10">
      {/* Page Header */}
      <section className="py-12 bg-secondary border-b border-border/50">
        <div className="lp-wrap text-center">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            <span className="text-xs font-bold text-primary tracking-widest uppercase bg-primary/10 px-3 py-1.5 rounded-full inline-block mb-4">
              Visual Catalogue
            </span>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight text-foreground text-balance">
              Product Photo Gallery
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Explore actual high-resolution images of our custom promotional merchandise, corporate gifts, and office accessories.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Filter Tabs */}
      <section className="py-8 bg-background">
        <div className="lp-wrap">
          <div className="flex flex-wrap justify-center gap-2 md:gap-3 mb-12">
            {categories.map((cat) => (
              <button
                key={cat}
                id={`btn-filter-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer ${
                  activeCategory === cat
                    ? "bg-[#466EFA] text-white shadow-md shadow-primary/20 scale-[1.03]"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                {cat === "All" ? "All Products" : cat}
              </button>
            ))}
          </div>

          {/* Photo Grid */}
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
          >
            <AnimatePresence mode="popLayout">
              {filteredPhotos.map((photo, index) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  key={photo.url}
                  className="group relative bg-card border border-border/60 rounded-2xl overflow-hidden hover:shadow-xl hover:border-primary/30 transition-all duration-300 flex flex-col cursor-pointer"
                  onClick={() => openLightbox(index)}
                >
                  {/* Image container */}
                  <div className="aspect-square w-full overflow-hidden bg-muted relative">
                    <img
                      src={photo.url}
                      alt={photo.name}
                      loading="lazy"
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                    />
                    {/* Category tag */}
                    <div className="absolute top-3 left-3 bg-background/80 backdrop-blur-md text-foreground text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full border border-border/40 flex items-center gap-1">
                      <Tag className="h-2.5 w-2.5 text-[#466EFA]" />
                      {photo.category}
                    </div>
                  </div>

                  {/* Info Footer */}
                  <div className="p-4 flex-grow flex flex-col justify-between items-start border-t border-border/40 bg-card/60 backdrop-blur-sm">
                    <h3 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug group-hover:text-[#466EFA] transition-colors duration-200">
                      {photo.name}
                    </h3>
                    <div className="mt-3 flex items-center justify-between w-full">
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                        <Grid className="h-3 w-3" />
                        Quick view
                      </span>
                      <Link
                        to={`/contact?product=${encodeURIComponent(photo.name)}&category=${encodeURIComponent(photo.category)}`}
                        onClick={(e) => e.stopPropagation()}
                        id={`btn-enquire-${index}`}
                        className="text-xs font-bold text-[#466EFA] hover:text-[#2f57e0] flex items-center gap-1.5 transition-colors duration-150"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Inquire
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          {/* Empty State */}
          {filteredPhotos.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20 bg-muted/30 rounded-2xl border border-dashed border-border"
            >
              <p className="text-muted-foreground font-medium">No photos found in this category.</p>
            </motion.div>
          )}
        </div>
      </section>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
            onClick={closeLightbox}
          >
            {/* Close button */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 text-white/75 hover:text-white p-2.5 rounded-full hover:bg-white/10 transition-colors duration-150 cursor-pointer"
              aria-label="Close gallery lightbox"
              id="btn-lightbox-close"
            >
              <X className="h-7 w-7" />
            </button>

            {/* Prev button */}
            <button
              onClick={handlePrev}
              className="absolute left-4 md:left-8 text-white/75 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors duration-150 cursor-pointer"
              aria-label="Previous image"
              id="btn-lightbox-prev"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>

            {/* Lightbox Content Container */}
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="max-w-4xl w-full flex flex-col md:flex-row bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Photo Area */}
              <div className="md:w-3/5 aspect-square md:aspect-auto md:h-[550px] bg-neutral-950 relative flex items-center justify-center">
                <img
                  src={filteredPhotos[lightboxIndex].url}
                  alt={filteredPhotos[lightboxIndex].name}
                  className="max-w-full max-h-full object-contain p-2"
                />
              </div>

              {/* Sidebar Info Area */}
              <div className="md:w-2/5 p-6 md:p-8 flex flex-col justify-between bg-neutral-900 text-left border-t md:border-t-0 md:border-l border-neutral-800">
                <div className="space-y-6">
                  {/* Category */}
                  <span className="bg-primary/20 text-[#466EFA] px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block">
                    {filteredPhotos[lightboxIndex].category}
                  </span>

                  {/* Name */}
                  <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight leading-snug">
                    {filteredPhotos[lightboxIndex].name}
                  </h2>

                  {/* Divider */}
                  <div className="h-px bg-neutral-800 w-full" />

                  {/* Description / Additional details */}
                  <p className="text-neutral-400 text-sm leading-relaxed">
                    Custom manufacturing is fully supported for this product. You can request changes in size, shape, material thickness, color schemes, and custom branding (UV printing or laser engraving).
                  </p>
                </div>

                {/* Call To Action */}
                <div className="pt-8">
                  <Link
                    to={`/contact?product=${encodeURIComponent(filteredPhotos[lightboxIndex].name)}&category=${encodeURIComponent(filteredPhotos[lightboxIndex].category)}`}
                    onClick={closeLightbox}
                    id="btn-lightbox-enquire"
                    className="w-full bg-[#466EFA] hover:bg-[#2f57e0] text-white py-3.5 px-6 font-semibold rounded-xl text-center transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-primary/10 cursor-pointer"
                  >
                    <MessageSquare className="h-5 w-5" />
                    Enquire for this product
                  </Link>
                </div>
              </div>
            </motion.div>

            {/* Next button */}
            <button
              onClick={handleNext}
              className="absolute right-4 md:right-8 text-white/75 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors duration-150 cursor-pointer"
              aria-label="Next image"
              id="btn-lightbox-next"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
