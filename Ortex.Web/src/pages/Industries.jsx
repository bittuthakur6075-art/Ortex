import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { Building2, GraduationCap, Landmark, Stethoscope, Calendar, Megaphone, Heart, Flag, ShoppingBag, UserCheck, ArrowRight } from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

const industriesSchemas = [
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://www.ortexindustries.in/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Industries",
        "item": "https://www.ortexindustries.in/industries"
      }
    ]
  }
]

export default function Industries() {
  useDocumentMetadata(
    "Custom Branding Solutions for Industries — Ortex Industries",
    "Tailored manufacturing and branding solutions for Corporates, Education, Healthcare, Retail, Government, Events, NGOs & Marketing agencies. OEM & bulk delivery.",
    { 
      path: "/industries",
      keywords: "corporate branding, educational stationery, healthcare badges, event merchandise, retail promotional gifts, custom corporate branding",
      schemas: industriesSchemas
    }
  )

  const industries = [
    {
      icon: Building2,
      title: "Corporate organizations",
      description: "Employee ID cards, badges, lanyards, corporate gifts, office accessories, and branded promotional merchandise for businesses of all sizes"
    },
    {
      icon: GraduationCap,
      title: "Educational institutions",
      description: "Student ID cards, examination boards, name plates, badges, lanyards, and customized stationery for schools, colleges, and universities"
    },
    {
      icon: Landmark,
      title: "Government departments",
      description: "Official ID cards, badges, lanyards, name plates, and customized products for government offices and public sector organizations"
    },
    {
      icon: Stethoscope,
      title: "Hospitals & healthcare",
      description: "Staff ID cards, patient identification systems, badges, lanyards, and medical facility signages with professional branding"
    },
    {
      icon: Calendar,
      title: "Event management",
      description: "Event badges, lanyards, passes, promotional merchandise, and customized products for conferences, exhibitions, and corporate events"
    },
    {
      icon: Megaphone,
      title: "Marketing agencies",
      description: "Promotional products, corporate gifts, branded merchandise, and customized items for marketing campaigns and client gifting"
    },
    {
      icon: Heart,
      title: "NGOs & non-profits",
      description: "Volunteer badges, ID cards, lanyards, promotional materials, and fundraising merchandise for non-profit organizations"
    },
    {
      icon: Flag,
      title: "Political campaigns",
      description: "Campaign badges, promotional merchandise, banners, and customized products for political parties and election campaigns"
    },
    {
      icon: ShoppingBag,
      title: "Retail businesses",
      description: "Employee badges, promotional merchandise, branded packaging accessories, and customer loyalty program materials"
    },
    {
      icon: UserCheck,
      title: "Professional services",
      description: "Business cards, name plates, office accessories, corporate gifts, and branded merchandise for consulting firms and service providers"
    }
  ]

  const stats = [
    { value: "10+", label: "Industry sectors served" },
    { value: "100%", label: "In-house production & QC" },
    { value: "PAN India + Export", label: "Delivery reach" }
  ]

  return (
    <>
      {/* Page Header */}
      <section className="py-20 bg-secondary">
        <div className="lp-wrap text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight text-foreground text-balance">
              Industries we serve
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Delivering customized product solutions across diverse sectors with industry-specific expertise and understanding.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Trust & Intro Section */}
      <section className="py-20 bg-background text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">
            
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground text-balance">
                Trusted by organizations across sectors
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Our diverse client base spans multiple industries, each with unique requirements and standards. We understand the specific needs of different sectors and deliver tailored solutions that meet industry regulations and expectations.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                From corporate organizations requiring professional employee identification systems to educational institutions needing durable examination boards, we have the expertise and infrastructure to serve your industry effectively.
              </p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="relative"
            >
              <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl">
                <img
                  src="https://images.unsplash.com/photo-1697638164340-6c5fc558bdf2?w=800&q=80&auto=format&fit=crop"
                  alt="Professional office environment showcasing corporate products and services"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </motion.div>

          </div>

          {/* Specialties Intro */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-12 text-center"
          >
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground text-balance">
              Sectors we specialize in
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Industry-specific solutions tailored to your unique requirements
            </p>
          </motion.div>

          {/* Specialties Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {industries.map((item, idx) => (
              <motion.div 
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.05 }}
                className="bg-card rounded-xl p-6 border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg flex items-start space-x-4"
              >
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* Expertise & Statistics Section */}
      <section className="py-20 bg-secondary text-left">
        <div className="lp-wrap">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-3xl mx-auto"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6 tracking-tight text-foreground text-balance">
              Industry-specific expertise
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              Our team understands the unique challenges and requirements of different industries. We work closely with you to develop solutions that meet your specific needs, comply with industry standards, and deliver exceptional value.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
              {stats.map((stat, idx) => (
                <div key={idx} className="text-center bg-card rounded-xl p-6 shadow-md border border-border/50">
                  <div className="text-4xl font-bold text-primary mb-2">{stat.value}</div>
                  <p className="text-muted-foreground font-medium">{stat.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="lp-wrap text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-balance text-primary-foreground">
              Solutions built for your sector
            </h2>
            <p className="text-lg mb-8 max-w-2xl mx-auto opacity-90 text-primary-foreground/90">
              Tell us about your industry and requirements, and we will recommend the right products, materials, and branding for your organisation.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/contact"
                className="px-6 py-3 bg-background text-foreground hover:bg-background/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
              >
                Discuss your requirements
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link
                to="/products"
                className="px-6 py-3 border-2 border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
              >
                Browse products
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  )
}
