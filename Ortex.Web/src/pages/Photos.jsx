import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, ChevronLeft, ChevronRight, MessageSquare, Tag, Grid } from "lucide-react"
import { Link } from "react-router-dom"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

const photosData = [
  {
    "name": "Corporate Gift Acrylic Keychain",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/1/481096172/WM/HE/AO/143706925/corporate-gift-acrylic-keychain-500x500.jpeg",
    "category": "Keychain"
  },
  {
    "name": "Hyundai Printed Leather Key Chain",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/1/481100200/UR/IJ/UG/143706925/hyundai-printed-leather-key-chain-500x500.jpeg",
    "category": "Keychain"
  },
  {
    "name": "Honda Promotional Leather Keychain",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/1/481091231/PX/XM/CX/143706925/honda-promotional-leather-keychain-500x500.png",
    "category": "Keychain"
  },
  {
    "name": "Promotional And Customized Keychains",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/5/512168567/DY/DE/DS/143706925/promotional-and-customized-keychains-500x500.jpg",
    "category": "Keychain"
  },
  {
    "name": "Customized Printed Promotional Keychain",
    "url": "https://5.imimg.com/data5/SELLER/Default/2023/2/NJ/FG/UD/143706925/20230212-155053-500x500.jpg",
    "category": "Keychain"
  },
  {
    "name": "T Shirt Shaped Silicone Keychains",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/12/569941121/XQ/ZJ/HG/143706925/whatsapp-image-2025-12-23-at-06-17-36-2-500x500.jpeg",
    "category": "Keychain"
  },
  {
    "name": "Event Acrylic Keychain",
    "url": "https://5.imimg.com/data5/SELLER/Default/2024/11/463781034/EE/FO/MO/143706925/event-acrylic-keychain-500x500.jpg",
    "category": "Keychain"
  },
  {
    "name": "Advertising Acrylic Keychain",
    "url": "https://5.imimg.com/data5/SELLER/PDFImage/2024/12/474630789/NL/FO/AG/143706925/advertising-acrylic-keychain-500x500.png",
    "category": "Keychain"
  },
  {
    "name": "Acrylic Keychain In Chennai",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/1/481090402/JU/WR/UB/143706925/acrylic-keychain-in-chennai-500x500.jpeg",
    "category": "Keychain"
  },
  {
    "name": "Custom Acrylic Keychains",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/1/481088805/OD/JM/JU/143706925/custom-acrylic-keychains-500x500.jpeg",
    "category": "Keychain"
  },
  {
    "name": "Plain Leather Key Ring",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/1/481092106/NF/FY/PN/143706925/plain-leather-key-ring-500x500.jpeg",
    "category": "Keychain"
  },
  {
    "name": "Promotional 7.5 Inch Wall Clock Square 162mm",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/1/573795810/WN/GX/PY/143706925/prem-motor-7-5inch-500x500.jpeg",
    "category": "Wall Clock"
  },
  {
    "name": "15 Inch Designer Promotional Wall Clock",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/1/573804766/LV/IM/KQ/143706925/cipla-15-iinch-500x500.jpeg",
    "category": "Wall Clock"
  },
  {
    "name": "Premium Designer Wooden Wall Clock Elegant Promotional & Corporate Gift",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/2/586971663/RO/MA/YK/143706925/chatgpt-image-feb-22-2026-04-39-50-pm-500x500.png",
    "category": "Wall Clock"
  },
  {
    "name": "Premium Designer MDF Wall Clock Elegant Promotional & Corporate Gift",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/2/586971679/JR/HK/IO/143706925/chatgpt-image-feb-22-2026-04-35-28-pm-500x500.png",
    "category": "Wall Clock"
  },
  {
    "name": "Promotional 7.5 Inch Wall Clock Square 162mm",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/4/596911178/YX/YH/RA/143706925/promotional-7-5-inch-wall-clock-square-162mm-500x500.jpeg",
    "category": "Wall Clock"
  },
  {
    "name": "Customized Acrylic Watch",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/3/588539946/GP/IM/CZ/143706925/customized-acrylic-watch-500x500.jpeg",
    "category": "Wall Clock"
  },
  {
    "name": "Acrylic Fancy Wall Clock",
    "url": "https://5.imimg.com/data5/SELLER/Default/2023/9/346322532/QM/VZ/UO/143706925/acrylic-fancy-wall-clock-500x500.jpg",
    "category": "Wall Clock"
  },
  {
    "name": "Customize Acrylic Dashboard",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/4/506195244/QF/EB/BF/143706925/customize-acrylic-dashboard-500x500.jpeg",
    "category": "Exam Board"
  },
  {
    "name": "Acrylic Car Dashboard Idol",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/4/506195713/MB/ZI/QR/143706925/acrylic-car-dashboard-idol-500x500.jpeg",
    "category": "Exam Board"
  },
  {
    "name": "Premium Quality Storage Exam Board",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/4/602634900/YA/NI/IH/143706925/whatsapp-image-2026-04-23-at-12-34-32-pm-500x500.jpeg",
    "category": "Exam Board"
  },
  {
    "name": "Mdf Exam Pad Manufacturer",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/6/620543604/RO/NK/WF/143706925/mdf-exam-pad-manufacturer-500x500.jpg",
    "category": "Exam Board"
  },
  {
    "name": "Customize Exam Clip Board",
    "url": "https://5.imimg.com/data5/SELLER/Default/2024/9/454900945/MY/KH/EI/143706925/customize-exam-clip-board-500x500.jpeg",
    "category": "Exam Board"
  },
  {
    "name": "Mdf Examination Pad",
    "url": "https://5.imimg.com/data5/SELLER/Default/2024/10/461621126/QK/RA/MP/143706925/mdf-examination-pad-500x500.jpg",
    "category": "Exam Board"
  },
  {
    "name": "Custom Printed Round Fridge Magnets & Promotional Badges",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/2/587603905/MI/ZQ/KS/143706925/whatsapp-image-2026-02-27-at-4-20-23-pm-500x500.jpeg",
    "category": "Badges"
  },
  {
    "name": "TMC Badge Promotional Badges",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/3/595561759/EP/LT/YU/143706925/whatsapp-image-2026-03-30-at-10-31-07-am-500x500.jpeg",
    "category": "Badges"
  },
  {
    "name": "Plastic Safety Pin Moulded Plastic Badge Pin",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/2/586969920/VP/TA/PY/143706925/whatsapp-image-2026-02-25-at-7-01-44-pm-1-500x500.jpeg",
    "category": "Badges"
  },
  {
    "name": "Lotus Plastic Lighting Badges",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/3/591664244/QG/QI/RW/143706925/whatsapp-image-2026-03-16-at-12-21-25-pm-1-500x500.jpeg",
    "category": "Badges"
  },
  {
    "name": "Acrylic Fridge Magnet",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/1/484451444/XK/DL/AE/143706925/acrylic-fridge-magnet-500x500.jpeg",
    "category": "Fridge Magnet"
  },
  {
    "name": "Wood Mdf Fridge Magnet",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/10/551181820/QG/OT/ET/143706925/wood-mdf-fridge-magnet-500x500.jpeg",
    "category": "Fridge Magnet"
  },
  {
    "name": "Custom Fridge Magnet",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/5/509315459/IP/JM/SW/143706925/custom-fridge-magnet-500x500.png",
    "category": "Fridge Magnet"
  },
  {
    "name": "Wooden Fridge Magnet",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/4/506193229/IZ/YR/PU/143706925/wooden-fridge-magnet-500x500.jpeg",
    "category": "Fridge Magnet"
  },
  {
    "name": "Mdf Fridge Magnet",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/1/484451383/CS/RH/PB/143706925/mdf-fridge-magnet-500x500.jpeg",
    "category": "Fridge Magnet"
  },
  {
    "name": "Pvc Fridge Magnet",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/4/505472164/TM/TC/XB/143706925/pvc-fridge-magnet-500x500.jpeg",
    "category": "Fridge Magnet"
  },
  {
    "name": "BJP Flag",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/3/594040901/GX/NI/HX/143706925/bjp-flag-500x500.jpeg",
    "category": "Flag"
  },
  {
    "name": "Plain Acrylic Name Display Holder",
    "url": "https://5.imimg.com/data5/SELLER/Default/2023/9/345285655/XS/TQ/EP/143706925/plain-acrylic-name-display-holder-500x500.jpg",
    "category": "Custom Promotional"
  },
  {
    "name": "Promotional Cotton Cap",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/1/482070645/GT/ZV/FZ/143706925/promotional-cotton-cap-500x500.jpg",
    "category": "Custom Promotional"
  },
  {
    "name": "Casual Wear Promotional Cap",
    "url": "https://5.imimg.com/data5/SELLER/Default/2025/1/482069310/KN/BF/AX/143706925/casual-wear-promotional-cap-500x500.jpg",
    "category": "Custom Promotional"
  },
  {
    "name": "Acrylic Name Card Holder",
    "url": "https://5.imimg.com/data5/SELLER/Default/2023/9/346287326/CU/SK/EL/143706925/acrylic-name-card-holder-500x500.jpg",
    "category": "Custom Promotional"
  },
  {
    "name": "Acrylic Paper Weight",
    "url": "https://5.imimg.com/data5/SELLER/Default/2023/9/345279309/HP/MS/YC/143706925/acrylic-paper-weight-500x500.jpeg",
    "category": "Custom Promotional"
  },
  {
    "name": "Sublimation Mobile Popsocket",
    "url": "https://5.imimg.com/data5/SELLER/Default/2026/5/609883285/GL/CR/KR/143706925/sublimation-mobile-popsocket-500x500.jpeg",
    "category": "Custom Promotional"
  }
]

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
        <h2 className="sr-only">Visual product showcase</h2>
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
