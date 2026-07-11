import { motion } from "framer-motion"
import { Briefcase, Layers, ShieldCheck, Tag, Clock, Globe } from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { fadeUp, RevealWords } from "../components/home/Section"
import PageCTA from "../components/ui/PageCTA"
import PageHero from "../components/ui/PageHero"

export default function About() {
  useDocumentMetadata(
    "About Ortex Industries - Manufacturing Excellence & Customization Expertise",
    "Learn about Ortex Industries' commitment to manufacturing excellence, complete customization capabilities, and global reach. Your trusted partner for premium customized products.",
    { path: "/about" }
  )

  const expertise = [
    {
      icon: Briefcase,
      title: "OEM & white label manufacturing",
      description: "Complete manufacturing solutions under your brand name with full customization support"
    },
    {
      icon: Layers,
      title: "Bulk production capabilities",
      description: "Scalable production facilities to handle orders of any size with consistent quality"
    },
    {
      icon: ShieldCheck,
      title: "Premium quality assurance",
      description: "Rigorous quality control processes ensuring every product meets the highest standards"
    },
    {
      icon: Tag,
      title: "Competitive pricing",
      description: "Direct manufacturing advantages translate to cost-effective solutions for your business"
    },
    {
      icon: Clock,
      title: "Fast turnaround times",
      description: "Efficient production workflows and dedicated teams ensure timely delivery of your orders"
    },
    {
      icon: Globe,
      title: "Global export support",
      description: "Comprehensive export services with worldwide shipping and documentation support"
    }
  ]

  const differentiators = [
    "Complete in-house manufacturing facilities with advanced machinery",
    "Unlimited customization options across all product categories",
    "Dedicated design and production teams for personalized service",
    "Competitive pricing without compromising on quality",
    "PAN India delivery network with reliable logistics partners",
    "Export expertise with global shipping capabilities",
    "Quick turnaround times for urgent requirements",
    "Comprehensive branding services including UV printing, laser engraving, and embossing"
  ]

  return (
    <>
      {/* Page Header */}
      <PageHero title="About Ortex Industries">
        Your trusted partner for premium customized products, delivering manufacturing excellence and complete customization solutions to businesses across India and worldwide.
      </PageHero>

      {/* Story Section */}
      <section className="py-[140px] bg-background text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            <motion.div {...fadeUp} className="space-y-6">
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase">
                Who we are
              </span>
              <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
                <RevealWords text="Our story" />
              </h2>
              <div className="space-y-4 text-[16px] font-normal text-muted-foreground leading-relaxed">
                <p>
                  Ortex Industries was founded with a vision to transform the way businesses access premium customized products. We recognized the growing need for reliable manufacturing partners who could deliver both quality and customization at scale.
                </p>
                <p>
                  Today, we operate state-of-the-art manufacturing facilities equipped with advanced machinery and staffed by skilled professionals. Our commitment to excellence has made us a preferred partner for businesses across diverse industries, from corporate organizations to educational institutions.
                </p>
                <p>
                  What sets us apart is our ability to offer complete in-house manufacturing combined with unlimited customization options. Whether you need MDF products, acrylic items, lanyards, badges, or corporate gifts, we have the expertise and infrastructure to bring your vision to life.
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
                  src="/img/factory-production-workshop.jpg"
                  alt="The Ortex Industries production floor, where routing, UV printing, and assembly are carried out in-house"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Expertise Section */}
      <section className="py-[140px] bg-secondary">
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {expertise.map((item, idx) => (
              <motion.div
                key={item.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.1 }}
                className="bg-card p-[30px] border border-border hover:border-primary/50 transition-colors duration-300 text-left"
              >
                <div className="mb-6 text-primary">
                  <item.icon className="h-8 w-8" />
                </div>
                <h3 className="text-[20px] font-semibold mb-3 text-card-foreground">{item.title}</h3>
                <p className="text-[16px] font-normal text-muted-foreground leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose us Checklist */}
      <section className="py-[140px] bg-background text-left">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="text-center mb-12">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              Why us
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight mb-4 text-foreground text-balance">
              <RevealWords text="Why choose Ortex Industries" />
            </h2>
            <p className="text-[18px] font-normal text-foreground max-w-2xl mx-auto">
              Key differentiators that make us your ideal manufacturing partner
            </p>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.15 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto"
          >
            {differentiators.map((text, idx) => (
              <div key={idx} className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <p className="text-[16px] font-normal text-muted-foreground leading-relaxed">{text}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Call to Action Section */}
      <PageCTA
        title="Let's build something for your brand"
        primary={{ to: "/quote", label: "Get a quote" }}
        secondary={{ to: "/contact", label: "Contact us" }}
      >
        Partner with a manufacturer that handles design, production, and branding under one roof.
      </PageCTA>
    </>
  )
}
