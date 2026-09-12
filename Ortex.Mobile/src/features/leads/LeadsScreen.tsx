import React from "react"
import { StyleSheet, View } from "react-native"

import { formatNumber, shortAge } from "@/domain/format"
import { canAccess } from "@/domain/modules"
import { enquiryAge, parseQuoteRfq, rfqArtwork, rfqUnits } from "@/domain/quoteRfq"
import { ENQUIRY_STATUS, type Enquiry } from "@/domain/schema"
import { VOICE_SOURCE, prettyPhone, voiceCallsFrom, type VoiceCall } from "@/domain/voice"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import {
  AppScreen,
  DataNotice,
  ListRefreshControl,
  Chip,
  EmptyState,
  IconButton,
  ListRow,
  ProfileAvatarButton,
  RowSeparator,
  SegmentedControl,
  Skeleton,
  StatusBadge,
} from "@/ui"

// Enquiries and voice calls read the SAME `enquiries` collection — a voice lead
// is just a row tagged with VOICE_SOURCE. The console splits them into two tabs
// of one hub for that reason, and so does this screen.
//
// A row is a summary, not a record: tapping one opens the lead's own page
// (EnquiryDetailScreen / VoiceCallDetailScreen), where the whole request, the
// advisories and the pipeline live. The list's job is to make the next lead to
// open obvious — which is why a row carries the SIZE of the request (lines and
// units, folded from the website's RFQ payload) rather than just a name and a
// date, and why an overdue or flagged row is tinted.

type Tab = "enquiries" | "voice"

export default function LeadsScreen({ navigation }: TabScreenProps<"Leads">) {
  const t = useTheme()
  const { profile } = useAuth()
  const { items, loading, refreshing, error, fromCache, cachedAt, reload } = useCollection<Enquiry>("enquiries")

  const canEnquiries = canAccess(profile, "enquiries")
  const canVoice = canAccess(profile, "voice-leads")
  const [tab, setTab] = React.useState<Tab>(canEnquiries ? "enquiries" : "voice")

  const segments = React.useMemo(
    () =>
      [
        canEnquiries ? { key: "enquiries" as const, label: "Enquiries" } : null,
        canVoice ? { key: "voice" as const, label: "Voice calls" } : null,
      ].filter(Boolean) as { key: Tab; label: string }[],
    [canEnquiries, canVoice],
  )

  const enquiries = React.useMemo(
    () =>
      items
        .filter((e) => e.source !== VOICE_SOURCE)
        .sort(
          (a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime(),
        ),
    [items],
  )
  const calls = React.useMemo(() => voiceCallsFrom(items), [items])

  const showingVoice = tab === "voice"
  const data: (Enquiry | VoiceCall)[] = showingVoice ? calls : enquiries

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <AppScreen
        title="Leads"
        subtitle={
          loading ? "Loading…" : showingVoice ? `${calls.length} calls` : `${enquiries.length} enquiries`
        }
        headerLeft={<ProfileAvatarButton />}
        headerRight={
          <IconButton
            name="search"
            onPress={() => navigation.navigate("Search")}
            accessibilityLabel="Search everything"
          />
        }
        list={{
          data: loading ? [] : data,
          refreshControl: <ListRefreshControl refreshing={refreshing} onRefresh={reload} />,
          keyExtractor: (x: unknown) => (x as { id: string }).id,
          ItemSeparatorComponent: RowSeparator,
          ListFooterComponent: data.length ? <RowSeparator /> : null,
          ListEmptyComponent: loading ? (
            <View style={{ paddingHorizontal: gutter, gap: spacing.sm }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={72} radius={12} />
              ))}
            </View>
          ) : error && !items.length ? (
            <EmptyState icon="warning" title="Could not load leads" hint={error} actionLabel="Try again" onAction={() => void reload()} />
          ) : (
            <EmptyState
              icon={showingVoice ? "voice" : "enquiry"}
              title={showingVoice ? "No voice calls yet" : "No enquiries yet"}
              hint={
                showingVoice
                  ? "Anu saves a lead every time someone talks to her on the website."
                  : "Website forms and the quote calculator land here."
              }
            />
          ),
          renderItem: ({ item }: { item: unknown }) => {
            if (showingVoice) {
              const call = item as VoiceCall
              const flagged =
                call.flags.support || call.flags.urgent || call.flags.hugeQty || call.flags.incomplete
              return (
                <ListRow
                  leadingIcon="voice"
                  leadingTone={call.flags.support ? "rose" : call.flags.urgent ? "amber" : "primary"}
                  title={call.name}
                  subtitle={[
                    // What they want comes before who they are: on a callback
                    // list the requirement is what decides which row to open.
                    call.itemsList.length
                      ? call.itemsList
                          .map((i) => [i.quantity, i.product].filter(Boolean).join(" x "))
                          .join(", ")
                      : call.productInterest || "Nothing captured",
                    call.customer.phone ? prettyPhone(call.customer.phone) : "No number",
                    shortAge(call.endedAt),
                    call.callTotal > 1 ? `call ${call.callIndex}/${call.callTotal}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  valueSub={
                    flagged ? (
                      <View style={styles.flags}>
                        {call.flags.support && <Chip label="Support" tint={t.danger} active small />}
                        {!call.flags.support && call.flags.urgent && (
                          <Chip label="Urgent" tint={t.warning} active small />
                        )}
                        {!call.flags.support && !call.flags.urgent && call.flags.incomplete && (
                          <Chip label="No qty" tint={t.textTertiary} active small />
                        )}
                      </View>
                    ) : (
                      <StatusBadge list={ENQUIRY_STATUS} id={call.status} small />
                    )
                  }
                  onPress={() => {
                    feedback.tap()
                    navigation.navigate("VoiceCallDetail", { id: call.id })
                  }}
                />
              )
            }

            const e = item as Enquiry
            const rfq = parseQuoteRfq(e)
            const age = enquiryAge(e)
            const artwork = rfqArtwork(e)
            return (
              <ListRow
                leadingIcon={rfq ? "quote" : "enquiry"}
                // An enquiry left as new for two days is the one to open next.
                leadingTone={age.overdue ? "amber" : "primary"}
                title={e.customer?.name || e.customer?.company || "Unnamed enquiry"}
                subtitle={[
                  // The size of the request, where the website sent one.
                  rfq
                    ? `${rfq.items.length} item${rfq.items.length === 1 ? "" : "s"} · ${formatNumber(rfqUnits(rfq.items))} pcs`
                    : e.productInterest || e.source,
                  artwork ? (artwork.failed ? "artwork failed" : "artwork") : null,
                  shortAge(e.createdAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                valueSub={<StatusBadge list={ENQUIRY_STATUS} id={e.status} small />}
                onPress={() => {
                  feedback.tap()
                  navigation.navigate("EnquiryDetail", { id: e.id })
                }}
              />
            )
          },
        }}
      >
        <DataNotice error={error} fromCache={fromCache} cachedAt={cachedAt} onRetry={() => void reload()} />
        {segments.length > 1 && (
          <View style={styles.segments}>
            <SegmentedControl options={segments} value={tab} onChange={setTab} />
          </View>
        )}
        {data.length ? <RowSeparator /> : null}
      </AppScreen>
    </View>
  )
}

const styles = StyleSheet.create({
  segments: { paddingHorizontal: gutter, marginBottom: spacing.sm },
  flags: { flexDirection: "row", justifyContent: "flex-end" },
})
