import { motion } from "framer-motion"
import { Briefcase, Layers, ShieldCheck, Tag, Clock, Globe } from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

export default function About() {
  useDocumentMetadata(
    "About Ortex Industries - Manufacturing Excellence & Customization Expertise",
    "Learn about Ortex Industries' commitment to manufacturing excellence, complete customization capabilities, and global reach. Your trusted partner for premium customized products."
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
      <section className="py-20 bg-secondary">
        <div className="lp-wrap text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight text-foreground text-balance">
              About Ortex Industries
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Your trusted partner for premium customized products, delivering manufacturing excellence and complete customization solutions to businesses across India and worldwide.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-20 bg-background text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6 tracking-tight text-foreground text-balance">
                Our story
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
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
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="relative"
            >
              <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl">
                <img 
                  src="https://images.unsplash.com/photo-1552581234-26160f608093" 
                  alt="Ortex Industries team collaborating on customized product manufacturing" 
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Expertise Section */}
      <section className="py-20 bg-secondary">
        <div className="lp-wrap text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground text-balance">
              Our expertise
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Comprehensive manufacturing and customization capabilities to serve your business needs
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {expertise.map((item, idx) => (
              <motion.div 
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="bg-card rounded-xl p-6 border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg text-left"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-card-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose us Checklist */}
      <section className="py-20 bg-background text-left">
        <div className="lp-wrap">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight text-foreground text-balance">
              Why choose Ortex Industries
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Key differentiators that make us your ideal manufacturing partner
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto"
          >
            {differentiators.map((text, idx) => (
              <div key={idx} className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <p className="text-muted-foreground leading-relaxed">{text}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>
    </>
  )
}
