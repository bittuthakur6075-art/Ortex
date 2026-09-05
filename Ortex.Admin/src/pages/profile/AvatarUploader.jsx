import { useRef, useState } from "react"
import { toast } from "sonner"
import { Camera, Trash2, Loader2 } from "../../components/ui/Icons"
import { uploadAvatar, removeAvatar, MAX_AVATAR_BYTES, MAX_AVATAR_MB } from "../../lib/avatarUpload"
import { updateMyProfile } from "../../services/users"
import { refreshProfile } from "../../hooks/useProfile"
import { currentUserId } from "../../lib/auth"
import { hasSupabase } from "../../data/store/supabaseClient"

// Profile photo with a camera button on the corner. Picking a file crops it to
// a square, uploads it to the "avatars" bucket and stores the URL on the
// profile, then refreshes every place the avatar is drawn (header, popover).
// The previous photo is deleted afterwards so the bucket does not collect
// orphans.
export default function AvatarUploader({ photo, name, size = "h-24 w-24" }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const initial = (name || "?").slice(0, 1).toUpperCase()

  const save = async (url) => {
    const res = await updateMyProfile(currentUserId(), { avatar_url: url })
    if (res.error) return { error: res.error }
    refreshProfile()
    if (photo && photo !== url) await removeAvatar(photo)
    return { ok: true }
  }

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-picking the same file
    if (!file) return
    if (!hasSupabase) return toast.error("Uploading a photo needs the backend enabled")
    if (!file.type.startsWith("image/")) return toast.error("Choose an image file")
    if (file.size > MAX_AVATAR_BYTES) return toast.error(`Image is over ${MAX_AVATAR_MB}MB`)

    setBusy(true)
    try {
      const url = await uploadAvatar(file, currentUserId())
      const res = await save(url)
      if (res.error) {
        await removeAvatar(url) // the object is orphaned if the profile write failed
        return toast.error(res.error)
      }
      toast.success("Photo updated")
    } catch (err) {
      console.error("Avatar upload failed:", err)
      toast.error("Could not upload the photo")
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    if (!hasSupabase) return toast.error("Removing your photo needs the backend enabled")
    setBusy(true)
    const res = await save(null)
    setBusy(false)
    if (res.error) return toast.error(res.error)
    toast.success("Photo removed")
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        {photo ? (
          <img src={photo} alt={name || "Profile photo"} className={`${size} rounded-full bg-muted object-cover ring-4 ring-card`} />
        ) : (
          <span className={`${size} flex items-center justify-center rounded-full bg-primary/10 text-3xl font-bold text-primary ring-4 ring-card`}>{initial}</span>
        )}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={photo ? "Change photo" : "Upload photo"}
          title={photo ? "Change photo" : "Upload photo"}
          className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-primary text-white ring-2 ring-card transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4" /> : <Camera variant="Linear" className="h-4 w-4" />}
        </button>
        <input ref={input} type="file" accept="image/*" onChange={pick} className="hidden" />
      </div>
      {photo && !busy && (
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-destructive-text">
          <Trash2 variant="Linear" className="h-3.5 w-3.5" /> Remove photo
        </button>
      )}
    </div>
  )
}
