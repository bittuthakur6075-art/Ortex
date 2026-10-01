import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { formatNumber, shortAge } from "@/domain/format"
import { callCallFirst, callSections, enquiryCallFirst, enquirySections, statusCounts, type ListSection } from "@/domain/lists"
import { canAccess } from "@/domain/modules"
import { parseQuoteRfq, rfqArtwork, rfqUnits } from "@/domain/quoteRfq"
import { ENQUIRY_STATUS, type Enquiry } from "@/domain/schema"
import { VOICE_SOURCE, voiceCallsFrom, type VoiceCall } from "@/domain/voice"
import EnquiryImportSheet from "@/features/leads/EnquiryImportSheet"
import ChatButton from "@/features/chat/ChatButton"
import NotificationBell from "@/features/notifications/NotificationBell"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { SECTION_TITLE } from "@/features/attendance/format"
import { useTheme } from "@/store/ThemeContext"
import { gutter } from "@/theme/tokens"
import { fontFamily } from "@/theme/typography"
import { AppScreen, Avatar, DataNotice, EmptyState, IconButton, ListRefreshControl, ProfileAvatarButton, RowRule, RowSeparator, SkeletonList, StatusBadge } from "@/ui"
import CountChips from "@/ui/CountChips"
import { SubHeader, Tag, useOneTone, type OneTone } from "@/ui/OneUi"

// Enquiries and voice calls read the SAME `enquiries` collection: a voice lead
// is a row tagged with VOICE_SOURCE, folded per conversation. The list (Figma
// "Quotations and Leads · One UI lists") opens on who to ring first: enquiries
// left new for two days and urgent or complaint calls, then today, then the
// rest. Minimal and compact: one row of filter pills, as the console's views
// (All, each status, then Anu calls) in place of a switch, then two-line rows (what they asked for and its status; who, when and from
// where), the person's face with a dot when the lead is overdue, urgent or a
// complaint. Calling lives on the lead's own page. The grouping rules are
// domain/lists.ts.

/** "all", "anu" (Anu's calls), or an enquiry status id. */
type Filter = string
type Row = Enquiry | VoiceCall

const isCall = (r: Row): r is VoiceCall => "endedAt" in r
const stampOf = (r: Row) => Date.parse(String(isCall(r) ? r.endedAt : r.createdAt)) || 0

/** Enquiries and calls in one list: the same three sections, newest first inside each. */
function mergeSections(a: ListSection<Row>[], b: ListSection<Row>[]): ListSection<Row>[] {
  const order: ListSection<Row>["key"][] = ["first", "recent", "earlier"]
  return order
    .map((key) => {
      const parts = [...a, ...b].filter((x) => x.key === key)
      if (!parts.length) return null
      const data = parts.flatMap((x) => x.data).sort((x, y) => stampOf(y) - stampOf(x))
      return { key, title: parts[0].title, data }
    })
    .filter(Boolean) as ListSection<Row>[]
}

export default function LeadsScreen({ navigation }: TabScreenProps<"Leads">) {
  const t = useTheme()
  const { profile } = useAuth()
  const { items, loading, refreshing, error, fromCache, cachedAt, reload } = useCollection<Enquiry>("enquiries")

  const canEnquiries = canAccess(profile, "enquiries")
  const canVoice = canAccess(profile, "voice-leads")
  const [importing, setImporting] = React.useState(false)
  const [filter, setFilter] = React.useState<Filter>("all")

  const enquiries = React.useMemo(() => (canEnquiries ? items.filter((e) => e.source !== VOICE_SOURCE) : []), [items, canEnquiries])
  const calls = React.useMemo(() => (canVoice ? voiceCallsFrom(items) : []), [items, canVoice])

  // The clock is read when the data changes (a pull, a realtime event), not per render.
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    setNow(Date.now())
  }, [items])

  const sections = React.useMemo((): ListSection<Row>[] => {
    const keep = <T extends Row>(list: T[]) =>
      filter === "all" || filter === "anu" ? list : list.filter((r) => (r.status || "new") === filter)
    const e = filter === "anu" ? [] : (enquirySections(keep(enquiries), now) as ListSection<Row>[])
    const c = callSections(keep(calls), now) as ListSection<Row>[]
    return filter === "anu" ? c : mergeSections(e, c)
  }, [filter, enquiries, calls, now])

  const rows: Row[] = [...enquiries, ...calls]
  const counts = statusCounts(rows as { status?: string }[], "new")
  const chips = [
    { key: "all", label: "All", count: rows.length },
    ...ENQUIRY_STATUS.filter((st) => counts[st.id]).map((st) => ({ key: st.id, label: st.label, count: counts[st.id] })),
    ...(canVoice && calls.length ? [{ key: "anu", label: "Anu Calls", count: calls.length }] : []),
  ]
  const newToday = rows.filter((r) => (r.status || "new") === "new" && now - stampOf(r) < 86400000).length
  const waiting = enquiries.filter((e) => enquiryCallFirst(e, now)).length + calls.filter((c) => callCallFirst(c, now)).length

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <AppScreen
        title="Leads"
        subtitle={loading ? "Loading…" : `${newToday} new today · ${waiting} to call first`}
        headerLeft={<ProfileAvatarButton />}
        headerRight={
          <>
            {canEnquiries ? (
              <IconButton name="upload" onPress={() => setImporting(true)} accessibilityLabel="Import enquiries from Excel" />
            ) : null}
            <IconButton name="search" onPress={() => navigation.navigate("Search")} accessibilityLabel="Search everything" />
            <ChatButton />
            <NotificationBell />
          </>
        }
        sections={{
          sections: loading ? [] : sections,
          refreshControl: <ListRefreshControl refreshing={refreshing} onRefresh={reload} />,
          keyExtractor: (x: unknown) => (x as Row).id,
          stickySectionHeadersEnabled: false,
          renderSectionHeader: ({ section }: { section: unknown }) => {
            const s = section as ListSection<Row>
            return (
              <SubHeader
                flush
                titleStyle={SECTION_TITLE}
                title={s.title}
                right={s.key === "first" ? <Tag label={String(s.data.length)} tone="danger" dot /> : undefined}
              />
            )
          },
          ItemSeparatorComponent: () => <RowRule />,
          renderSectionFooter: () => <RowSeparator />,
          ListEmptyComponent: loading ? (
            <SkeletonList count={6} leading="avatar" />
          ) : error && !items.length ? (
            <EmptyState icon="warning" title="Could not load leads" hint={error} actionLabel="Try again" onAction={() => void reload()} />
          ) : (
            <EmptyState
              icon={filter === "anu" ? "voice" : "enquiry"}
              title={filter === "all" ? "No leads yet" : "Nothing here"}
              hint={
                filter === "all"
                  ? "Website forms, the quote calculator and Anu's calls land here."
                  : "Try another filter above."
              }
            />
          ),
          renderItem: ({ item, section }: { item: unknown; section: unknown }) => {
            const s = section as ListSection<Row>
            const r = item as Row
            return isCall(r) ? (
              <CallRow
                call={r}
                first={s.key === "first"}
                onPress={() => {
                  feedback.tap()
                  navigation.navigate("VoiceCallDetail", { id: r.id })
                }}
              />
            ) : (
              <EnquiryRow
                e={r}
                first={s.key === "first"}
                onPress={() => {
                  feedback.tap()
                  navigation.navigate("EnquiryDetail", { id: r.id })
                }}
              />
            )
          },
        }}
      >
        <DataNotice error={error} fromCache={fromCache} cachedAt={cachedAt} onRetry={() => void reload()} />
        {!loading && rows.length ? <CountChips options={chips} value={filter} onChange={setFilter} /> : null}
        {!loading && sections.length ? <RowSeparator /> : null}
      </AppScreen>
      <EnquiryImportSheet visible={importing} onClose={() => setImporting(false)} existing={items} onImported={() => void reload()} />
    </View>
  )
}

/** What they asked for, the size of it where the website sent one. */
function enquiryWhat(e: Enquiry): string {
  const rfq = parseQuoteRfq(e)
  if (rfq?.items.length) {
    const head = rfq.items[0].name || "Quote request"
    const more = rfq.items.length > 1 ? `, ${rfq.items.length} items` : ""
    return `${head}${more} · ${formatNumber(rfqUnits(rfq.items))} pcs`
  }
  const what = e.productInterest || "Enquiry"
  return e.quantity ? `${what} · ${e.quantity} pcs` : what
}

function EnquiryRow({ e, first, onPress }: { e: Enquiry; first: boolean; onPress: () => void }) {
  const rfq = parseQuoteRfq(e)
  const artwork = rfqArtwork(e)
  const name = e.customer?.name || e.customer?.company || "Unnamed"
  const who = e.customer?.name && e.customer?.company ? `${name}, ${e.customer.company}` : name
  return (
    <LeadRow
      name={name}
      what={enquiryWhat(e)}
      meta={[who, shortAge(e.createdAt), rfq ? "Quote calculator" : e.source]}
      flag={artwork?.failed ? { label: "Artwork failed", tone: "danger" } : first ? { label: "Overdue", tone: "warning" } : null}
      status={<StatusBadge list={ENQUIRY_STATUS} id={e.status || "new"} small />}
      onPress={onPress}
    />
  )
}

function CallRow({ call, first, onPress }: { call: VoiceCall; first: boolean; onPress: () => void }) {
  const what = call.itemsList.length
    ? call.itemsList.map((i) => [i.product, i.quantity && `${i.quantity} pcs`].filter(Boolean).join(" · ")).join(", ")
    : call.productInterest || "Nothing captured"
  return (
    <LeadRow
      name={call.name || "Caller"}
      what={what}
      meta={[call.name || "Caller", shortAge(call.endedAt), call.callTotal > 1 ? `call ${call.callIndex} of ${call.callTotal}` : "Anu"]}
      flag={
        call.flags.support
          ? { label: "Support", tone: "danger" }
          : call.flags.urgent
            ? { label: "Urgent", tone: "warning" }
            : first
              ? { label: "Overdue", tone: "warning" }
              : null
      }
      status={<StatusBadge list={ENQUIRY_STATUS} id={call.status} small />}
      onPress={onPress}
    />
  )
}

/** Two lines: what and its status; who, when and from where, led by a flag word when there is one. */
function LeadRow({
  name,
  what,
  meta,
  flag,
  status,
  onPress,
}: {
  name: string
  what: string
  meta: (string | null | undefined)[]
  flag: { label: string; tone: OneTone } | null
  status: React.ReactNode
  onPress: () => void
}) {
  const t = useTheme()
  const tint = useOneTone()
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <View>
        <Avatar name={name} size="md" />
        {flag ? <View style={[styles.dot, { backgroundColor: tint(flag.tone).solid, borderColor: t.background }]} /> : null}
      </View>
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={[styles.what, { color: t.text }]} numberOfLines={1}>
            {what}
          </Text>
          {status}
        </View>
        <Text style={[styles.meta, { color: t.textTertiary }]} numberOfLines={1}>
          {flag ? <Text style={{ color: tint(flag.tone).fg, fontFamily: fontFamily.medium }}>{`${flag.label} · `}</Text> : null}
          {meta.filter(Boolean).join(" · ")}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: gutter, paddingVertical: 12 },
  dot: { position: "absolute", right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  body: { flex: 1, minWidth: 0, gap: 3 },
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  what: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 20 },
  meta: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 17 },
})
