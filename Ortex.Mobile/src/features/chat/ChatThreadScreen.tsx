import * as Clipboard from "expo-clipboard"
import * as ImagePicker from "expo-image-picker"
import React from "react"
import {
  FlatList,
  Image,
  Keyboard,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { TEAM_TITLES } from "@/domain/anuIntent"
import { isAdmin } from "@/domain/modules"
import {
  clock,
  conversationTitle,
  firstName,
  isImage,
  isMultiPerson,
  memberLine,
  peerOf,
  threadSections,
  tickState,
  type ChatAttachment,
  type ChatMessage,
  type Conversation,
} from "@/domain/chat"
import { ConversationAvatar, PersonFace, Ticks } from "@/features/chat/chatUi"
import { useDismissChatNotification } from "@/features/chat/ChatNotifier"
import { useAnuChat } from "@/features/chat/useAnuChat"
import { getInbox, patchConversation, setActiveConversation, useChatInbox, useChatThread, useMyId, type Photo } from "@/features/chat/useChat"
import { keyboardTopInWindow } from "@/hooks/useKeyboardAwareScroll"
import { cachedFileUrl, chat, fileUrl } from "@/lib/chat"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { fontFamily, textVariants } from "@/theme/typography"
import { Button, Dialog, EmptyState, Icon, IconButton, ImageViewer, Spinner, SquircleBackground, useToast, type IconName } from "@/ui"
import { useReducedMotion } from "@/ui/motion"

/**
 * One conversation — the console's pages/chat/Thread.jsx on the phone.
 *
 * An inverted list (newest at the bottom, the keyboard pushes it up), day
 * labels, WhatsApp-style bubbles and ticks, photos, replies, and a long-press
 * menu (Reply, Copy, Delete for everyone). In the Anu thread the composer asks
 * Anu instead, her answers carry record cards, and a message for a team waits
 * on a Send / Cancel card. Every word she writes comes from the database.
 */

const ANU_SUGGESTIONS = [
  "What needs my attention today?",
  "Who is not in today?",
  "Daily update for my team",
  "Sales this month",
  "New leads this week",
  "What's new?",
]

const CARD_ICON: Record<string, IconName> = { quotation: "quote", customer: "customer", enquiry: "enquiry", voice_call: "voice", product: "product" }
const CARD_ROUTE: Record<string, "QuotationDetail" | "CustomerDetail" | "EnquiryDetail" | "VoiceCallDetail" | "ProductDetail"> = {
  quotation: "QuotationDetail",
  customer: "CustomerDetail",
  enquiry: "EnquiryDetail",
  voice_call: "VoiceCallDetail",
  product: "ProductDetail",
}

/**
 * Stands in for the conversation until the inbox has it (a cold start from a
 * notification, or an inbox that failed), so the messages still draw.
 */
function stubConversation(id: string): Conversation {
  return { id, kind: "direct", title: null, team: null, muted: false, my_role: "member", last_read_at: null, activity_at: "", unread: 0, members: [], last_message: null }
}

type MessageAction = { name: "reply" | "copy" | "delete"; label: string; danger?: boolean; run: () => void }

const TICK_WORD: Record<string, string> = { pending: "sending", failed: "not sent", sent: "sent", read: "read" }

type Row = { type: "day"; key: string; label: string } | { type: "msg"; key: string; message: ChatMessage; runStart: boolean; runEnd: boolean }

/** A coordinate-origin difference (status bar) is not a keyboard; below this, no lift. */
const LIFT_SLACK = 40

/** How much of this view the keyboard covers (AnuScreen's measured lift). */
function useKeyboardLift(reduced: boolean) {
  const ref = React.useRef<View>(null)
  const [lift, setLift] = React.useState(0)
  const keyboardTop = React.useRef(0)
  const measure = React.useCallback(() => {
    const view = ref.current
    if (!view || !keyboardTop.current) return setLift(0)
    try {
      view.measureInWindow((_x, y, _w, h) => {
        if (!h || !keyboardTop.current) return
        const overlap = Math.round(y + h - keyboardTop.current)
        setLift(overlap > LIFT_SLACK ? overlap : 0)
      })
    } catch {
      /* detached mid-measure */
    }
  }, [])
  React.useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"
    const animate = (e?: KeyboardEvent) => {
      if (reduced || Platform.OS !== "ios") return
      LayoutAnimation.configureNext({ duration: e?.duration || 250, update: { type: LayoutAnimation.Types.keyboard } })
    }
    const show = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      keyboardTop.current = keyboardTopInWindow(e)
      animate(e)
      requestAnimationFrame(measure)
    })
    const hide = Keyboard.addListener(hideEvent, (e: KeyboardEvent) => {
      keyboardTop.current = 0
      animate(e)
      setLift(0)
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [measure, reduced])
  return { ref, lift, onLayout: measure }
}

export default function ChatThreadScreen({ navigation, route }: StackScreenProps<"ChatThread">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { profile } = useAuth()
  const meId = useMyId()
  const inbox = useChatInbox()
  const conv = inbox.list.find((c) => c.id === route.params.id) || getInbox().find((c) => c.id === route.params.id) || null
  const shown = React.useMemo(() => conv || stubConversation(route.params.id), [conv, route.params.id])
  const thread = useChatThread(route.params.id, meId)
  const anu = useAnuChat(profile, thread)
  const isAnu = conv?.kind === "assistant"
  const keyboard = useKeyboardLift(useReducedMotion())
  const [text, setText] = React.useState("")
  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null)
  const [menuFor, setMenuFor] = React.useState<ChatMessage | null>(null)
  const [preview, setPreview] = React.useState<Photo | null>(null)
  const [photosOff, setPhotosOff] = React.useState(false)
  const [confirmClear, setConfirmClear] = React.useState(false)

  useDismissChatNotification(route.params.id)

  // Opened from one of Anu's questions on the Chat tab: ask it once, when the
  // thread has loaded, so the answer lands under what is already there.
  const asked = React.useRef(false)
  React.useEffect(() => {
    const q = route.params.ask
    if (!q || asked.current || !isAnu || thread.loading) return
    asked.current = true
    void anu.ask(q)
  }, [route.params.ask, isAnu, thread.loading, anu])

  React.useEffect(() => {
    setActiveConversation(route.params.id)
    return () => setActiveConversation(null)
  }, [route.params.id])

  const members = React.useMemo(() => new Map((conv?.members || []).map((m) => [m.id, m])), [conv?.members])
  const byId = React.useMemo(() => new Map(thread.messages.map((m) => [m.id, m])), [thread.messages])

  // Flat rows, NEWEST FIRST, for an inverted list: the day label follows its
  // messages in the array so that, inverted, it sits above them.
  const rows = React.useMemo(() => {
    const out: Row[] = []
    for (const s of threadSections(thread.messages)) {
      out.push({ type: "day", key: s.key, label: s.label })
      for (const it of s.items) out.push({ type: "msg", key: it.message.id, message: it.message, runStart: it.runStart, runEnd: it.runEnd })
    }
    return out.reverse()
  }, [thread.messages])

  const send = async () => {
    const body = text.trim()
    if (!body) return
    setText("")
    feedback.tap()
    if (isAnu) return void anu.ask(body)
    const reply = replyTo
    setReplyTo(null)
    await thread.send({ body, replyTo: reply?.id || null }).catch(() => undefined)
  }

  const sendPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) return setPhotosOff(true)
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, base64: true })
    if (result.canceled) return
    const asset = result.assets?.[0]
    if (!asset?.base64) return toast.show({ message: "That photo could not be read. Try another", tone: "danger" })
    setPreview({ base64: asset.base64, mimeType: asset.mimeType || "image/jpeg", fileName: asset.fileName || undefined, width: asset.width, height: asset.height, uri: asset.uri })
  }

  // Sent only from the preview, so a wrong pick never reaches the chat.
  const sendPreview = async () => {
    const photo = preview
    if (!photo) return
    setPreview(null)
    const caption = text.trim()
    const reply = replyTo
    setText("")
    setReplyTo(null)
    await thread.send({ body: caption, photo, replyTo: reply?.id || null }).catch(() => undefined)
  }

  const remove = async (m: ChatMessage) => {
    try {
      await chat.remove(m.id)
      thread.setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, body: null, attachment: null, meta: null, deleted_at: new Date().toISOString() } : x)))
    } catch (e) {
      toast.show({ message: (e as Error).message, tone: "danger" })
    }
  }

  /** What a message offers: the long-press menu and the screen reader's actions share it. */
  const actionsFor = (m: ChatMessage): MessageAction[] => {
    if (m.local || m.kind === "system" || m.deleted_at) return []
    const out: MessageAction[] = []
    if (!isAnu) out.push({ name: "reply", label: "Reply", run: () => setReplyTo(m) })
    if (m.body) out.push({ name: "copy", label: "Copy", run: () => void Clipboard.setStringAsync(m.body || "").then(() => toast.show({ message: "Copied" })) })
    if (m.sender_id === meId && m.kind === "text") out.push({ name: "delete", label: "Delete for everyone", danger: true, run: () => void remove(m) })
    return out
  }

  const menu = (m: ChatMessage) => {
    if (!actionsFor(m).length) return
    feedback.select()
    setMenuFor(m)
  }

  const toggleMute = async () => {
    if (!conv) return
    const muted = !conv.muted
    patchConversation(conv.id, { muted })
    try {
      await chat.setMuted(conv.id, muted)
      toast.show({ message: muted ? "Muted" : "Notifications on" })
    } catch (e) {
      patchConversation(conv.id, { muted: !muted })
      toast.show({ message: (e as Error).message, tone: "danger" })
    }
  }

  const clearAnu = () => {
    setConfirmClear(false)
    void chat.clearAssistant().then(() => thread.setMessages([])).catch((e: Error) => toast.show({ message: e.message, tone: "danger" }))
  }

  const peer = conv ? peerOf(conv, meId) : null
  const subtitle = !conv
    ? ""
    : isAnu
      ? "Assistant · answers straight from the database"
      : conv.kind === "team"
        ? `${conv.members.length} members · daily update and attendance`
        : conv.kind === "group"
          ? memberLine(conv, meId)
          : peer?.active === false
            ? "Account deactivated"
            : peer?.role
              ? roleWord(peer.role)
              : ""

  const empty = !thread.loading && !thread.messages.length
  const menuActions = menuFor ? actionsFor(menuFor) : []

  return (
    <View style={[styles.root, { backgroundColor: t.surfaceInset }]}>
      <View style={[styles.header, { paddingTop: insets.top, backgroundColor: t.appBar, borderBottomColor: t.border }]}>
        <IconButton name="back" onPress={() => navigation.goBack()} accessibilityLabel="Back" />
        {conv ? <ConversationAvatar conv={conv} meId={meId} size={40} /> : null}
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={[textVariants.listTitle, { color: t.text }]}>
            {conv ? conversationTitle(conv, meId) : "Chat"}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[textVariants.caption, { color: t.textTertiary }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {conv && !isAnu ? (
          <MuteButton muted={conv.muted} onPress={() => void toggleMute()} />
        ) : null}
        {isAnu && thread.messages.length ? <IconButton name="trash" onPress={() => setConfirmClear(true)} accessibilityLabel="Clear chat" /> : null}
      </View>

      <View ref={keyboard.ref} onLayout={keyboard.onLayout} style={[styles.flex, { paddingBottom: keyboard.lift }]}>
        {thread.loading ? (
          <View style={styles.center}>
            <Spinner label="Loading messages" />
          </View>
        ) : empty && thread.error ? (
          <View style={styles.flex}>
            <EmptyState icon="warning" title="Could not load this chat" hint={thread.error} actionLabel="Try again" onAction={thread.reload} />
          </View>
        ) : empty && isAnu ? (
          <AnuWelcome name={firstName(profile?.name)} onAsk={(q) => void anu.ask(q)} disabled={anu.thinking} />
        ) : empty ? (
          <View style={styles.center}>
            <ConversationAvatar conv={shown} meId={meId} size={72} />
            <Text style={[textVariants.subtitle, { color: t.text, marginTop: spacing.md }]}>{conv ? conversationTitle(conv, meId) : "Chat"}</Text>
            <Text style={[textVariants.small, styles.centerText, { color: t.textTertiary }]}>Say hello. Only the people in this chat can read it.</Text>
          </View>
        ) : (
          <FlatList
            inverted
            data={rows}
            keyExtractor={(r) => r.key}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            onEndReached={() => thread.hasMore && void thread.loadOlder().catch(() => undefined)}
            onEndReachedThreshold={0.3}
            ListHeaderComponent={
              isAnu ? (
                <View>
                  {anu.thinking ? <Thinking /> : null}
                  {anu.pending ? (
                    <View style={[styles.pending, { backgroundColor: t.surface, borderColor: t.warning }]}>
                      <Text style={[textVariants.listTitle, { color: t.text }]}>Send to {TEAM_TITLES[anu.pending.team]}?</Text>
                      <Text style={[textVariants.body, styles.pendingBody, { backgroundColor: t.surfaceInset, color: t.text }]}>{anu.pending.body}</Text>
                      <Text style={[textVariants.caption, { color: t.textTertiary }]}>It goes out under your name.</Text>
                      <View style={styles.pendingActions}>
                        <Button label="Send" size="sm" onPress={() => void anu.confirmSend()} style={styles.flex} />
                        <Button label="Cancel" size="sm" variant="outline" onPress={() => void anu.cancelSend()} style={styles.flex} />
                      </View>
                    </View>
                  ) : null}
                  {anu.error ? (
                    <Pressable onPress={anu.clearError} accessibilityRole="button" accessibilityHint="Dismisses the message" style={[styles.error, { backgroundColor: t.dangerBg }]}>
                      <Text style={[textVariants.small, { color: t.dangerText }]}>{anu.error}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null
            }
            renderItem={({ item }) =>
              item.type === "day" ? (
                <View style={styles.dayWrap}>
                  <Text style={[textVariants.caption, styles.day, { backgroundColor: t.surfaceRaised, color: t.textSecondary }]}>{item.label}</Text>
                </View>
              ) : (
                <Bubble
                  m={item.message}
                  runStart={item.runStart}
                  runEnd={item.runEnd}
                  conv={shown}
                  meId={meId}
                  members={members}
                  replied={item.message.reply_to ? byId.get(item.message.reply_to) || null : null}
                  onLongPress={() => menu(item.message)}
                  actions={actionsFor(item.message)}
                  onRetry={() => void thread.retry(item.message).catch(() => undefined)}
                  onDiscard={() => thread.discard(item.message)}
                  onOpenCard={(kind, id) => CARD_ROUTE[kind] && navigation.navigate(CARD_ROUTE[kind], { id })}
                />
              )
            }
          />
        )}

        {/* The database refuses it too (chat_send, Admin migration 0069). */}
        {conv?.kind === "team" && conv.team === "everyone" && !isAdmin(profile) ? (
          <Text style={[textVariants.small, styles.readOnly, { color: t.textTertiary, backgroundColor: t.surfaceInset, paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.sm }]}>
            Only admins can post here.
          </Text>
        ) : (<>
        {replyTo ? (
          <View style={[styles.replyBar, { backgroundColor: t.surface, borderTopColor: t.border }]}>
            <View style={[styles.replyQuote, { borderLeftColor: t.primary, backgroundColor: t.surfaceInset }]}>
              <Text style={[textVariants.caption, { color: t.primary, fontFamily: fontFamily.semibold }]}>
                Replying to {replyTo.sender_id === meId ? "yourself" : firstName(members.get(replyTo.sender_id || "")?.name)}
              </Text>
              <Text numberOfLines={1} style={[textVariants.small, { color: t.textSecondary }]}>{replyTo.body || "Photo"}</Text>
            </View>
            <IconButton name="close" onPress={() => setReplyTo(null)} accessibilityLabel="Cancel reply" />
          </View>
        ) : null}

        <View style={[styles.composer, { backgroundColor: t.surfaceInset, borderTopColor: "transparent", paddingBottom: keyboard.lift ? spacing.sm : Math.max(insets.bottom, spacing.sm) }]}>
          {!isAnu ? <IconButton name="image" onPress={() => void sendPhoto()} accessibilityLabel="Send a photo" /> : null}
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder={isAnu ? "Ask Anu anything about the business" : "Message"}
            placeholderTextColor={t.textTertiary}
            style={[styles.input, { backgroundColor: t.surfaceRaised, color: t.text }]}
          />
          <Pressable
            onPress={() => void send()}
            disabled={!text.trim() || (isAnu && anu.thinking)}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={[styles.sendBtn, { backgroundColor: text.trim() ? t.primary : t.surfaceTrack }]}
          >
            <Icon name="send" size={20} color={text.trim() ? t.textOnPrimary : t.textFaint} variant="Bold" />
          </Pressable>
        </View>
        </>)}
      </View>

      <Dialog visible={!!menuFor} onClose={() => setMenuFor(null)} title="Message" actions={[{ label: "Cancel", onPress: () => setMenuFor(null) }]}>
        <View style={styles.menuList}>
          {menuActions.map((a) => (
            <Pressable
              key={a.name}
              accessibilityRole="button"
              onPress={() => {
                setMenuFor(null)
                a.run()
              }}
              style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? t.surfacePressed : "transparent" }]}
            >
              <Text style={[textVariants.body, { color: a.danger ? t.dangerText : t.text }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </Dialog>

      <Dialog
        visible={photosOff}
        onClose={() => setPhotosOff(false)}
        title="Photos are off for Ortex"
        message="To send a photo, allow Ortex to use your photos in Settings."
        actions={[
          { label: "Cancel", onPress: () => setPhotosOff(false) },
          {
            label: "Open settings",
            onPress: () => {
              setPhotosOff(false)
              void Linking.openSettings()
            },
          },
        ]}
      />

      <Dialog
        visible={!!preview}
        onClose={() => setPreview(null)}
        title="Send this photo?"
        message={text.trim() ? `Caption: ${text.trim()}` : undefined}
        actions={[
          { label: "Cancel", onPress: () => setPreview(null) },
          { label: "Send", onPress: () => void sendPreview() },
        ]}
      >
        {preview ? (
          <Image
            source={{ uri: preview.uri }}
            accessibilityLabel="The photo you picked"
            style={[styles.preview, { aspectRatio: preview.width && preview.height ? Math.min(2, Math.max(0.75, preview.width / preview.height)) : 1 }]}
            resizeMode="cover"
          />
        ) : null}
      </Dialog>

      <Dialog
        visible={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear your chat with Anu?"
        message="This cannot be undone."
        actions={[
          { label: "Cancel", onPress: () => setConfirmClear(false) },
          { label: "Clear", tone: "danger", onPress: clearAnu },
        ]}
      />
    </View>
  )
}

/** A bell, struck through while muted: the state is in the glyph, not only its colour. */
function MuteButton({ muted, onPress }: { muted: boolean; onPress: () => void }) {
  const t = useTheme()
  const ink = muted ? t.warning : t.text
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={muted ? "Muted. Unmute" : "Mute"}
      android_ripple={{ color: t.accentTint, borderless: true, radius: 22 }}
      style={styles.iconBtn}
    >
      <Icon name="bell" size={22} color={ink} />
      {muted ? <View style={[styles.strike, { backgroundColor: ink, borderColor: t.appBar }]} /> : null}
    </Pressable>
  )
}

const ROLE_WORD: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", accounts: "Accounts", sales: "Sales Executive", staff: "Staff" }
const roleWord = (r: string) => ROLE_WORD[r] || r

function Bubble({
  m, runStart, runEnd, conv, meId, members, replied, onLongPress, actions, onRetry, onDiscard, onOpenCard,
}: {
  m: ChatMessage
  runStart: boolean
  runEnd: boolean
  conv: Conversation
  meId: string | null
  members: Map<string, Conversation["members"][number]>
  replied: ChatMessage | null
  onLongPress: () => void
  actions: MessageAction[]
  onRetry: () => void
  onDiscard: () => void
  onOpenCard: (kind: string, id: string) => void
}) {
  const t = useTheme()
  const [viewing, setViewing] = React.useState(false)
  if (m.kind === "system") {
    return (
      <View style={styles.dayWrap}>
        <Text style={[textVariants.caption, styles.system, { color: t.textTertiary }]}>{m.body}</Text>
      </View>
    )
  }
  const isBot = m.kind === "bot"
  const mine = m.sender_id === meId && m.kind === "text"
  const group = isMultiPerson(conv)
  const sender = isBot ? { name: "Anu", avatar_url: null } : members.get(m.sender_id || "") || { name: (m.meta?.sender_name as string) || "Former colleague", avatar_url: null }
  const deleted = Boolean(m.deleted_at)
  const ink = mine ? t.textOnPrimary : t.text
  const soft = mine ? "rgba(255,255,255,0.8)" : t.textTertiary
  const meta = (m.meta || {}) as { cards?: { key: string; kind: string; id: string; title: string; subtitle: string }[]; stats?: { label: string; value: string }[] }
  const hasPhoto = !deleted && !!m.attachment && isImage(m.attachment)
  // One spoken line: who, when, whether it was read, then the words. A bubble
  // with record cards stays open so each card can be reached on its own.
  const said = deleted ? "Message deleted" : [m.attachment ? "Photo" : "", m.body || ""].filter(Boolean).join(". ")
  const label = [mine ? "You" : isBot ? "Anu" : firstName(sender.name), clock(m.created_at), mine && !deleted ? TICK_WORD[tickState(m, conv, meId)] : "", said]
    .filter(Boolean)
    .join(", ")
  const a11yActions = [
    ...actions.map((a) => ({ name: a.name, label: a.label })),
    ...(hasPhoto ? [{ name: "photo", label: "Open photo" }] : []),
    ...(m.local === "failed" ? [{ name: "retry", label: "Retry" }, { name: "discard", label: "Discard" }] : []),
  ]
  const onAction = (name: string) => {
    if (name === "photo") return setViewing(true)
    if (name === "retry") return onRetry()
    if (name === "discard") return onDiscard()
    actions.find((a) => a.name === name)?.run()
  }
  const failed = m.local === "failed"

  return (
    <View style={[styles.bubbleRow, { justifyContent: mine ? "flex-end" : "flex-start", marginTop: runStart ? spacing.sm : 2 }]}>
      {!mine && group ? <View style={styles.faceSlot}>{runEnd ? <PersonFace name={sender.name || "?"} uri={sender.avatar_url || undefined} size={28} /> : null}</View> : null}
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={300}
        accessible={!meta.cards?.length}
        accessibilityLabel={label}
        accessibilityActions={a11yActions}
        onAccessibilityAction={(e) => onAction(e.nativeEvent.actionName)}
        style={[
          styles.bubble,
          // Anu's daily update and attendance report read as a card, not a chat line.
          isBot
            ? styles.botCard
            : [
                { backgroundColor: mine ? t.primary : t.surfaceRaised },
                runEnd && (mine ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }),
                failed && { borderColor: t.danger, borderWidth: 1.5 },
              ],
          // A photo sits in a thin frame, not the text padding.
          m.attachment && !m.body && !replied && !deleted && styles.photoBubble,
        ]}
      >
        {isBot ? <SquircleBackground fill={t.surfaceRaised} stroke={failed ? t.danger : undefined} strokeWidth={failed ? 1.5 : 0} radius={20} /> : null}
        {!mine && group && runStart ? (
          <Text style={[textVariants.caption, { color: t.primary, fontFamily: fontFamily.semibold }]}>
            {isBot ? "Anu · automatic update" : firstName(sender.name)}
          </Text>
        ) : null}
        {replied && !deleted ? (
          <View style={[styles.quote, { borderLeftColor: mine ? "rgba(255,255,255,0.7)" : t.primary, backgroundColor: mine ? "rgba(255,255,255,0.15)" : t.surfaceInset }]}>
            <Text style={[textVariants.caption, { color: mine ? t.textOnPrimary : t.primary, fontFamily: fontFamily.semibold }]}>
              {replied.sender_id === meId ? "You" : firstName(members.get(replied.sender_id || "")?.name)}
            </Text>
            <Text numberOfLines={2} style={[textVariants.caption, { color: soft }]}>{replied.deleted_at ? "This message was deleted" : replied.body || "Photo"}</Text>
          </View>
        ) : null}
        {deleted ? (
          <Text style={[textVariants.body, { color: soft, fontStyle: "italic" }]}>{mine ? "You deleted this message" : "This message was deleted"}</Text>
        ) : (
          <>
            {m.attachment ? <Photo att={m.attachment} viewing={viewing} onView={setViewing} /> : null}
            {m.body ? <Text selectable style={[textVariants.body, { color: ink }]}>{m.body}</Text> : null}
            {meta.stats?.length ? (
              <View style={styles.stats}>
                {meta.stats.map((s) => (
                  <View key={s.label} style={[styles.stat, { backgroundColor: t.surfaceInset }]}>
                    <Text style={[textVariants.caption, { color: t.textTertiary }]}>{s.label}</Text>
                    <Text style={[textVariants.small, { color: t.text, fontFamily: fontFamily.semibold }]}>{s.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {meta.cards?.filter((c) => CARD_ROUTE[c.kind]).map((c) => (
              <Pressable
                key={c.key}
                onPress={() => onOpenCard(c.kind, c.id)}
                accessibilityRole="button"
                accessibilityLabel={[c.title, c.subtitle].filter(Boolean).join(", ")}
                style={({ pressed }) => [styles.card, { borderColor: t.border, backgroundColor: pressed ? t.surfacePressed : t.surface }]}>
                <View style={[styles.cardIcon, { backgroundColor: t.iconWell }]}>
                  <Icon name={CARD_ICON[c.kind] || "search"} size={16} color={t.primary} variant="Bulk" />
                </View>
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={[textVariants.small, { color: t.text, fontFamily: fontFamily.semibold }]}>{c.title}</Text>
                  {c.subtitle ? <Text numberOfLines={1} style={[textVariants.caption, { color: t.textTertiary }]}>{c.subtitle}</Text> : null}
                </View>
                <Icon name="forward" size={16} color={t.textFaint} />
              </Pressable>
            ))}
          </>
        )}
        <View style={[styles.metaRow, m.attachment && !m.body && !replied && !deleted && styles.photoMeta]}>
          {m.edited_at && !deleted ? <Text style={[styles.metaText, { color: soft }]}>Edited</Text> : null}
          <Text style={[styles.metaText, { color: soft }]}>{clock(m.created_at)}</Text>
          {mine && !deleted ? <Ticks state={tickState(m, conv, meId)} color={soft} readColor={t.textOnPrimary} /> : null}
        </View>
        {failed ? (
          <View style={styles.failed}>
            <Text style={[textVariants.caption, styles.flex, { color: ink }]}>{m.error || "Not sent."}</Text>
            <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry sending" style={styles.failedBtn}>
              <Text style={[textVariants.caption, { color: ink, fontFamily: fontFamily.bold }]}>Retry</Text>
            </Pressable>
            <Pressable onPress={onDiscard} accessibilityRole="button" accessibilityLabel="Discard message" style={styles.failedBtn}>
              <Text style={[textVariants.caption, { color: ink }]}>Discard</Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    </View>
  )
}

function Photo({ att, viewing, onView }: { att: ChatAttachment; viewing: boolean; onView: (open: boolean) => void }) {
  const t = useTheme()
  const [uri, setUri] = React.useState(att.localUri || (att.path ? cachedFileUrl(att.path) : ""))
  React.useEffect(() => {
    let alive = true
    if (att.path && isImage(att)) fileUrl(att.path).then((u) => alive && setUri(u)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [att])
  if (!isImage(att)) {
    return (
      <Text
        onPress={() => att.path && void fileUrl(att.path).then((u) => Linking.openURL(u))}
        accessibilityRole="link"
        style={[textVariants.small, { color: t.primary }]}
      >
        {att.name || "File"}
      </Text>
    )
  }
  const ratio = att.width && att.height ? Math.min(2, Math.max(0.75, att.width / att.height)) : 4 / 3
  return (
    <>
      <Pressable
        onPress={() => uri && onView(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Photo${att.name ? `, ${att.name}` : ""}. Opens full screen`}
        style={[styles.photo, { aspectRatio: ratio, backgroundColor: t.skeleton }]}
      >
        {uri ? <Image source={{ uri }} style={[StyleSheet.absoluteFill, { opacity: att.uploading ? 0.6 : 1 }]} resizeMode="cover" /> : null}
      </Pressable>
      <ImageViewer visible={viewing} images={uri ? [uri] : []} onClose={() => onView(false)} />
    </>
  )
}

function AnuWelcome({ name, onAsk, disabled }: { name: string; onAsk: (q: string) => void; disabled: boolean }) {
  const t = useTheme()
  return (
    <View style={styles.welcome}>
      <Image source={require("../../../assets/anu.jpg")} style={styles.welcomeFace} />
      <Text style={[textVariants.subtitle, { color: t.text, marginTop: spacing.md }]}>Namaste {name}, I'm Anu</Text>
      <Text style={[textVariants.small, styles.centerText, { color: t.textSecondary }]}>
        I read the Ortex database and answer straight from it: your to-dos, who is in, your team's update, leads, quotations, customers, products and sales. I can pass a message to another team too.
      </Text>
      <View style={styles.chips}>
        {ANU_SUGGESTIONS.map((q) => (
          <Pressable key={q} disabled={disabled} onPress={() => onAsk(q)} accessibilityRole="button" style={({ pressed }) => [styles.chip, { borderColor: t.border, backgroundColor: pressed ? t.surfacePressed : t.surface }]}>
            <Icon name="assistant" size={14} color={t.primary} variant="Bulk" />
            <Text style={[textVariants.small, { color: t.text }]}>{q}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function Thinking() {
  const t = useTheme()
  return (
    <View style={[styles.bubbleRow, { marginTop: spacing.sm }]}>
      <View style={[styles.bubble, { backgroundColor: t.surfaceRaised }]}>
        <Text style={[textVariants.small, { color: t.textTertiary }]}>Anu is looking it up…</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  headerText: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  centerText: { textAlign: "center", marginTop: spacing.xs },
  listContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  dayWrap: { alignItems: "center", paddingVertical: spacing.sm },
  day: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, overflow: "hidden" },
  system: { textAlign: "center", paddingHorizontal: spacing.lg },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  faceSlot: { width: 28 },
  botCard: { flex: 1, maxWidth: "100%", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, gap: 6 },
  bubble: { maxWidth: "80%", borderRadius: 18, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 4 },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  metaText: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 14 },
  failed: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  failedBtn: { minHeight: 48, minWidth: 48, paddingHorizontal: spacing.sm, alignItems: "center", justifyContent: "center" },
  menuList: { marginTop: spacing.sm, marginHorizontal: -spacing.sm },
  menuItem: { minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  preview: { width: "100%", marginTop: spacing.md, borderRadius: radius.card },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  strike: { position: "absolute", width: 26, height: 3, borderRadius: 2, borderWidth: 0.75, transform: [{ rotate: "-45deg" }] },
  photoBubble: { paddingHorizontal: 4, paddingTop: 4 },
  photoMeta: { paddingHorizontal: 8 },
  photo: { width: 240, maxWidth: "100%", borderRadius: 12, overflow: "hidden" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stat: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, minWidth: "46%" },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: spacing.sm },
  cardIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  pending: { borderWidth: 1, borderRadius: 16, padding: spacing.md, gap: spacing.sm, marginTop: spacing.sm },
  pendingBody: { borderRadius: 8, padding: spacing.sm },
  pendingActions: { flexDirection: "row", gap: spacing.sm },
  error: { borderRadius: 12, padding: spacing.md, marginTop: spacing.sm },
  replyBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: gutter, paddingRight: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  replyQuote: { flex: 1, borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  readOnly: { textAlign: "center", paddingHorizontal: gutter, paddingTop: spacing.md },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 140, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontFamily: fontFamily.regular, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  welcome: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: gutter },
  welcomeFace: { width: 80, height: 80, borderRadius: 40 },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm, marginTop: spacing.lg },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
})
