import { motion } from "framer-motion"
import { CloseCircle } from "iconsax-react"

// The open call: a 600x400 squircle docked at the centre-bottom with the
// Gemini-style bar equalizer, live status line, call timer and close control.
// Shares `layoutId="anu-morph"` with the launcher so the pill morphs into it.
export default function CallPanel({ status, speaking, mmss, statusLabel, canvasRef, onEnd, onRetry }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pointer-events-none">
      <motion.div
        layoutId="anu-morph"
        role="dialog"
        aria-label="Live voice call with Anu"
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="pointer-events-auto relative flex flex-col overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
        style={{ width: 600, height: 400, maxWidth: "95vw", maxHeight: "88vh", borderRadius: 50, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)" }}
      >
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14 }} className="flex h-full flex-col">
          {/* Top: identity + close */}
          <div className="flex items-center justify-between px-5 pt-4">
            <div className="leading-tight">
              <p className="text-white text-[18px] font-medium">Hi, I'm Anu</p>
              <p className="text-white/50 text-[16px]">Here to help you design</p>
            </div>
            <button onClick={onEnd} aria-label="Close" className="grid place-items-center w-8 h-8 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition">
              <CloseCircle size={22} variant="Bulk" color="currentColor" />
            </button>
          </div>

          {/* Gemini-style bar equalizer + status */}
          <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
            <canvas ref={canvasRef} className="w-[460px] max-w-[92%] h-[96px]" />
            <div className="flex items-center gap-1.5 text-white/50 text-xs uppercase tracking-wide">
              {status === "live" && (
                <span className={`w-1.5 h-1.5 rounded-full ${speaking ? "bg-indigo-400" : "bg-emerald-400"} animate-pulse`} />
              )}
              <span>{status === "live" ? `${mmss} · ` : ""}{statusLabel}</span>
            </div>
          </div>

          <div className="pb-8" />

          {status === "error" && (
            <button onClick={onRetry} className="absolute bottom-20 left-1/2 -translate-x-1/2 text-sm text-white/70 underline hover:text-white">Retry</button>
          )}
        </motion.div>
      </motion.div>
    </div>
  )
}
