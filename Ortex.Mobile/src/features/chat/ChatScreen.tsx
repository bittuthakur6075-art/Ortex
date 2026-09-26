import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import {
  conversationTitle,
  inboxTime,
  previewText,
  searchConversations,
  tickState,
  type Conversation,
} from "@/domain/chat"
import AnuButton from "@/features/anu/AnuButton"
import { ConversationAvatar, Ticks } from "@/features/chat/chatUi"
import NewChatSheet from "@/features/chat/NewChatSheet"
import { reloadInbox, useChatInbox, useMyId } from "@/features/chat/useChat"
import NotificationBell from "@/features/notifications/NotificationBell"
import { chat } from "@/lib/chat"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { Card, SubHeader } from "@/ui/OneUi"
import { SquircleBackground } from "@/ui/Squircle"
import { spacing } from "@/theme/tokens"
import { fontFamily, textVariants } from "@/theme/typography"
import {
  AppScreen,
  EmptyState,
  Fab,
  ListRefreshControl,
  ProfileAvatarButton,
  SearchField,
  SkeletonList,
} from "@/ui"

/**
 * Team chat, the phone's Chat tab — the console's pages/Chat.jsx list pane.
 *
 * Anu is pinned in her own panel above the list (Beside's pattern), with three
 * questions that open her thread already asking, so she reads as a tool rather
 * than one more contact. Then two sections: the team channels, where Anu posts
 * the daily update and attendance, and direct chats and groups. A row opens the
 * thread as a pushed page. Same rows, same RLS as the console: a message sent
 * here appears there at once.
 */

type Filter = "all" | "unread" | "teams" | "direct"

const ANU_ASKS = ["Aaj kya pending hai?", "Kaun absent hai?", "Is mahine ki sales"]

type ChatSection = { key: string; title: string; data: Conversation[] }

export default function ChatScreen({ navigation }: TabScreenProps<"Chat">) {
  const t = useTheme()
  const meId = useMyId()
  const inbox = useChatInbox()
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<Filter>("all")
  const [creating, setCreating] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)

  // Anu's thread always exists, so she is always pinned at the top.
  React.useEffect(() => {
    if (inbox.loading || inbox.missing) return
    if (!inbox.list.some((c) => c.kind === "assistant"))
      chat
        .openAssistant()
        .then(() => reloadInbox())
        .catch(() => undefined)
  }, [inbox.loading, inbox.missing, inbox.list])

  const anu = inbox.list.find((c) => c.kind === "assistant") || null
  const people = React.useMemo(() => inbox.list.filter((c) => c.kind !== "assistant"), [inbox.list])
  const unreadChats = people.filter((c) => c.unread > 0).length
  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: unreadChats ? `Unread ${unreadChats}` : "Unread" },
    { key: "teams", label: "Teams" },
    { key: "direct", label: "Direct" },
  ]

  const sections = React.useMemo(() => {
    let rows = searchConversations(people, query, meId)
    if (filter === "unread") rows = rows.filter((c) => c.unread > 0)
    const teams = filter === "direct" ? [] : rows.filter((c) => c.kind === "team")
    const others = filter === "teams" ? [] : rows.filter((c) => c.kind !== "team")
    const out: ChatSection[] = []
    if (teams.length) out.push({ key: "teams", title: "Teams", data: teams })
    if (others.length) out.push({ key: "direct", title: "Direct and groups", data: others })
    return out
  }, [people, query, filter, meId])

  const open = (id: string, ask?: string) => {
    feedback.tap()
    navigation.navigate("ChatThread", ask ? { id, ask } : { id })
  }

  const refresh = async () => {
    setRefreshing(true)
    await reloadInbox()
    setRefreshing(false)
  }

  return (
    <AppScreen
      title="Chat"
      subtitle={inbox.unread ? `${inbox.unread} unread` : "Your team, and Anu"}
      inTabs
      inset
      headerLeft={<ProfileAvatarButton />}
      headerRight={
        <View style={styles.headerActions}>
          <AnuButton />
          <NotificationBell />
        </View>
      }
      overlay={<Fab icon="add" onPress={() => setCreating(true)} accessibilityLabel="New chat or group" />}
      sections={{
        sections: inbox.loading && !inbox.list.length ? [] : sections,
        refreshControl: <ListRefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />,
        keyExtractor: (x: unknown) => (x as Conversation).id,
        // Each section's rows sit in ONE card (Figma "Chat · Inbox"): the label
        // above, the rows inside, a rule between them indented to the text.
        ItemSeparatorComponent: RowRule,
        stickySectionHeadersEnabled: false,
        renderSectionHeader: ({ section }: { section: unknown }) => (
          <SubHeader title={(section as ChatSection).title} />
        ),
        renderSectionFooter: () => <View style={styles.sectionGap} />,
        ListEmptyComponent: inbox.loading ? (
          <SkeletonList count={6} leading="avatar" />
        ) : inbox.missing ? (
          <EmptyState
            icon="warning"
            title="Chat is not set up yet"
            hint="The office needs to switch Team chat on for this account's server."
          />
        ) : inbox.error && !inbox.list.length ? (
          <EmptyState
            icon="warning"
            title="Could not load chats"
            hint={inbox.error}
            actionLabel="Try again"
            onAction={() => void reloadInbox()}
          />
        ) : (
          <EmptyState
            icon="enquiry"
            title={query || filter !== "all" ? "No chats match" : "No chats yet"}
            hint={
              query || filter !== "all"
                ? "Try another search or filter."
                : "Tap + to message a colleague or make a group."
            }
          />
        ),
        renderItem: ({ item, index, section }: { item: unknown; index: number; section: unknown }) => {
          const last = index === (section as ChatSection).data.length - 1
          return (
            <View style={[styles.cardRow, index === 0 && styles.cardFirst, last && styles.cardLast]}>
              {/* The card's smoothed corners on its first and last rows only. */}
              <SquircleBackground
                fill={t.surfaceRaised}
                radius={24}
                corners={{ topLeft: index === 0, topRight: index === 0, bottomLeft: last, bottomRight: last }}
              />
              <ChatRow
                conv={item as Conversation}
                meId={meId}
                onPress={() => open((item as Conversation).id)}
              />
            </View>
          )
        },
      }}
    >
      <View style={styles.tools}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search chats and people" />
      </View>
      <View style={styles.chips}>
        {filters.map((f) => {
          const on = f.key === filter
          return (
            <Pressable
              key={f.key}
              onPress={() => {
                feedback.select()
                setFilter(f.key)
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.chip, { backgroundColor: on ? t.text : t.surfaceRaised }]}
            >
              <Text style={[styles.chipText, { color: on ? t.surfaceRaised : t.textSecondary }]}>
                {f.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {anu && !query ? <AnuPanel conv={anu} meId={meId} onOpen={(ask) => open(anu.id, ask)} /> : null}
      <NewChatSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onOpened={(id) => {
          setCreating(false)
          void reloadInbox().then(() => open(id))
        }}
      />
    </AppScreen>
  )
}

/** Anu, pinned: her face, what she is for, and three questions that open her thread already asking. */
function AnuPanel({
  conv,
  meId,
  onOpen,
}: {
  conv: Conversation
  meId: string | null
  onOpen: (ask?: string) => void
}) {
  const t = useTheme()
  return (
    <Card style={styles.anuCard}>
      <Pressable
        onPress={() => onOpen()}
        accessibilityRole="button"
        accessibilityLabel={`Anu, your assistant${conv.unread ? `, ${conv.unread} unread` : ""}`}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
      >
        <ConversationAvatar conv={conv} meId={meId} size={52} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={[textVariants.listTitle, { color: t.text }]}>Anu</Text>
            <View style={[styles.tag, { backgroundColor: t.primary10 }]}>
              <Text style={[textVariants.captionStrong, { color: t.primary }]}>Assistant</Text>
            </View>
            <View style={styles.flex} />
            {conv.unread ? (
              <View style={[styles.badge, { backgroundColor: t.primary }]}>
                <Text style={[styles.badgeText, { color: t.textOnPrimary }]}>{conv.unread}</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={[textVariants.small, { color: t.textSecondary }]}>
            {previewText(conv, meId)}
          </Text>
        </View>
      </Pressable>
      <View style={styles.asks}>
        {ANU_ASKS.map((q) => (
          <Pressable
            key={q}
            onPress={() => onOpen(q)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.ask,
              { backgroundColor: pressed ? t.surfacePressed : t.surfaceInset },
            ]}
          >
            <Text style={[textVariants.smallStrong, { color: t.textSecondary }]}>{q}</Text>
          </Pressable>
        ))}
      </View>
    </Card>
  )
}

/** The rule between two rows of a card, indented to the text (16 + 48 + 14). */
function RowRule() {
  const t = useTheme()
  return (
    <View style={[styles.cardRow, { backgroundColor: t.surfaceRaised }]}>
      <View style={[styles.rule, { backgroundColor: t.border }]} />
    </View>
  )
}

function ChatRow({ conv, meId, onPress }: { conv: Conversation; meId: string | null; onPress: () => void }) {
  const t = useTheme()
  const last = conv.last_message
  const mineLast = Boolean(last && last.sender_id === meId && last.kind === "text" && !last.deleted)
  const unread = conv.unread > 0
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${conversationTitle(conv, meId)}${unread ? `, ${conv.unread} unread` : ""}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <ConversationAvatar conv={conv} meId={meId} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text
            numberOfLines={1}
            style={[
              styles.name,
              { color: t.text, fontFamily: unread ? fontFamily.semibold : fontFamily.medium },
            ]}
          >
            {conversationTitle(conv, meId)}
          </Text>
          <Text
            style={[
              textVariants.caption,
              {
                color: unread && !conv.muted ? t.primary : t.textTertiary,
                fontFamily: unread ? fontFamily.semibold : fontFamily.regular,
              },
            ]}
          >
            {inboxTime(last?.created_at || (conv.kind === "assistant" ? null : conv.activity_at))}
          </Text>
        </View>
        <View style={styles.rowBottom}>
          {mineLast && last ? (
            <Ticks state={tickState(last, conv, meId)} color={t.textTertiary} readColor={t.primary} />
          ) : null}
          <Text
            numberOfLines={1}
            style={[
              styles.preview,
              {
                color: unread ? t.textSecondary : t.textTertiary,
                fontFamily: unread ? fontFamily.medium : fontFamily.regular,
              },
            ]}
          >
            {previewText(conv, meId)}
          </Text>
          {conv.muted ? <Text style={[textVariants.caption, { color: t.textTertiary }]}>Muted</Text> : null}
          {unread ? (
            <View style={[styles.badge, { backgroundColor: conv.muted ? t.mutedBg : t.primary }]}>
              <Text style={[styles.badgeText, { color: conv.muted ? t.textSecondary : t.textOnPrimary }]}>
                {conv.unread > 99 ? "99+" : conv.unread}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  tools: { paddingHorizontal: 16, paddingBottom: 10 },
  chips: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontFamily: fontFamily.semibold, fontSize: 13.5, lineHeight: 17 },
  anuCard: { paddingTop: 14, paddingBottom: 14, gap: 12 },
  cardRow: { marginHorizontal: 12 },
  cardFirst: { paddingTop: 6 },
  cardLast: { paddingBottom: 6 },
  rule: { height: 1, marginLeft: 78, marginRight: 16 },
  sectionGap: { height: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: 6 },
  flex: { flex: 1, minWidth: 0 },
  name: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 21 },
  preview: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 14 },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  asks: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  ask: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
})
