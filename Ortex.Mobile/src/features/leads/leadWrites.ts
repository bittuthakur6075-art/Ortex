import React from "react"
import { AppState } from "react-native"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { statusPatch, undoPatch, type LeadDoc } from "@/domain/leads"
import { ENQUIRY_STATUS, statusMeta } from "@/domain/schema"
import { feedback } from "@/lib/feedback"
import type { useToast } from "@/ui"

export type Channel = "call" | "whatsapp"

type Toast = ReturnType<typeof useToast>

/**
 * A status change on one lead or every row of a folded call, as the console's
 * `writeStatus`: dates the step in `statusAt`, clears the old follow-up, and
 * offers Undo, which puts each row's own status, dates and reason back.
 */
export async function writeLeadStatus(rows: LeadDoc[], status: string, toast: Toast, extra: Record<string, unknown> = {}) {
  const at = new Date().toISOString()
  const before = rows.map((r) => ({ id: r.id, prev: undoPatch(r) }))
  try {
    await Promise.all(rows.map((r) => repo.update("enquiries", r.id, statusPatch(r, status, at, extra))))
  } catch (e) {
    feedback.error()
    toast.show({ message: errorMessage(e, "Could not change the status"), tone: "danger" })
    return false
  }
  feedback.created()
  toast.show({
    message: status === "lost" ? "Closed as lost" : `Marked ${statusMeta(ENQUIRY_STATUS, status).label.toLowerCase()}`,
    tone: "success",
    onUndo: () =>
      void Promise.all(before.map(({ id, prev }) => repo.update("enquiries", id, prev))).then(
        () => toast.show({ message: "Status put back", tone: "success" }),
        (e) => toast.show({ message: errorMessage(e, "Could not undo"), tone: "danger" }),
      ),
  })
  return true
}

/**
 * Reaching a lead and coming back. `reach("call", () => callNumber(phone))`
 * arms the prompt; when the app returns from the dialer or WhatsApp the "How
 * did it go?" sheet opens. A stale arm (over two hours) is dropped.
 */
export function useAfterContact() {
  const [open, setOpen] = React.useState<Channel | null>(null)
  const pending = React.useRef<{ kind: Channel; at: number; left: boolean } | null>(null)

  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      const p = pending.current
      if (!p) return
      if (state !== "active") {
        p.left = true
        return
      }
      if (p.left) {
        pending.current = null
        if (Date.now() - p.at < 2 * 3600000) setOpen(p.kind)
      }
    })
    return () => sub.remove()
  }, [])

  const reach = async (kind: Channel, go: () => Promise<boolean>) => {
    pending.current = { kind, at: Date.now(), left: false }
    if (!(await go())) pending.current = null
  }

  return { open, setOpen, reach }
}

