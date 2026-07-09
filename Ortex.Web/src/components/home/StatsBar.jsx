import { motion } from "framer-motion"
import { stats } from "../../constants/home"
import { fadeUp } from "./Section"

export default function StatsBar() {
  return (
    <section className="py-12 bg-background border-b border-border/40">
      <div className="lp-wrap">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, idx) => (
            <motion.div
              key={stat.label}
              {...fadeUp}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="flex flex-col items-center text-center"
            >
              <div className="text-[28px] md:text-[32px] font-medium text-primary leading-none">{stat.value}</div>
              <p className="text-[13px] md:text-[14px] font-normal uppercase text-muted-foreground mt-3 tracking-wide">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
