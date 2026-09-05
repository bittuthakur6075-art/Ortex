import { useState } from "react"
import { Trash2 } from "../../components/ui/Icons"
import { toast } from "sonner"
import { repo } from "../../data/store/repository"
import { useProfile } from "../../hooks/useProfile"
import { newSocialPost, SOCIAL_STATUS, statusMeta } from "../../data/domain/schema"
import { supabase, hasSupabase, functionErrorMessage } from "../../data/store/supabaseClient"
import PageHeader from "../../components/layout/PageHeader"
import { Button, StatusBadge } from "../../components/ui/Ui"
import CreativeCard from "./CreativeCard"
import CopyCard from "./CopyCard"
import PublishingCard from "./PublishingCard"
import ApprovalCard from "./ApprovalCard"

export default function SocialEditor({ post, onClose }) {
  const profile = useProfile()
  const isAdmin = profile?.role === "admin"

  // Once a brand-new post is first persisted (by save, submit, approve, or
  // publish) we must reuse its id for every later write, or each action would
  // create a fresh duplicate row. `post` is the prop; `postId` is the live id.
  const [postId, setPostId] = useState(post?.id || null)
  const isEdit = !!postId
  const [form, setForm] = useState(() => (post ? { ...newSocialPost(), ...post } : newSocialPost()))
  const [drawing, setDrawing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [format, setFormat] = useState("square")

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const meta = statusMeta(SOCIAL_STATUS, form.status)
  const locked = form.status === "published"

  const persist = async (patch = {}) => {
    const payload = { ...form, ...patch }
    if (postId) {
      await repo.update("social", postId, payload)
      return postId
    }
    const created = await repo.create("social", payload)
    setPostId(created.id)
    return created.id
  }

  const save = async () => {
    if (!form.topic.trim()) return toast.error("A topic is required")
    await persist()
    toast.success(isEdit ? "Post updated" : "Post created")
    onClose()
  }

  // Render the creative via the social-creative Edge Function (Pollinations,
  // free, no key). A cold render can take up to a minute.
  const generate = async () => {
    if (!hasSupabase) return toast.error("Connect Supabase to generate creatives.")
    if (!form.imagePrompt.trim()) return toast.error("Write an image prompt first")
    setDrawing(true)
    try {
      const { data, error } = await supabase.functions.invoke("social-creative", {
        body: { imagePrompt: form.imagePrompt, format },
      })
      if (error) throw new Error(await functionErrorMessage(error, "Creative generation failed"))
      if (data?.error) throw new Error(data.error)
      setForm((f) => ({ ...f, image: data.image, status: f.status === "idea" ? "draft" : f.status }))
      toast.success("Creative generated - review it before approving")
    } catch (err) {
      console.error("Creative generation failed:", err)
      toast.error(err?.message || "Creative generation failed")
    } finally {
      setDrawing(false)
    }
  }

  const submitForReview = async () => {
    if (!form.image) return toast.error("Generate a creative first")
    if (!form.caption.trim()) return toast.error("Write a caption first")
    await persist({ status: "review" })
    setForm((f) => ({ ...f, status: "review" }))
    toast.success("Sent for approval")
  }

  const approve = async () => {
    const patch = {
      status: form.scheduledFor ? "scheduled" : "approved",
      approvedBy: profile?.email || "",
      approvedAt: new Date().toISOString(),
    }
    await persist(patch)
    setForm((f) => ({ ...f, ...patch }))
    toast.success(form.scheduledFor ? "Approved and scheduled" : "Approved - ready to publish")
  }

  const publish = async () => {
    if (!window.confirm("Publish this post to the live company profile now? This cannot be undone from here.")) return
    setPublishing(true)
    try {
      const id = await persist()
      const { data, error } = await supabase.functions.invoke("social-publish", { body: { postId: id } })
      if (error) throw new Error(await functionErrorMessage(error, "Publish failed"))
      if (data?.error) throw new Error(data.error)
      toast.success("Published")
      onClose()
    } catch (err) {
      console.error("Publish failed:", err)
      toast.error(err?.message || "Publish failed")
    } finally {
      setPublishing(false)
    }
  }

  const remove = async () => {
    if (window.confirm(`Delete post "${form.topic || "Untitled"}"?`)) {
      await repo.remove("social", postId)
      toast.success("Post deleted")
      onClose()
    }
  }

  const togglePlatform = (id) =>
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(id) ? f.platforms.filter((p) => p !== id) : [...f.platforms, id],
    }))

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Social
        </button>
        <StatusBadge list={SOCIAL_STATUS} status={form.status} />
      </div>

      <PageHeader
        title={isEdit ? form.topic || "Untitled post" : "New post"}
        subtitle={meta.id === "published" ? "Live on your profile" : "Draft, review, approve, then publish"}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Creative + copy */}
        <div className="space-y-6 lg:col-span-2">
          <CreativeCard
            form={form}
            set={set}
            format={format}
            setFormat={setFormat}
            generate={generate}
            drawing={drawing}
            locked={locked}
          />
          <CopyCard form={form} set={set} locked={locked} />
        </div>

        {/* Settings */}
        <div className="space-y-6">
          <PublishingCard form={form} set={set} togglePlatform={togglePlatform} locked={locked} />
          <ApprovalCard
            form={form}
            isAdmin={isAdmin}
            submitForReview={submitForReview}
            approve={approve}
            publish={publish}
            publishing={publishing}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
        {isEdit ? (
          <Button variant="dangerGhost" size="sm" onClick={remove}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={locked}>
            {isEdit ? "Save" : "Create post"}
          </Button>
        </div>
      </div>
    </div>
  )
}
