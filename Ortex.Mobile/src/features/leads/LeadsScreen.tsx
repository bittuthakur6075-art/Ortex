import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { repo } from "@/data/repo"
import { shortAge } from "@/domain/format"
import { canAccess } from "@/domain/modules"
import { ENQUIRY_STATUS, newLine, type Enquiry } from "@/domain/schema"
import { VOICE_SOURCE, buildQuotationPrefill, voiceCallsFrom, type VoiceCall } from "@/domain/voice"
import { useCollection } from "@/hooks/useCollection"
import { callNumber, prettyPhone, whatsapp } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  Button,
  Chip,
  EmptyState,
  IconButton,
  ListRow,
  ProfileAvatarButton,
  RowSeparator,
  SegmentedControl,
  Sheet,
  Skeleton,
  StatusBadge,
  useToast,
} from "@/ui"
import StatusSheet from "@/features/leads/StatusSheet"

// Enquiries and voice calls read the SAME `enquiries` collection — a voice lead
// is just a row tagged with VOICE_SOURCE. The console splits them into two tabs
// of one hub for that reason, and so does this screen.
//
// A lead is an ACTIONABLE object, not just a fact, so tapping a row opens a
// bottom sheet carrying Call / WhatsApp / Create quotation / Status. That is the
// Capnix row-actions pattern: the list stays a clean scannable plane, and the
// verbs live one tap away rather than crowding every row with four buttons.

type Tab = "enquiries" | "voice"

/** What a row expands into, whichever list it came from. */
type Subject = {
  id: string
  name: string
  phone?: string
  status: string
  summary?: string
  /** Every underlying enquiry row — a folded voice call has several. */
  rowIds: string[]
  prefill: {
    customer?: Partial<Enquiry["customer"]>
    lines?: ReturnType<typeof newLine>[]
    notes?: string
    enquiryId?: string
  }
}

export default function LeadsScreen({ navigation }: TabScreenProps<"Leads">) {
  const t = useTheme()
  const toast = useToast()
  const { profile } = useAuth()
  const { items, loading } = useCollection<Enquiry>("enquiries")
  const [subject, setSubject] = React.useState<Subject | null>(null)
  const [statusOpen, setStatusOpen] = React.useState(false)

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

  const subjectFromEnquiry = (e: Enquiry): Subject => ({
    id: e.id,
    name: e.customer?.name || e.customer?.company || "Unnamed enquiry",
    phone: e.customer?.phone,
    status: e.status,
    summary: e.message,
    rowIds: [e.id],
    prefill: {
      customer: e.customer,
      lines: e.productInterest ? [newLine({ description: e.productInterest })] : undefined,
      notes: e.message ? `Ref: ${e.message}` : undefined,
      enquiryId: e.id,
    },
  })

  const subjectFromCall = (call: VoiceCall): Subject => {
    const prefill = buildQuotationPrefill(call)
    return {
      id: call.id,
      name: call.name,
      phone: call.customer.phone,
      status: call.status,
      summary: call.summary,
      // A "call" is several enquiry rows; a status change writes to all of them,
      // so the next person to open any single row sees the same truth.
      rowIds: call.rows.map((r) => r.id),
      prefill,
    }
  }

  const setStatus = async (status: string) => {
    if (!subject) return
    setStatusOpen(false)
    setSubject(null)
    try {
      await Promise.all(subject.rowIds.map((id) => repo.update("enquiries", id, { status })))
      feedback.created()
      toast.show({ message: `Marked ${status}`, tone: "success" })
    } catch {
      feedback.error()
      toast.show({ message: "Could not update — check your connection", tone: "danger" })
    }
  }

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
          keyExtractor: (x: unknown) => (x as { id: string }).id,
          ItemSeparatorComponent: RowSeparator,
          ListFooterComponent: data.length ? <RowSeparator /> : null,
          ListEmptyComponent: loading ? (
            <View style={{ paddingHorizontal: gutter, gap: spacing.sm }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={72} radius={12} />
              ))}
            </View>
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
                    setSubject(subjectFromCall(call))
                  }}
                />
              )
            }

            const e = item as Enquiry
            return (
              <ListRow
                leadingIcon="enquiry"
                title={e.customer?.name || e.customer?.company || "Unnamed enquiry"}
                subtitle={[e.productInterest || e.source, shortAge(e.createdAt)].filter(Boolean).join(" · ")}
                valueSub={<StatusBadge list={ENQUIRY_STATUS} id={e.status} small />}
                onPress={() => {
                  feedback.tap()
                  setSubject(subjectFromEnquiry(e))
                }}
              />
            )
          },
        }}
      >
        {segments.length > 1 && (
          <View style={styles.segments}>
            <SegmentedControl options={segments} value={tab} onChange={setTab} />
          </View>
        )}
        {data.length ? <RowSeparator /> : null}
      </AppScreen>

      {/* Row actions live in a sheet, not crowded into every row. */}
      <Sheet visible={!!subject && !statusOpen} onClose={() => setSubject(null)} title={subject?.name}>
        {subject && (
          <View>
            {!!subject.summary && (
              <Text
                numberOfLines={4}
                style={[textVariants.body, { color: t.textSecondary, marginBottom: spacing.md }]}
              >
                {subject.summary}
              </Text>
            )}
            <View style={styles.sheetActions}>
              <Button
                label="Call"
                icon="call"
                variant="secondary"
                disabled={!subject.phone}
                onPress={() => void callNumber(subject.phone)}
              />
              <Button
                label="WhatsApp"
                icon="whatsapp"
                variant="secondary"
                disabled={!subject.phone}
                onPress={() => void whatsapp(subject.phone)}
              />
            </View>
            <Button
              label="Create quotation"
              icon="quote"
              fullWidth
              style={{ marginTop: spacing.sm }}
              onPress={() => {
                const prefill = subject.prefill
                setSubject(null)
                feedback.tap()
                navigation.navigate("QuotationEditor", { prefill })
              }}
            />
            <Button
              label="Change status"
              icon="tick"
              variant="ghost"
              fullWidth
              style={{ marginTop: spacing.xs }}
              onPress={() => setStatusOpen(true)}
            />
          </View>
        )}
      </Sheet>

      <StatusSheet
        visible={statusOpen}
        current={subject?.status}
        onClose={() => setStatusOpen(false)}
        onPick={(id) => void setStatus(id)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  segments: { paddingHorizontal: gutter, marginBottom: spacing.sm },
  flags: { flexDirection: "row", justifyContent: "flex-end" },
  sheetActions: { flexDirection: "row", gap: spacing.sm },
})
