import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { Clock } from "iconsax-react"
import { Check, AlertTriangle } from "../../components/ui/Icons"
import { whatsappLink } from "../../constants/site"

export default function SuccessScreen({ isQueued, reference, lines, maxLeadTime, resetAll }) {
  return (
    <div className="min-h-screen bg-background py-16">
      <div className="lp-wrap max-w-2xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card border border-border rounded-2xl p-8 md:p-12 text-center"
        >
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
            isQueued ? "bg-amber-500/10 text-amber-500" : "bg-[#04B440]/10 text-[#04B440]"
          }`}>
            {isQueued ? <AlertTriangle className="h-9 w-9" /> : <Check className="h-9 w-9" />}
          </div>
          <h1 className="text-[28px] md:text-[32px] font-semibold tracking-tight text-foreground">
            {isQueued ? "Saved — delivery pending" : "Quote request submitted"}
          </h1>
          <p className="text-muted-foreground mt-3 max-w-md mx-auto">
            Your request is logged under reference <strong className="text-foreground">{reference}</strong>.
            {isQueued
              ? " We couldn't reach our servers just now, so it's saved on this device and will send automatically when the connection recovers. To be certain it reaches us today, send it over WhatsApp."
              : " Our sales desk will verify specs and send a formal GST quotation."}
          </p>

          {isQueued && (
            <a
              href={whatsappLink(`Hi Ortex, I submitted quote request ${reference} but it may not have reached you. Please send me a formal quotation.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:bg-primary/90 transition-colors"
            >
              Send this request on WhatsApp
            </a>
          )}

          <div className="my-8 rounded-xl border border-border bg-secondary p-5 text-left">
            <h2 className="font-semibold text-foreground border-b border-border pb-2 mb-3">Your request</h2>
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.product.id} className="flex justify-between text-sm gap-4">
                  <span className="text-foreground">{l.product.name}</span>
                  <span className="font-medium text-muted-foreground whitespace-nowrap">× {l.qty} {l.product.unit}</span>
                </div>
              ))}
            </div>
            {maxLeadTime > 0 && (
              <p className="text-xs text-foreground mt-3 pt-3 border-t border-border flex items-center gap-1.5">
                <Clock size={15} variant="Bulk" color="currentColor" className="text-primary" aria-hidden="true" />
                Est. dispatch ~{maxLeadTime} working days after artwork approval
              </p>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={resetAll} className="px-6 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:bg-primary/90 transition-colors cursor-pointer">
              Build another quote
            </button>
            <Link to="/">
              <button className="px-6 py-3 border border-border text-foreground hover:border-foreground/40 rounded-full font-semibold transition-colors cursor-pointer">
                Return home
              </button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
