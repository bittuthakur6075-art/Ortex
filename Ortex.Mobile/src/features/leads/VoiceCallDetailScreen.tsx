import React from "react"
import { Animated, Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { formatCurrency, formatDateTime, formatNumber, relativeTime } from "@/domain/format"
import { ENQUIRY_STATUS, QUOTATION_STATUS, statusMeta, type Enquiry, type Quotation } from "@/domain/schema"
import { buildQuotationPrefill, parseQuantity, prettyPhone, voiceCallsFrom } from "@/domain/voice"
import { useCollection } from "@/hooks/useCollection"
import { callNumber, copy, email as sendEmail, whatsapp } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { border, gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { Button, Icon, IconButton, Panel, PanelBand, RecordActivityPanel, DetailSkeleton, StatusBadge, useToast } from "@/ui"
import { Advisory, Fact, ItemRow, QuickAction, StatusStepper } from "@/features/leads/leadUi"
import CallRecordings from "@/features/leads/CallRecordings"

/**
 * One call with Anu, the website's voice assistant.
 *
 * A "call" is not a row: Anu re-saves the lead every time the picture firms up,
 * so one conversation is several `enquiries` rows folded together by
 * `domain/voice.ts`. That fold is the whole reason this page exists — the newest
 * capture is the order as it actually stands, and the earlier ones are the
 * TIMELINE of how it got there, which is where a rep finds the thing the
 * customer said once and Anu dropped from the final summary.
 *
 * Everything Anu could not establish is stated as a gap rather than left blank:
 * no name, no delivery city, an item with no quantity. Each of those is a
 * sentence about what to ask, because the point of the page is the next phone
 * call, not the record.
 */

const COLLAPSE = 72

export default function VoiceCallDetailScreen({ route, navigation }: StackScreenProps<"VoiceCallDetail">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { items, loading } = useCollection<Enquiry>("enquiries")
  const { items: quotations } = useCollection<Quotation>("quotations")
  const scrollY = React.useRef(new Animated.Value(0)).current
  const [saving, setSaving] = React.useState(false)

  // Refolded from the live collection rather than passed through navigation, so
  // a status write (or a capture arriving while the page is open) is reflected
  // here without a round trip through the list.
  const calls = React.useMemo(() => voiceCallsFrom(items), [items])
  const call = calls.find((c) => c.id === route.params.id)

  const related = React.useMemo(() => {
    if (!call) return []
    const digits = (call.customer.phone || "").replace(/\D/g, "").slice(-10)
    const mail = (call.customer.email || "").trim().toLowerCase()
    return quotations.filter((q) => {
      if (call.rows.some((r) => q.enquiryId === r.id)) return true
      if (mail && (q.customer?.email || "").trim().toLowerCase() === mail) return true
      if (digits && (q.customer?.phone || "").replace(/\D/g, "").slice(-10) === digits) return true
      return false
    })
  }, [quotations, call])

  if (!call && loading) {
    return (
      <DetailSkeleton onBack={() => navigation.goBack()} panels={[4, 3, 3]} />
    )
  }

  if (!call) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <Text style={{ color: t.textSecondary, fontFamily: font.medium }}>This call is no longer here.</Text>
        <View style={{ marginTop: 14 }}>
          <Button label="Go back" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </View>
    )
  }

  const phone = call.customer.phone
  const barTitleOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE * 0.6, COLLAPSE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  })

  // A status change writes to EVERY row of the call, so whoever opens any single
  // capture next sees the same truth.
  const setStatus = async (status: string) => {
    setSaving(true)
    try {
      await Promise.all(call.rows.map((r) => repo.update("enquiries", r.id, { status })))
      feedback.created()
      toast.show({ message: `Marked ${statusMeta(ENQUIRY_STATUS, status).label}`, tone: "success" })
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not update"), tone: "danger" })
    } finally {
      setSaving(false)
    }
  }

  const createQuotation = () => {
    feedback.tap()
    navigation.navigate("QuotationEditor", { prefill: buildQuotationPrefill(call) })
  }

  const biggest = Math.max(0, ...call.itemsList.map((i) => parseQuantity(i.quantity) || 0))

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <View style={[styles.bar, { backgroundColor: t.surface, borderBottomColor: t.divider, paddingTop: insets.top }]}>
        <IconButton name="back" onPress={() => navigation.goBack()} accessibilityLabel="Back" />
        <Animated.Text
          numberOfLines={1}
          style={[styles.barTitle, textVariants.appBarTitleBack, { color: t.text, opacity: barTitleOpacity }]}
        >
          {call.name}
        </Animated.Text>
        <IconButton
          name="call"
          onPress={() => void callNumber(phone)}
          accessibilityLabel="Call back"
          color={t.primary}
        />
      </View>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
      >
        {/* Identity, then the pipeline — one block carrying the gutter, as on the
            quotation page. */}
        <View style={styles.pageBlock}>
          <Text style={[styles.name, { color: t.text, fontStyle: call.named ? "normal" : "italic" }]}>
            {call.name}
          </Text>
          <View style={styles.metaLine}>
            <StatusBadge list={ENQUIRY_STATUS} id={call.status} />
            <Text style={[textVariants.caption, { color: t.textTertiary }]}>
              {relativeTime(call.endedAt)}
              {call.callTotal > 1 ? ` · call ${call.callIndex} of ${call.callTotal}` : ""}
            </Text>
          </View>
          <Text style={[textVariants.body, styles.pagePhone, { color: t.textSecondary }]}>
            {phone ? prettyPhone(phone) : "No number captured"}
          </Text>

          <View style={styles.stepperWrap}>
            <StatusStepper status={call.status} onChange={(s) => void setStatus(s)} disabled={saving} />
          </View>
        </View>

        {/* Everything a rep must know BEFORE the callback, in the order it would
            change what they say. Support outranks every other advisory. */}
        {call.flags.support && (
          <Advisory tone="danger" icon="warning">
            This call mentions a complaint or a cancellation. Handle it as support before any sales
            follow-up. A quotation here will read as tone deaf.
          </Advisory>
        )}
        {!call.named && (
          <Advisory tone="info" icon="customer">
            Anu never captured a name. Open with the number and the requirement instead, and get the name
            early.
          </Advisory>
        )}
        {call.flags.urgent && (
          <Advisory tone="warning" icon="clock">
            {`They said it is urgent${
              call.timeline ? ` (${call.timeline})` : ""
            }. Ring before you quote. A fast answer is worth more than a polished one here.`}
          </Advisory>
        )}
        {call.flags.hugeQty && (
          <Advisory tone="warning" icon="warning">
            {`The quantity on this call is unusually large${
              biggest ? ` (up to ${formatNumber(biggest)})` : ""
            }. Confirm it before it is used for pricing. Spoken figures like this are often a slip of the tongue.`}
          </Advisory>
        )}
        {call.flags.incomplete && (
          <Advisory tone="warning" icon="warning">
            {call.itemsList.length
              ? "One or more items have no quantity. Confirm them before quoting. A line without a quantity cannot be priced."
              : "Anu never captured what they want. Start the callback by establishing the item and the quantity."}
          </Advisory>
        )}
        {call.callTotal > 1 && (
          <Advisory tone="success" icon="tick">
            {`This customer has called ${call.callTotal} times. Repeat callers convert far better than first-time ones, so treat this as a warm lead.`}
          </Advisory>
        )}
        {related.length > 0 && (
          <Advisory tone="info" icon="quote">
            {`Already quoted ${related.length} time${
              related.length === 1 ? "" : "s"
            }. Check that before writing another.`}
          </Advisory>
        )}

        {/* The band above the first panel: without it the head block runs
            straight into the actions with nothing to part them, while every
            later section is parted by one. */}
        <PanelBand />
        <Panel>
          <View style={styles.quickRow}>
            <QuickAction
              icon="call"
              label="Call"
              tone="blue"
              disabled={!phone}
              onPress={() => void callNumber(phone)}
            />
            <QuickAction
              icon="whatsapp"
              label="WhatsApp"
              tone="emerald"
              disabled={!phone}
              onPress={() => void whatsapp(phone)}
            />
            <QuickAction
              icon="mail"
              label="Email"
              disabled={!call.customer.email}
              onPress={() => void sendEmail(call.customer.email)}
            />
            <QuickAction icon="quote" label="Quote" tone="primary" onPress={createQuotation} />
          </View>
        </Panel>

        {/* The order as it stands after the last capture. */}
        <Panel title="What they want" padded>
          {call.itemsList.length ? (
            call.itemsList.map((it, i) => (
              <ItemRow
                key={`${it.product}-${i}`}
                product={it.product}
                note={it.notes}
                quantity={it.quantity}
                last={i === call.itemsList.length - 1}
              />
            ))
          ) : (
            <Text style={[textVariants.body, { color: t.textTertiary }]}>
              {call.productInterest || "Nothing specific was captured on this call."}
            </Text>
          )}
          {!!call.summary && (
            <Text selectable style={[textVariants.body, { color: t.textSecondary, marginTop: spacing.md }]}>
              {call.summary}
            </Text>
          )}
        </Panel>

        <Panel title="Contact" padded>
          <Pressable
            onLongPress={phone ? () => void copyValue(phone, "Number") : undefined}
            delayLongPress={320}
            disabled={!phone}
          >
            <Fact icon="call" label="Phone" value={phone ? prettyPhone(phone) : ""} important />
          </Pressable>
          <Fact icon="mail" label="Email" value={call.customer.email} />
          <Fact icon="company" label="Company" value={call.customer.company} />
          <Fact
            icon="address"
            label="Deliver to"
            value={call.customer.address}
            missing="Not captured, ask before quoting freight"
            important
          />
          <Fact icon="clock" label="Timeline" value={call.timeline} />
        </Panel>

        {/* The fold, made visible. Newest first, because the last capture is how
            the call actually ended. */}
        <Panel
          title="What Anu heard"
          meta={call.captures > 1 ? `${call.captures} updates` : undefined}
          padded
        >
          {call.rows.map((r, i) => (
            <View key={r.id} style={[styles.capture, { borderLeftColor: t.divider }]}>
              <View style={[styles.captureDot, { backgroundColor: i === 0 ? t.primary : t.borderStrong }]} />
              <View style={styles.captureHead}>
                <Text style={[textVariants.caption, { color: t.textTertiary }]}>
                  {formatDateTime(r.createdAt)}
                </Text>
                {i === 0 && call.rows.length > 1 && (
                  <View style={[styles.finalPill, { backgroundColor: t.iconWell }]}>
                    <Text style={[textVariants.chipText, { color: t.primary }]}>FINAL</Text>
                  </View>
                )}
              </View>
              <Text style={[textVariants.body, { color: t.text, marginTop: 2 }]}>
                {r.summary || "No summary recorded for this update."}
              </Text>
              {/* What this capture held, so a product added or dropped between
                  captures is visible rather than implied. */}
              {r.itemsList.length > 0 && (
                <Text style={[textVariants.caption, { color: t.textTertiary, marginTop: 3 }]}>
                  {r.itemsList.map((it) => [it.quantity, it.product].filter(Boolean).join(" x ")).join(" · ")}
                </Text>
              )}
              {!!r.timeline && (
                <Text style={[textVariants.caption, { color: t.textTertiary, marginTop: 1 }]}>
                  Timeline: {r.timeline}
                </Text>
              )}
              {i < call.rows.length - 1 && <View style={{ height: spacing.md }} />}
            </View>
          ))}
        </Panel>

        {/* The tape, under the paraphrase. What Anu wrote down is above; this is
            what the customer actually said. */}
        <CallRecordings call={call} />

        <Panel title="Record" padded>
          <Fact icon="voice" label="Captured by" value="Anu, the website voice assistant" />
          <Fact icon="clock" label="Call started" value={formatDateTime(call.startedAt)} />
          <Fact icon="clock" label="Last update" value={formatDateTime(call.endedAt)} />
          {!!call.reference && <Fact icon="copy" label="Reference" value={call.reference} />}
        </Panel>

        {related.length > 0 && (
          <>
            <Panel title="Quotations">
              {related.map((q, i) => (
                <Pressable
                  key={q.id}
                  onPress={() => navigation.navigate("QuotationDetail", { id: q.id })}
                  android_ripple={{ color: t.accentTint }}
                  style={[
                    styles.quoteRow,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.divider },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[textVariants.bodyStrong, { color: t.text }]}>{q.number}</Text>
                    <Text style={[textVariants.caption, { color: t.textTertiary }]}>
                      {relativeTime(q.createdAt)}
                    </Text>
                  </View>
                  <Text style={[textVariants.amount, { color: t.text }]}>
                    {formatCurrency(q.totals?.grandTotal || 0)}
                  </Text>
                  <StatusBadge list={QUOTATION_STATUS} id={q.status} small />
                </Pressable>
              ))}
            </Panel>
          </>
        )}

        {/* A folded call is several enquiry rows sharing a phone number, and
            this is the newest capture. A status change writes to every folded
            row, so this row's history speaks for the whole call. */}
        <RecordActivityPanel collection="enquiries" record={call} />
      </Animated.ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: t.surface,
            borderTopColor: t.border,
            paddingBottom: insets.bottom + spacing.sm,
          },
        ]}
      >
        {call.flags.support ? (
          <View style={styles.supportFooter}>
            <Icon name="warning" size={18} color={t.dangerText} variant="Bulk" />
            <Text style={[textVariants.small, { color: t.dangerText, flex: 1 }]}>
              Support first. Call them back before quoting.
            </Text>
            <Button
              label="Call"
              icon="call"
              size="sm"
              disabled={!phone}
              onPress={() => void callNumber(phone)}
            />
          </View>
        ) : (
          <Button label="Create quotation" icon="quote" onPress={createQuotation} fullWidth />
        )}
      </View>
    </View>
  )

  async function copyValue(value: string, what: string) {
    await copy(value)
    toast.show({ message: `${what} copied`, tone: "success" })
  }
}


const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { alignItems: "center", justifyContent: "center" },

  // The page below is white, so the bar needs the divider hairline to have an
  // edge at all. A header over a grey plane would not draw one.
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 2,
    borderBottomWidth: border.hairline,
  },
  barTitle: { flex: 1, marginHorizontal: 4 },

  // Full bleed: the page is a stack of panels, each drawing its own 2dp band
  // (ui/Panel.tsx). Loose content between them carries the gutter itself.
  content: { paddingTop: 0 },
  // The head block and the advisories are loose content on a full-bleed page,
  // so each carries the gutter itself.
  // The head block carries the gutter; the pieces inside it do not repeat it.
  pageBlock: { paddingHorizontal: gutter, paddingTop: spacing.md },
  name: { fontSize: 24, lineHeight: 30, fontFamily: font.bold },
  metaLine: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  pagePhone: { marginTop: 2 },
  stepperWrap: { marginTop: spacing.md, marginBottom: spacing.md },

  // The contact card's own row metrics: 6dp between four 76dp pills, centred.
  quickRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: gutter,
    paddingVertical: spacing.md,
  },

  capture: { borderLeftWidth: 1, paddingLeft: 14 },
  captureDot: {
    position: "absolute",
    left: -5,
    top: 5,
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  captureHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  finalPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },

  quoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: gutter,
    paddingVertical: 14,
  },

  footer: {
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  supportFooter: { flexDirection: "row", alignItems: "center", gap: 10 },
})
