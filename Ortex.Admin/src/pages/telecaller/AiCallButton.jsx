import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Sparkles } from "../../components/ui/Icons"
import { Button } from "../../components/ui/Ui"
import { useProfile } from "../../hooks/useProfile"
import { canAccess } from "../../data/domain/modules"
import { dialNow } from "../../services/telecaller"
import { repo } from "../../data/store/repository"
import { isValidMobile } from "./helpers"

// "Let the AI call them", dropped onto Voice Leads cards and the Lead drawer.
// `target` is built by targetFromVoiceCall / targetFromLead in ./helpers.
// Renders nothing for staff without the telecaller module or when the number
// is not a dialable Indian mobile.
export default function AiCallButton({ target, size = "sm", variant = "outline", className = "", children }) {
  const profile = useProfile()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  if (!canAccess(profile, "telecaller") || !isValidMobile(target?.phone || "")) return null

  const go = async (e) => {
    e?.stopPropagation?.()
    setBusy(true)
    // Read at click time, not per card: a Vapi call rings a real phone.
    const provider = await repo.getSettings().then((s) => s?.telecaller?.provider, () => null)
    if (provider !== "simulate" && !window.confirm(`This places a real phone call to ${target.contactName || target.phone} now. Continue?`)) {
      setBusy(false)
      return
    }
    const res = await dialNow({ target })
    setBusy(false)
    if (res.error) return toast.error(res.error)
    toast.success(
      res.simulated
        ? `Simulated call done: ${String(res.analysis?.outcome || "").replace(/_/g, " ")}`
        : `Ringing ${target.contactName || target.phone}…`,
      { action: { label: "Open", onClick: () => navigate(`/telecaller?call=${res.callId}`) } },
    )
  }

  return (
    <Button size={size} variant={variant} className={className} disabled={busy} onClick={go} title="Have the AI telecaller ring this number now">
      <Sparkles className="h-4 w-4" /> {busy ? "Calling…" : children || "AI call"}
    </Button>
  )
}
