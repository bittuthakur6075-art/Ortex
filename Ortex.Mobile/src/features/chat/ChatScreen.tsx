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
import { gutter, spacing } from "@/theme/tokens"
import { fontFamily, textVariants } from "@/theme/typography"
import {
  AppScreen,
  EmptyState,
  Fab,
  ListRefreshControl,
  ProfileAvatarButton,
  RowSeparator,
  SearchField,
  SegmentedControl,
  SkeletonList,
} from "@/ui"

/**
 * Team chat, the phone's Chat tab — the console's pages/Chat.jsx list pane.
 *
 * Anu is pinned first (ask her anything, answers straight from the database),
 * then every chat by newest activity: direct chats, groups, and the team
 * channels where Anu posts the daily update and attendance. A row opens the
 * thread as a pushed page. Same rows, same RLS as the console: a message sent
 * here appears there at once.
 */

type Filter = "all" | "unread" | "teams"

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "teams", label: "Teams" },
]

export default function ChatScreen({ navigation }: TabScreenProps<"Chat">) {
  const meId = useMyId()
  const inbox = useChatInbox()
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<Filter>("all")
  const [creating, setCreating] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)

  // Anu's thread always exists, so she is always pinned at the top.
  React.useEffect(() => {
    if (inbox.loading || inbox.missing) return
    if (!inbox.list.some((c) => c.kind === "assistant")) chat.openAssistant().then(() => reloadInbox()).catch(() => undefined)
  }, [inbox.loading, inbox.missing, inbox.list])

  const shown = React.useMemo(() => {
    let rows = searchConversations(inbox.list, query, meId)
    if (filter === "unread") rows = rows.filter((c) => c.unread > 0)
    if (filter === "teams") rows = rows.filter((c) => c.kind === "team" || c.kind === "group")
    return rows
  }, [inbox.list, query, filter, meId])

  const open = (id: string) => {
    feedback.tap()
    navigation.navigate("ChatThread", { id })
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
      headerLeft={<ProfileAvatarButton />}
      headerRight={
        <View style={styles.headerActions}>
          <AnuButton />
          <NotificationBell />
        </View>
      }
      overlay={<Fab icon="add" onPress={() => setCreating(true)} accessibilityLabel="New chat or group" />}
      list={{
        data: inbox.loading && !inbox.list.length ? [] : shown,
        refreshControl: <ListRefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />,
        keyExtractor: (x: unknown) => (x as Conversation).id,
        ItemSeparatorComponent: RowSeparator,
        ListEmptyComponent: inbox.loading ? (
          <SkeletonList count={6} leading="avatar" />
        ) : inbox.missing ? (
          <EmptyState icon="warning" title="Chat is not set up yet" hint="The office needs to switch Team chat on for this account's server." />
        ) : inbox.error && !inbox.list.length ? (
          <EmptyState icon="warning" title="Could not load chats" hint={inbox.error} actionLabel="Try again" onAction={() => void reloadInbox()} />
        ) : (
          <EmptyState
            icon="enquiry"
            title={query || filter !== "all" ? "No chats match" : "No chats yet"}
            hint={query || filter !== "all" ? "Try another search or filter." : "Tap + to message a colleague or make a group."}
          />
        ),
        renderItem: ({ item }: { item: unknown }) => <ChatRow conv={item as Conversation} meId={meId} onPress={() => open((item as Conversation).id)} />,
      }}
    >
      <View style={styles.tools}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search chats" />
        <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      <NewChatSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onOpened={(id) => {
          setCreating(false)
          void reloadInbox().then(() => open(id))
        }}
      />
      {shown.length ? <RowSeparator /> : null}
    </AppScreen>
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
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.surfacePressed : t.surface }]}
    >
      <ConversationAvatar conv={conv} meId={meId} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={[textVariants.listTitle, styles.flex, { color: t.text }]}>
            {conversationTitle(conv, meId)}
          </Text>
          <Text style={[textVariants.caption, { color: unread && !conv.muted ? t.primary : t.textTertiary, fontFamily: unread ? fontFamily.semibold : fontFamily.regular }]}>
            {inboxTime(last?.created_at || (conv.kind === "assistant" ? null : conv.activity_at))}
          </Text>
        </View>
        <View style={styles.rowBottom}>
          {mineLast && last ? <Ticks state={tickState(last, conv, meId)} color={t.textTertiary} readColor={t.primary} /> : null}
          <Text numberOfLines={1} style={[textVariants.small, styles.flex, { color: t.textSecondary }]}>
            {previewText(conv, meId)}
          </Text>
          {conv.muted ? <Text style={[textVariants.caption, { color: t.textTertiary }]}>Muted</Text> : null}
          {unread ? (
            <View style={[styles.badge, { backgroundColor: conv.muted ? t.mutedBg : t.primary }]}>
              <Text style={[styles.badgeText, { color: conv.muted ? t.textSecondary : t.textOnPrimary }]}>{conv.unread > 99 ? "99+" : conv.unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  tools: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: gutter, paddingVertical: spacing.md - 2 },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: 6 },
  flex: { flex: 1, minWidth: 0 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: fontFamily.semibold, fontSize: 11, lineHeight: 13 },
})
