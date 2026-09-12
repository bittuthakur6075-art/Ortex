import React from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { formatCurrency, formatDate } from "@/domain/format"
import { stateLabel } from "@/domain/gstStates"
import { computeDocument } from "@/domain/pricing"
import {
  createQuotation,
  emptyDraft,
  isInterState,
  markEnquiryQuoted,
  placeOfSupplyState,
  updateQuotation,
  validUntilFor,
  type QuotationDraft,
} from "@/domain/quotations"
import { newCustomer, type Line, type Quotation } from "@/domain/schema"
import CustomerPickerSheet from "@/features/quotations/CustomerPickerSheet"
import LineItemSheet from "@/features/quotations/LineItemSheet"
import StatePickerSheet from "@/features/quotations/StatePickerSheet"
import {
  clearStoredDraft,
  draftHasContent,
  readStoredDraft,
  usePersistedDraft,
} from "@/features/quotations/useQuotationDraft"
import { useSettings } from "@/hooks/useSettings"
import { prettyPhone } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { border, gutter, radius, size as sizes, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  Avatar,
  Button,
  Chip,
  Dialog,
  Divider,
  Icon,
  IconButton,
  Switch,
  TextField,
  useToast,
} from "@/ui"
import KeyboardAwareScrollView from "@/ui/KeyboardAwareScrollView"

/**
 * Make a quotation.
 *
 * REDESIGNED around what the job actually is. A quotation has exactly two
 * required parts — WHO it is for and WHAT is on it — and about a dozen optional
 * ones. The previous screen gave them equal billing: a seven-field customer form
 * sat permanently open between the picker and the items, so the thing a
 * salesperson opens this screen to do was two screenfuls down, under a wall of
 * boxes they had already filled by picking the customer.
 *
 * Now the screen reads as three answers and a receipt:
 *
 *   WHO   — the picker, then the details INLINE under a card head that names
 *           who this is for. The details stay on this page rather than moving
 *           into a sheet: they belong to the quotation being written, and
 *           checking a GSTIN mid-quote should not be a modal round trip. The
 *           place of supply is tinted as a warning while unset, because it
 *           silently decides the tax split.
 *   WHAT  — the items, each a row with its own maths, and one unmissable way to
 *           add another.
 *   HOW MUCH — a receipt whose first line says the tax treatment in words, so
 *           "IGST" is never a surprise at the bottom of a PDF.
 *
 * The footer carries the grand total at all times — it is the number being
 * watched while typing — and, when the quotation cannot be saved yet, says which
 * of the two required parts is missing INSTEAD of the total. Validation that
 * appears as a toast after you press the button is validation that arrived too
 * late.
 *
 * The maths is untouched: `computeDocument` recomputes on every keystroke exactly
 * as the console's `liveDoc` memo does, and saving still goes through the ported
 * `createQuotation` / `updateQuotation`.
 *
 * KEYBOARD: the form scrolls in a `KeyboardAwareScrollView`, which lifts the
 * focused field above the keyboard and reserves the footer's height beneath the
 * content. `adjustResize` alone (the manifest's setting) shrinks the window but
 * never moves the field you are typing in.
 */

/** The validity periods worth one tap; anything else is typed. */
const VALIDITY_PRESETS = [7, 15, 30]

export default function QuotationEditorScreen({ route, navigation }: StackScreenProps<"QuotationEditor">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { settings, loading: settingsLoading, error: settingsError } = useSettings()
  const { profile } = useAuth()

  const editingId = route.params?.id
  const prefill = route.params?.prefill

  const [draft, setDraft] = React.useState<QuotationDraft>(() => emptyDraft(settings))
  const [seeded, setSeeded] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [customerOpen, setCustomerOpen] = React.useState(false)
  // Picking "New customer" hands back a BLANK customer, so the form cannot be
  // gated on hasCustomer alone — that check would stay false and the picker
  // would close onto a card with nothing in it.
  const [customerFormOpen, setCustomerFormOpen] = React.useState(false)
  const [stateOpen, setStateOpen] = React.useState<"customer" | "shipTo" | null>(null)
  const [editingLine, setEditingLine] = React.useState<{ index: number; line: Line | null } | null>(null)
  const [showTerms, setShowTerms] = React.useState(false)
  const [resumeOffer, setResumeOffer] = React.useState<QuotationDraft | null>(null)
  const [confirmLeave, setConfirmLeave] = React.useState(false)

  // Seed once the settings row has arrived: `validityDays` and the default terms
  // both come from it, and seeding earlier would bake in the fallbacks.
  React.useEffect(() => {
    if (seeded || settingsLoading) return

    const run = async () => {
      if (editingId) {
        const existing = await repo.get<Quotation>("quotations", editingId)
        if (existing) {
          setDraft({
            id: existing.id,
            customer: existing.customer,
            shipTo: existing.shipTo,
            lines: existing.lines || [],
            extraDiscountPercent: existing.extraDiscountPercent || 0,
            paymentTerms: existing.paymentTerms || "",
            issueDate: existing.issueDate,
            validityDays: existing.validityDays ?? settings.quotation.validityDays,
            notes: existing.notes || "",
            terms: existing.terms || "",
            status: existing.status,
            lostReason: existing.lostReason || "",
            enquiryId: existing.enquiryId,
            leadId: existing.leadId,
            // Editing keeps the name the quotation was RAISED under. Re-stamping
            // it with whoever opened the record would quietly reassign a sent
            // document to a different rep.
            sellerName: existing.sellerName || "",
            showSeller: existing.showSeller !== false,
          })
        }
        setSeeded(true)
        return
      }

      // A new quotation's seller name is NOT stamped here: it is resolved at save
      // time from the profile (like the console), so a name added on Account
      // details mid-draft still prints, and a persisted draft never freezes "".
      const base = emptyDraft(settings)
      if (prefill) {
        setDraft({
          ...base,
          customer: { ...base.customer, ...prefill.customer },
          lines: prefill.lines ?? base.lines,
          notes: prefill.notes ?? base.notes,
          enquiryId: prefill.enquiryId ?? null,
        })
        setSeeded(true)
        return
      }

      // A blank new quotation: offer back whatever the app was killed holding.
      const stored = await readStoredDraft()
      if (stored && draftHasContent(stored.draft)) setResumeOffer(stored.draft)
      setDraft(base)
      setSeeded(true)
    }

    void run()
  }, [seeded, settingsLoading, settings, editingId, prefill])

  // Only a new, unsaved quotation is worth persisting locally.
  usePersistedDraft(draft, seeded && !editingId)

  const set = (patch: Partial<QuotationDraft>) => setDraft((d) => ({ ...d, ...patch }))

  // WHOSE NAME goes on the sheet. A new quotation takes the signed-in user's, read
  // live so a name added on Account details mid-draft is picked up; an existing
  // one keeps the name it was raised under, because re-stamping it on edit would
  // quietly reassign a document that has already been sent.
  const sellerName = editingId ? draft.sellerName || "" : profile?.name?.trim() || ""

  const interState = isInterState(
    settings.company.stateCode,
    placeOfSupplyState(draft.customer, draft.shipTo),
  )
  const totals = React.useMemo(
    () =>
      computeDocument(draft.lines, {
        interState,
        extraDiscountPercent: draft.extraDiscountPercent,
      }),
    [draft.lines, draft.extraDiscountPercent, interState],
  )
  const validUntil = validUntilFor(draft.issueDate, draft.validityDays)

  const hasCustomer = !!(draft.customer.name.trim() || draft.customer.company.trim())
  const hasLines = draft.lines.length > 0
  const canSave = hasCustomer && hasLines && !saving
  // Said in the footer, in place of the total, so the block is visible before the
  // button is ever pressed.
  const blocker = !hasCustomer ? "Choose a customer" : !hasLines ? "Add at least one item" : null

  const save = async () => {
    if (blocker) {
      feedback.warn()
      toast.show({ message: blocker, tone: "danger" })
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await updateQuotation(editingId, draft as Partial<Quotation>, settings)
        feedback.created()
        toast.show({ message: "Quotation updated", tone: "success" })
        navigation.goBack()
      } else {
        const created = await createQuotation({ ...draft, sellerName }, settings)
        // The quotation EXISTS from here on, so nothing below may throw into the
        // catch: a "Could not save" toast after a successful insert makes the
        // rep press Save again and mint a second number for the same document.
        // The draft is cleared first, so even a crash cannot offer it back.
        await clearStoredDraft().catch(() => {})
        let followUp: string | null = null
        if (draft.enquiryId) {
          await markEnquiryQuoted(draft.enquiryId).catch(() => {
            followUp = "The enquiry could not be marked as quoted."
          })
        }
        feedback.created()
        toast.show({
          message: followUp ? `Quotation ${created.number} created. ${followUp}` : `Quotation ${created.number} created`,
          tone: followUp ? "neutral" : "success",
        })
        navigation.replace("QuotationDetail", { id: created.id })
      }
    } catch (e) {
      feedback.error()
      // The most likely cause in the field is no signal. Say so, and leave the
      // draft exactly where it is so nothing typed is lost.
      toast.show({ message: errorMessage(e, "Could not save the quotation"), tone: "danger" })
    } finally {
      setSaving(false)
    }
  }

  const leave = () => {
    if (!editingId && draftHasContent(draft)) {
      setConfirmLeave(true)
      return
    }
    navigation.goBack()
  }

  const upsertLine = (line: Line) => {
    const index = editingLine?.index ?? draft.lines.length
    const next = draft.lines.slice()
    next[index] = line
    set({ lines: next })
    setEditingLine(null)
  }

  const removeLine = () => {
    if (!editingLine) return
    set({ lines: draft.lines.filter((_, i) => i !== editingLine.index) })
    setEditingLine(null)
    feedback.deleted()
  }

  const customerName = draft.customer.company || draft.customer.name
  const customerSub =
    draft.customer.company && draft.customer.name ? draft.customer.name : prettyPhone(draft.customer.phone)

  // The footer is drawn over the scroll, so the content reserves its height.
  const footerHeight = sizes.buttonLg + spacing.xl + insets.bottom

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <View
        style={[
          styles.head,
          { paddingTop: insets.top, height: insets.top + sizes.appBar, borderBottomColor: t.divider },
        ]}
      >
        <IconButton name="back" onPress={leave} accessibilityLabel="Back" />
        <Text style={[textVariants.appBarTitleBack, styles.headTitle, { color: t.text }]}>
          {editingId ? "Edit quotation" : "New quotation"}
        </Text>
        {/* The issue date is a fact about the document, not chrome — it prints on
            the quotation — so it takes the strong ink rather than the tertiary
            grey that reads as a hint. */}
        <Text style={[textVariants.caption, styles.headDate, { color: t.textStrong }]}>
          {formatDate(draft.issueDate)}
        </Text>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.content} bottomOffset={footerHeight}>
        {/* The company itself could not be loaded, so this document is being
            priced on the built-in defaults: a placeholder GSTIN and a Delhi
            home state. Said before anything is typed, not discovered on the PDF. */}
        {!!settingsError && (
          <View style={[styles.settingsWarning, { backgroundColor: t.warningBg }]}>
            <Icon name="warning" size={18} color={t.warning} variant="Bold" />
            <Text style={[textVariants.caption, { color: t.warning, flex: 1 }]}>
              {`Company settings could not be loaded (${settingsError}). Numbering, GSTIN and the tax split on this quotation may be wrong. Get signal and reopen before sending it.`}
            </Text>
          </View>
        )}
        {/* ── WHO ────────────────────────────────────────────────────────── */}
        <Panel title="Customer">
          {hasCustomer || customerFormOpen ? (
            <>
              <View style={styles.customerHead}>
                <Avatar name={customerName} size="md" />
                <View style={styles.customerBody}>
                  <Text numberOfLines={1} style={[textVariants.cardTitle, { color: t.text }]}>
                    {customerName}
                  </Text>
                  {!!customerSub && (
                    <Text numberOfLines={1} style={[textVariants.small, { color: t.textTertiary }]}>
                      {customerSub}
                    </Text>
                  )}
                </View>
                <Button label="Change" variant="ghost" size="sm" onPress={() => setCustomerOpen(true)} />
              </View>

              <Divider inset={0} />

              {/* The details stay ON THIS PAGE, under the card's own head. They
                belong to the quotation being written, and moving them into a
                sheet made checking a GSTIN mid-quote a modal round trip. The
                keyboard is handled by the scroll view, not by hiding the form. */}
              <View style={styles.form}>
                <TextField
                  label="Contact Name"
                  value={draft.customer.name}
                  onChangeText={(v) => set({ customer: { ...draft.customer, name: v } })}
                  placeholder="Enter contact name"
                  autoCapitalize="words"
                />
                <TextField
                  label="Company"
                  value={draft.customer.company}
                  onChangeText={(v) => set({ customer: { ...draft.customer, company: v } })}
                  placeholder="Enter company name"
                  autoCapitalize="words"
                />
                {/* One field per row. Side by side, each got half the width, which
                  is not enough for an email address — it scrolled inside its own
                  box while being typed, and a half-visible address is one nobody
                  can check before sending a quotation to it. */}
                <TextField
                  label="Phone"
                  value={draft.customer.phone}
                  onChangeText={(v) => set({ customer: { ...draft.customer, phone: v } })}
                  keyboardType="phone-pad"
                  placeholder="Enter phone number"
                />
                <TextField
                  label="Email"
                  value={draft.customer.email}
                  onChangeText={(v) => set({ customer: { ...draft.customer, email: v } })}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Enter email address"
                />
                <TextField
                  label="GSTIN"
                  value={draft.customer.gstin}
                  onChangeText={(v) => set({ customer: { ...draft.customer, gstin: v.toUpperCase() } })}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={15}
                  placeholder="Enter GSTIN"
                />
                {/* The one field here that changes the money. */}
                <PickerField
                  label="Place of Supply"
                  value={
                    draft.customer.stateCode
                      ? stateLabel(draft.customer.stateCode)
                      : "Not set, taxed as local"
                  }
                  hint="Decides CGST + SGST or IGST"
                  warn={!draft.customer.stateCode}
                  onPress={() => setStateOpen("customer")}
                />
                <TextField
                  label="Billing Address"
                  value={draft.customer.address}
                  onChangeText={(v) => set({ customer: { ...draft.customer, address: v } })}
                  placeholder="Enter billing address"
                  multiline
                  numberOfLines={3}
                />
              </View>

              <Divider inset={0} />
              <View style={styles.shipToggle}>
                <Switch
                  value={!!draft.shipTo}
                  onValueChange={(on) => set({ shipTo: on ? newCustomer() : null })}
                  label="Ships Somewhere Else"
                  description="The place of supply then follows the delivery address"
                />
              </View>

              {!!draft.shipTo && (
                <View style={styles.form}>
                  <TextField
                    label="Consignee"
                    value={draft.shipTo.name}
                    onChangeText={(v) => set({ shipTo: { ...draft.shipTo!, name: v } })}
                    placeholder="Enter consignee name"
                    autoCapitalize="words"
                  />
                  <PickerField
                    label="Delivery State"
                    value={draft.shipTo.stateCode ? stateLabel(draft.shipTo.stateCode) : "Not set"}
                    onPress={() => setStateOpen("shipTo")}
                  />
                  <TextField
                    label="Delivery Address"
                    value={draft.shipTo.address}
                    onChangeText={(v) => set({ shipTo: { ...draft.shipTo!, address: v } })}
                    placeholder="Enter delivery address"
                    multiline
                    numberOfLines={3}
                  />
                </View>
              )}
            </>
          ) : (
            <Pressable
              onPress={() => {
                feedback.tap()
                setCustomerOpen(true)
              }}
              accessibilityRole="button"
              accessibilityLabel="Choose a customer"
              android_ripple={{ color: t.accentTint }}
              style={({ pressed }) => [styles.emptyPick, { opacity: pressed ? 0.75 : 1 }]}
            >
              <View style={[styles.emptyPickIcon, { backgroundColor: t.primary10 }]}>
                <Icon name="customer" size={22} color={t.primary} variant="Bulk" />
              </View>
              <View style={styles.emptyPickBody}>
                <Text style={[textVariants.cardTitle, { color: t.text }]}>Choose a customer</Text>
                <Text style={[textVariants.small, { color: t.textTertiary }]}>
                  Search the master, or add someone new
                </Text>
              </View>
              <Icon name="forward" size={18} color={t.textTertiary} />
            </Pressable>
          )}
        </Panel>

        {/* ── WHAT ───────────────────────────────────────────────────────── */}
        <Panel
          title="Items"
          meta={hasLines ? `${draft.lines.length} ${draft.lines.length === 1 ? "line" : "lines"}` : undefined}
        >
          {hasLines ? (
            draft.lines.map((line, index) => {
              const computed = totals.lines[index]
              return (
                <View key={index}>
                  {index > 0 && <Divider inset={gutter} />}
                  <Pressable
                    onPress={() => {
                      feedback.tap()
                      setEditingLine({ index, line })
                    }}
                    android_ripple={{ color: t.accentTint }}
                    style={styles.lineRow}
                  >
                    <View style={[styles.lineIndex, { backgroundColor: t.surfaceInset }]}>
                      <Text style={[textVariants.microLabel, { color: t.textSecondary }]}>{index + 1}</Text>
                    </View>
                    <View style={styles.lineBody}>
                      <Text numberOfLines={2} style={[textVariants.bodyStrong, { color: t.text }]}>
                        {line.description || "Untitled item"}
                      </Text>
                      <Text numberOfLines={1} style={[textVariants.caption, { color: t.textTertiary }]}>
                        {line.quantity} {line.unit} × {formatCurrency(line.rate)}
                        {line.discountPercent ? ` · ${line.discountPercent}% off` : ""} · {line.gstRate}% GST
                      </Text>
                    </View>
                    <Text style={[textVariants.amount, { color: t.text }]}>
                      {formatCurrency(computed?.taxable ?? 0)}
                    </Text>
                  </Pressable>
                </View>
              )
            })
          ) : (
            <View style={styles.emptyLines}>
              <Icon name="quote" size={30} color={t.textHint} variant="Bulk" />
              <Text style={[textVariants.small, styles.emptyLinesText, { color: t.textTertiary }]}>
                Nothing quoted yet.
              </Text>
            </View>
          )}

          <Divider inset={0} />
          <Pressable
            onPress={() => {
              feedback.tap()
              setEditingLine({ index: draft.lines.length, line: null })
            }}
            android_ripple={{ color: t.accentTint }}
            accessibilityRole="button"
            accessibilityLabel="Add an item"
            style={styles.cardAction}
          >
            <Icon name="addItem" size={19} color={t.primary} />
            <Text style={[textVariants.smallStrong, { color: t.primary, marginLeft: 10 }]}>
              {hasLines ? "Add another item" : "Add the first item"}
            </Text>
          </Pressable>
        </Panel>

        {/* ── HOW MUCH ───────────────────────────────────────────────────── */}
        <Panel title="Money">
          {/* The tax treatment, said in words at the TOP. Reading "IGST" for the
              first time at the bottom of a sent PDF is how a wrong split gets
              noticed by the customer instead of by us. */}
          <View style={[styles.taxNote, { backgroundColor: interState ? t.infoBg : t.surfaceInset }]}>
            <Icon name="info" size={15} color={interState ? t.info : t.textTertiary} variant="Bulk" />
            <Text style={[textVariants.caption, styles.taxNoteText, { color: t.textSecondary }]}>
              {interState
                ? `Interstate supply, one IGST line at each item's rate`
                : `Within ${stateLabel(settings.company.stateCode) || "your state"}, CGST + SGST`}
            </Text>
          </View>

          <View style={styles.receipt}>
            <TotalRow label="Subtotal" value={formatCurrency(totals.subTotal)} />
            {totals.totalDiscount > 0 && (
              <TotalRow label="Discount" value={`−${formatCurrency(totals.totalDiscount)}`} />
            )}
            <TotalRow label="Taxable" value={formatCurrency(totals.taxable)} />
            {interState ? (
              <TotalRow label="IGST" value={formatCurrency(totals.igst)} />
            ) : (
              <>
                <TotalRow label="CGST" value={formatCurrency(totals.cgst)} />
                <TotalRow label="SGST" value={formatCurrency(totals.sgst)} />
              </>
            )}
            {!!totals.roundOff && <TotalRow label="Round Off" value={formatCurrency(totals.roundOff)} />}
            <View style={styles.receiptRule}>
              <Divider />
            </View>
            <TotalRow label="Grand Total" value={formatCurrency(totals.grandTotal)} strong />
          </View>

          <Divider inset={0} />
          {/* Compact and inline: a whole-quote discount is an occasional
              adjustment, not a field to walk past on every quotation. */}
          <View style={styles.discountRow}>
            <Icon name="discount" size={18} color={t.textTertiary} variant="Bulk" />
            <Text style={[textVariants.body, styles.discountLabel, { color: t.textSecondary }]}>
              Extra Discount
            </Text>
            {/* A raw input, not the kit's TextField: that one owns a label
                slot, a drawn squircle and a bottom margin, none of which fit a
                44px box sitting inside a row. */}
            <TextInput
              value={draft.extraDiscountPercent ? String(draft.extraDiscountPercent) : ""}
              onChangeText={(v) => set({ extraDiscountPercent: Number(v.replace(/[^0-9.]/g, "")) || 0 })}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={t.textTertiary}
              accessibilityLabel="Extra discount percent"
              cursorColor={t.fieldCursor}
              selectionColor={t.fieldCursor}
              style={[
                styles.discountInput,
                textVariants.bodyStrong,
                { backgroundColor: t.fieldBg, borderColor: t.border, color: t.text },
              ]}
            />
            <Text style={[textVariants.bodyStrong, { color: t.textSecondary }]}>%</Text>
          </View>
        </Panel>

        {/* ── THE SHEET ITSELF ───────────────────────────────────────────── */}
        {/* Not folded away with the terms: whose name goes on a document the
            customer keeps is a decision worth seeing while writing it, and it is
            one tap. The name is the signed-in profile's, fixed at creation. */}
        <Panel title="On the PDF">
          {/* A Switch, not the kit Checkbox: that one is a checklist "done" tick
              that greys and strikes its label when on, so ON would read as OFF. */}
          <View style={styles.checkRow}>
            <Switch
              value={draft.showSeller}
              // Switch fires the toggle haptic itself.
              onValueChange={(next) => set({ showSeller: next })}
              label={sellerName ? `Show "Quoted by ${sellerName}"` : "Show my name as the seller"}
              description={
                sellerName
                  ? undefined
                  : editingId
                    ? "This quotation was raised without a seller name."
                    : "Add your name on Profile → Account details, and it will print here."
              }
            />
          </View>
        </Panel>

        {/* ── THE REST, folded away ──────────────────────────────────────── */}
        <Panel>
          <Pressable
            onPress={() => {
              feedback.tap()
              setShowTerms((v) => !v)
            }}
            android_ripple={{ color: t.accentTint }}
            style={styles.foldHead}
          >
            <Text style={[textVariants.sectionLabel, { color: t.textTertiary, flex: 1 }]}>
              VALIDITY, TERMS & NOTES
            </Text>
            <Icon name={showTerms ? "down" : "forward"} size={16} color={t.textTertiary} />
          </Pressable>

          {showTerms && (
            <View style={styles.foldBody}>
              <Text style={[textVariants.small, styles.validity, { color: t.textSecondary }]}>
                Issued {formatDate(draft.issueDate)} · valid until {formatDate(validUntil)}
              </Text>
              <Text style={[textVariants.label, { color: t.textStrong, marginBottom: 8 }]}>Valid For</Text>
              <View style={styles.validityChips}>
                {VALIDITY_PRESETS.map((days) => (
                  <Chip
                    key={days}
                    label={`${days} days`}
                    active={draft.validityDays === days}
                    onPress={() => {
                      feedback.select()
                      set({ validityDays: days })
                    }}
                  />
                ))}
                {!VALIDITY_PRESETS.includes(draft.validityDays) && (
                  <Chip label={`${draft.validityDays} days`} active />
                )}
              </View>
              <TextField
                label="Custom Validity (Days)"
                value={String(draft.validityDays)}
                onChangeText={(v) => set({ validityDays: Number(v.replace(/[^0-9]/g, "")) || 0 })}
                placeholder="Enter number of days"
                keyboardType="number-pad"
              />
              <TextField
                label="Payment Terms"
                value={draft.paymentTerms}
                onChangeText={(v) => set({ paymentTerms: v })}
                placeholder="Enter payment terms"
              />
              <TextField
                label="Terms and Conditions"
                value={draft.terms}
                onChangeText={(v) => set({ terms: v })}
                placeholder="Enter terms and conditions"
                multiline
                numberOfLines={4}
              />
              <TextField
                label="Notes"
                value={draft.notes}
                onChangeText={(v) => set({ notes: v })}
                placeholder="Enter notes"
                multiline
                numberOfLines={3}
              />
            </View>
          )}
        </Panel>
      </KeyboardAwareScrollView>

      {/* The running total is what a salesperson watches while typing, so it
          stays on screen — replaced by the blocking reason while the quotation
          cannot be saved at all. */}
      <View
        style={[
          styles.footer,
          { backgroundColor: t.appBar, borderTopColor: t.border, paddingBottom: insets.bottom + spacing.sm },
        ]}
      >
        <View style={styles.footerTotal}>
          {blocker ? (
            <>
              <Text style={[textVariants.microLabel, { color: t.textTertiary }]}>NEXT</Text>
              <Text style={[textVariants.cardTitle, { color: t.warning }]}>{blocker}</Text>
            </>
          ) : (
            <>
              <Text style={[textVariants.microLabel, { color: t.textTertiary }]}>
                {(interState ? "INCL. IGST" : "INCL. CGST + SGST") +
                  ` · ${draft.lines.length} ${draft.lines.length === 1 ? "ITEM" : "ITEMS"}`}
              </Text>
              <Text style={[textVariants.rowAmount, { color: t.text }]}>
                {formatCurrency(totals.grandTotal)}
              </Text>
            </>
          )}
        </View>
        <Button
          label={editingId ? "Save" : "Create"}
          onPress={() => void save()}
          loading={saving}
          disabled={!canSave}
        />
      </View>

      <CustomerPickerSheet
        visible={customerOpen}
        onClose={() => setCustomerOpen(false)}
        onPick={(customer) => {
          setCustomerOpen(false)
          set({ customer })
          // "New customer" hands back a BLANK record, so `hasCustomer` stays
          // false and the card would not open on its own — this is what puts the
          // form on screen with somewhere to type.
          setCustomerFormOpen(true)
        }}
      />

      <StatePickerSheet
        visible={stateOpen !== null}
        value={stateOpen === "shipTo" ? draft.shipTo?.stateCode : draft.customer.stateCode}
        onClose={() => setStateOpen(null)}
        onPick={(code) => {
          feedback.select()
          if (stateOpen === "shipTo" && draft.shipTo) set({ shipTo: { ...draft.shipTo, stateCode: code } })
          else set({ customer: { ...draft.customer, stateCode: code } })
          setStateOpen(null)
        }}
      />

      <LineItemSheet
        visible={editingLine !== null}
        line={editingLine?.line ?? null}
        onClose={() => setEditingLine(null)}
        onSave={upsertLine}
        onRemove={editingLine?.line ? removeLine : undefined}
      />

      <Dialog
        visible={!!resumeOffer}
        onClose={() => setResumeOffer(null)}
        title="Continue where you left off?"
        message="You have an unfinished quotation from last time."
        actions={[
          {
            label: "Start fresh",
            onPress: () => {
              setResumeOffer(null)
              void clearStoredDraft()
            },
          },
          {
            label: "Continue",
            onPress: () => {
              // Merged over a fresh base so a draft persisted by an older build
              // still carries every field this one expects.
              if (resumeOffer) setDraft({ ...emptyDraft(settings), ...resumeOffer })
              setResumeOffer(null)
            },
          },
        ]}
      />

      <Dialog
        visible={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Leave without saving?"
        message="The draft is kept on this phone, so you can pick it up again."
        actions={[
          { label: "Keep editing", onPress: () => setConfirmLeave(false) },
          {
            label: "Leave",
            tone: "danger",
            onPress: () => {
              setConfirmLeave(false)
              navigation.goBack()
            },
          },
        ]}
      />
    </View>
  )
}

/**
 * A field-shaped button that opens a picker sheet. `warn` tints it while the
 * place of supply is unset, because "not set" is not a neutral state there — it
 * quietly taxes the whole document as a local supply.
 */
function PickerField({
  label,
  value,
  hint,
  warn,
  onPress,
}: {
  label: string
  value: string
  hint?: string
  warn?: boolean
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <View style={styles.pickerWrap}>
      <Text style={[textVariants.label, { color: t.textStrong, marginBottom: 6 }]}>{label}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        style={({ pressed }) => [
          styles.picker,
          {
            backgroundColor: warn ? t.warningBg : t.fieldBg,
            borderColor: warn ? t.warning : t.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text numberOfLines={1} style={[textVariants.body, { color: t.text, flex: 1 }]}>
          {value}
        </Text>
        <Icon name="down" size={16} color={t.textTertiary} />
      </Pressable>
      {!!hint && <Text style={[textVariants.caption, { color: t.textTertiary, marginTop: 5 }]}>{hint}</Text>}
    </View>
  )
}

/**
 * A section of the page.
 *
 * THE SECTION LANGUAGE IS CAPNIX'S, not a card's. A panel is full-bleed — no
 * radius, no border, no shadow — sitting on `surface`, and what separates it from
 * the panel above and below is a literal 2dp band of `colors.border`. The
 * SEPARATION is the object boundary; a rounded bordered card floating on a page
 * of the same colour was drawing that boundary twice and reading as a stack of
 * lozenges. (See C:\code\capnix\Capnix.Mobile.Partner AppCard: "on a sheet page
 * it is a FLAT PANEL … separated by the 2px band the screen draws".)
 *
 * Each panel carries its own bottom band rather than the screen inserting bands
 * between children — Capnix learned that the hard way: a screen that maps over
 * its children and inserts separators breaks the moment a panel is conditional or
 * wrapped, and the band then belongs to whatever renders it.
 */
function Panel({ title, meta, children }: { title?: string; meta?: string; children: React.ReactNode }) {
  const t = useTheme()
  return (
    <>
      <View style={{ backgroundColor: t.surface }}>
        {!!title && (
          <View style={styles.panelHead}>
            <Text style={[textVariants.sectionLabel, { color: t.textTertiary }]}>{title.toUpperCase()}</Text>
            {!!meta && (
              <Text style={[textVariants.caption, { color: t.textTertiary, marginLeft: 8 }]}>{meta}</Text>
            )}
          </View>
        )}
        {children}
      </View>
      <View style={[styles.band, { backgroundColor: t.border }]} />
    </>
  )
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const t = useTheme()
  return (
    <View style={styles.totalRow}>
      <Text
        style={[
          strong ? textVariants.bodyStrong : textVariants.body,
          { color: strong ? t.text : t.textSecondary },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          strong ? textVariants.amount : textVariants.factValue,
          { color: t.text, fontSize: strong ? 19 : 15 },
        ]}
      >
        {value}
      </Text>
    </View>
  )
}


const styles = StyleSheet.create({
  root: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingRight: gutter,
    borderBottomWidth: border.hairline,
  },
  headTitle: { flex: 1, marginLeft: 6, textTransform: "capitalize" },
  headDate: { textTransform: "uppercase", letterSpacing: 0.3 },
  // FULL BLEED: the panels run edge to edge and the bands between them are the
  // page structure, so the page itself has no side padding — every inset below
  // is the panel gutter instead.
  content: { paddingTop: 0 },
  band: { height: 2 },

  panelHead: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingHorizontal: gutter,
    paddingTop: gutter,
    paddingBottom: spacing.sm,
  },
  cardAction: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter, paddingVertical: 15 },

  // A full-bleed row inside the panel, not a dashed box: on a page built of
  // bands, a second outlined shape inside one of them competes with the band.
  emptyPick: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: gutter,
    paddingBottom: gutter,
    paddingTop: spacing.xs,
  },
  emptyPickIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPickBody: { flex: 1, marginLeft: 14, gap: 2 },

  form: { paddingHorizontal: gutter, paddingTop: spacing.md, paddingBottom: 2 },
  shipToggle: { paddingHorizontal: gutter, paddingVertical: spacing.md },
  pickerWrap: { marginBottom: spacing.md },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  customerHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter, paddingBottom: 10 },
  customerBody: { flex: 1, marginLeft: 12, minWidth: 0, gap: 1 },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: gutter,
    paddingBottom: spacing.md,
  },

  lineRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter, paddingVertical: 14 },
  lineIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  lineBody: { flex: 1, marginRight: 10, gap: 2 },
  emptyLines: { alignItems: "center", paddingVertical: spacing.xl, gap: 8 },
  emptyLinesText: {},

  taxNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: gutter,
    paddingVertical: 10,
  },
  taxNoteText: { flex: 1 },
  receipt: { paddingHorizontal: gutter, paddingVertical: spacing.md },
  receiptRule: { marginVertical: spacing.sm },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },

  discountRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter, paddingVertical: 12 },
  discountLabel: { flex: 1, marginLeft: 12 },
  discountInput: {
    width: 84,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 12,
    textAlign: "right",
    marginRight: 8,
  },

  checkRow: { paddingHorizontal: gutter, paddingBottom: spacing.sm },
  settingsWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: gutter,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  foldHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: gutter,
    paddingVertical: gutter,
  },
  foldBody: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  validity: { marginBottom: spacing.md },
  validityChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.md },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: gutter,
    paddingTop: spacing.md,
    // The same 2dp band that separates the panels above, not a hairline: the
    // footer floats over the scrolling form, and a hairline in `divider` was too
    // faint to say where the page stops and the action bar begins.
    borderTopWidth: 2,
  },
  footerTotal: { flex: 1, gap: 2 },
})
