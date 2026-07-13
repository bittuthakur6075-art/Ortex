import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import {
  Add, Minus, ClipboardText, Colorfilter, Category, Truck,
  Building3, ReceiptText, ShieldTick, ArrowRight,
} from "iconsax-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { fadeUp, EASE } from "../components/home/Section"
import PageHero from "../components/ui/PageHero"
import { whatsappLink, CONTACT } from "../constants/site"

/**
 * Full FAQ, grouped by topic. Every answer is grounded in real business data
 * (products.js MOQ/GST/lead times, uploads.js file limits, Terms.jsx payment
 * policy, constants/site.js contact details) — nothing invented. A flattened
 * copy of all questions is emitted as FAQPage JSON-LD for rich results.
 */
const FAQ_GROUPS = [
  {
    id: "ordering",
    icon: ClipboardText,
    title: "Ordering & quotes",
    items: [
      {
        q: "How do I get pricing or a quote?",
        a: "We prepare a formal GST quotation for every enquiry rather than list fixed prices, because the rate depends on your product, material, quantity, and finish. Build your list in the quote builder, or send your requirement over WhatsApp or email, and our sales desk returns a written, volume-tiered quotation, usually within one working day.",
      },
      {
        q: "What is your Minimum Order Quantity (MOQ)?",
        a: "Because we manufacture in-house, MOQs are flexible and vary by product. Wall clocks start at 10 units; acrylic paperweights, examination boards and corporate gifts start at 25; keychains, badges, clipboards and MDF products start at 50; lanyards and fridge magnets start at 100; and moulded silicone, PVC and satin items start at 200. Every product card shows its exact MOQ, and smaller promotional sample runs can be negotiated.",
      },
      {
        q: "Can I order a product that is not in your catalogue?",
        a: "Yes. Custom and OEM work is our core business. If you need a unique size, shape, material, or finish that is not listed, send your specification through the Contact form or WhatsApp and we will quote it as a custom run.",
      },
      {
        q: "Can I combine different products or colours in one order?",
        a: "Yes. A single order can mix multiple products, colours, and artwork versions. Add each item to your quote and we consolidate everything into one quotation and one dispatch.",
      },
      {
        q: "How do I place and confirm an order?",
        a: "Approve your quotation and digital mockup, clear the advance, and we schedule production. You receive updates through to dispatch, and a formal GST invoice with your order.",
      },
    ],
  },
  {
    id: "customization",
    icon: Colorfilter,
    title: "Customization & artwork",
    items: [
      {
        q: "What design and logo file formats do you accept?",
        a: "For crisp UV printing and laser engraving we prefer vector files: .AI, .CDR, .DXF, .EPS, .PDF or .SVG. High-resolution .PNG or .JPG files are also accepted. Upload files up to 10 MB in the quote builder, or send larger files over WhatsApp or email.",
      },
      {
        q: "I don't have print-ready artwork. Can you help?",
        a: "Yes. Our in-house design team can clean up, redraw, or lay out your logo for production, and prepare a proof for your approval before anything is cut or printed.",
      },
      {
        q: "Do you match specific brand colours?",
        a: "Yes. We match Pantone shades across printing and finishing so the run reflects your brand precisely rather than a close approximation. Share your colour references along with your artwork.",
      },
      {
        q: "What printing and finishing methods do you use?",
        a: "Depending on the product and material, we use flatbed UV printing, laser engraving and cutting, CNC routing, dye sublimation, thermo-embossing, and hot-stamping or debossing for leather. We recommend the best method for your item when we quote.",
      },
      {
        q: "Will I see a proof before production?",
        a: "Always. We provide a free digital mockup, a 2D or 3D layout, for approval on every order. A physical pre-production sample can also be produced for a nominal fee that is refundable once you confirm the bulk order.",
      },
      {
        q: "Can you produce fully custom shapes, sizes, and materials?",
        a: "Yes. Custom shapes, sheet thicknesses, sizes, and material choices are standard for us, since almost everything is cut and finished to your artwork in-house.",
      },
    ],
  },
  {
    id: "products",
    icon: Category,
    title: "Products & materials",
    items: [
      {
        q: "What products do you manufacture?",
        a: "We make customized keychains, acrylic products, MDF products, lanyards and ID accessories, badges, examination boards, promotional wall clocks, fridge magnets, corporate gifts, flags and banners, clipboards and writing pads, and promotional merchandise. If you have something outside this list, ask us.",
      },
      {
        q: "What materials do you work with?",
        a: "Acrylic, MDF, natural wood, PU and genuine leather, food-grade silicone, soft PVC, satin and polyester ribbon, tinplate and brass, PVC and ABS board, and stainless steel for drinkware, among others. Material is matched to the product and finish you need.",
      },
      {
        q: "Can I get plain or unbranded products?",
        a: "Yes. We supply blank and unbranded stock, and we also white-label, packing and shipping under your brand rather than ours.",
      },
    ],
  },
  {
    id: "delivery",
    icon: Truck,
    title: "Production & delivery",
    items: [
      {
        q: "What are your standard lead times?",
        a: "Most orders dispatch in about 4 to 12 working days, depending on the product, quantity, and finish. Simpler items like button badges and satin keychains move fastest, while wooden clocks and moulded or assembled items take longer. Your quotation confirms the dispatch window for your specific order.",
      },
      {
        q: "Do you deliver across India?",
        a: "Yes. We dispatch PAN India with tracking through reliable courier and freight partners.",
      },
      {
        q: "Do you ship internationally?",
        a: "Yes. We provide worldwide export support, handling export documentation, customs paperwork, and secure packing, and ship through trusted freight partners.",
      },
      {
        q: "Who handles packaging and shipping?",
        a: "We pack every order securely for transit and arrange dispatch. Freight terms are confirmed in your quotation, and export orders include the required documentation.",
      },
      {
        q: "Do you offer rush or express production?",
        a: "Where the schedule allows, we can prioritise urgent orders. Share your deadline when you enquire and we will confirm whether an expedited window is possible.",
      },
    ],
  },
  {
    id: "oem",
    icon: Building3,
    title: "OEM & white-label",
    items: [
      {
        q: "Do you offer OEM and white-label manufacturing?",
        a: "Yes. Contract manufacturing is a core part of what we do. We produce custom MDF, acrylic, lanyard, badge, and merchandise lines under your own label, from your files to finished, packed stock.",
      },
      {
        q: "Will the products carry any Ortex branding?",
        a: "No. White-label orders carry only your brand. There is no Ortex marking on the product or packaging unless you ask for it.",
      },
      {
        q: "Can resellers, agencies, and other brands order from you?",
        a: "Yes. We regularly supply resellers, corporate gifting companies, event teams, and agencies producing merchandise for their own clients.",
      },
      {
        q: "Do you keep our designs and projects confidential?",
        a: "Yes. We treat your artwork and project details as confidential. Any custom mould or tooling we develop for your order is kept on file so your repeat runs stay consistent.",
      },
    ],
  },
  {
    id: "payment",
    icon: ReceiptText,
    title: "Payment, invoicing & GST",
    items: [
      {
        q: "How does payment work?",
        a: "Custom production is confirmed with an advance deposit, with the balance cleared before dispatch. Because items are made to your artwork, deposits become non-refundable once production setup begins. Full terms are shared with your quotation.",
      },
      {
        q: "Do you provide a GST invoice?",
        a: "Yes. Every order ships with a formal GST invoice for clean, accountable procurement.",
      },
      {
        q: "What GST rate applies?",
        a: "Most products are billed at 18% GST, while lanyards, flags, and caps are billed at 12%. Your quotation and invoice show the exact rate for each item.",
      },
      {
        q: "Can I cancel or change an order after confirming?",
        a: "Artwork and quantity changes are easiest before production setup begins. Once manufacturing starts, orders cannot be cancelled and deposits are non-refundable, since each item is custom-made. Talk to us early if a change is needed.",
      },
    ],
  },
  {
    id: "quality",
    icon: ShieldTick,
    title: "Quality & support",
    items: [
      {
        q: "How do you ensure quality?",
        a: "Every stage stays under our own roof, from raw sheet to cutting, printing, assembly, and packing, with checks at each step. Nothing is subcontracted, so the batch you receive holds to one consistent standard.",
      },
      {
        q: "Will a reorder match my previous batch?",
        a: "Yes. We keep your approved artwork and specifications on file, so repeat orders match your earlier run in colour, size, and finish.",
      },
      {
        q: "What if an item arrives damaged or defective?",
        a: "Contact us right away with photos and your order details. We review genuine manufacturing or transit issues and arrange a remake or a fair resolution.",
      },
      {
        q: "How do I reach your team?",
        a: `Call ${CONTACT.phonePrimary} or ${CONTACT.phoneSecondary}, message us on WhatsApp, or email ${CONTACT.email}. Our hours are ${CONTACT.hours}.`,
      },
    ],
  },
]

const ALL_ITEMS = FAQ_GROUPS.flatMap((g) => g.items)

const WhatsAppIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 510 513" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fillRule="evenodd" clipRule="evenodd" d="M435.689 74.468C387.754 26.471 324 0.025 256.071 0C116.098 0 2.18 113.906 2.131 253.916C2.107 298.674 13.808 342.361 36.029 380.862L0 512.459L134.617 477.148C171.704 497.386 213.467 508.039 255.962 508.051H256.071C396.02 508.051 509.951 394.134 509.999 254.123C510.023 186.268 483.638 122.478 435.689 74.48V74.468ZM256.071 465.168H255.986C218.118 465.157 180.97 454.976 148.558 435.751L140.851 431.174L60.965 452.127L82.285 374.238L77.268 366.251C56.143 332.646 44.978 293.804 45.002 253.929C45.051 137.563 139.731 42.883 256.157 42.883C312.53 42.908 365.521 64.886 405.371 104.786C445.224 144.674 467.152 197.713 467.128 254.099C467.078 370.476 372.4 465.157 256.071 465.157V465.168ZM371.839 307.101C365.495 303.923 334.302 288.581 328.481 286.462C322.661 284.343 318.437 283.285 314.211 289.64C309.986 295.997 297.823 310.291 294.121 314.515C290.419 318.753 286.718 319.277 280.374 316.098C274.031 312.92 253.587 306.224 229.345 284.611C210.485 267.784 197.748 247.013 194.048 240.656C190.346 234.301 193.658 230.867 196.823 227.713C199.672 224.865 203.167 220.299 206.345 216.597C209.523 212.895 210.57 210.242 212.688 206.016C214.808 201.778 213.748 198.079 212.166 194.899C210.582 191.722 197.895 160.49 192.598 147.791C187.447 135.421 182.213 137.101 178.329 136.894C174.626 136.711 170.402 136.675 166.165 136.675C161.928 136.675 155.06 138.257 149.24 144.614C143.42 150.968 127.031 166.323 127.031 197.541C127.031 228.761 149.764 258.946 152.942 263.183C156.119 267.42 197.687 331.501 261.331 358.995C276.466 365.533 288.288 369.441 297.506 372.363C312.702 377.197 326.533 376.516 337.466 374.883C349.656 373.058 375.006 359.53 380.29 344.711C385.573 329.893 385.573 317.182 383.991 314.539C382.409 311.898 378.172 310.302 371.828 307.125L371.839 307.101Z" fill="currentColor" />
  </svg>
)

export default function FAQ() {
  useDocumentMetadata(
    "Frequently Asked Questions - Ortex Industries",
    "Got questions about custom manufacturing, MOQ, sampling policies, or design files? Find answers to frequently asked questions about Ortex Industries.",
    { path: "/faq" }
  )

  useEffect(() => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": ALL_ITEMS.map((item) => ({
        "@type": "Question",
        "name": item.q,
        "acceptedAnswer": { "@type": "Answer", "text": item.a },
      })),
    }
    const script = document.createElement("script")
    script.type = "application/ld+json"
    script.id = "faq-schema"
    script.innerHTML = JSON.stringify(schema)
    document.head.appendChild(script)
    return () => document.getElementById("faq-schema")?.remove()
  }, [])

  // One open answer at a time, keyed "groupId-index".
  const [openId, setOpenId] = useState(null)

  return (
    <div className="bg-background min-h-screen">
      <PageHero title="Frequently asked questions">
        Everything about ordering, customization, materials, delivery, OEM, and payment, answered in one place.
      </PageHero>

      <section className="pb-[140px] bg-background text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-16 gap-y-12 items-start">

            {/* Left: sticky topic jump-nav */}
            <aside className="hidden lg:block lg:col-span-4 lg:sticky lg:top-28 self-start">
              <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-4">
                Browse by topic
              </p>
              <nav aria-label="FAQ topics">
                <ul className="space-y-0.5">
                  {FAQ_GROUPS.map((g) => (
                    <li key={g.id}>
                      <a
                        href={`#${g.id}`}
                        className="group flex items-center gap-3 rounded-[12px] [corner-shape:squircle] px-3 py-2.5 text-[15px] font-medium text-foreground hover:bg-secondary hover:text-primary transition-colors"
                      >
                        <span className="grid place-items-center w-8 h-8 rounded-[10px] [corner-shape:squircle] bg-secondary text-primary group-hover:bg-primary/10 transition-colors">
                          <g.icon size={17} color="currentColor" variant="Bulk" aria-hidden="true" />
                        </span>
                        {g.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            {/* Right: grouped accordions */}
            <div className="lg:col-span-8 space-y-14">
              {FAQ_GROUPS.map((group) => (
                <div key={group.id} id={group.id} className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-5">
                    <span className="grid place-items-center w-10 h-10 rounded-[12px] [corner-shape:squircle] bg-primary/10 text-primary">
                      <group.icon size={22} color="currentColor" variant="Bulk" aria-hidden="true" />
                    </span>
                    <h2 className="text-[24px] md:text-[28px] font-semibold text-foreground tracking-tight">
                      {group.title}
                    </h2>
                  </div>

                  <div className="border-t border-border">
                    {group.items.map((item, idx) => {
                      const id = `${group.id}-${idx}`
                      const isOpen = openId === id
                      return (
                        <motion.div
                          key={item.q}
                          {...fadeUp}
                          transition={{ ...fadeUp.transition, delay: Math.min(idx, 5) * 0.04 }}
                          className="border-b border-border"
                        >
                          <button
                            type="button"
                            onClick={() => setOpenId(isOpen ? null : id)}
                            aria-expanded={isOpen}
                            aria-controls={`${id}-panel`}
                            className="w-full flex items-center justify-between gap-4 py-5 text-left"
                          >
                            <span className={`text-[16px] md:text-[17px] font-semibold transition-colors ${isOpen ? "text-primary" : "text-foreground"}`}>
                              {item.q}
                            </span>
                            {isOpen
                              ? <Minus size={22} color="currentColor" variant="Bulk" className="text-primary flex-shrink-0" aria-hidden="true" />
                              : <Add size={22} color="currentColor" variant="Bulk" className="text-muted-foreground flex-shrink-0" aria-hidden="true" />}
                          </button>
                          <AnimatePresence initial={false}>
                            {isOpen && (
                              <motion.div
                                id={`${id}-panel`}
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: EASE }}
                                className="overflow-hidden"
                              >
                                <p className="pb-5 -mt-1 text-[16px] text-muted-foreground leading-relaxed max-w-2xl">
                                  {item.a}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* Closing CTA banner */}
      <section className="pb-[140px] bg-background">
        <div className="px-[50px]">
          <div className="relative min-h-[380px] overflow-hidden rounded-[28px] [corner-shape:squircle]">
            <img
              src="/img/faq-production.avif"
              alt="Custom lanyard and ribbon webbing on an Ortex production line"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />
            <div className="absolute inset-0 flex items-end">
              <motion.div {...fadeUp} className="w-full p-8 md:p-14">
                <span className="block text-[14px] font-semibold text-white/80 tracking-[0.22em] uppercase mb-3">
                  Still not sure?
                </span>
                <h2 className="max-w-3xl text-[32px] md:text-[52px] font-medium leading-[1.1] tracking-tight text-white text-balance mb-6">
                  Talk to our team directly
                </h2>
                <p className="max-w-xl text-[16px] md:text-[18px] text-white/80 mb-8">
                  Send your requirement and a real person replies within one working day, with a formal GST quotation.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/contact"
                    className="px-7 py-3.5 bg-white text-foreground hover:bg-white/90 font-semibold text-[15px] rounded-full inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
                  >
                    Contact us
                    <ArrowRight size={18} color="currentColor" variant="Linear" aria-hidden="true" />
                  </Link>
                  <a
                    href={whatsappLink("Hi Ortex Industries, I have a question about a custom order.")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-7 py-3.5 bg-whatsapp text-[#071437] hover:brightness-95 font-semibold text-[15px] rounded-full inline-flex items-center gap-2.5 transition-all duration-200 active:scale-[0.98]"
                  >
                    <WhatsAppIcon className="w-4 h-4 fill-current" />
                    Chat on WhatsApp
                  </a>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
