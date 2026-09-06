import React from "react"
import { Animated, Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { formatCurrency, formatDateTime, formatNumber, relativeTime } from "@/domain/format"
import {
  enquiryAge,
  isQuoteEnquiry,
  parseQuoteRfq,
  rfqArtwork,
  rfqRateMismatches,
  rfqSummary,
  rfqToQuotationLines,
} from "@/domain/quoteRfq"
import {
  ENQUIRY_STATUS,
  QUOTATION_STATUS,
  newLine,
  statusMeta,
  type Enquiry,
  type Product,
  type Quotation,
} from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { callNumber, copy, email as sendEmail, prettyPhone, whatsapp } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { Button, Icon, IconButton, Panel, PanelBand, StatusBadge, useToast } from "@/ui"
import { Advisory, Fact, ItemRow, QuickAction, StatusStepper } from "@/features/leads/leadUi"

/**
 * One enquiry, read the way a salesperson reads one.
 *
 * An enquiry row is thin — a customer, a source, a status, and a `message` — but
 * the ones that matter are not: a "Quote calculator" enquiry carries a whole
 * structured order in `notes` (see `domain/quoteRfq.ts`), including artwork and
 * the rates the website stamped at submission. The console shows all of that;
 * the phone used to show four lines of text in a bottom sheet, which is why a
 * rep in the field could not tell a 50-piece sample from a 20,000-piece order
 * without ringing the office.
 *
 * The page answers, in this order: is there anything I must know before I ring
 * (advisories), who is this and how do I reach them, WHAT DID THEY ASK FOR —
 * priced from our own catalogue, never from the payload — what else is on the
 * record, and has this already been quoted. The pipeline sits under the name as
 * a stepper, so moving it along never costs a screen.
 */

const COLLAPSE = 72

export default function EnquiryDetailScreen({ route, navigation }: StackScreenProps<"EnquiryDetail">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { items } = useCollection<Enquiry>("enquiries")
  const { items: products } = useCollection<Product>("products")
  const { items: quotations } = useCollection<Quotation>("quotations")
  const scrollY = React.useRef(new Animated.Value(0)).current
  const [saving, setSaving] = React.useState(false)

  const enquiry = items.find((e) => e.id === route.params.id)

  const rfq = React.useMemo(() => parseQuoteRfq(enquiry), [enquiry])
  const summary = React.useMemo(() => (rfq ? rfqSummary(rfq.items, products) : null), [rfq, products])
  const mismatches = React.useMemo(() => (rfq ? rfqRateMismatches(rfq.items, products) : []), [rfq, products])
  const artwork = React.useMemo(() => rfqArtwork(enquiry), [enquiry])

  // Quotations raised off this enquiry, or off the same person. The console
  // matches a customer email-first then phone; the same rule here, so history
  // does not hide behind a differently-typed name.
  const related = React.useMemo(() => {
    if (!enquiry) return []
    const mail = (enquiry.customer?.email || "").trim().toLowerCase()
    const digits = (enquiry.customer?.phone || "").replace(/\D/g, "").slice(-10)
    return quotations.filter((q) => {
      if (q.enquiryId === enquiry.id) return true
      if (mail && (q.customer?.email || "").trim().toLowerCase() === mail) return true
      if (digits && (q.customer?.phone || "").replace(/\D/g, "").slice(-10) === digits) return true
      return false
    })
  }, [quotations, enquiry])

  if (!enquiry) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <Text style={{ color: t.textSecondary, fontFamily: font.medium }}>
          This enquiry no longer exists.
        </Text>
        <View style={{ marginTop: 14 }}>
          <Button label="Go back" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </View>
    )
  }

  const name = enquiry.customer?.name || enquiry.customer?.company || "Unnamed enquiry"
  const phone = enquiry.customer?.phone
  const mail = enquiry.customer?.email
  const age = enquiryAge(enquiry)
  const message = (enquiry.message || "").trim()
  const barTitleOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE * 0.6, COLLAPSE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  })

  const setStatus = async (status: string) => {
    setSaving(true)
    try {
      await repo.update("enquiries", enquiry.id, { status })
      feedback.created()
      toast.show({ message: `Marked ${statusMeta(ENQUIRY_STATUS, status).label}`, tone: "success" })
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not update"), tone: "danger" })
    } finally {
      setSaving(false)
    }
  }

  const toggleStar = async () => {
    try {
      await repo.update("enquiries", enquiry.id, { starred: !enquiry.starred })
      feedback.toggle(!enquiry.starred)
    } catch (e) {
      toast.show({ message: errorMessage(e, "Could not update"), tone: "danger" })
    }
  }

  // The whole order where the website sent one, otherwise the single product
  // interest — never an empty editor the rep has to retype the enquiry into.
  const createQuotation = () => {
    feedback.tap()
    navigation.navigate("QuotationEditor", {
      prefill: {
        customer: enquiry.customer,
        lines: rfq
          ? rfqToQuotationLines(rfq.items, products)
          : enquiry.productInterest
          ? [newLine({ description: enquiry.productInterest })]
          : undefined,
        notes: !rfq && message ? `Ref: ${message}` : undefined,
        enquiryId: enquiry.id,
      },
    })
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <View style={[styles.bar, { backgroundColor: t.surface, borderBottomColor: t.divider, paddingTop: insets.top }]}>
        <IconButton name="back" onPress={() => navigation.goBack()} accessibilityLabel="Back" />
        <Animated.Text
          numberOfLines={1}
          style={[styles.barTitle, textVariants.appBarTitleBack, { color: t.text, opacity: barTitleOpacity }]}
        >
          {name}
        </Animated.Text>
        <IconButton
          name="star"
          variant={enquiry.starred ? "Bold" : "Linear"}
          color={enquiry.starred ? t.warning : t.text}
          accessibilityLabel={enquiry.starred ? "Unstar enquiry" : "Star enquiry"}
          onPress={() => void toggleStar()}
        />
      </View>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
      >
        {/* Identity, then the pipeline. Both above the fold: who, and where.
            One block carrying the gutter, as on the quotation page — not five
            loose elements each remembering the inset for themselves. */}
        <View style={styles.pageBlock}>
          <Text style={[styles.name, { color: t.text }]}>{name}</Text>
          <View style={styles.metaLine}>
            <StatusBadge list={ENQUIRY_STATUS} id={enquiry.status} />
            <Text style={[textVariants.caption, { color: t.textTertiary }]}>
              {enquiry.source || "Unknown source"} · {age.label}
            </Text>
          </View>
          {!!enquiry.customer?.company && enquiry.customer.company !== name && (
            <Text style={[textVariants.body, { color: t.textSecondary, marginTop: 2 }]}>
              {enquiry.customer.company}
            </Text>
          )}

          <View style={styles.stepperWrap}>
            <StatusStepper status={enquiry.status} onChange={(s) => void setStatus(s)} disabled={saving} />
          </View>
        </View>

        {/* Advisories: what a person needs to know before they ring, in words. */}
        {age.overdue && (
          <Advisory tone="warning" icon="clock">
            {`This enquiry has been sitting as new for ${age.days} days. A same-week reply is most of why an enquiry converts at all.`}
          </Advisory>
        )}
        {artwork?.failed && (
          <Advisory tone="danger" icon="image">
            {`Their artwork (${artwork.fileName}) failed to upload. Ask them to resend it before promising a mockup.`}
          </Advisory>
        )}
        {mismatches.length > 0 && (
          <Advisory tone="warning" icon="warning">
            {mismatches.length === 1
              ? `The rate submitted for ${mismatches[0].name} does not match the catalogue. Prices come from the catalogue on the quotation, so check it before you commit to a figure.`
              : `${mismatches.length} items were submitted at rates that no longer match the catalogue. The quotation uses catalogue rates, so quote from those, not from what they saw.`}
          </Advisory>
        )}
        {related.length > 0 && (
          <Advisory tone="info" icon="quote">
            {`This customer already has ${related.length} quotation${
              related.length === 1 ? "" : "s"
            }. Check it before writing another.`}
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
              tone="amber"
              disabled={!mail}
              onPress={() => void sendEmail(mail)}
            />
            <QuickAction icon="quote" label="Quote" tone="primary" onPress={createQuotation} />
          </View>
        </Panel>

        {/* WHAT THEY ASKED FOR. The website sends items and quantities only, so
            the money here is ours: catalogue rates, and honest about how much of
            the order it could actually price. */}
        <Panel title="What they asked for" padded>
          {rfq && summary ? (
            <>
              <View style={styles.totals}>
                <Total label="Lines" value={String(summary.lines)} />
                <Total label="Units" value={formatNumber(summary.units)} />
                <Total
                  label="At our rates"
                  value={summary.value ? formatCurrency(summary.value, { compact: true }) : "-"}
                />
              </View>
              <View style={styles.items}>
                {rfq.items.map((it, i) => (
                  <ItemRow
                    key={`${it.productId || it.sku || it.name}-${i}`}
                    product={it.name || "Custom item"}
                    note={[it.sku, it.category].filter(Boolean).join(" · ") || "Not in the catalogue"}
                    quantity={`${formatNumber(it.quantity)} ${it.unit || "pcs"}`}
                    last={i === rfq.items.length - 1}
                  />
                ))}
              </View>
              <Text style={[textVariants.caption, { color: t.textTertiary, marginTop: spacing.sm }]}>
                {summary.priced === summary.lines
                  ? "Valued at current catalogue rates, before GST. The website never sends prices."
                  : `Only ${summary.priced} of ${summary.lines} lines matched a catalogue product, so this value is partial.`}
              </Text>
            </>
          ) : message ? (
            <Text selectable style={[textVariants.body, { color: t.text }]}>
              {message}
            </Text>
          ) : (
            <Text style={[textVariants.body, { color: t.textTertiary }]}>
              No message was sent with this enquiry.
            </Text>
          )}

          {!!artwork && !artwork.failed && (
            <View style={[styles.artwork, { backgroundColor: t.successBg }]}>
              <Icon name="image" size={18} color={t.success} variant="Bulk" />
              <Text style={[textVariants.smallStrong, { color: t.success, flex: 1 }]}>
                Artwork attached: {artwork.fileName}
              </Text>
            </View>
          )}
        </Panel>

        <Panel title="Contact" padded>
          <Pressable
            onLongPress={phone ? () => void copyPhone(phone) : undefined}
            delayLongPress={320}
            disabled={!phone}
          >
            <Fact icon="call" label="Phone" value={phone ? prettyPhone(phone) : ""} important />
          </Pressable>
          <Fact icon="mail" label="Email" value={mail} />
          <Fact icon="company" label="Company" value={enquiry.customer?.company} />
          <Fact
            icon="address"
            label="Deliver to"
            value={enquiry.customer?.address}
            missing="Not captured, ask before quoting freight"
            important
          />
          <Fact icon="gst" label="GSTIN" value={enquiry.customer?.gstin} />
        </Panel>

        <Panel title="Record" padded>
          <Fact icon="enquiry" label="Source" value={enquiry.source} />
          <Fact icon="product" label="Interested in" value={enquiry.productInterest} />
          <Fact icon="clock" label="Received" value={formatDateTime(enquiry.createdAt)} />
          <Fact icon="customer" label="Owner" value={enquiry.owner} missing="Unassigned" />
          {!!enquiry.reference && <Fact icon="copy" label="Reference" value={enquiry.reference} />}
          {/* An RFQ's notes are the machine payload, not something to read. */}
          {!isQuoteEnquiry(enquiry) && !!enquiry.notes?.trim() && (
            <Fact icon="edit" label="Internal notes" value={enquiry.notes} />
          )}
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
        <Button label="Create quotation" icon="quote" onPress={createQuotation} fullWidth />
      </View>
    </View>
  )

  async function copyPhone(value: string) {
    await copy(value)
    toast.show({ message: "Number copied", tone: "success" })
  }
}

function Total({ label, value }: { label: string; value: string }) {
  const t = useTheme()
  return (
    <View style={[styles.total, { backgroundColor: t.surfaceInset }]}>
      <Text numberOfLines={1} style={[textVariants.factValue, { color: t.text }]}>
        {value}
      </Text>
      <Text style={[textVariants.caption, { color: t.textTertiary }]}>{label}</Text>
    </View>
  )
}

/** The header's bottom rule: 1dp of `divider` (#F4F6F8). */
const HEADER_RULE = 1

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
    borderBottomWidth: HEADER_RULE,
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
  stepperWrap: { marginTop: spacing.md, marginBottom: spacing.md },

  // The contact card's own row metrics: 6dp between four 76dp pills, centred.
  quickRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: gutter,
    paddingVertical: spacing.md,
  },

  totals: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  total: { flex: 1, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 12 },
  items: { marginTop: spacing.xs },
  artwork: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.md,
    padding: 10,
    borderRadius: radius.card,
  },

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
})
