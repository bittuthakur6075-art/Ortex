import { useEffect, useRef, useState } from "react"
import { Trash2 } from "../../components/ui/Icons"
import { toast } from "sonner"
import { repo } from "../../data/store/repository"
import { useProfile } from "../../hooks/useProfile"
import { newSocialPost, SOCIAL_STATUS, statusMeta, socialCaptionText } from "../../data/domain/schema"
import { supabase, hasSupabase, functionErrorMessage } from "../../data/store/supabaseClient"
import PageHeader from "../../components/layout/PageHeader"
import { Button, StatusBadge } from "../../components/ui/Ui"
import CreativeCard from "./CreativeCard"
import CopyCard from "./CopyCard"
import PublishingCard from "./PublishingCard"
import ApprovalCard from "./ApprovalCard"
import PhotoPicker from "./PhotoPicker"
import { isAdmin as isAdminRole } from "../../lib/roles"
import { uploadSocialImage, IG_MAX_CAPTION, IG_MAX_HASHTAGS } from "../../lib/socialImage"

// Statuses only an admin may set or edit. The database refuses anyone else
// (migrations 0013, 0014, 0035); the editor matches it so a rep never types into
// a form that cannot be saved.
const ADMIN_ONLY = ["approved", "scheduled", "publishing", "published", "failed"]

/** What would stop this post going out, as a sentence, or "". */
function problemWith(post) {
  if (!post.image) return "Add a photo or create an image first."
  if (!String(post.caption || "").trim()) return "Write a caption first."
  if (!(post.platforms || []).length) return "Choose at least one platform."
  if ((post.platforms || []).includes("instagram")) {
    const posted = socialCaptionText(post)
    if (posted.length > IG_MAX_CAPTION) return `Caption and hashtags are ${posted.length} characters; Instagram allows ${IG_MAX_CAPTION}.`
    if ((post.hashtags || []).length > IG_MAX_HASHTAGS) return `Instagram allows ${IG_MAX_HASHTAGS} hashtags.`
  }
  return ""
}

export default function SocialEditor({ post, onClose }) {
  const profile = useProfile()
  const isAdmin = isAdminRole(profile)

  // Once a brand-new post is first persisted (by save, submit, approve, or
  // publish) we must reuse its id for every later write, or each action would
  // create a fresh duplicate row. `post` is the prop; `postId` is the live id.
  const [postId, setPostId] = useState(post?.id || null)
  const isEdit = !!postId
  const [form, setForm] = useState(() => (post ? { ...newSocialPost(), ...post } : newSocialPost()))
  const [busy, setBusy] = useState("") // "" | upload | pick | generate | restyle | save
  const [publishing, setPublishing] = useState(false)
  const [picking, setPicking] = useState(false)

  // Unsaved-change tracking, for the leave warning.
  const savedRef = useRef(JSON.stringify(form))
  const dirty = JSON.stringify(form) !== savedRef.current
  const markSaved = (doc) => { savedRef.current = JSON.stringify(doc) }

  useEffect(() => {
    if (!dirty) return
    const warn = (e) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const meta = statusMeta(SOCIAL_STATUS, form.status)
  const locked = form.status === "published" || form.status === "publishing"
  const readOnly = locked || (!isAdmin && ADMIN_ONLY.includes(form.status))

  // Every action goes through here: a refusal from the database (an RLS policy,
  // the approval guard) or a function now reaches the person as a sentence
  // instead of an uncaught promise.
  const attempt = async (label, fn) => {
    try {
      return await fn()
    } catch (err) {
      console.error(`${label} failed:`, err)
      toast.error(err?.message || `${label} failed`)
      return undefined
    }
  }

  const persist = async (patch = {}) => {
    const payload = { ...form, ...patch }
    if (postId) {
      await repo.update("social", postId, payload)
    } else {
      const created = await repo.create("social", payload)
      setPostId(created.id)
      markSaved(payload)
      return created.id
    }
    markSaved(payload)
    return postId
  }

  const leave = () => {
    if (dirty && !window.confirm("Leave without saving your changes?")) return
    onClose()
  }

  const save = () =>
    attempt("Save", async () => {
      if (!form.topic.trim()) return toast.error("A topic is required")
      setBusy("save")
      try {
        await persist()
      } finally {
        setBusy("")
      }
      toast.success(isEdit ? "Post updated" : "Post created")
      onClose()
    })

  // A new photo moves an idea on to a draft.
  const applyImage = (patch) =>
    setForm((f) => ({ ...f, ...patch, status: f.status === "idea" ? "draft" : f.status }))

  const withBusy = (kind, label, fn) =>
    attempt(label, async () => {
      setBusy(kind)
      try {
        await fn()
      } finally {
        setBusy("")
      }
    })

  const onUpload = (file) =>
    withBusy("upload", "Upload", async () => {
      const url = await uploadSocialImage(file, form.format)
      applyImage({ image: url, imageSource: "upload", sourceImage: "" })
      toast.success("Photo added")
    })

  const onPick = (photo) => {
    setPicking(false)
    withBusy("pick", "Adding the photo", async () => {
      const url = await uploadSocialImage(photo.url, form.format)
      applyImage({ image: url, imageSource: "catalogue", sourceImage: "", productId: form.productId || photo.productId || null })
      toast.success(`Added: ${photo.label}`)
    })
  }

  const render = async (body) => {
    if (!hasSupabase) throw new Error("Connect Supabase to create images.")
    const { data, error } = await supabase.functions.invoke("social-creative", { body })
    if (error) throw new Error(await functionErrorMessage(error, "Image creation failed"))
    if (data?.error) throw new Error(data.error)
    return data.image
  }

  const onGenerate = () => {
    if (!form.imagePrompt.trim()) return toast.error("Describe the image first")
    return withBusy("generate", "Image creation", async () => {
      const image = await render({ imagePrompt: form.imagePrompt, format: form.format })
      applyImage({ image, imageSource: "ai", sourceImage: "" })
      toast.success("Image created. Check it before sending for approval.")
    })
  }

  const onRestyle = (realPhoto) =>
    withBusy("restyle", "Restyle", async () => {
      const image = await render({ imagePrompt: form.imagePrompt, format: form.format, referenceUrl: realPhoto })
      applyImage({ image, imageSource: "restyle", sourceImage: realPhoto })
      toast.success("Restyled. Check the product still looks exactly right.")
    })

  const submitForReview = () =>
    attempt("Send for approval", async () => {
      if (!form.topic.trim()) return toast.error("A topic is required")
      const problem = problemWith(form)
      if (problem) return toast.error(problem)
      await persist({ status: "review" })
      setForm((f) => ({ ...f, status: "review" }))
      markSaved({ ...form, status: "review" })
      toast.success("Sent for approval")
    })

  const approve = () =>
    attempt("Approve", async () => {
      const problem = problemWith(form)
      if (problem) return toast.error(problem)
      // A schedule time already in the past is not a schedule; approve it for
      // publishing by hand instead of letting the next sweep fire it at once.
      const future = form.scheduledFor && new Date(form.scheduledFor).getTime() > Date.now()
      const patch = {
        status: future ? "scheduled" : "approved",
        approvedBy: profile?.email || "",
        approvedAt: new Date().toISOString(),
      }
      await persist(patch)
      setForm((f) => ({ ...f, ...patch }))
      markSaved({ ...form, ...patch })
      if (form.scheduledFor && !future) toast.message("The scheduled time has passed, so it is approved to publish now instead.")
      toast.success(future ? "Approved and scheduled" : "Approved, ready to publish")
    })

  const publish = async () => {
    const problem = problemWith(form)
    if (problem) return toast.error(problem)
    if (!window.confirm("Publish this post to the live company profile now? This cannot be undone from here.")) return
    setPublishing(true)
    let id = postId
    try {
      id = await persist()
      const { data, error } = await supabase.functions.invoke("social-publish", { body: { postId: id } })
      if (error) throw new Error(await functionErrorMessage(error, "Publish failed"))
      if (data?.error) throw new Error(data.error)
      toast.success("Published")
      onClose()
    } catch (err) {
      console.error("Publish failed:", err)
      toast.error(err?.message || "Publish failed")
      // The function records what landed and what failed on the row itself;
      // show that rather than the form as it was before the attempt.
      if (id) {
        const fresh = await repo.get("social", id).catch(() => null)
        if (fresh) {
          const next = { ...newSocialPost(), ...fresh }
          setForm(next)
          markSaved(next)
        }
      }
    } finally {
      setPublishing(false)
    }
  }

  const remove = () =>
    attempt("Delete", async () => {
      const live = form.status === "published" || Object.values(form.results || {}).some((r) => r?.id)
      const question = live
        ? `Delete "${form.topic || "Untitled"}" from the console?\n\nIt stays live on Instagram and Facebook; delete it there separately.`
        : `Delete post "${form.topic || "Untitled"}"?`
      if (!window.confirm(question)) return
      await repo.remove("social", postId)
      toast.success("Post deleted")
      onClose()
    })

  const togglePlatform = (id) =>
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(id) ? f.platforms.filter((p) => p !== id) : [...f.platforms, id],
    }))

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <button onClick={leave} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Social
        </button>
        <StatusBadge list={SOCIAL_STATUS} status={form.status} />
      </div>

      <PageHeader
        title={isEdit ? form.topic || "Untitled post" : "New post"}
        subtitle={meta.id === "published" ? "Live on your profile" : "Draft, review, approve, then publish"}
      />

      {readOnly && !locked && (
        <p className="mb-4 rounded-lg bg-warning/12 px-4 py-3 text-sm text-warning-text">
          This post is approved, so only an admin can change it.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Creative + copy */}
        <div className="space-y-6 lg:col-span-2">
          <CreativeCard
            form={form}
            set={set}
            busy={busy === "save" ? "" : busy}
            locked={readOnly}
            onUpload={onUpload}
            onOpenPicker={() => setPicking(true)}
            onGenerate={onGenerate}
            onRestyle={onRestyle}
          />
          <CopyCard form={form} set={set} locked={readOnly} />
        </div>

        {/* Settings */}
        <div className="space-y-6">
          <PublishingCard form={form} set={set} togglePlatform={togglePlatform} locked={readOnly} />
          <ApprovalCard
            form={form}
            isAdmin={isAdmin}
            busy={Boolean(busy)}
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
          <Button variant="outline" size="sm" onClick={leave}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={readOnly || Boolean(busy)}>
            {busy === "save" ? "Saving…" : isEdit ? "Save" : "Create post"}
          </Button>
        </div>
      </div>

      <PhotoPicker open={picking} onClose={() => setPicking(false)} onPick={onPick} />
    </div>
  )
}
