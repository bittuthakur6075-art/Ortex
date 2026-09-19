import { Image } from "expo-image"
import * as ImagePicker from "expo-image-picker"
import React from "react"
import { Linking, Pressable, StyleSheet, Text, View } from "react-native"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { isAdmin } from "@/domain/modules"
import type { Row } from "@/domain/schema"
import {
  ADMIN_ONLY,
  IG_MAX_CAPTION,
  IG_MAX_HASHTAGS,
  SOCIAL_FORMATS,
  SOCIAL_PLATFORMS,
  SOCIAL_STATUS,
  captionText,
  formatOf,
  newSocialPost,
  parseHashtags,
  platformReady,
  problemWith,
  whenLabel,
  type Platform,
  type SocialFormat,
  type SocialPost,
} from "@/domain/social"
import { useCollection } from "@/hooks/useCollection"
import { invokeEdge } from "@/lib/edgeFunction"
import { feedback } from "@/lib/feedback"
import { copyRemotePhoto, uploadLocalPhoto } from "@/lib/socialImages"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import {
  AppScreen,
  Button,
  Checkbox,
  Dialog,
  Icon,
  Section,
  SegmentedControl,
  Spinner,
  StatusBadge,
  TextField,
  useToast,
} from "@/ui"
import PhotoPickerSheet, { type PickedPhoto } from "./PhotoPickerSheet"
import SchedulePickerSheet from "./SchedulePickerSheet"
import { useSocialAccounts } from "./useSocialAccounts"

type Post = SocialPost & Row
type Busy = "" | "photo" | "ai" | "save" | "publish"

const ASPECT: Record<SocialFormat, number> = { square: 1, portrait: 4 / 5, landscape: 1200 / 628 }

const SOURCE_LABEL: Record<string, string> = {
  upload: "Your photo",
  catalogue: "From the catalogue",
  ai: "Created with AI",
  restyle: "Your photo, new scene by AI",
}

/**
 * One social post on the phone: write it, add a photo, send it for approval,
 * and (an admin) approve it and pick when it goes out. The same row the console
 * edits, and the same server does the posting: once scheduled, the publish sweep
 * sends it at the time chosen whether or not this phone is on.
 *
 * Mirrors the console's pages/social/SocialEditor.jsx; the database refuses a
 * non-admin anything past "In review" (0014/0035), and this screen matches it so
 * nobody types into a form that cannot be saved.
 */
export default function SocialPostScreen({ route, navigation }: StackScreenProps<"SocialPost">) {
  const t = useTheme()
  const toast = useToast()
  const { profile } = useAuth()
  const admin = isAdmin(profile)
  const editingId = route.params?.id

  const { items, reload } = useCollection<Post>("social")
  const { status: accounts } = useSocialAccounts()

  const [postId, setPostId] = React.useState<string | null>(editingId ?? null)
  const [draft, setDraft] = React.useState<SocialPost>(() => newSocialPost())
  const [hashtagText, setHashtagText] = React.useState("")
  const [loaded, setLoaded] = React.useState(!editingId)
  const [busy, setBusy] = React.useState<Busy>("")
  const [photosOpen, setPhotosOpen] = React.useState(false)
  const [scheduleOpen, setScheduleOpen] = React.useState(false)
  const [confirm, setConfirm] = React.useState<"" | "publish" | "delete" | "leave">("")
  const saved = React.useRef("")

  // Load once, and again when the SERVER changes the row (the sweep publishing
  // it while this screen is open) — never over what the person is typing.
  const row = editingId ? items.find((p) => p.id === editingId) : undefined
  React.useEffect(() => {
    if (!row) return
    const fromServer = newSocialPost(row)
    const serverStatusMoved = loaded && fromServer.status !== draft.status && ["publishing", "published", "failed"].includes(fromServer.status)
    if (!loaded || serverStatusMoved) {
      setDraft(fromServer)
      setHashtagText((fromServer.hashtags || []).join(", "))
      saved.current = JSON.stringify(fromServer)
      setLoaded(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row])

  // New posts start on the platforms that can actually be posted to.
  React.useEffect(() => {
    if (editingId || !accounts || saved.current) return
    const ready = SOCIAL_PLATFORMS.map((p) => p.id).filter((p) => platformReady(accounts, p))
    if (ready.length) setDraft((d) => ({ ...d, platforms: ready }))
  }, [accounts, editingId])

  const current: SocialPost = { ...draft, hashtags: parseHashtags(hashtagText) }
  const dirty = loaded && JSON.stringify(current) !== (saved.current || JSON.stringify({ ...newSocialPost(), platforms: draft.platforms }))
  const locked = draft.status === "published" || draft.status === "publishing"
  const readOnly = locked || (!admin && ADMIN_ONLY.includes(draft.status))
  const set = (patch: Partial<SocialPost>) => setDraft((d) => ({ ...d, ...patch }))

  // Leaving with unsaved changes asks first.
  React.useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (!dirty || busy === "save") return
        e.preventDefault()
        setConfirm("leave")
      }),
    [navigation, dirty, busy],
  )

  const fail = (e: unknown, fallback: string) => {
    feedback.error()
    toast.show({ message: errorMessage(e, fallback), tone: "danger" })
  }

  /** Write the post; returns its id. */
  const persist = async (patch: Partial<SocialPost> = {}) => {
    const payload = { ...current, ...patch, topic: current.topic.trim() }
    let id = postId
    if (id) {
      await repo.update("social", id, payload)
    } else {
      const created = await repo.create<Post>("social", payload)
      id = created.id
      setPostId(id)
    }
    setDraft((d) => ({ ...d, ...patch }))
    saved.current = JSON.stringify(payload)
    void reload()
    return id
  }

  // A new photo moves an idea on to a draft.
  const applyImage = (patch: Partial<SocialPost>) =>
    setDraft((d) => ({ ...d, ...patch, status: d.status === "idea" ? "draft" : d.status }))

  const withBusy = async (kind: Busy, fallback: string, fn: () => Promise<void>) => {
    setBusy(kind)
    try {
      await fn()
    } catch (e) {
      fail(e, fallback)
    } finally {
      setBusy("")
    }
  }

  // ---- photo ----

  const fromPhone = () =>
    withBusy("photo", "Could not add the photo", async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        feedback.warn()
        toast.show({ message: "Ortex needs access to your photos. Allow it in Settings", tone: "danger" })
        return
      }
      const square = draft.format === "square"
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        // iOS's cropper is square-only, so it is offered for square posts; the
        // other shapes are centre-cropped to the exact ratio after picking.
        allowsEditing: square,
        aspect: square ? [1, 1] : undefined,
        quality: 1,
      })
      if (result.canceled || !result.assets?.[0]?.uri) return
      const url = await uploadLocalPhoto(result.assets[0].uri, draft.format)
      applyImage({ image: url, imageSource: "upload", sourceImage: "" })
      feedback.created()
    })

  const fromCatalogue = (photo: PickedPhoto) => {
    setPhotosOpen(false)
    void withBusy("photo", "Could not add that photo", async () => {
      const url = await copyRemotePhoto(photo.url, draft.format)
      applyImage({ image: url, imageSource: "catalogue", sourceImage: "", productId: draft.productId || photo.productId })
      feedback.created()
      toast.show({ message: `Added: ${photo.label}`, tone: "success" })
    })
  }

  // A restyle starts from a real photo: this post's, or the one a previous
  // restyle was made from.
  const realPhoto =
    draft.imageSource === "restyle" ? draft.sourceImage : ["upload", "catalogue"].includes(draft.imageSource) ? draft.image : ""

  const createImage = (restyle: boolean) => {
    if (!restyle && !draft.imagePrompt.trim()) {
      feedback.warn()
      toast.show({ message: "Describe the image first", tone: "danger" })
      return
    }
    void withBusy("ai", "Could not create the image", async () => {
      const { data, error } = await invokeEdge<{ image: string }>("social-creative", {
        imagePrompt: draft.imagePrompt,
        format: draft.format,
        ...(restyle ? { referenceUrl: realPhoto } : {}),
      })
      if (error || !data?.image) throw new Error(error || "No image came back")
      applyImage(restyle ? { image: data.image, imageSource: "restyle", sourceImage: realPhoto } : { image: data.image, imageSource: "ai", sourceImage: "" })
      feedback.created()
      toast.show({ message: restyle ? "Restyled. Check the product still looks right" : "Image created. Check it before sending", tone: "success" })
    })
  }

  // ---- actions ----

  const blocked = () => {
    const problem = problemWith(current, accounts)
    if (problem) {
      feedback.warn()
      toast.show({ message: problem, tone: "danger" })
    }
    return Boolean(problem)
  }

  /** An admin's schedule change decides between "approved" and "scheduled". */
  const scheduledStatus = (iso: string | null) => (iso && new Date(iso).getTime() > Date.now() ? "scheduled" : "approved")

  const save = () => {
    if (!current.topic.trim()) {
      feedback.warn()
      toast.show({ message: "Give the post a topic", tone: "danger" })
      return
    }
    void withBusy("save", "Could not save the post", async () => {
      const patch = admin && ["approved", "scheduled"].includes(draft.status) ? { status: scheduledStatus(draft.scheduledFor) } : {}
      await persist(patch)
      feedback.created()
      toast.show({ message: postId ? "Post saved" : "Post created", tone: "success" })
    })
  }

  const sendForApproval = () => {
    if (blocked()) return
    void withBusy("save", "Could not send it for approval", async () => {
      await persist({ status: "review" })
      feedback.created()
      toast.show({ message: admin ? "Ready for approval" : "Sent to an admin for approval", tone: "success" })
    })
  }

  const approve = () => {
    if (blocked()) return
    void withBusy("save", "Could not approve the post", async () => {
      const status = scheduledStatus(draft.scheduledFor)
      await persist({ status, approvedBy: profile?.email || "", approvedAt: new Date().toISOString() })
      feedback.created()
      toast.show({
        message: status === "scheduled" ? `Approved. Goes out ${whenLabel(draft.scheduledFor)}` : "Approved. Publish it now or pick a time",
        tone: "success",
      })
    })
  }

  const publishNow = () => {
    setConfirm("")
    if (blocked()) return
    void withBusy("publish", "Could not publish", async () => {
      const id = await persist()
      const { error } = await invokeEdge("social-publish", { postId: id })
      await reload()
      if (error) throw new Error(error)
      feedback.created()
      toast.show({ message: "Published", tone: "success" })
    })
  }

  const remove = () => {
    setConfirm("")
    if (!postId) return
    void withBusy("save", "Could not delete the post", async () => {
      await repo.remove("social", postId)
      saved.current = JSON.stringify(current) // nothing left to protect
      feedback.deleted()
      toast.show({ message: "Post deleted", tone: "success" })
      navigation.goBack()
    })
  }

  const live = draft.status === "published" || Object.values(draft.results || {}).some((r) => r?.id)
  const posted = captionText(current)
  const onInstagram = current.platforms.includes("instagram")
  const format = formatOf(draft.format)

  if (!loaded) {
    return (
      <AppScreen title="Post" back onBack={() => navigation.goBack()} inTabs={false}>
        <View style={styles.center}>
          <Spinner />
        </View>
      </AppScreen>
    )
  }

  return (
    <>
      <AppScreen
        title={postId ? draft.topic || "Post" : "New post"}
        back
        onBack={() => navigation.goBack()}
        inTabs={false}
        headerRight={<StatusBadge list={SOCIAL_STATUS} id={draft.status} small />}
        contentStyle={styles.content}
      >
        {readOnly && !locked && (
          <Text style={[textVariants.caption, styles.notice, { color: t.warningText, backgroundColor: t.warningBg }]}>
            This post is approved, so only an admin can change it.
          </Text>
        )}

        {/* ---- photo ---- */}
        <Section title="Photo" style={styles.section} bodyStyle={styles.form}>
          <SegmentedControl
            options={SOCIAL_FORMATS.map((f) => ({ key: f.key, label: f.label }))}
            value={draft.format}
            onChange={(v) => !readOnly && set({ format: v })}
          />
          <View style={[styles.photo, { aspectRatio: ASPECT[draft.format], backgroundColor: t.surfaceInset, borderColor: t.border }]}>
            {draft.image ? (
              <Image source={{ uri: draft.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
            ) : (
              <View style={styles.photoEmpty}>
                <Icon name="image" size={28} color={t.textTertiary} variant="Bulk" />
                <Text style={[textVariants.caption, { color: t.textTertiary }]}>
                  {format.label} {format.size[0]}×{format.size[1]}
                </Text>
              </View>
            )}
            {(busy === "photo" || busy === "ai") && (
              <View style={[StyleSheet.absoluteFill as object, styles.overlay, { backgroundColor: t.scrim }]}>
                <Spinner />
                <Text style={[textVariants.caption, { color: "#FFFFFF" }]}>
                  {busy === "ai" ? "Creating… up to a minute" : "Preparing photo…"}
                </Text>
              </View>
            )}
          </View>
          {!!draft.image && (
            <Text style={[textVariants.caption, { color: t.textTertiary }]}>{SOURCE_LABEL[draft.imageSource] || "Photo"}</Text>
          )}
          {!!draft.image && ["ai", "restyle"].includes(draft.imageSource) && (
            <Text style={[textVariants.caption, styles.notice, { color: t.warningText, backgroundColor: t.warningBg }]}>
              AI image: check the product looks like what Ortex makes, with no invented text or logo.
            </Text>
          )}
          {!readOnly && (
            <View style={styles.row}>
              <Button label="From phone" icon="camera" variant="secondary" style={styles.flex} disabled={Boolean(busy)} onPress={() => void fromPhone()} />
              <Button label="Catalogue" icon="product" variant="secondary" style={styles.flex} disabled={Boolean(busy)} onPress={() => setPhotosOpen(true)} />
            </View>
          )}
          {!readOnly && (
            <>
              <TextField
                label={realPhoto ? "New scene (for Restyle) or image description" : "Or describe an image for AI"}
                value={draft.imagePrompt}
                onChangeText={(v) => set({ imagePrompt: v })}
                placeholder={realPhoto ? "e.g. on a walnut boardroom table, warm light" : "e.g. blue lanyards on an office desk"}
                multiline
                ai={{
                  purpose: realPhoto
                    ? "A short scene description for restyling a real product photo into an advertising shot: setting, surface, props, light. Never ask for text, letters or logos"
                    : "Prompt for an AI image model that renders a social media product photo: product, material, setting, lighting. Never ask for text, letters or logos",
                  format: "short",
                  maxChars: 600,
                  context: () => ({ topic: draft.topic, caption: draft.caption }),
                }}
              />
              <View style={styles.row}>
                {!!realPhoto && (
                  <Button label="Restyle photo" icon="assistant" style={styles.flex} disabled={Boolean(busy)} onPress={() => createImage(true)} />
                )}
                <Button
                  label={draft.imageSource === "ai" ? "Create again" : "Create with AI"}
                  icon="assistant"
                  variant={realPhoto ? "secondary" : "primary"}
                  style={styles.flex}
                  disabled={Boolean(busy)}
                  onPress={() => createImage(false)}
                />
              </View>
            </>
          )}
        </Section>

        {/* ---- the words ---- */}
        <Section title="Post" style={styles.section} bodyStyle={styles.form}>
          <TextField
            label="Topic"
            required
            value={draft.topic}
            onChangeText={(v) => set({ topic: v })}
            placeholder="Internal name, e.g. Lanyards for events"
            editable={!readOnly}
          />
          {!!draft.hook && (
            <Text style={[textVariants.caption, styles.notice, { color: t.infoText, backgroundColor: t.infoBg }]}>
              Why this post: {draft.hook}
            </Text>
          )}
          <TextField
            label="Caption"
            value={draft.caption}
            onChangeText={(v) => set({ caption: v })}
            placeholder="Lead with the buyer's problem, end with how to reach you"
            multiline
            editable={!readOnly}
            hint={`${draft.caption.length} characters. The feed shows about the first 125`}
            ai={
              readOnly
                ? undefined
                : {
                    purpose:
                      "Instagram, Facebook and LinkedIn caption for an Ortex Industries post. Hook in the first 125 characters, a clear call to enquire, no hashtags (they are a separate field)",
                    format: "message",
                    maxChars: 1500,
                    context: () => ({ topic: draft.topic }),
                  }
            }
          />
          <TextField
            label="Hashtags"
            value={hashtagText}
            onChangeText={setHashtagText}
            placeholder="corporategifting, lanyards, delhibusiness"
            autoCapitalize="none"
            editable={!readOnly}
            hint={`${current.hashtags.length} of ${IG_MAX_HASHTAGS} Instagram allows`}
            error={onInstagram && current.hashtags.length > IG_MAX_HASHTAGS ? `Instagram allows ${IG_MAX_HASHTAGS}` : undefined}
          />
          {onInstagram && posted.length > IG_MAX_CAPTION && (
            <Text style={[textVariants.caption, { color: t.dangerText }]}>
              Caption and hashtags are {posted.length} characters; Instagram allows {IG_MAX_CAPTION}.
            </Text>
          )}
        </Section>

        {/* ---- where and when ---- */}
        <Section title="Where and when" style={styles.section} bodyStyle={styles.form}>
          {SOCIAL_PLATFORMS.map((p) => {
            const checked = draft.platforms.includes(p.id)
            const ready = platformReady(accounts, p.id)
            return (
              <View key={p.id} style={styles.platform}>
                <Checkbox
                  checked={checked}
                  disabled={readOnly || (!ready && !checked)}
                  label={p.label}
                  onChange={(on) =>
                    set({ platforms: on ? [...draft.platforms, p.id] : draft.platforms.filter((x: Platform) => x !== p.id) })
                  }
                />
                {!ready && <Text style={[textVariants.caption, { color: t.textTertiary }]}>Not connected</Text>}
              </View>
            )
          })}

          <Pressable
            disabled={readOnly && !admin}
            onPress={() => setScheduleOpen(true)}
            style={[styles.picker, { borderColor: t.border, backgroundColor: t.surface }]}
            accessibilityLabel="Choose when this post goes out"
          >
            <Icon name="calendar" size={20} color={t.primary} variant="Bulk" />
            <View style={styles.flex}>
              <Text style={[textVariants.caption, { color: t.textSecondary }]}>Goes out</Text>
              <Text style={[styles.pickerValue, { color: t.text }]}>
                {draft.scheduledFor ? whenLabel(draft.scheduledFor) : "When an admin publishes it"}
              </Text>
            </View>
            {!(readOnly && !admin) && <Icon name="down" size={18} color={t.textTertiary} />}
          </Pressable>
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>
            Scheduled posts go out from the server within 15 minutes of the time, even with this phone off.
          </Text>
        </Section>

        {/* ---- outcome ---- */}
        {(!!draft.error || Object.keys(draft.results || {}).length > 0) && (
          <Section title="Result" style={styles.section} bodyStyle={styles.form}>
            {!!draft.error && (
              <Text style={[textVariants.caption, styles.notice, { color: t.dangerText, backgroundColor: t.dangerBg }]}>{draft.error}</Text>
            )}
            {Object.entries(draft.results || {}).map(([platform, r]) => (
              <Pressable key={platform} disabled={!r?.permalink} onPress={() => r?.permalink && void Linking.openURL(r.permalink)} style={styles.result}>
                <Text style={[textVariants.body, { color: t.text }]}>{SOCIAL_PLATFORMS.find((p) => p.id === platform)?.label || platform}</Text>
                <Text style={[textVariants.caption, { color: r?.id ? (r.permalink ? t.primary : t.successText) : t.dangerText }]}>
                  {r?.id ? (r.permalink ? "View post" : "Published") : r?.error || "Not published"}
                </Text>
              </Pressable>
            ))}
          </Section>
        )}

        {/* ---- actions ---- */}
        <View style={styles.actions}>
          {draft.status === "publishing" && (
            <Text style={[textVariants.caption, styles.center, { color: t.textSecondary }]}>Being posted right now. This page updates by itself.</Text>
          )}

          {(draft.status === "idea" || draft.status === "draft") && (
            <Button label="Send for approval" fullWidth disabled={Boolean(busy)} onPress={sendForApproval} />
          )}

          {draft.status === "review" &&
            (admin ? (
              <Button
                label={draft.scheduledFor ? `Approve and schedule` : "Approve"}
                icon="tick"
                fullWidth
                disabled={Boolean(busy)}
                onPress={approve}
              />
            ) : (
              <Text style={[textVariants.caption, styles.center, { color: t.textSecondary }]}>Waiting on an admin to approve.</Text>
            ))}

          {admin && ["approved", "scheduled", "failed"].includes(draft.status) && (
            <Button
              label={draft.status === "failed" ? "Try publishing again" : "Publish now"}
              icon="send"
              fullWidth
              loading={busy === "publish"}
              disabled={Boolean(busy)}
              onPress={() => setConfirm("publish")}
            />
          )}

          {!readOnly && (
            <Button label={postId ? "Save changes" : "Save draft"} variant="secondary" fullWidth loading={busy === "save"} disabled={Boolean(busy)} onPress={save} />
          )}

          {!!postId && (admin || !ADMIN_ONLY.includes(draft.status)) && (
            <Button label="Delete post" variant="danger" fullWidth disabled={Boolean(busy)} onPress={() => setConfirm("delete")} />
          )}
        </View>
      </AppScreen>

      <PhotoPickerSheet visible={photosOpen} onClose={() => setPhotosOpen(false)} onPick={fromCatalogue} />

      <SchedulePickerSheet
        visible={scheduleOpen}
        value={draft.scheduledFor}
        onClose={() => setScheduleOpen(false)}
        onPick={(iso) => {
          set({ scheduledFor: iso })
          setScheduleOpen(false)
        }}
      />

      <Dialog
        visible={confirm === "publish"}
        onClose={() => setConfirm("")}
        title="Publish now?"
        message={`This posts to the live ${current.platforms.map((p) => SOCIAL_PLATFORMS.find((x) => x.id === p)?.label).join(", ")} straight away. It cannot be undone from here.`}
        actions={[
          { label: "Cancel", onPress: () => setConfirm("") },
          { label: "Publish", onPress: publishNow },
        ]}
      />
      <Dialog
        visible={confirm === "delete"}
        onClose={() => setConfirm("")}
        title="Delete this post?"
        message={live ? "It is removed from Ortex only. It stays live on Instagram, Facebook and LinkedIn; delete it there separately." : "This cannot be undone."}
        actions={[
          { label: "Cancel", onPress: () => setConfirm("") },
          { label: "Delete", tone: "danger", onPress: remove },
        ]}
      />
      <Dialog
        visible={confirm === "leave"}
        onClose={() => setConfirm("")}
        title="Discard your changes?"
        message="What you changed on this post has not been saved."
        actions={[
          { label: "Keep editing", onPress: () => setConfirm("") },
          {
            label: "Discard",
            tone: "danger",
            onPress: () => {
              saved.current = JSON.stringify(current)
              setConfirm("")
              navigation.goBack()
            },
          },
        ]}
      />
    </>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl },
  section: { marginBottom: 0 },
  form: { paddingHorizontal: gutter, paddingTop: spacing.xs, gap: spacing.sm },
  center: { textAlign: "center", paddingVertical: spacing.lg, alignItems: "center" },
  notice: { marginHorizontal: gutter, marginVertical: spacing.xs, padding: spacing.sm, borderRadius: radius.sm, overflow: "hidden" },
  photo: { width: "100%", borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  photoEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  overlay: { alignItems: "center", justifyContent: "center", gap: 8 },
  row: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  platform: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerValue: { fontSize: 15, fontFamily: font.medium },
  result: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  actions: { paddingHorizontal: gutter, paddingTop: spacing.lg, gap: spacing.sm },
})
