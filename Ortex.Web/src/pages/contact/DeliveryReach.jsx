import { motion } from "framer-motion"
import { Global, Airplane } from "iconsax-react"
import { fadeUp, RevealWords } from "../../components/ui/Section"

const reachItems = [
  { icon: Global, title: "PAN India delivery", description: "Every order ships from our own floor through tracked, reliable courier partners to all states and union territories. You get a dispatch update and a live tracking link, so you always know exactly where your consignment is." },
  { icon: Airplane, title: "Worldwide export", description: "Exporting abroad? We handle export documentation, customs paperwork, and secure packing from end to end, then ship through trusted freight partners so your order clears customs and arrives on time, without the usual hassle." },
]

/** "Where we deliver" section: PAN India delivery and worldwide export cards. */
export default function DeliveryReach() {
  return (
    <section className="section-y bg-background text-center">
      <div className="lp-wrap">
        <motion.div {...fadeUp} className="mb-14">
          <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
            Delivery &amp; reach
          </span>
          <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground lg:whitespace-nowrap">
            <RevealWords text="Delivered where you need it" />
          </h2>
          <p className="mt-5 max-w-2xl mx-auto text-[18px] font-normal text-[#4b5675] leading-relaxed">
            From a single order for a school, office, or hospital to a nationwide brand rollout, our own floor and trusted couriers get it to your door, on time.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[20px] text-left">
          {reachItems.map((item, idx) => (
            <motion.div
              key={item.title}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: idx * 0.08 }}
              className="bg-card p-[40px]"
            >
              <div className="w-[50px] h-[50px] rounded-[999px] bg-primary/10 grid place-items-center text-primary mb-6">
                <item.icon size={24} variant="Bulk" color="currentColor" aria-hidden="true" />
              </div>
              <h3 className="text-[24px] font-semibold text-foreground">{item.title}</h3>
              <div className="mt-6 border-t border-primary/20" />
              <p className="mt-6 text-[16px] font-normal text-[#4b5675] leading-relaxed">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
