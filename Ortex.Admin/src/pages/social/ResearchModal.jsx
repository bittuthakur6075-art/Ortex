import { useState, useEffect } from "react"
import { Plus, Sparkles } from "../../components/ui/Icons"
import { toast } from "sonner"
import { repo } from "../../data/store/repository"
import { newSocialPost } from "../../data/domain/schema"
import { supabase, hasSupabase, functionErrorMessage } from "../../data/store/supabaseClient"
import { Button, Card, Input, Select, Field, Modal } from "../../components/ui/Ui"

export default function ResearchModal({ open, onClose }) {
  const [angle, setAngle] = useState("")
  const [count, setCount] = useState(3)
  const [busy, setBusy] = useState(false)
  const [ideas, setIdeas] = useState(null)

  useEffect(() => {
    if (open) {
      setAngle("")
      setCount(3)
      setIdeas(null)
    }
  }, [open])

  const run = async () => {
    if (!hasSupabase) return toast.error("Connect Supabase to use the researcher.")
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke("social-researcher", {
        body: { angle, count: Number(count) },
      })
      if (error) throw new Error(await functionErrorMessage(error, "Research failed"))
      if (data?.error) throw new Error(data.error)
      setIdeas(data.ideas || [])
    } catch (err) {
      console.error("Social research failed:", err)
      toast.error(err?.message || "Research failed")
    } finally {
      setBusy(false)
    }
  }

  const keep = async (idea) => {
    await repo.create("social", newSocialPost({ ...idea, status: "idea" }))
    setIdeas((list) => list.filter((i) => i !== idea))
    toast.success("Saved as an idea")
  }

  const keepAll = async () => {
    await repo.bulkCreate("social", ideas.map((i) => newSocialPost({ ...i, status: "idea" })))
    toast.success(`${ideas.length} ideas saved`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Research post ideas"
      width="max-w-3xl"
      footer={
        <div className="flex w-full items-center justify-between">
          <p className="text-xs text-muted-foreground">Ideas are grounded in your live products and categories.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            {ideas?.length > 0 && (
              <Button size="sm" onClick={keepAll}>
                Keep all {ideas.length}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <Field label="Angle" hint="Optional - leave blank and the researcher picks its own">
            <Input
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="e.g. School procurement season"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run() } }}
            />
          </Field>
          <Field label="How many">
            <Select value={count} onChange={(e) => setCount(e.target.value)}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </Field>
          <Button onClick={run} disabled={busy}>
            <Sparkles className="h-4 w-4" /> {busy ? "Researching…" : ideas ? "Again" : "Research"}
          </Button>
        </div>

        {ideas?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No ideas came back. Try a different angle.</p>
        )}

        {ideas?.map((idea, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-foreground">{idea.topic}</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">{idea.hook}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => keep(idea)}>
                <Plus className="h-4 w-4" /> Keep
              </Button>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{idea.caption}</p>
            <p className="mt-2 text-xs text-primary">{(idea.hashtags || []).map((h) => `#${h}`).join(" ")}</p>
          </Card>
        ))}
      </div>
    </Modal>
  )
}
