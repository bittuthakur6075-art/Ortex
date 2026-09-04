import { motion } from "framer-motion"

// Bottom-right "Talk to us" pill shown once the first (auto-opened) call has
// been closed. Shares `layoutId="anu-morph"` with the call panel so it expands
// into the modal and collapses back.
export default function Launcher({ onOpen }) {
  return (
    <motion.button
      layoutId="anu-morph"
      onClick={onOpen}
      aria-label="Talk to Anu by voice"
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className="fixed right-4 md:right-[50px] bottom-[calc(1rem+env(safe-area-inset-bottom))] md:bottom-[50px] z-[80] inline-flex items-center gap-2.5 h-14 pl-2 pr-6 bg-primary text-white font-semibold text-[16px] overflow-hidden hover:brightness-105"
      style={{ borderRadius: 9999 }}
    >
      <span className="grid place-items-center w-10 h-10 flex-none rounded-full bg-white/20">
        <span
          aria-hidden="true"
          className="w-6 h-6 bg-white"
          style={{
            WebkitMaskImage: "url(/img/logo-symbol.svg)",
            maskImage: "url(/img/logo-symbol.svg)",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
          }}
        />
      </span>
      <span className="whitespace-nowrap">Talk to us</span>
    </motion.button>
  )
}
