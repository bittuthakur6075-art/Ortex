import { motion } from "framer-motion"
import AnuAvatar from "./AnuAvatar"
import { MORPH_SPRING } from "./shared"

// Bottom-right "Speak with Anu" pill shown once the first (auto-opened) call has
// been closed. Anu's face sits in a ring that breathes, so it reads as a live
// person rather than a plain button; a single soft ring pings once when it first appears. Shares
// `layoutId="anu-morph"` with the call panel, so it expands into it and back.
export default function Launcher({ onOpen }) {
  return (
    <motion.button
      layoutId="anu-morph"
      onClick={onOpen}
      aria-label="Start a voice call with Anu"
      transition={MORPH_SPRING}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      className="group fixed right-4 md:right-[50px] bottom-[calc(1rem+env(safe-area-inset-bottom))] md:bottom-[50px] z-[80] inline-flex items-center gap-3 p-1.5 pr-6 bg-primary text-white"
      style={{ borderRadius: 9999 }}
    >
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-primary"
        initial={{ opacity: 0.8, scale: 1 }}
        animate={{ opacity: 0, scale: 1.35 }}
        transition={{ duration: 1.6, ease: "easeOut", delay: 0.5, repeat: 2, repeatDelay: 2.5 }}
      />
      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.1 } }} className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-[#0A0B16]/35 transition-transform duration-300 group-hover:scale-110">
          <AnuAvatar mood="idle" size={40} />
        </span>
        <span className="text-left leading-tight">
          <span className="block whitespace-nowrap text-[16px] font-semibold">Speak with Anu</span>
          <span className="block whitespace-nowrap text-[12px] text-white/70">Free voice consultation · Hindi & English</span>
        </span>
      </motion.span>
    </motion.button>
  )
}
