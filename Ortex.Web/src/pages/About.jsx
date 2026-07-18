import { motion } from "framer-motion"
import {
  Personalcard,
  Layer,
  ShieldTick,
  TrendUp,
  Timer1,
  Global,
  Setting2,
  Verify,
  Truck,
  People,
  Box,
  Ruler,
  Brush,
  TickCircle,
} from "iconsax-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { fadeUp, RevealWords } from "../components/home/Section"
import PageCTA from "../components/ui/PageCTA"
import PageHero from "../components/ui/PageHero"

export default function About() {
  useDocumentMetadata(
    "About Ortex Industries - Manufacturing Excellence & Customization Expertise",
    "Learn the Ortex Industries story: how we started, why brands across India trust us, the quality we deliver, and the in-house customization capabilities that make us your ideal manufacturing partner.",
    { path: "/about" }
  )

  const milestones = [
    {
      year: "The beginning",
      title: "It started with a promise",
      description:
        "Ortex began as one small workshop with a single belief: every business, big or small, deserves a maker who treats their order like their own brand is on the line.",
    },
    {
      year: "Building the floor",
      title: "We built our own floor",
      description:
        "So we stopped outsourcing and invested in our own routing, UV printing, laser engraving, and finishing, keeping quality and timelines in our hands, never a vendor's.",
    },
    {
      year: "Earning trust",
      title: "Trust, earned order by order",
      description:
        "Word travelled through corporates, schools, and event teams. Clients who came for one run kept coming back, because what shipped matched exactly what we promised, on time.",
    },
    {
      year: "Today",
      title: "A partner, not a vendor",
      description:
        "Today we supply brands across India and export worldwide, making MDF, acrylic, lanyards, badges, and gifts at scale, all under one roof and built to each brand's spec.",
    },
  ]

  const stats = [
    { value: "10+", label: "Years crafting custom products" },
    { value: "5L+", label: "Products delivered to date" },
    { value: "1,200+", label: "Brands and businesses served" },
    { value: "98%", label: "Orders dispatched on time" },
  ]

  const trustPillars = [
    {
      icon: Setting2,
      title: "All in-house",
      description:
        "Design, print, brand, and finish under one roof. One team owns your order end to end.",
    },
    {
      icon: Verify,
      title: "Always on-spec",
      description:
        "Fifty pieces or fifty thousand, each matches your approved sample. Quality is built in, never bolted on.",
    },
    {
      icon: Truck,
      title: "Always on time",
      description:
        "Launches do not wait, and neither do we. We hit committed dates across our PAN India network.",
    },
    {
      icon: People,
      title: "A true partner",
      description:
        "Straight talk, honest timelines, and no pricing games. We tell you what is possible, up front.",
    },
  ]

  const qualitySteps = [
    {
      icon: Box,
      title: "Material selection",
      description:
        "We source graded MDF, acrylic, and hardware so the finish and durability start right at the raw material.",
    },
    {
      icon: Ruler,
      title: "Precision production",
      description:
        "Calibrated routing, cutting, and engraving hold tight tolerances so every piece in the run is identical.",
    },
    {
      icon: Brush,
      title: "Finishing and branding",
      description:
        "UV printing, laser engraving, and embossing are applied and cured to keep your branding crisp and long-lasting.",
    },
    {
      icon: TickCircle,
      title: "Final inspection",
      description:
        "Each batch is checked against the approved sample before it is packed, so what leaves our floor is what you signed off.",
    },
  ]

  const expertise = [
    {
      icon: Personalcard,
      title: "OEM & white label manufacturing",
      description: "Complete manufacturing solutions under your brand name with full customization support",
    },
    {
      icon: Layer,
      title: "Bulk production capabilities",
      description: "Scalable production facilities to handle orders of any size with consistent quality",
    },
    {
      icon: ShieldTick,
      title: "Premium quality assurance",
      description: "Rigorous quality control processes ensuring every product meets the highest standards",
    },
    {
      icon: TrendUp,
      title: "Competitive pricing",
      description: "Direct manufacturing advantages translate to cost-effective solutions for your business",
    },
    {
      icon: Timer1,
      title: "Fast turnaround times",
      description: "Efficient production workflows and dedicated teams ensure timely delivery of your orders",
    },
    {
      icon: Global,
      title: "Global export support",
      description: "Comprehensive export services with worldwide shipping and documentation support",
    },
  ]

  const differentiators = [
    { icon: Setting2, text: "In-house facilities with advanced machinery" },
    { icon: Ruler, text: "Unlimited customization across every category" },
    { icon: People, text: "Dedicated design and production teams" },
    { icon: TrendUp, text: "Factory-direct pricing, no quality cut" },
    { icon: Truck, text: "PAN India delivery with trusted logistics" },
    { icon: Global, text: "Export ready, shipped worldwide" },
    { icon: Timer1, text: "Fast turnaround for urgent orders" },
    { icon: Brush, text: "Full branding: UV print, laser, and emboss" },
  ]

  return (
    <>
      {/* Page Header */}
      <PageHero title="About Ortex Industries" nowrap>
        Your trusted manufacturing partner for premium customized products,
        serving brands across India and worldwide.
      </PageHero>

      {/* Story Section */}
      <section className="section-y bg-[#0b0c0e] text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            <motion.div {...fadeUp}>
              <span className="block text-[14px] font-semibold uppercase tracking-[0.22em] text-primary mb-3">
                Who we are
              </span>
              <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-white">
                <RevealWords text="Our story" />
              </h2>
              <div className="mt-8 space-y-4 text-[18px] font-normal text-white/70 leading-relaxed">
                <p>
                  Ortex Industries started with one frustration we heard again and again: getting custom products made usually meant choosing between quality and turnaround. We built the company to remove that trade-off, and to give businesses a manufacturing partner they could actually rely on, order after order.
                </p>
                <p>
                  Everything runs under our own roof, from CNC routing and UV printing to laser engraving, assembly, and packing. That in-house control is how we keep quality consistent from the first sample to a bulk run, and it is why corporates, schools, agencies, and resellers keep coming back to us.
                </p>
                <p>
                  What sets us apart is range with reliability. MDF and acrylic items, lanyards, badges, corporate gifts, and more, all produced to your artwork, at your volume, and delivered across India and exported worldwide.
                </p>
                <p>
                  Behind every order is a simple commitment: clear communication, honest timelines, and finished products we would put our own name on. That is the standard we hold on every job, whether it is fifty pieces or fifty thousand.
                </p>
              </div>
            </motion.div>

            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.1 }}
              className="relative"
            >
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src="/img/about-production.avif"
                  alt="Close-up of laser engraving in progress on the Ortex Industries production floor"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Stats Band — matches the home StatsBar design */}
      <section className="py-16 bg-primary">
        <div className="lp-wrap">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, idx) => (
              <motion.div
                key={stat.label}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.08 }}
                className="flex flex-col items-center text-center"
              >
                <div className="text-[26px] md:text-[32px] font-medium text-white capitalize leading-none">{stat.value}</div>
                <p className="text-[16px] font-medium uppercase text-white/60 mt-3 tracking-wide">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How We Started - Journey / Timeline */}
      <section className="section-y bg-background text-left">
        <div className="lp-wrap">
          <motion.div
            {...fadeUp}
            className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between mb-16"
          >
            <div>
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
                How we started
              </span>
              <h2 className="text-[40px] md:text-[56px] lg:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground lg:whitespace-nowrap">
                <RevealWords text="Built one order at a time" />
              </h2>
            </div>
            <p className="text-[16px] font-normal text-foreground leading-relaxed max-w-xs lg:text-right">
              We never grew by doing more, only by doing it right, every single time.
            </p>
          </motion.div>

          {/* Milestone rows: [count + stage] · title · description, all in one row */}
          <div>
            {milestones.map((item, idx) => (
              <motion.div
                key={item.year}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.06 }}
                className="border-t border-border first:border-t-0 last:border-b py-10 grid grid-cols-1 lg:grid-cols-[200px_1fr_1fr] gap-y-5 lg:gap-x-[100px] lg:items-end"
              >
                {/* Left: count + stage eyebrow, stacked */}
                <div className="flex flex-col gap-1 whitespace-nowrap">
                  <span className="text-[42px] font-semibold tabular-nums tracking-normal text-[#EBEDF3]">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[18px] font-medium uppercase tracking-[0.04em] text-primary">
                    {item.year}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-[32px] font-medium leading-[1.1] tracking-tight text-foreground">
                  {item.title}
                </h3>

                {/* Sublet */}
                <p className="text-[16px] font-medium text-[#4b5675] leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Expertise Section — what we do (moved up: the reader needs the "what" before the "why") */}
      <section className="section-y bg-[#f9fbfc]">
        <div className="lp-wrap text-center">
          <motion.div {...fadeUp} className="mb-16">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              What we do
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight mb-4 text-foreground text-balance">
              <RevealWords text="Our expertise" />
            </h2>
            <p className="text-[18px] font-normal text-foreground max-w-2xl mx-auto">
              Comprehensive manufacturing and customization capabilities to serve your business needs
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[20px]">
            {expertise.map((item, idx) => (
              <motion.div
                key={item.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.1 }}
                className="bg-card p-[30px] text-left"
              >
                <div className="mb-8 w-[50px] h-[50px] rounded-[999px] bg-primary/10 flex items-center justify-center text-primary">
                  <item.icon size={24} color="currentColor" variant="Bulk" aria-hidden="true" />
                </div>
                <h3 className="text-[24px] font-medium mb-3 text-card-foreground">{item.title}</h3>
                <p className="text-[16px] font-normal text-[#4B5675] leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Quality We Deliver — OEM "Why partner with us" icon-grid design */}
      <section className="section-y bg-background">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="mb-[50px] max-w-2xl mx-auto text-center">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              The quality we deliver
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight mb-6 text-foreground lg:whitespace-nowrap">
              <RevealWords text="Quality is a process" />
            </h2>
            <p className="text-[18px] font-normal text-foreground leading-relaxed">
              Every product moves through four deliberate stages before it reaches you, so the standard never comes down to luck.
            </p>
          </motion.div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-[42px] gap-y-[80px] list-none">
            {qualitySteps.map((item, idx) => (
              <motion.li
                key={item.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.1 }}
                className="text-left relative overflow-hidden group"
              >
                <div className="mb-8 w-[50px] h-[50px] rounded-[999px] bg-primary/10 flex items-center justify-center text-primary">
                  <item.icon size={24} color="currentColor" variant="Bulk" aria-hidden="true" />
                </div>
                <h3 className="text-[24px] font-medium text-foreground">{item.title}</h3>
                <div className="mt-6 border-t border-primary/20" />
                <p className="mt-6 text-[16px] font-normal text-[#4B5675] leading-relaxed">
                  {item.description}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why Choose Ortex — trust pillars + differentiators (Trust section merged in here) */}
      <section className="section-y bg-[#f9fbfc] text-left">
        <div className="lp-wrap">
          <motion.div
            {...fadeUp}
            className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between mb-16"
          >
            <div>
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
                Why us
              </span>
              <h2 className="text-[40px] md:text-[56px] lg:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground">
                <RevealWords text="Why choose Ortex Industries" />
              </h2>
            </div>
            <p className="text-[16px] font-normal text-foreground leading-relaxed max-w-xs lg:text-right">
              Clients keep coming back for how we work, not only for what we make.
            </p>
          </motion.div>

          {/* Trust pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[20px]">
            {trustPillars.map((item, idx) => (
              <motion.div
                key={item.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.1 }}
                className="bg-card p-[30px] text-left"
              >
                <div className="mb-8 w-[50px] h-[50px] rounded-[999px] bg-primary/10 flex items-center justify-center text-primary">
                  <item.icon size={24} color="currentColor" variant="Bulk" aria-hidden="true" />
                </div>
                <h3 className="text-[20px] md:text-[24px] font-medium mb-3 text-card-foreground">{item.title}</h3>
                <p className="text-[16px] font-normal text-[#4B5675] leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Differentiators checklist */}
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.15 }}
            className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4 bg-background p-[30px]"
          >
            {differentiators.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <span className="flex-shrink-0 text-primary">
                  <item.icon size={20} color="currentColor" variant="Bulk" aria-hidden="true" />
                </span>
                <p className="text-[18px] font-medium text-foreground leading-relaxed">{item.text}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Call to Action Section */}
      <PageCTA
        title="Skip the middleman. Come to the maker."
        primary={{ to: "/quote", label: "Get a quote" }}
        secondary={{ to: "/contact", label: "Contact us" }}
      >
        Design, production, and branding under one roof. On-spec, on time, from first proof to final dispatch.
      </PageCTA>
    </>
  )
}
