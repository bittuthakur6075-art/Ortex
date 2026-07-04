import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { Settings, Sliders, Globe, ArrowRight } from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import Hero from "../components/Hero"

export default function Home() {
  useDocumentMetadata(
    "Ortex Industries - Premium Customized Products for Businesses Worldwide",
    "Ortex Industries specializes in manufacturing premium customized products including MDF products, acrylic items, lanyards, badges, and corporate gifts. Serving businesses across India and worldwide."
  )

  const capabilities = [
    {
      icon: Settings,
      title: "In-house manufacturing",
      description: "State-of-the-art facilities for complete production control and quality assurance"
    },
    {
      icon: Sliders,
      title: "Complete customization",
      description: "Tailored solutions to match your exact specifications and branding requirements"
    },
    {
      icon: Globe,
      title: "Global reach",
      description: "Serving customers across India and worldwide with reliable export support"
    }
  ]

  return (
    <>
      {/* Hero Section */}
      <Hero />

      {/* Capabilities Section */}
      <section className="py-20 bg-secondary">
        <div className="lp-wrap">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground text-balance">
              Our core capabilities
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Delivering excellence through advanced manufacturing and customization expertise
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {capabilities.map((item, idx) => (
              <motion.div 
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="bg-card rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-border text-left"
              >
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                  <item.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-card-foreground">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-20 bg-background">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-left"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6 tracking-tight text-foreground text-balance">
                Why businesses choose Ortex Industries
              </h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">Complete in-house manufacturing</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Our advanced production facilities ensure complete quality control from raw materials to finished products, delivering consistent excellence in every order.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">Unlimited customization options</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    From design to branding, we offer complete customization services including UV printing, laser engraving, sublimation, and embossing to match your exact requirements.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">Competitive pricing with premium quality</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Direct manufacturing capabilities allow us to offer competitive pricing without compromising on quality, making premium products accessible for businesses of all sizes.
                  </p>
                </div>
              </div>

              <Link to="/about" className="inline-block mt-8">
                <button className="px-5 py-2.5 border-2 border-border hover:bg-muted font-medium rounded-lg flex items-center justify-center transition-all duration-200 active:scale-[0.98] cursor-pointer text-foreground">
                  Learn more about us
                  <ArrowRight className="ml-2 h-4 w-4" />
                </button>
              </Link>
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
                  src="https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/whatsapp-image-2026-06-25-at-6.53.24-am-2-AChL5.jpeg" 
                  alt="Premium customized products manufactured by Ortex Industries" 
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>

          </div>
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
              Ready to bring your ideas to life?
            </h2>
            <p className="text-lg mb-8 max-w-2xl mx-auto opacity-90 text-primary-foreground/90">
              Get in touch with our team to discuss your requirements and receive a customized quote for your project.
            </p>
            <Link to="/contact">
              <button className="px-6 py-3 bg-background text-foreground hover:bg-background/90 font-semibold rounded-lg flex items-center justify-center mx-auto transition-all duration-200 active:scale-[0.98] cursor-pointer">
                Contact us today
                <ArrowRight className="ml-2 h-5 w-5 text-foreground" />
              </button>
            </Link>
          </motion.div>
        </div>
      </section>
    </>
  )
}
