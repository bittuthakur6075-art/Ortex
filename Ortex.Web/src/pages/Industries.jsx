import { motion } from "framer-motion"
import { Building2, GraduationCap, Landmark, Stethoscope, Calendar, Megaphone, Heart, Flag, ShoppingBag, UserCheck } from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { fadeUp, RevealWords } from "../components/home/Section"
import PageCTA from "../components/ui/PageCTA"

export default function Industries() {
  useDocumentMetadata(
    "Industries We Serve - Ortex Industries | Corporate, Education, Healthcare & More",
    "Ortex Industries serves diverse sectors including corporate organizations, educational institutions, government departments, hospitals, event management, and more with customized products.",
    { path: "/industries" }
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
      <section className="py-[140px] bg-secondary">
        <div className="lp-wrap text-center">
          <motion.div {...fadeUp} className="max-w-3xl mx-auto">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              Industries
            </span>
            <h1 className="text-[40px] md:text-[64px] font-normal leading-[1.05] mb-6 tracking-tight text-foreground text-balance">
              Industries we serve
            </h1>
            <p className="text-[18px] font-normal text-foreground leading-relaxed">
              Delivering customized product solutions across diverse sectors with industry-specific expertise and understanding.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Trust & Intro Section */}
      <section className="py-[140px] bg-background text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">

            <motion.div {...fadeUp} className="space-y-6">
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase">
                Who we serve
              </span>
              <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
                <RevealWords text="Trusted by organizations across sectors" />
              </h2>
              <p className="text-[18px] font-normal text-foreground leading-relaxed">
                Our diverse client base spans multiple industries, each with unique requirements and standards. We understand the specific needs of different sectors and deliver tailored solutions that meet industry regulations and expectations.
              </p>
              <p className="text-[16px] font-normal text-muted-foreground leading-relaxed">
                From corporate organizations requiring professional employee identification systems to educational institutions needing durable examination boards, we have the expertise and infrastructure to serve your industry effectively.
              </p>
            </motion.div>

            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.1 }}
              className="relative"
            >
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src="https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/348f14b4519831287f42e8843fa4ccf1.png"
                  alt="Acrylic name badge manufactured by Ortex Industries with healthcare branding and magnetic backing"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </motion.div>

          </div>

          {/* Specialties Intro */}
          <motion.div {...fadeUp} className="mb-12 text-center">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              What we make
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight mb-4 text-foreground text-balance">
              <RevealWords text="Sectors we specialize in" />
            </h2>
            <p className="text-[18px] font-normal text-foreground max-w-2xl mx-auto">
              Industry-specific solutions tailored to your unique requirements
            </p>
          </motion.div>

          {/* Specialties Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {industries.map((item, idx) => (
              <motion.div
                key={item.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: Math.min(idx, 5) * 0.05 }}
                className="bg-card p-[30px] border border-border hover:border-primary/50 transition-colors duration-300 flex items-start space-x-4"
              >
                <div className="flex-shrink-0 text-primary">
                  <item.icon className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-[20px] font-semibold mb-3 text-foreground">{item.title}</h3>
                  <p className="text-[16px] font-normal text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* Expertise & Statistics Section */}
      <section className="py-[140px] bg-secondary text-left">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="text-center max-w-3xl mx-auto">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              Our expertise
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight mb-6 text-foreground text-balance">
              <RevealWords text="Industry-specific expertise" />
            </h2>
            <p className="text-[18px] font-normal text-foreground leading-relaxed mb-8">
              Our team understands the unique challenges and requirements of different industries. We work closely with you to develop solutions that meet your specific needs, comply with industry standards, and deliver exceptional value.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
              {stats.map((stat, idx) => (
                <div key={idx} className="text-center bg-card p-[30px] border border-border">
                  <div className="text-[40px] font-medium text-primary mb-2 leading-none">{stat.value}</div>
                  <p className="text-[16px] font-normal text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Call to Action Section */}
      <PageCTA
        title="Solutions built for your sector"
        primary={{ to: "/contact", label: "Get in touch" }}
        secondary={{ to: "/products", label: "Browse products" }}
      >
        Tell us about your industry and requirements, and we will recommend the right products, materials, and branding for your organisation.
      </PageCTA>
    </>
  )
}
