import { motion } from "framer-motion"
import { stats } from "../../constants/home"
import { fadeUp, EASE } from "./Section"

export default function StatsBar() {
  return (
    <section className="py-12 bg-primary border-b border-white/10">
      <div className="lp-wrap">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, idx) => (
            <motion.div
              key={stat.label}
              {...fadeUp}
              transition={{ duration: 0.6, ease: EASE, delay: idx * 0.1 }}
              className="flex flex-col items-center text-center"
            >
              <div className="text-[26px] md:text-[32px] font-medium text-white capitalize leading-none">{stat.value}</div>
              <p className="text-[16px] font-medium uppercase text-white/60 mt-3 tracking-wide">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
