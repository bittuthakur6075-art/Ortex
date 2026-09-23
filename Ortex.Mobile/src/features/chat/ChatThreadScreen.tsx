import * as Clipboard from "expo-clipboard"
import * as ImagePicker from "expo-image-picker"
import React from "react"
import {
  ActivityIndicator,
  Alert,
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
import { useAnuChat } from "@/features/chat/useAnuChat"
import { getInbox, patchConversation, setActiveConversation, useChatInbox, useChatThread, useMyId, type Photo } from "@/features/chat/useChat"
import { keyboardTopInWindow } from "@/hooks/useKeyboardAwareScroll"
import { chat, fileUrl } from "@/lib/chat"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { fontFamily, textVariants } from "@/theme/typography"
import { Button, Icon, IconButton, useToast, type IconName } from "@/ui"
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
  const thread = useChatThread(route.params.id, meId)
  const anu = useAnuChat(profile, thread)
  const isAnu = conv?.kind === "assistant"
  const keyboard = useKeyboardLift(useReducedMotion())
  const [text, setText] = React.useState("")
  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null)

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
    if (!permission.granted) {
      toast.show({ message: "Ortex needs access to your photos. Allow it in Settings", tone: "danger" })
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, base64: true })
    if (result.canceled) return
    const asset = result.assets?.[0]
    if (!asset?.base64) return toast.show({ message: "That photo could not be read. Try another", tone: "danger" })
    const photo: Photo = { base64: asset.base64, mimeType: asset.mimeType || "image/jpeg", fileName: asset.fileName || undefined, width: asset.width, height: asset.height, uri: asset.uri }
    const caption = text.trim()
    setText("")
    await thread.send({ body: caption, photo, replyTo: replyTo?.id || null }).catch(() => undefined)
    setReplyTo(null)
  }

  const menu = (m: ChatMessage) => {
    if (m.local || m.kind === "system") return
    feedback.select()
    const mine = m.sender_id === meId && m.kind === "text"
    const buttons: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = []
    if (!isAnu && !m.deleted_at) buttons.push({ text: "Reply", onPress: () => setReplyTo(m) })
    if (m.body && !m.deleted_at) buttons.push({ text: "Copy", onPress: () => void Clipboard.setStringAsync(m.body || "").then(() => toast.show({ message: "Copied" })) })
    if (mine && !m.deleted_at) {
      buttons.push({
        text: "Delete for everyone",
        style: "destructive",
        onPress: async () => {
          try {
            await chat.remove(m.id)
            thread.setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, body: null, attachment: null, meta: null, deleted_at: new Date().toISOString() } : x)))
          } catch (e) {
            toast.show({ message: (e as Error).message, tone: "danger" })
          }
        },
      })
    }
    buttons.push({ text: "Cancel", style: "cancel" })
    Alert.alert("Message", undefined, buttons)
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

  const clearAnu = () =>
    Alert.alert("Clear your chat with Anu?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => void chat.clearAssistant().then(() => thread.setMessages([])).catch((e: Error) => toast.show({ message: e.message, tone: "danger" })),
      },
    ])

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
          <IconButton name="bell" onPress={() => void toggleMute()} color={conv.muted ? t.warning : undefined} accessibilityLabel={conv.muted ? "Unmute" : "Mute"} />
        ) : null}
        {isAnu && thread.messages.length ? <IconButton name="trash" onPress={clearAnu} accessibilityLabel="Clear chat" /> : null}
      </View>

      <View ref={keyboard.ref} onLayout={keyboard.onLayout} style={[styles.flex, { marginBottom: keyboard.lift }]}>
        {thread.loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={t.primary} />
          </View>
        ) : empty && isAnu ? (
          <AnuWelcome name={firstName(profile?.name)} onAsk={(q) => void anu.ask(q)} disabled={anu.thinking} />
        ) : empty && conv ? (
          <View style={styles.center}>
            <ConversationAvatar conv={conv} meId={meId} size={72} />
            <Text style={[textVariants.subtitle, { color: t.text, marginTop: spacing.md }]}>{conversationTitle(conv, meId)}</Text>
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
                    <Pressable onPress={anu.clearError} style={[styles.error, { backgroundColor: t.dangerBg }]}>
                      <Text style={[textVariants.small, { color: t.dangerText }]}>{anu.error}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null
            }
            renderItem={({ item }) =>
              item.type === "day" ? (
                <View style={styles.dayWrap}>
                  <Text style={[textVariants.caption, styles.day, { backgroundColor: t.surface, color: t.textSecondary }]}>{item.label}</Text>
                </View>
              ) : conv ? (
                <Bubble
                  m={item.message}
                  runStart={item.runStart}
                  runEnd={item.runEnd}
                  conv={conv}
                  meId={meId}
                  members={members}
                  replied={item.message.reply_to ? byId.get(item.message.reply_to) || null : null}
                  onLongPress={() => menu(item.message)}
                  onRetry={() => void thread.retry(item.message).catch(() => undefined)}
                  onDiscard={() => thread.discard(item.message)}
                  onOpenCard={(kind, id) => CARD_ROUTE[kind] && navigation.navigate(CARD_ROUTE[kind], { id })}
                />
              ) : null
            }
          />
        )}

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

        <View style={[styles.composer, { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: keyboard.lift ? spacing.sm : Math.max(insets.bottom, spacing.sm) }]}>
          {!isAnu ? <IconButton name="image" onPress={() => void sendPhoto()} accessibilityLabel="Send a photo" /> : null}
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder={isAnu ? "Ask Anu anything about the business" : "Message"}
            placeholderTextColor={t.textHint}
            style={[styles.input, { backgroundColor: t.fieldBg, color: t.text }]}
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
      </View>
    </View>
  )
}

const ROLE_WORD: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", accounts: "Accounts", sales: "Sales Executive", staff: "Staff" }
const roleWord = (r: string) => ROLE_WORD[r] || r

function Bubble({
  m, runStart, runEnd, conv, meId, members, replied, onLongPress, onRetry, onDiscard, onOpenCard,
}: {
  m: ChatMessage
  runStart: boolean
  runEnd: boolean
  conv: Conversation
  meId: string | null
  members: Map<string, Conversation["members"][number]>
  replied: ChatMessage | null
  onLongPress: () => void
  onRetry: () => void
  onDiscard: () => void
  onOpenCard: (kind: string, id: string) => void
}) {
  const t = useTheme()
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

  return (
    <View style={[styles.bubbleRow, { justifyContent: mine ? "flex-end" : "flex-start", marginTop: runStart ? spacing.sm : 2 }]}>
      {!mine && group ? <View style={styles.faceSlot}>{runEnd ? <PersonFace name={sender.name || "?"} uri={sender.avatar_url || undefined} size={28} /> : null}</View> : null}
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={300}
        style={[
          styles.bubble,
          mine ? { backgroundColor: t.primary } : { backgroundColor: t.surface, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth },
          runEnd && (mine ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }),
          m.local === "failed" && { borderColor: t.danger, borderWidth: 1.5 },
        ]}
      >
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
            {m.attachment ? <Photo att={m.attachment} /> : null}
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
              <Pressable key={c.key} onPress={() => onOpenCard(c.kind, c.id)} style={({ pressed }) => [styles.card, { borderColor: t.border, backgroundColor: pressed ? t.surfacePressed : t.surface }]}>
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
        <View style={styles.metaRow}>
          {m.edited_at && !deleted ? <Text style={[styles.metaText, { color: soft }]}>Edited</Text> : null}
          <Text style={[styles.metaText, { color: soft }]}>{clock(m.created_at)}</Text>
          {mine && !deleted ? <Ticks state={tickState(m, conv, meId)} color={soft} readColor={t.textOnPrimary} /> : null}
        </View>
        {m.local === "failed" ? (
          <View style={styles.failed}>
            <Text style={[textVariants.caption, styles.flex, { color: ink }]}>{m.error || "Not sent."}</Text>
            <Text onPress={onRetry} style={[textVariants.caption, { color: ink, fontFamily: fontFamily.bold }]}>Retry</Text>
            <Text onPress={onDiscard} style={[textVariants.caption, { color: ink }]}>Discard</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  )
}

function Photo({ att }: { att: ChatAttachment }) {
  const t = useTheme()
  const [uri, setUri] = React.useState(att.localUri || "")
  React.useEffect(() => {
    let alive = true
    if (att.path && isImage(att)) fileUrl(att.path).then((u) => alive && setUri(u)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [att])
  if (!isImage(att)) {
    return (
      <Text onPress={() => att.path && void fileUrl(att.path).then((u) => Linking.openURL(u))} style={[textVariants.small, { color: t.primary }]}>
        {att.name || "File"}
      </Text>
    )
  }
  const ratio = att.width && att.height ? Math.min(2, Math.max(0.6, att.width / att.height)) : 4 / 3
  return (
    <Pressable onPress={() => uri && void Linking.openURL(uri)} style={[styles.photo, { aspectRatio: ratio, backgroundColor: t.skeleton }]}>
      {uri ? <Image source={{ uri }} style={[StyleSheet.absoluteFill, { opacity: att.uploading ? 0.6 : 1 }]} resizeMode="cover" /> : null}
    </Pressable>
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
          <Pressable key={q} disabled={disabled} onPress={() => onAsk(q)} style={({ pressed }) => [styles.chip, { borderColor: t.border, backgroundColor: pressed ? t.surfacePressed : t.surface }]}>
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
      <View style={[styles.bubble, { backgroundColor: t.surface, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth }]}>
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
  bubble: { maxWidth: "80%", borderRadius: 18, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 4 },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  metaText: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 14 },
  failed: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: 4 },
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
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 140, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontFamily: fontFamily.regular, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  welcome: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: gutter },
  welcomeFace: { width: 80, height: 80, borderRadius: 40 },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm, marginTop: spacing.lg },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
})
