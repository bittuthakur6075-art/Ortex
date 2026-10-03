import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { formatCurrency, formatNumber, shortAge } from "@/domain/format"
import { quoteDaysLeft, quoteSections, quoteSummary, statusCounts, isExpiring, type ListSection } from "@/domain/lists"
import { QUOTATION_STATUS, type Quotation } from "@/domain/schema"
import { SECTION_TITLE } from "@/features/attendance/format"
import ChatButton from "@/features/chat/ChatButton"
import NotificationBell from "@/features/notifications/NotificationBell"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { fontFamily } from "@/theme/typography"
import { AppScreen, Avatar, DataNotice, EmptyState, Fab, IconButton, ListRefreshControl, ProfileAvatarButton, RowRule, RowSeparator, SkeletonList, StatusBadge } from "@/ui"
import CountChips from "@/ui/CountChips"
import { SubHeader, Tag } from "@/ui/OneUi"
import { gutter } from "@/theme/tokens"

// The tab the app exists for, minimal and compact like Leads: the status
// pills (the open, expiring and won figures are on Home), then the
// quotes grouped by urgency (Expiring Soon, This Week, Earlier) in two-line
// rows: customer and amount; number, size and age with the status, led by the
// days left when a quote is about to lapse, which also dots the avatar. The
// grouping rules live in domain/lists.ts, shared with Home.

const compact = (n: number) => (n ? formatCurrency(n, { compact: true }) : "₹0")

function expiryWords(left: number) {
  return left === 0 ? "Expires today" : left === 1 ? "Expires tomorrow" : `Expires in ${left} days`
}

export default function QuotationsScreen({ navigation }: TabScreenProps<"Quotes">) {
  const { items, loading, refreshing, error, fromCache, cachedAt, reload } = useCollection<Quotation>("quotations")
  const [filter, setFilter] = React.useState("all")

  // The clock is read when the data changes (a pull, a realtime event), not per render.
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    setNow(Date.now())
  }, [items])
  const counts = React.useMemo(() => statusCounts(items), [items])
  const chips = React.useMemo(
    () => [
      { key: "all", label: "All", count: items.length },
      ...QUOTATION_STATUS.filter((s) => counts[s.id]).map((s) => ({ key: s.id, label: s.label, count: counts[s.id] })),
    ],
    [items.length, counts],
  )
  const summary = React.useMemo(() => quoteSummary(items, now), [items, now])
  const sections = React.useMemo(
    () => quoteSections(filter === "all" ? items : items.filter((q) => q.status === filter), now),
    [items, filter, now],
  )

  const open = (id: string) => {
    feedback.tap()
    navigation.navigate("QuotationDetail", { id })
  }

  return (
    <AppScreen
      title="Quotations"
      subtitle={loading ? "Loading…" : `${items.length} ${items.length === 1 ? "quote" : "quotes"} · ${compact(summary.openValue)} open`}
      headerLeft={<ProfileAvatarButton />}
      headerRight={
        <>
          <IconButton name="search" onPress={() => navigation.navigate("Search")} accessibilityLabel="Search everything" />
          <ChatButton />
          <NotificationBell />
        </>
      }
      overlay={<Fab label="New quotation" icon="add" accessibilityLabel="New quotation" onPress={() => navigation.navigate("QuotationEditor")} />}
      sections={{
        sections: loading ? [] : sections,
        refreshControl: <ListRefreshControl refreshing={refreshing} onRefresh={reload} />,
        keyExtractor: (q: unknown) => (q as Quotation).id,
        stickySectionHeadersEnabled: false,
        renderSectionHeader: ({ section }: { section: unknown }) => {
          const s = section as ListSection<Quotation>
          return (
            <SubHeader
              flush
              titleStyle={SECTION_TITLE}
              title={s.title}
              right={s.key === "first" ? <Tag label={String(s.data.length)} tone="warning" dot /> : undefined}
            />
          )
        },
        ItemSeparatorComponent: () => <RowRule />,
        renderSectionFooter: () => <RowSeparator />,
        ListFooterComponent: <View style={styles.fabClear} />,
        ListEmptyComponent: loading ? (
          <SkeletonList count={6} leading="avatar" value />
        ) : error && !items.length ? (
          <EmptyState icon="warning" title="Could not load quotations" hint={error} actionLabel="Try again" onAction={() => void reload()} />
        ) : (
          <EmptyState
            icon="quote"
            title={filter !== "all" ? "Nothing matches" : "No quotations yet"}
            hint={filter !== "all" ? "Try another filter above." : "Tap New quotation to raise one, or start from a lead."}
          />
        ),
        renderItem: ({ item }: { item: unknown }) => {
          const q = item as Quotation
          return <QuoteRow q={q} now={now} onPress={() => open(q.id)} />
        },
      }}
    >
      <DataNotice error={error} fromCache={fromCache} cachedAt={cachedAt} onRetry={() => void reload()} />
      {!loading && items.length ? <CountChips options={chips} value={filter} onChange={setFilter} /> : null}
      {!loading && sections.length ? <RowSeparator /> : null}
    </AppScreen>
  )
}

/** Customer and amount on top; number, size and age below with the status, led by the days left when it is lapsing. */
function QuoteRow({ q, now, onPress }: { q: Quotation; now: number; onPress: () => void }) {
  const t = useTheme()
  const name = q.customer?.company || q.customer?.name || "No customer"
  const expiring = isExpiring(q, now)
  const left = quoteDaysLeft(q, now)
  const lines = q.lines?.length || 0
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <View>
        <Avatar name={name} size="md" />
        {expiring ? <View style={[styles.dot, { backgroundColor: t.warning, borderColor: t.background }]} /> : null}
      </View>
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
            {name}
          </Text>
          {/* Whole rupees in the list; the paise are on the quote itself. */}
          <Text style={[styles.amount, { color: t.text }]}>{`₹${formatNumber(Math.round(Number(q.totals?.grandTotal) || 0))}`}</Text>
        </View>
        <View style={styles.line}>
          <Text style={[styles.meta, { color: t.textTertiary }]} numberOfLines={1}>
            {expiring && left !== null ? (
              <Text style={[styles.metaStrong, { color: t.warningText }]}>{`${expiryWords(left)} · `}</Text>
            ) : null}
            {`${q.number} · ${lines} ${lines === 1 ? "item" : "items"} · ${shortAge(q.createdAt)}`}
          </Text>
          <StatusBadge list={QUOTATION_STATUS} id={q.status} small />
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fabClear: { height: 80 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: gutter, paddingVertical: 12 },
  dot: { position: "absolute", right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 20 },
  amount: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 20, fontVariant: ["tabular-nums"] },
  meta: { flex: 1, fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 17 },
  metaStrong: { fontFamily: fontFamily.semibold },
})
