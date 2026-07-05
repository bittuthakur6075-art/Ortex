import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

export default function Portfolio() {
  useDocumentMetadata(
    "Portfolio - Ortex Industries | Our Recent Work & Manufacturing Projects",
    "Explore the Ortex Industries portfolio featuring our premium customized products, including MDF items, acrylic awards, custom lanyards, and corporate gifts.",
    { path: "/portfolio" }
  )

  const categories = [
    "MDF Products",
    "Acrylic Products",
    "Badges & Lanyards",
    "Corporate Gifts",
    "Stationery & Promotional"
  ]

  const portfolioItems = [
    {
      id: 3,
      image: "https://images.unsplash.com/photo-1552289195-d5e549d437b4",
      title: "MDF Wall Art Signages",
      category: "MDF Products",
      description: "Decorative MDF wall art and signages built for professional interiors and branding.",
      altText: "MDF Wall Art Signages"
    },
    {
      id: 4,
      image: "https://images.unsplash.com/photo-1687462696565-25e77a767971",
      title: "Acrylic Display Stands",
      category: "Acrylic Products",
      description: "Clear, durable acrylic display stands suitable for retail counters and exhibitions.",
      altText: "Acrylic Display Stands"
    },
    {
      id: 6,
      image: "https://images.unsplash.com/photo-1527894060890-258f21b55c46",
      title: "Acrylic Name Plates",
      category: "Acrylic Products",
      description: "Professional acrylic name plates for office desks and doors, offering a sleek and modern appearance.",
      altText: "Acrylic Name Plates"
    },
    {
      id: 7,
      image: "https://images.unsplash.com/photo-1682335610247-2b7db8423551",
      title: "Custom Printed Lanyards",
      category: "Badges & Lanyards",
      description: "High-quality polyester and satin lanyards featuring vibrant sublimation printing for corporate IDs.",
      altText: "Custom Printed Lanyards"
    },
    {
      id: 8,
      image: "https://images.unsplash.com/photo-1622876969099-7b2cd8717b66",
      title: "Magnetic Name Badges",
      category: "Badges & Lanyards",
      description: "Premium magnetic name badges designed for events and hospitality staff without damaging clothing.",
      altText: "Magnetic Name Badges"
    },
    {
      id: 9,
      image: "https://images.unsplash.com/photo-1635870224948-01dd421f1cb7",
      title: "Premium Corporate Gift Sets",
      category: "Corporate Gifts",
      description: "Carefully curated luxury gift sets including branded pens, diaries, and personalized accessories.",
      altText: "Premium Corporate Gift Sets"
    },
    {
      id: 10,
      image: "https://images.unsplash.com/photo-1654343338221-dff50d351b9d",
      title: "Executive Diaries",
      category: "Corporate Gifts",
      description: "High-end executive diaries with custom embossing and elegant finishes for professional gifting.",
      altText: "Executive Diaries"
    },
    {
      id: 11,
      image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/1c8810a9aab598f2852aa43694b1e810.jpg",
      title: "Custom Printed Polyester Lanyard - TNQ Foundation",
      category: "Badges & Lanyards",
      description: "Premium yellow polyester lanyard with full-color custom printing (TNQ Foundation branding), metal hardware, and safety release clip. Features durable construction with professional finish for corporate events and organizational use.",
      altText: "Yellow polyester lanyard with TNQ Foundation custom printing and metal hardware"
    },
    {
      id: 12,
      image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/df12dcba362d2a4018c92cdfe42fe5ea.jpg",
      title: "Magnetic Metal Badge - Brainly Bee Design",
      category: "Badges & Lanyards",
      description: 'Colorful circular magnetic metal badge featuring "I Am A Brainly Bee" design with yellow and blue colors. High-quality printing with strong magnetic backing for secure attachment to uniforms, bags, and promotional items.',
      altText: 'Set of circular magnetic metal badges with "I Am A Brainly Bee" design in yellow and blue'
    },
    {
      id: 13,
      image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/348f14b4519831287f42e8843fa4ccf1.png",
      title: "Acrylic Name Badge - Medinetix Diagnostic",
      category: "Acrylic Products",
      description: "Custom-printed acrylic name badge with professional healthcare branding (Medinetix Diagnostic). Features colorful logo design with magnetic backing for easy attachment. Ideal for medical professionals, healthcare staff, and clinic personnel.",
      altText: "Acrylic name badge for Medinetix Diagnostic with green heart logo, blue text, and magnetic backing"
    },
    {
      id: 14,
      image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/bfcd631b36b72777ed9b93146eab51d1.jpg",
      title: "MDF Wall Mount Clock - Meghalaya Design",
      category: "MDF Products",
      description: "Decorative MDF wall-mounted clock featuring vibrant Meghalaya tourism design with green landscape and helicopter imagery. High-quality UV printing with protective finish. Perfect for travel agencies, tourism offices, and decorative wall displays.",
      altText: "Set of four MDF wall-mounted clocks with Meghalaya design featuring green landscape and helicopter imagery"
    },
    {
      id: 15,
      image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/361faf75782d94ec7db0ed3a259f5d50.jpg",
      title: "Souvenir Magnet - I Love Haflong",
      category: "Stationery & Promotional",
      description: 'Decorative souvenir magnet featuring "I Love Haflong" design with scenic landscape imagery. High-quality printing with strong magnetic backing. Perfect for tourism souvenirs and promotional giveaways.',
      altText: 'Decorative souvenir magnet with "I Love Haflong" design featuring scenic landscape and tourism imagery'
    },
    {
      id: 16,
      image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/458febc687a80adf5b027abd1ebdf24b.jpg",
      title: "Colorful Spinner Fidget Toys - Promotional Items",
      category: "Stationery & Promotional",
      description: "Vibrant multicolor spinner fidget toys with customizable center area for branding. Available in various color combinations (green, purple, orange, blue, yellow, pink). Perfect for promotional giveaways, corporate events, and merchandise. High-quality plastic construction with smooth spinning action.",
      altText: "Vibrant multicolor spinner fidget toys with customizable center area for branding"
    },
    {
      id: 17,
      image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/56315942c1152cce539bfd626e71bd74.jpg",
      title: "Flower-Shaped Sticky Notes - Colorful Adhesive Pads",
      category: "Stationery & Promotional",
      description: "Decorative flower-shaped sticky notes with colorful petals in green, yellow, pink, blue, and orange. High-quality adhesive backing for easy attachment to surfaces. Perfect for office use, reminders, and promotional giveaways. Eco-friendly paper construction.",
      altText: "Decorative flower-shaped sticky notes with colorful petals"
    },
    {
      id: 18,
      image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/01c646b1bb21e4fbef8b388744992828.jpg",
      title: "Syringe-Style Highlighters - Medical-Themed Stationery",
      category: "Stationery & Promotional",
      description: "Unique syringe-shaped highlighters with medical-themed design. Available in bright colors (green, yellow) with measurement markings. Perfect for healthcare professionals, medical students, and promotional items for pharmaceutical companies. High-quality ink with smooth writing performance.",
      altText: "Unique syringe-shaped highlighters with medical-themed design"
    },
    {
      id: 19,
      image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/38ae3a135e4a18e538c6d77373b7ad36.jpg",
      title: "Pill-Shaped Highlighters - Capsule Design Stationery",
      category: "Stationery & Promotional",
      description: "Innovative pill/capsule-shaped highlighters with red and white color design. Unique ergonomic shape with comfortable grip. Perfect for medical professionals, pharmaceutical promotions, and creative office supplies. High-quality plastic construction with vibrant ink colors.",
      altText: "Innovative pill/capsule-shaped highlighters with red and white color design"
    }
  ]

  const [activeCategory, setActiveCategory] = useState("All")
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  const filteredItems = activeCategory === "All" 
    ? portfolioItems 
    : portfolioItems.filter(item => item.category === activeCategory)

  const openLightbox = (index) => {
    setCurrentIndex(index)
    setLightboxOpen(true)
  }

  const closeLightbox = () => {
    setLightboxOpen(false)
  }

  const nextImage = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % filteredItems.length)
  }

  const prevImage = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + filteredItems.length) % filteredItems.length)
  }

  // Keyboard navigation for Lightbox
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!lightboxOpen) return
      if (e.key === "Escape") closeLightbox()
      if (e.key === "ArrowRight") nextImage()
      if (e.key === "ArrowLeft") prevImage()
    }
    window.addEventListener("keydown", handleKeyDown)
    if (lightboxOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "auto"
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = "auto"
    }
  }, [lightboxOpen, filteredItems])

  return (
    <>
      {/* Page Header */}
      <section className="py-20 bg-secondary text-secondary-foreground">
        <div className="lp-wrap text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight text-foreground text-balance">
              Our Portfolio
            </h1>
            <p className="text-lg opacity-80 leading-relaxed text-muted-foreground">
              Discover a selection of our recent manufacturing projects. From custom branding solutions to premium corporate gifts, see how we bring ideas to life.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Gallery Section */}
      <section className="py-16 lp-wrap">
        
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-12">
          <button 
            onClick={() => setActiveCategory("All")}
            className={`px-4 py-2 text-sm font-medium rounded-full border transition-all duration-300 cursor-pointer ${
              activeCategory === "All"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground hover:bg-muted border-border"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button 
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 text-sm font-medium rounded-full border transition-all duration-300 cursor-pointer ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground hover:bg-muted border-border"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Portfolio Grid */}
        <motion.div 
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"
        >
          <AnimatePresence mode="popLayout">
            {filteredItems.map((item, idx) => (
              <motion.div 
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                onClick={() => openLightbox(idx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    openLightbox(idx)
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`View details for ${item.title}`}
                className="gallery-card group cursor-pointer flex flex-col h-full rounded-xl bg-card border border-border/50 shadow-sm hover:shadow-xl transition-all duration-300 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="gallery-image-wrapper aspect-square overflow-hidden rounded-t-xl bg-muted relative">
                  <img
                    src={item.image}
                    alt={item.altText}
                    loading="lazy"
                    decoding="async"
                    className="gallery-image w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-2 block">
                      {item.category}
                    </span>
                    <h3 className="text-lg font-bold text-foreground mb-2 line-clamp-1 leading-snug">
                      {item.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {filteredItems.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p>No projects found in this category.</p>
          </div>
        )}
      </section>

      {/* Fullscreen Lightbox Modal */}
      <AnimatePresence>
        {lightboxOpen && filteredItems[currentIndex] && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="lightbox-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
            onClick={closeLightbox}
          >
            {/* Modal Content */}
            <div 
              className="relative max-w-4xl w-full mx-4 flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              
              {/* Close Button */}
              <button 
                onClick={closeLightbox}
                className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all duration-200 cursor-pointer"
                aria-label="Close lightbox"
              >
                <X className="h-6 w-6" />
              </button>

              {/* Navigation Controls */}
              <button 
                onClick={prevImage}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all duration-200 cursor-pointer z-10"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              
              <button 
                onClick={nextImage}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all duration-200 cursor-pointer z-10"
                aria-label="Next image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>

              {/* Main Image Slider View */}
              <div className="bg-card rounded-2xl overflow-hidden shadow-2xl w-full border border-border/50 max-h-[85vh] flex flex-col md:flex-row text-left">
                
                {/* Image side */}
                <div className="flex-1 bg-muted flex items-center justify-center max-h-[50vh] md:max-h-[85vh]">
                  <motion.img 
                    key={filteredItems[currentIndex].id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    src={filteredItems[currentIndex].image} 
                    alt={filteredItems[currentIndex].altText}
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Details side */}
                <div className="w-full md:w-[350px] p-6 md:p-8 flex flex-col justify-center bg-card">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-2 block">
                    {filteredItems[currentIndex].category}
                  </span>
                  <h2 className="text-2xl font-bold text-foreground mb-4 leading-tight">
                    {filteredItems[currentIndex].title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {filteredItems[currentIndex].description}
                  </p>
                  
                  <div className="mt-8 pt-6 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
                    <span>Item {currentIndex + 1} of {filteredItems.length}</span>
                    <Link 
                      to={`/contact?product=${encodeURIComponent(filteredItems[currentIndex].title)}&category=${encodeURIComponent(filteredItems[currentIndex].category)}`}
                      onClick={closeLightbox}
                      className="text-primary hover:underline font-semibold"
                    >
                      Inquire about this
                    </Link>
                  </div>
                </div>

              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
