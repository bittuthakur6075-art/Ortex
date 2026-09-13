import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { relativeTime, formatCurrency } from "@/domain/format"
import type { AppNotification } from "@/domain/notifications"
import { useNotifications } from "@/features/notifications/useNotifications"
import { feedback } from "@/lib/feedback"
import { markAllRead, markRead, useNotificationStore } from "@/lib/notificationStore"
import { dismissAll } from "@/lib/push"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  Chip,
  DataNotice,
  EmptyState,
  Icon,
  IconButton,
  ListRefreshControl,
  RowSeparator,
  SegmentedControl,
  SkeletonList,
} from "@/ui"

/**
 * Everything that happened while the rep was doing something else.
 *
 * PORT of Ortex.Admin/src/components/layout/NotificationsDrawer.jsx, as a PAGE
 * rather than a drawer: a phone has no room for an overlay that itself needs
 * tabs. Two views, All and Unread — the console's third, Archived, is NOT
 * ported: a derived feed already retires an item the moment the record moves on
 * (the enquiry is answered, the quotation is extended), so archiving would be a
 * second, manual way to hide something that hides itself, and a shelf nobody
 * ever visits. Read flags are local to the handset for the same reason they are
 * local to a browser there (lib/notificationStore.ts says why).
 *
 * A row states WHO and WHAT — the customer, what they asked for, how big it is,
 * how long it has been waiting — and opens the lead's own page. It carries NO
 * Call or WhatsApp button: those exist on the notification in the SHADE, where
 * the whole point is to act without opening the app. Once the app is open the
 * record itself is one tap away, with the contact circles, the advisories and
 * the full request on it, and a second set of buttons here would be a poorer
 * copy of that page.
 */

type FeedView = "all" | "unread"

const VIEWS: { key: FeedView; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
]

export default function NotificationsScreen({ navigation }: StackScreenProps<"Notifications">) {
  const t = useTheme()
  const { active, unread, loading, refreshing, error, reload, isRead } = useNotifications()
  const { prefs } = useNotificationStore()
  const [view, setView] = React.useState<FeedView>("all")

  const data = view === "unread" ? unread : active

  const open = (item: AppNotification) => {
    feedback.tap()
    markRead(item.id)
    navigation.navigate(item.target.screen, { id: item.target.id } as never)
  }

  return (
    <AppScreen
      title="Notifications"
      subtitle={
        loading
          ? "Loading…"
          : prefs.enabled
            ? `${unread.length} unread of ${active.length}`
            : "Muted. Nothing will be announced"
      }
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      headerRight={
        <View style={styles.headerActions}>
          <IconButton
            name="tick"
            accessibilityLabel="Mark all as read"
            disabled={!unread.length}
            onPress={() => {
              feedback.select()
              markAllRead(active.map((n) => n.id))
              // Clearing the list clears the shade with it: leaving twelve
              // notifications behind a zeroed bell is the state every inbox
              // gets wrong.
              void dismissAll()
            }}
          />
          <IconButton
            name="settings"
            accessibilityLabel="Notification settings"
            onPress={() => navigation.navigate("NotificationSettings")}
          />
        </View>
      }
      list={{
        data: loading ? [] : data,
        refreshControl: <ListRefreshControl refreshing={refreshing} onRefresh={() => void reload()} />,
        keyExtractor: (x: unknown) => (x as AppNotification).id,
        ItemSeparatorComponent: RowSeparator,
        ListFooterComponent: data.length ? <RowSeparator /> : null,
        ListEmptyComponent: loading ? (
          <SkeletonList count={5} leading="well" value />
        ) : error && !active.length ? (
          <EmptyState
            icon="warning"
            title="Could not load notifications"
            hint={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : (
          <EmptyState
            icon="bell"
            title={view === "unread" ? "Nothing unread" : "You are all caught up"}
            hint="New enquiries, Anu's voice leads and quotations about to expire land here."
          />
        ),
        renderItem: ({ item }: { item: unknown }) => {
          const n = item as AppNotification
          return (
            <NotificationCard item={n} read={isRead(n.id)} onOpen={() => open(n)} />
          )
        },
      }}
    >
      <DataNotice error={error} onRetry={() => void reload()} />
      <View style={styles.segments}>
        <SegmentedControl options={VIEWS} value={view} onChange={setView} />
      </View>
      {!prefs.enabled && (
        <Pressable
          onPress={() => navigation.navigate("NotificationSettings")}
          style={[styles.muted, { backgroundColor: t.warningBg }]}
        >
          <Icon name="bell" size={18} color={t.warning} variant="Bulk" />
          <Text style={[textVariants.small, { color: t.warningText, flex: 1 }]}>
            Notifications are muted. These leads are still listed here, but the phone will not
            announce them.
          </Text>
        </Pressable>
      )}
      {data.length ? <RowSeparator /> : null}
    </AppScreen>
  )
}

// ---- the row ----------------------------------------------------------------

function NotificationCard({
  item,
  read,
  onOpen,
}: {
  item: AppNotification
  read: boolean
  onOpen: () => void
}) {
  const t = useTheme()
  const tone = item.tone === "primary" ? null : t.tones[item.tone === "rose" ? "rose" : "amber"]
  const wellBg = tone ? tone.bg : t.iconWell
  const wellFg = tone ? tone.fg : t.primary

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.surface,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.head}>
        <View style={[styles.well, { backgroundColor: wellBg }]}>
          <Icon name={item.icon} size={18} color={wellFg} variant="Bulk" />
        </View>

        <View style={styles.headBody}>
          <Text numberOfLines={2} style={[textVariants.listTitle, { color: t.text }]}>
            {item.title}
          </Text>
          <Text numberOfLines={1} style={[textVariants.caption, { color: t.textTertiary, marginTop: 2 }]}>
            {relativeTime(item.when)} · {item.module}
            {item.urgent ? " · Needs attention" : ""}
          </Text>
        </View>

        {/* The unread dot doubles as the toggle, exactly as the console's does. */}
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={read ? "Mark as unread" : "Mark as read"}
          onPress={() => markRead(item.id, !read)}
          style={styles.dotSlot}
        >
          <View
            style={[
              styles.dot,
              read
                ? { backgroundColor: "transparent", borderWidth: 1, borderColor: t.border }
                : { backgroundColor: t.primary },
            ]}
          />
        </Pressable>
      </View>

      <Text style={[textVariants.small, { color: t.textSecondary, marginTop: spacing.xs }]}>
        {item.body}
      </Text>

      {item.value != null && (
        <View style={[styles.amount, { backgroundColor: t.surfaceInset }]}>
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>Quote value</Text>
          <Text style={[textVariants.amount, { color: t.text }]}>{formatCurrency(item.value)}</Text>
        </View>
      )}

      {item.facts.length > 0 && (
        <View style={styles.facts}>
          {item.facts.map((f) => (
            <Chip key={f} label={f} small />
          ))}
        </View>
      )}

    </Pressable>
  )
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center" },
  segments: { paddingHorizontal: gutter, marginBottom: spacing.sm },
  muted: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: gutter,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  // A notification is a BLOCK, not a 56dp row: it carries a title, a detail
  // line, chips and up to three buttons. It still reaches both edges and is
  // separated by the 2dp band, so it belongs to the same page language as every
  // list in the app.
  card: { paddingHorizontal: gutter, paddingVertical: spacing.md },
  head: { flexDirection: "row", alignItems: "flex-start" },
  headBody: { flex: 1, minWidth: 0 },
  well: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  dotSlot: { paddingLeft: spacing.sm, paddingTop: 4 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  amount: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
})
