import React from "react"
import { Animated, Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { daysUntil, formatCurrency, formatDate } from "@/domain/format"
import { stateLabel } from "@/domain/gstStates"
import { LOST_REASONS, QUOTATION_STATUS, statusMeta, type Quotation } from "@/domain/schema"
import { useSettings } from "@/hooks/useSettings"
import { callNumber, prettyPhone, whatsapp } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import { printQuotation, shareQuotationOnWhatsApp, shareQuotationPdf } from "@/lib/pdf"
import QuotationPreview from "@/features/quotations/QuotationPreview"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import type { StatusTone } from "@/theme/theme"
import { border, gutter, size as sizes, spacing } from "@/theme/tokens"
import { font } from "@/theme/typography"
import { Button, Dialog, Icon, IconButton, PopupMenu, RecordActivityPanel, Sheet, Spinner, useToast } from "@/ui"
import type { IconName } from "@/ui/Icon"

/**
 * One quotation, read the way a salesperson reads one.
 *
 * The order is the order of the questions asked in front of a customer: WHO is it
 * for and what is it worth (the hero), how do I reach them right now (the action
 * row), what is on it, what does it add up to, where is it going, what did we
 * promise. The one thing they came to do — send it — is a fixed footer, always
 * reachable however far down they are.
 *
 * WHITE, RULED, NOT CARDED. The old page floated white cards on a grey plane,
 * which spent a border, a shadow-free edge and 16dp of gutter on every group and
 * left every section looking equally important. This is one white sheet divided
 * by hairlines and type, so weight can be spent where it means something: the
 * amount, the status, the grand total. It reads like the document it represents
 * rather than like a settings screen.
 *
 * Four judgements worth keeping:
 *   · The CUSTOMER is the headline, not the number. Nobody opens a quotation
 *     wondering which serial it was; they open it knowing whose it is.
 *   · STATUS IS A CONTROL, not a badge. Changing it is the second most common
 *     act here after sharing, so the pill itself opens the picker and carries a
 *     chevron to say so. It was a text link under the totals.
 *   · VALIDITY IS COUNTED for the reader — "3 days left", ambering then reddening
 *     — rather than printing a date they have to subtract from.
 *   · PRINT APPEARS ONCE. It was in the header AND the action row before.
 *
 * The header carries no title until you scroll: the hero already says whose
 * quotation this is at full size, and a duplicate 17dp copy of it 60dp higher is
 * noise. Past the hero it fades in, so a half-read page still says where you are.
 */

/** A quote inside this many days of expiry is worth flagging before it lapses. */
const EXPIRING_SOON = 3
/** Scroll distance over which the compact header title takes over from the hero. */
const TITLE_HANDOVER = 90

export default function QuotationDetailScreen({ route, navigation }: StackScreenProps<"QuotationDetail">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { settings } = useSettings()
  // Deleting is ADMIN ONLY, and the DATABASE enforces it:
  // Ortex.Admin/supabase/migrations/0022_admin_only_quotation_delete.sql splits
  // 0007's `staff_quotations` `for all` policy into read/insert/update on
  // has_module_access('quotations') plus a separate admin_quotations_delete on
  // is_admin(). This check is the second line of defence — it hides a control a
  // non-admin cannot use anyway, rather than being the only thing standing
  // between them and a hole in the quotation number series.
  const { profile } = useAuth()
  const isAdmin = profile?.role === "admin"
  const [doc, setDoc] = React.useState<Quotation | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [statusOpen, setStatusOpen] = React.useState(false)
  const [lostOpen, setLostOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [sharing, setSharing] = React.useState(false)
  const scrollY = React.useRef(new Animated.Value(0)).current

  const load = React.useCallback(async () => {
    try {
      setDoc(await repo.get<Quotation>("quotations", route.params.id))
    } catch (e) {
      toast.show({ message: errorMessage(e, "Could not load the quotation"), tone: "danger" })
    } finally {
      setLoading(false)
    }
  }, [route.params.id, toast])

  React.useEffect(() => {
    void load()
    return repo.subscribe(() => void load(), "quotations")
  }, [load])

  const setStatus = async (status: string, lostReason?: string) => {
    if (!doc) return
    setStatusOpen(false)
    setLostOpen(false)
    try {
      // A plain status change never touches lines or totals, so it goes straight
      // through repo rather than the recomputing updateQuotation.
      await repo.update("quotations", doc.id, lostReason ? { status, lostReason } : { status })
      feedback.created()
      toast.show({ message: `Marked ${status}`, tone: "success" })
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not update"), tone: "danger" })
    }
  }

  const remove = async () => {
    if (!doc) return
    setDeleting(true)
    try {
      await repo.remove("quotations", doc.id)
      feedback.created()
      toast.show({ message: `${doc.number} deleted`, tone: "success" })
      // Leave BEFORE the realtime tick arrives: this screen loads by id, and
      // staying would put it on a row that no longer exists.
      navigation.goBack()
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not delete the quotation"), tone: "danger" })
    } finally {
      setConfirmDelete(false)
      setDeleting(false)
    }
  }

  const share = async () => {
    if (!doc) return
    setSharing(true)
    try {
      // Straight into the customer's own WhatsApp thread when we hold a number:
      // no share sheet, no contact picker. `shareQuotationOnWhatsApp` reports
      // false rather than throwing when WhatsApp is missing or declines the
      // intent, and the system share sheet is the fallback — the send still has
      // to be possible on a phone without WhatsApp.
      const sent =
        !!doc.customer?.phone && (await shareQuotationOnWhatsApp(doc, settings, doc.customer.phone, pitch))
      if (!sent) await shareQuotationPdf(doc, settings)
      // Sending is what "sent" means, so the status follows the action rather
      // than waiting for someone to remember to set it.
      if (doc.status === "draft") await repo.update("quotations", doc.id, { status: "sent" })
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not build the PDF"), tone: "danger" })
    } finally {
      setSharing(false)
    }
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: t.surface }]}>
        <Spinner label="Loading quotation" />
      </View>
    )
  }

  if (!doc) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: t.surface, paddingTop: insets.top }]}>
        <Text style={{ color: t.textSecondary, fontFamily: font.medium }}>
          This quotation no longer exists.
        </Text>
        <View style={{ marginTop: 14 }}>
          <Button label="Go back" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </View>
    )
  }

  const totals = doc.totals
  const phone = doc.customer?.phone
  const hasPhone = !!String(phone || "").replace(/\D/g, "")
  const lines = doc.lines || []
  const left = doc.validUntil ? daysUntil(doc.validUntil) : null
  const validity = validityNote(doc.validUntil, doc.issueDate, left)
  const status = statusMeta(QUOTATION_STATUS, doc.status)
  const who = doc.customer?.company || doc.customer?.name || "-"
  const pitch = `Hello${doc.customer?.name ? ` ${doc.customer.name}` : ""}, here is quotation ${
    doc.number
  } for ${formatCurrency(totals?.grandTotal || 0)}. ${settings.company.name}`

  // Both header layers ride one scroll value, so the rule and the title can never
  // disagree about whether the hero has left the screen.
  const headerShift = scrollY.interpolate({
    inputRange: [TITLE_HANDOVER * 0.4, TITLE_HANDOVER],
    outputRange: [0, 1],
    extrapolate: "clamp",
  })

  return (
    <View style={[styles.root, { backgroundColor: t.surface }]}>
      <View style={[styles.head, { paddingTop: insets.top, height: insets.top + sizes.appBar }]}>
        <IconButton name="back" onPress={() => navigation.goBack()} accessibilityLabel="Back" />
        <Animated.Text numberOfLines={1} style={[styles.headTitle, { color: t.text, opacity: headerShift }]}>
          {who}
        </Animated.Text>
        <IconButton
          name="edit"
          onPress={() => navigation.navigate("QuotationEditor", { id: doc.id })}
          accessibilityLabel="Edit quotation"
        />
        <IconButton
          name="more"
          onPress={() => {
            feedback.tap()
            setMenuOpen(true)
          }}
          accessibilityLabel="More actions"
        />
        <Animated.View
          pointerEvents="none"
          // Always drawn: the page under this bar is white, and a white bar over
          // a white page has no edge without the divider hairline.
          style={[styles.headRule, { backgroundColor: t.divider }]}
        />
      </View>

      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 116 }]}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
      >
        {/* The head block is loose content on a full-bleed page, so it carries
            the gutter itself. */}
        <View style={styles.pageBlock}>
          {/* WHO it is for, WHAT it is worth, and whether it is still live — the
            three things asked before anything is tapped. */}
          <Text style={[styles.eyebrow, { color: t.textTertiary }]}>
            {doc.number} · Issued {formatDate(doc.issueDate)}
          </Text>
          <Text style={[styles.who, { color: t.text }]}>{who}</Text>
          {!!(doc.customer?.company && doc.customer?.name) && (
            <Text style={[styles.whoSub, { color: t.textSecondary }]}>{doc.customer.name}</Text>
          )}
          {/* The number sits WITH the name rather than only in Bill to: it is who
            you are about to ring, not a tax detail, and it should not need a
            scroll past the totals to find. Tapping it dials. */}
          {hasPhone && (
            <Pressable
              onPress={() => void callNumber(phone)}
              accessibilityRole="button"
              accessibilityLabel={`Call ${prettyPhone(phone)}`}
              style={({ pressed }) => [styles.whoPhoneRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="call" size={14} color={t.primary} variant="Bulk" />
              <Text style={[styles.whoPhone, { color: t.primary }]}>{prettyPhone(phone)}</Text>
            </Pressable>
          )}
          <Text style={[styles.amount, { color: t.text }]}>{formatCurrency(totals?.grandTotal || 0)}</Text>
          <Text style={[styles.amountNote, { color: t.textTertiary }]}>
            {totals?.interState ? "Inclusive of IGST" : "Inclusive of CGST + SGST"}
          </Text>

          <View style={styles.pills}>
            {/* The status pill IS the status picker. */}
            <Pressable
              onPress={() => {
                feedback.tap()
                setStatusOpen(true)
              }}
              accessibilityRole="button"
              accessibilityLabel={`Status ${status.label}. Change`}
              style={({ pressed }) => [
                styles.pill,
                { backgroundColor: t.tones[status.tone].bg, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.pillText, { color: t.tones[status.tone].fg }]}>{status.label}</Text>
              <Icon name="down" size={14} color={t.tones[status.tone].fg} />
            </Pressable>

            <View style={[styles.pill, { backgroundColor: t.tones[validity.tone].bg }]}>
              <Icon name="clock" size={13} color={t.tones[validity.tone].fg} variant="Bulk" />
              <Text style={[styles.pillText, { color: t.tones[validity.tone].fg }]}>{validity.label}</Text>
            </View>
          </View>

          {/* Reaching the customer, one thumb-reach in. Quiet wells rather than
            saturated pills: on a white sheet the amount should be the loudest
            thing, and four solid colours next to it flatten that. */}
          <View style={styles.actions}>
            <QuickAction
              icon="call"
              label="Call"
              tone="blue"
              disabled={!hasPhone}
              onPress={() => void callNumber(phone)}
            />
            <QuickAction
              icon="whatsapp"
              label="WhatsApp"
              tone="emerald"
              disabled={!hasPhone}
              onPress={() => void whatsapp(phone, pitch)}
            />
            <QuickAction
              icon="print"
              label="Print"
              tone="violet"
              onPress={() => void printQuotation(doc, settings)}
            />
            {/* The document itself, before it goes anywhere. */}
            <QuickAction
              icon="preview"
              label="Preview"
              tone="slate"
              onPress={() => {
                feedback.tap()
                setPreviewOpen(true)
              }}
            />
          </View>
        </View>

        <SectionTitle text={lines.length ? `Items · ${lines.length}` : "Items"} />
        {lines.map((line, i) => {
          const computed = totals?.lines?.[i]
          return (
            // eslint-disable-next-line react/no-array-index-key -- lines are positional
            <View key={i} style={[styles.row, i > 0 && { borderTopColor: t.divider, borderTopWidth: RULE }]}>
              <View style={styles.rowBody}>
                <Text style={[styles.lineName, { color: t.text }]}>{line.description || "Item"}</Text>
                <View style={styles.lineMeta}>
                  <Text style={[styles.lineQty, { color: t.textSecondary }]}>
                    {line.quantity} {line.unit} × {formatCurrency(line.rate)}
                  </Text>
                  <Text style={[styles.lineTag, { color: t.textTertiary }]}>{line.gstRate}% GST</Text>
                  {!!line.discountPercent && (
                    <Text style={[styles.lineTag, { color: t.success }]}>{line.discountPercent}% off</Text>
                  )}
                </View>
              </View>
              <Text style={[styles.lineAmount, { color: t.text }]}>
                {formatCurrency(computed?.taxable ?? 0)}
              </Text>
            </View>
          )
        })}
        {!lines.length && (
          <Text style={[styles.empty, { color: t.textTertiary }]}>
            No itemised lines. This quotation carries totals only.
          </Text>
        )}

        <SectionTitle text="Summary" />
        <TotalRow label="Subtotal" value={formatCurrency(totals?.subTotal)} />
        {(totals?.totalDiscount || 0) > 0 && (
          <TotalRow label="Discount" value={`-${formatCurrency(totals?.totalDiscount)}`} tone="success" />
        )}
        {totals?.interState ? (
          <TotalRow label="IGST" value={formatCurrency(totals?.igst)} />
        ) : (
          <>
            <TotalRow label="CGST" value={formatCurrency(totals?.cgst)} />
            <TotalRow label="SGST" value={formatCurrency(totals?.sgst)} />
          </>
        )}
        {!!totals?.roundOff && <TotalRow label="Round off" value={formatCurrency(totals.roundOff)} />}
        {/* The one number read aloud. A rule above it and a size step are enough
            to separate it — it does not need a tinted strip to be found. */}
        <View style={[styles.grand, { borderTopColor: t.borderStrong }]}>
          <Text style={[styles.grandLabel, { color: t.textSecondary }]}>Grand total</Text>
          <Text style={[styles.grandValue, { color: t.text }]}>{formatCurrency(totals?.grandTotal)}</Text>
        </View>

        <SectionTitle text="Bill to" />
        {!!doc.customer?.gstin && <Fact icon="gst" label="GSTIN" value={doc.customer.gstin} />}
        <Fact
          icon="address"
          label="Place of supply"
          value={stateLabel(doc.shipTo?.stateCode || doc.customer?.stateCode) || "Not set"}
          hint={totals?.interState ? "Taxed as IGST" : "Taxed as CGST + SGST"}
        />

        {!!doc.notes && (
          <>
            <SectionTitle text="Notes" />
            <Text style={[styles.body, { color: t.textSecondary }]}>{doc.notes}</Text>
          </>
        )}
        {!!doc.terms && (
          <>
            <SectionTitle text="Terms" />
            <Text style={[styles.body, { color: t.textTertiary }]}>{doc.terms}</Text>
          </>
        )}

        {/* Who raised this quotation and who changed it since — the question a
            disputed rate always comes down to. `bare` because this page is a
            receipt of ruled rows, not a stack of panels. */}
        <SectionTitle text="Activity" />
        <RecordActivityPanel collection="quotations" record={doc} bare />
      </Animated.ScrollView>

      <View
        style={[
          styles.footer,
          { backgroundColor: t.surface, borderTopColor: t.divider, paddingBottom: insets.bottom + 12 },
        ]}
      >
        {doc.status === "draft" && (
          <Text style={[styles.footNote, { color: t.textTertiary }]}>Sharing marks this quotation sent.</Text>
        )}
        <Button
          label={sharing ? "Preparing…" : "Share quotation"}
          icon="share"
          onPress={share}
          loading={sharing}
          fullWidth
        />
      </View>

      <PopupMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        top={insets.top + sizes.appBar - 4}
        items={[
          {
            key: "print",
            label: "Print",
            icon: "print",
            onPress: () => {
              setMenuOpen(false)
              void printQuotation(doc, settings)
            },
          },
          {
            key: "preview",
            label: "Preview",
            icon: "preview",
            onPress: () => {
              setMenuOpen(false)
              setPreviewOpen(true)
            },
          },
          {
            key: "status",
            label: "Change status",
            icon: "tick",
            onPress: () => {
              setMenuOpen(false)
              setStatusOpen(true)
            },
          },
          // Last in the menu and destructive: the irreversible item never sits
          // where a thumb lands on the way to something else.
          ...(isAdmin
            ? [
                {
                  key: "delete",
                  label: "Delete quotation",
                  icon: "trash" as const,
                  destructive: true,
                  onPress: () => {
                    setMenuOpen(false)
                    setConfirmDelete(true)
                  },
                },
              ]
            : []),
        ]}
      />

      <Dialog
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this quotation?"
        message={`${doc.number} and its line items are removed for everyone. This cannot be undone.`}
        actions={[
          { label: "Cancel", onPress: () => setConfirmDelete(false) },
          { label: deleting ? "Deleting…" : "Delete", tone: "danger", onPress: () => void remove() },
        ]}
      />

      <QuotationPreview
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        doc={doc}
        settings={settings}
      />

      <Sheet visible={statusOpen} onClose={() => setStatusOpen(false)} title="Quotation status">
        {QUOTATION_STATUS.map((s) => (
          <Pressable
            key={s.id}
            onPress={() =>
              s.id === "rejected" ? (setStatusOpen(false), setLostOpen(true)) : void setStatus(s.id)
            }
            android_ripple={{ color: t.accentTint }}
            style={styles.sheetRow}
          >
            <View style={[styles.dot, { backgroundColor: t.tones[s.tone].fg }]} />
            <Text
              style={[
                styles.sheetLabel,
                { color: t.text, fontFamily: s.id === doc.status ? font.semibold : font.regular },
              ]}
            >
              {s.label}
            </Text>
            {s.id === doc.status && <Icon name="tick" size={20} color={t.primary} variant="Bulk" />}
          </Pressable>
        ))}
      </Sheet>

      {/* Every loss is captured with a reason, so the console's lost-reason
          report stays honest whether the quote was rejected at a desk or here. */}
      <Sheet visible={lostOpen} onClose={() => setLostOpen(false)} title="Why was it rejected?">
        {LOST_REASONS.map((reason) => (
          <Pressable
            key={reason}
            onPress={() => void setStatus("rejected", reason)}
            android_ripple={{ color: t.accentTint }}
            style={styles.sheetRow}
          >
            <Text style={[styles.sheetLabel, { color: t.text }]}>{reason}</Text>
          </Pressable>
        ))}
      </Sheet>
    </View>
  )
}

/**
 * "Valid until 20 Sep" makes the reader do the subtraction. This does it for
 * them, and carries the tone that goes with the answer.
 */
function validityNote(
  validUntil: string | undefined,
  issueDate: string | undefined,
  left: number | null,
): { label: string; tone: StatusTone } {
  if (!validUntil || left == null) return { label: `Issued ${formatDate(issueDate)}`, tone: "slate" }
  if (left < 0) return { label: `Expired ${formatDate(validUntil)}`, tone: "rose" }
  if (left === 0) return { label: "Expires today", tone: "rose" }
  if (left <= EXPIRING_SOON) return { label: `${left} day${left === 1 ? "" : "s"} left`, tone: "amber" }
  return { label: `Valid to ${formatDate(validUntil)}`, tone: "emerald" }
}

/**
 * On a white sheet a section is a rule and a word, not a card. The rule is the
 * heavier `border` rather than the row `divider`, so a new section reads as a
 * stronger break than the hairline between two items inside one.
 */
function SectionTitle({ text }: { text: string }) {
  const t = useTheme()
  return (
    <View style={[styles.sectionHead, { borderTopColor: t.border }]}>
      <Text style={[styles.sectionText, { color: t.textTertiary }]}>{text.toUpperCase()}</Text>
    </View>
  )
}

/** A tinted well with the glyph in its own tone — quiet enough to sit under the amount. */
function QuickAction({
  icon,
  label,
  onPress,
  disabled,
  tone,
}: {
  icon: IconName
  label: string
  onPress: () => void
  disabled?: boolean
  tone: StatusTone
}) {
  const t = useTheme()
  const { fg, bg } = t.tones[tone]
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.action, { opacity: disabled ? 0.35 : pressed ? 0.65 : 1 }]}
    >
      <View style={[styles.actionWell, { backgroundColor: bg }]}>
        <Icon name={icon} size={22} color={fg} variant="Bulk" />
      </View>
      <Text numberOfLines={1} style={[styles.actionLabel, { color: t.text }]}>
        {label}
      </Text>
    </Pressable>
  )
}

/** A labelled fact, label over value. */
function Fact({
  icon,
  label,
  value,
  hint,
  onPress,
}: {
  icon: IconName
  label: string
  value: string
  hint?: string
  onPress?: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={onPress ? { color: t.accentTint } : undefined}
      style={({ pressed }) => [styles.fact, { opacity: pressed && onPress ? 0.7 : 1 }]}
    >
      <Icon name={icon} size={20} color={t.textTertiary} variant="Bulk" />
      <View style={styles.factBody}>
        <Text style={[styles.factLabel, { color: t.textTertiary }]}>{label}</Text>
        <Text style={[styles.factValue, { color: t.text }]}>{value}</Text>
        {!!hint && <Text style={[styles.factHint, { color: t.textTertiary }]}>{hint}</Text>}
      </View>
      {onPress && <Icon name="forward" size={16} color={t.textTertiary} />}
    </Pressable>
  )
}

function TotalRow({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  const t = useTheme()
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, { color: t.textSecondary }]}>{label}</Text>
      <Text style={[styles.totalValue, { color: tone === "success" ? t.success : t.text }]}>{value}</Text>
    </View>
  )
}

const RULE = StyleSheet.hairlineWidth


const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { alignItems: "center", justifyContent: "center" },

  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 2 },
  headTitle: { flex: 1, marginHorizontal: 6, fontSize: 17, fontFamily: font.semibold },
  // 1dp, not `StyleSheet.hairlineWidth`: a hairline is 0.33dp on a 3x phone, one
  // physical pixel of `divider`, which is invisible in the hand.
  headRule: { position: "absolute", left: 0, right: 0, bottom: 0, height: border.hairline },

  // Full bleed: each section head draws the 2dp band that parts it from the one
  // above (the app panel language, ui/Panel.tsx), so only the rows carry the
  // gutter.
  content: { paddingTop: 0 },
  // The head block opens the page, so it breathes below the app bar rather than
  // starting flush against its rule — the same 16dp the lead detail pages use.
  pageBlock: { paddingHorizontal: gutter, paddingTop: spacing.md },

  eyebrow: { fontSize: 12, letterSpacing: 0.4, fontFamily: font.medium },
  who: { marginTop: 6, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, fontFamily: font.bold },
  whoSub: { marginTop: 2, fontSize: 14, fontFamily: font.regular },
  whoPhoneRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  whoPhone: { fontSize: 14, fontFamily: font.semibold },
  amount: { marginTop: 14, fontSize: 36, letterSpacing: -1.2, fontFamily: font.extrabold },
  amountNote: { marginTop: 2, fontSize: 12, fontFamily: font.regular },

  pills: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 999,
  },
  pillText: { fontSize: 12.5, fontFamily: font.semibold },

  // Space-between rather than a fixed gap: at four actions a 24dp gap plus four
  // 64dp columns is 328dp, which is the whole 360dp screen less the gutters — one
  // more action, or a wider phone, and a fixed gap would either clip or look
  // arbitrary. This lets the row breathe on a big screen and tighten on a small one.
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  action: { alignItems: "center", width: 64 },
  actionWell: { width: 52, height: 52, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  actionLabel: { marginTop: 7, fontSize: 12, fontFamily: font.medium },

  sectionHead: {
    marginTop: spacing.lg,
    paddingHorizontal: gutter,
    paddingTop: gutter,
    paddingBottom: 6,
    borderTopWidth: 2,
  },
  sectionText: { fontSize: 11.5, letterSpacing: 0.6, fontFamily: font.semibold },

  row: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: gutter, paddingVertical: 13 },
  rowBody: { flex: 1, marginRight: 12 },
  lineName: { fontSize: 15, lineHeight: 20, fontFamily: font.semibold },
  lineMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 },
  lineQty: { fontSize: 13, fontFamily: font.medium },
  lineTag: { fontSize: 12, fontFamily: font.medium },
  lineAmount: { fontSize: 15, fontFamily: font.bold },
  empty: { paddingVertical: 14, fontSize: 14, lineHeight: 20, fontFamily: font.regular },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: gutter,
    paddingVertical: 6,
  },
  totalLabel: { fontSize: 14, fontFamily: font.regular },
  totalValue: { fontSize: 14.5, fontFamily: font.medium },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginHorizontal: gutter,
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: RULE,
  },
  grandLabel: { fontSize: 13, letterSpacing: 0.3, fontFamily: font.semibold },
  grandValue: { fontSize: 22, letterSpacing: -0.6, fontFamily: font.extrabold },

  fact: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter, paddingVertical: 13 },
  factBody: { flex: 1, marginLeft: 14, minWidth: 0 },
  factLabel: { fontSize: 12, letterSpacing: 0.3, fontFamily: font.medium },
  factValue: { marginTop: 2, fontSize: 15.5, fontFamily: font.medium },
  factHint: { marginTop: 2, fontSize: 12, fontFamily: font.regular },

  body: { fontSize: 14, lineHeight: 21, paddingHorizontal: gutter, fontFamily: font.regular },

  footer: {
    paddingHorizontal: gutter,
    paddingTop: 12,
    borderTopWidth: RULE,
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  footNote: { marginBottom: 8, fontSize: 12, textAlign: "center", fontFamily: font.regular },

  sheetRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 6 },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 12 },
  sheetLabel: { flex: 1, fontSize: 16 },
})
