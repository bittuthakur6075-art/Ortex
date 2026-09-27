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
import { callNumber } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter } from "@/theme/tokens"
import { fontFamily } from "@/theme/typography"
import { AppScreen, DataNotice, EmptyState, IconButton, ListRefreshControl, ProfileAvatarButton, RowRule, RowSeparator, SegmentedControl, SkeletonList, StatusBadge } from "@/ui"
import CountChips from "@/ui/CountChips"
import Icon, { type IconName } from "@/ui/Icon"
import LineTabs from "@/ui/LineTabs"
import { SubHeader, Tag, Well, type OneTone } from "@/ui/OneUi"

// Enquiries and voice calls read the SAME `enquiries` collection: a voice lead
// is a row tagged with VOICE_SOURCE, folded per conversation. The list (Figma
// "Quotations and Leads · One UI lists") opens on who to ring first: enquiries
// left new for two days and urgent or complaint calls, then today, then the
// rest. A row leads with WHAT they asked for, then who and when, with status
// and source as tags and a Call button, so a callback is one tap from here.
// The grouping rules are domain/lists.ts.

type Tab = "enquiries" | "voice"
type Row = Enquiry | VoiceCall

export default function LeadsScreen({ navigation }: TabScreenProps<"Leads">) {
  const t = useTheme()
  const { profile } = useAuth()
  const { items, loading, refreshing, error, fromCache, cachedAt, reload } = useCollection<Enquiry>("enquiries")

  const canEnquiries = canAccess(profile, "enquiries")
  const canVoice = canAccess(profile, "voice-leads")
  const [importing, setImporting] = React.useState(false)
  const [tab, setTab] = React.useState<Tab>(canEnquiries ? "enquiries" : "voice")
  const [filter, setFilter] = React.useState("all")
  const [segmentsBottom, setSegmentsBottom] = React.useState(0)

  const enquiries = React.useMemo(() => items.filter((e) => e.source !== VOICE_SOURCE), [items])
  const calls = React.useMemo(() => voiceCallsFrom(items), [items])
  const showingVoice = tab === "voice"
  const rows: Row[] = showingVoice ? calls : enquiries

  const segments = React.useMemo(
    () =>
      [
        canEnquiries ? { key: "enquiries" as const, label: `Enquiries ${enquiries.length}` } : null,
        canVoice ? { key: "voice" as const, label: `Voice Calls ${calls.length}` } : null,
      ].filter(Boolean) as { key: Tab; label: string }[],
    [canEnquiries, canVoice, enquiries.length, calls.length],
  )

  const counts = React.useMemo(() => statusCounts(rows as { status?: string }[], "new"), [rows])
  const chips = React.useMemo(
    () => [
      { key: "all", label: "All", count: rows.length },
      ...ENQUIRY_STATUS.filter((s) => counts[s.id]).map((s) => ({ key: s.id, label: s.label, count: counts[s.id] })),
    ],
    [rows.length, counts],
  )

  // The clock is read when the data changes (a pull, a realtime event), not per render.
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    setNow(Date.now())
  }, [items])
  const sections = React.useMemo((): ListSection<Row>[] => {
    const keep = (s?: string) => filter === "all" || (s || "new") === filter
    return showingVoice
      ? callSections(calls.filter((c) => keep(c.status)), now)
      : enquirySections(enquiries.filter((e) => keep(e.status)), now)
  }, [showingVoice, calls, enquiries, filter, now])

  const stamp = (r: Row) => Date.parse(String("endedAt" in r ? r.endedAt : (r as Enquiry).createdAt))
  const newToday = rows.filter((r) => (r.status || "new") === "new" && now - stamp(r) < 86400000).length
  const waiting = showingVoice ? calls.filter((c) => callCallFirst(c, now)).length : enquiries.filter((e) => enquiryCallFirst(e, now)).length

  const switchTab = (k: Tab) => {
    setTab(k)
    setFilter("all")
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <AppScreen
        title="Leads"
        subtitle={loading ? "Loading…" : `${newToday} new today · ${waiting} to call first`}
        stickyKey={tab}
        stickyThreshold={segmentsBottom}
        stickyBar={segments.length > 1 ? <LineTabs options={segments} value={tab} onChange={switchTab} style={styles.lineTabs} /> : null}
        headerLeft={<ProfileAvatarButton />}
        headerRight={
          <>
            {canEnquiries && !showingVoice ? (
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
                title={s.title}
                right={s.key === "first" ? <Tag label={String(s.data.length)} tone="danger" dot /> : undefined}
              />
            )
          },
          ItemSeparatorComponent: () => <RowRule />,
          renderSectionFooter: () => <RowSeparator />,
          ListEmptyComponent: loading ? (
            <SkeletonList count={6} leading="well" value />
          ) : error && !items.length ? (
            <EmptyState icon="warning" title="Could not load leads" hint={error} actionLabel="Try again" onAction={() => void reload()} />
          ) : (
            <EmptyState
              icon={showingVoice ? "voice" : "enquiry"}
              title={filter !== "all" ? "Nothing matches" : showingVoice ? "No voice calls yet" : "No enquiries yet"}
              hint={
                filter !== "all"
                  ? "Try another filter above."
                  : showingVoice
                    ? "Anu saves a lead every time someone talks to her on the website."
                    : "Website forms and the quote calculator land here."
              }
            />
          ),
          renderItem: ({ item, section }: { item: unknown; section: unknown }) => {
            const s = section as ListSection<Row>
            return (
              showingVoice ? (
                  <CallRow
                    call={item as VoiceCall}
                    first={s.key === "first"}
                    onPress={() => {
                      feedback.tap()
                      navigation.navigate("VoiceCallDetail", { id: (item as VoiceCall).id })
                    }}
                  />
                ) : (
                  <EnquiryRow
                    e={item as Enquiry}
                    first={s.key === "first"}
                    onPress={() => {
                      feedback.tap()
                      navigation.navigate("EnquiryDetail", { id: (item as Enquiry).id })
                    }}
                  />
                )
            )
          },
        }}
      >
        <DataNotice error={error} fromCache={fromCache} cachedAt={cachedAt} onRetry={() => void reload()} />
        {segments.length > 1 && (
          <View
            style={styles.segments}
            // The handover point: y + height IS the scroll offset where the
            // switch slides under the bar and its underline twin pins.
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout
              setSegmentsBottom(y + height)
            }}
          >
            <SegmentedControl options={segments} value={tab} onChange={switchTab} />
          </View>
        )}
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
  const who = [e.customer?.name, e.customer?.company].filter(Boolean).join(" · ") || "Unnamed enquiry"
  return (
    <LeadRow
      icon={rfq ? "quote" : "enquiry"}
      tone={first ? "warning" : "primary"}
      what={enquiryWhat(e)}
      who={`${who} · ${shortAge(e.createdAt)}`}
      phone={e.customer?.phone}
      onPress={onPress}
    >
      {first ? <Tag label="Overdue" tone="warning" dot /> : null}
      <StatusBadge list={ENQUIRY_STATUS} id={e.status || "new"} small />
      {e.source ? <Tag label={rfq ? "Quote Calculator" : e.source} /> : null}
      {artwork ? <Tag label={artwork.failed ? "Artwork failed" : "Artwork"} tone={artwork.failed ? "danger" : "neutral"} /> : null}
    </LeadRow>
  )
}

function CallRow({ call, first, onPress }: { call: VoiceCall; first: boolean; onPress: () => void }) {
  const what = call.itemsList.length
    ? call.itemsList.map((i) => [i.product, i.quantity && `${i.quantity} pcs`].filter(Boolean).join(" · ")).join(", ")
    : call.productInterest || "Nothing captured"
  const who = [call.name, shortAge(call.endedAt), call.callTotal > 1 ? `call ${call.callIndex} of ${call.callTotal}` : null]
    .filter(Boolean)
    .join(" · ")
  return (
    <LeadRow
      icon="voice"
      tone={call.flags.support ? "danger" : call.flags.urgent || first ? "warning" : "primary"}
      what={what}
      who={who}
      phone={call.customer.phone}
      onPress={onPress}
    >
      {call.flags.support ? <Tag label="Support" tone="danger" dot /> : call.flags.urgent ? <Tag label="Urgent" tone="warning" dot /> : null}
      <StatusBadge list={ENQUIRY_STATUS} id={call.status} small />
      {call.flags.incomplete ? <Tag label="No qty" /> : <Tag label="Anu" tone="violet" />}
    </LeadRow>
  )
}

function LeadRow({
  icon,
  tone,
  what,
  who,
  phone,
  onPress,
  children,
}: {
  icon: IconName
  tone: OneTone
  what: string
  who: string
  phone?: string
  onPress: () => void
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <Well icon={icon} tone={tone} size={40} />
      <View style={styles.body}>
        <Text style={[styles.what, { color: t.text }]} numberOfLines={1}>
          {what}
        </Text>
        <Text style={[styles.who, { color: t.textTertiary }]} numberOfLines={1}>
          {who}
        </Text>
        <View style={styles.tags}>{children}</View>
      </View>
      {phone ? (
        <Pressable
          onPress={() => void callNumber(phone)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Call ${who}`}
          style={[styles.call, { backgroundColor: t.successBg }]}
        >
          <Icon name="call" size={20} color={t.successText} variant="Bulk" />
        </Pressable>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  segments: { paddingHorizontal: gutter, marginBottom: 12 },
  lineTabs: { paddingHorizontal: gutter },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: gutter, paddingVertical: 14 },
  body: { flex: 1, minWidth: 0, gap: 3 },
  what: { fontFamily: fontFamily.semibold, fontSize: 15.5, lineHeight: 20 },
  who: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 17 },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, paddingTop: 3 },
  call: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
})
