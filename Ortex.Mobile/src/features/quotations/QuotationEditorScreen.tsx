import React from "react"
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
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
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import { Button, Card, Dialog, Divider, Icon, IconButton, Switch, TextField, useToast } from "@/ui"

// The console's quotation editor is a 2/3-1/3 dashboard. On a phone that becomes
// a single column of One UI cards with a sticky footer that always shows the
// live grand total — the one number a salesperson is watching while they type.
//
// The maths is not reimplemented here: `computeDocument` recomputes on every
// keystroke exactly as the console's `liveDoc` memo does, and saving goes
// through the ported `createQuotation` / `updateQuotation`.

export default function QuotationEditorScreen({ route, navigation }: StackScreenProps<"QuotationEditor">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { settings, loading: settingsLoading } = useSettings()

  const editingId = route.params?.id
  const prefill = route.params?.prefill

  const [draft, setDraft] = React.useState<QuotationDraft>(() => emptyDraft(settings))
  const [seeded, setSeeded] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [customerOpen, setCustomerOpen] = React.useState(false)
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
          })
        }
        setSeeded(true)
        return
      }

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
  const canSave = hasCustomer && draft.lines.length > 0 && !saving

  const save = async () => {
    if (!hasCustomer) {
      toast.show({ message: "Choose or add a customer", tone: "danger" })
      return
    }
    if (!draft.lines.length) {
      toast.show({ message: "Add at least one line item", tone: "danger" })
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
        const created = await createQuotation(draft, settings)
        if (draft.enquiryId) await markEnquiryQuoted(draft.enquiryId)
        await clearStoredDraft()
        feedback.created()
        toast.show({ message: `Quotation ${created.number} created`, tone: "success" })
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

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: t.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.head, { paddingTop: insets.top + 6, borderBottomColor: t.divider }]}>
        <IconButton name="back" onPress={leave} accessibilityLabel="Back" />
        <Text style={[styles.headTitle, { color: t.text }]}>
          {editingId ? "Edit quotation" : "New quotation"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* 1 — Customer */}
        <SectionTitle text="Customer" />
        <Card padding={0} style={styles.card}>
          <Pressable
            onPress={() => {
              feedback.tap()
              setCustomerOpen(true)
            }}
            android_ripple={{ color: t.ripple }}
            style={styles.pickerRow}
          >
            <Icon name="customer" size={20} color={t.accent} variant="Bold" />
            <View style={styles.pickerBody}>
              <Text style={[styles.pickerLabel, { color: t.textTertiary }]}>Bill to</Text>
              <Text style={[styles.pickerValue, { color: hasCustomer ? t.text : t.textTertiary }]}>
                {hasCustomer ? draft.customer.company || draft.customer.name : "Choose or add a customer"}
              </Text>
            </View>
            <Icon name="forward" size={18} color={t.textTertiary} />
          </Pressable>

          {hasCustomer && (
            <>
              <Divider inset={20} />
              <View style={styles.form}>
                <TextField
                  label="Contact name"
                  value={draft.customer.name}
                  onChangeText={(v) => set({ customer: { ...draft.customer, name: v } })}
                  placeholder="Who you are quoting"
                />
                <TextField
                  label="Company"
                  value={draft.customer.company}
                  onChangeText={(v) => set({ customer: { ...draft.customer, company: v } })}
                  placeholder="Optional"
                />
                <View style={styles.row}>
                  <View style={styles.half}>
                    <TextField
                      label="Phone"
                      value={draft.customer.phone}
                      onChangeText={(v) => set({ customer: { ...draft.customer, phone: v } })}
                      keyboardType="phone-pad"
                      placeholder="10 digits"
                    />
                  </View>
                  <View style={styles.half}>
                    <TextField
                      label="Email"
                      value={draft.customer.email}
                      onChangeText={(v) => set({ customer: { ...draft.customer, email: v } })}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholder="Optional"
                    />
                  </View>
                </View>
                <TextField
                  label="GSTIN"
                  value={draft.customer.gstin}
                  onChangeText={(v) => set({ customer: { ...draft.customer, gstin: v.toUpperCase() } })}
                  autoCapitalize="characters"
                  placeholder="Optional"
                />
                <FieldButton
                  label="Place of supply"
                  value={
                    draft.customer.stateCode
                      ? stateLabel(draft.customer.stateCode)
                      : "Not set — taxed as local"
                  }
                  hint="Decides CGST + SGST or IGST"
                  onPress={() => setStateOpen("customer")}
                />
                <TextField
                  label="Address"
                  value={draft.customer.address}
                  onChangeText={(v) => set({ customer: { ...draft.customer, address: v } })}
                  placeholder="Optional"
                  multiline
                />
              </View>
            </>
          )}
        </Card>

        {hasCustomer && (
          <Card padding={16} style={styles.card}>
            <Switch
              value={!!draft.shipTo}
              onValueChange={(on) => set({ shipTo: on ? newCustomer() : null })}
              label="Ships somewhere else"
              description="GST place of supply follows the delivery address"
            />
            {draft.shipTo && (
              <View style={styles.shipTo}>
                <TextField
                  label="Consignee"
                  value={draft.shipTo.name}
                  onChangeText={(v) => set({ shipTo: { ...draft.shipTo!, name: v } })}
                  placeholder="Who receives it"
                />
                <FieldButton
                  label="Delivery state"
                  value={draft.shipTo.stateCode ? stateLabel(draft.shipTo.stateCode) : "Not set"}
                  onPress={() => setStateOpen("shipTo")}
                />
                <TextField
                  label="Delivery address"
                  value={draft.shipTo.address}
                  onChangeText={(v) => set({ shipTo: { ...draft.shipTo!, address: v } })}
                  multiline
                />
              </View>
            )}
          </Card>
        )}

        {/* 2 — Line items */}
        <SectionTitle text="Items" />
        <Card padding={0} style={styles.card}>
          {draft.lines.length === 0 ? (
            <Text style={[styles.emptyLines, { color: t.textTertiary }]}>
              Nothing quoted yet. Add the first item below.
            </Text>
          ) : (
            draft.lines.map((line, index) => {
              const computed = totals.lines[index]
              return (
                <View key={index}>
                  {index > 0 && <Divider inset={20} />}
                  <Pressable
                    onPress={() => {
                      feedback.tap()
                      setEditingLine({ index, line })
                    }}
                    android_ripple={{ color: t.ripple }}
                    style={styles.lineRow}
                  >
                    <View style={styles.lineBody}>
                      <Text numberOfLines={1} style={[styles.lineName, { color: t.text }]}>
                        {line.description || "Untitled item"}
                      </Text>
                      <Text numberOfLines={1} style={[styles.lineSub, { color: t.textTertiary }]}>
                        {line.quantity} {line.unit} × {formatCurrency(line.rate)}
                        {line.discountPercent ? ` · ${line.discountPercent}% off` : ""} · {line.gstRate}% GST
                      </Text>
                    </View>
                    <Text style={[styles.lineAmount, { color: t.text }]}>
                      {formatCurrency(computed?.taxable ?? 0)}
                    </Text>
                  </Pressable>
                </View>
              )
            })
          )}
          <Divider inset={20} />
          <Pressable
            onPress={() => {
              feedback.tap()
              setEditingLine({ index: draft.lines.length, line: null })
            }}
            android_ripple={{ color: t.ripple }}
            style={styles.addRow}
          >
            <Icon name="addItem" size={20} color={t.accent} />
            <Text style={[styles.addLabel, { color: t.accent }]}>Add an item</Text>
          </Pressable>
        </Card>

        {/* 3 — Totals */}
        <SectionTitle text="Totals" />
        <Card padding={16} style={styles.card}>
          <TotalRow label="Subtotal" value={formatCurrency(totals.subTotal)} />
          {totals.totalDiscount > 0 && (
            <TotalRow label="Discount" value={`-${formatCurrency(totals.totalDiscount)}`} />
          )}
          <TotalRow label="Taxable" value={formatCurrency(totals.taxable)} />
          {/* Never both: the place of supply picks one branch or the other. */}
          {interState ? (
            <TotalRow label="IGST" value={formatCurrency(totals.igst)} />
          ) : (
            <>
              <TotalRow label="CGST" value={formatCurrency(totals.cgst)} />
              <TotalRow label="SGST" value={formatCurrency(totals.sgst)} />
            </>
          )}
          {!!totals.roundOff && <TotalRow label="Round off" value={formatCurrency(totals.roundOff)} />}
          <Divider />
          <TotalRow label="Grand total" value={formatCurrency(totals.grandTotal)} strong />

          <View style={styles.discountField}>
            <TextField
              label="Extra discount on the whole quote (%)"
              value={draft.extraDiscountPercent ? String(draft.extraDiscountPercent) : ""}
              onChangeText={(v) => set({ extraDiscountPercent: Number(v.replace(/[^0-9.]/g, "")) || 0 })}
              keyboardType="decimal-pad"
              placeholder="0"
              leadingIcon="discount"
            />
          </View>
        </Card>

        {/* 4 — Terms, collapsed: prefilled from settings and rarely touched. */}
        <Pressable onPress={() => setShowTerms((v) => !v)} style={styles.sectionToggle}>
          <SectionTitle text="Validity, terms & notes" />
          <Icon name={showTerms ? "down" : "forward"} size={16} color={t.textTertiary} />
        </Pressable>
        {showTerms && (
          <Card padding={16} style={styles.card}>
            <Text style={[styles.validity, { color: t.textSecondary }]}>
              Issued {formatDate(draft.issueDate)} · valid until {formatDate(validUntil)}
            </Text>
            <TextField
              label="Valid for (days)"
              value={String(draft.validityDays)}
              onChangeText={(v) => set({ validityDays: Number(v.replace(/[^0-9]/g, "")) || 0 })}
              keyboardType="number-pad"
            />
            <TextField
              label="Payment terms"
              value={draft.paymentTerms}
              onChangeText={(v) => set({ paymentTerms: v })}
              placeholder="e.g. 50% advance, balance before dispatch"
            />
            <TextField
              label="Terms and conditions"
              value={draft.terms}
              onChangeText={(v) => set({ terms: v })}
              multiline
            />
            <TextField
              label="Notes"
              value={draft.notes}
              onChangeText={(v) => set({ notes: v })}
              placeholder="Anything the customer should see"
              multiline
            />
          </Card>
        )}
      </ScrollView>

      {/* Sticky footer: the running total is the number being watched, so it
          stays on screen no matter how far down the form the user is. */}
      <View
        style={[
          styles.footer,
          { backgroundColor: t.headerBg, borderTopColor: t.divider, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={styles.footerTotal}>
          <Text style={[styles.footerLabel, { color: t.textTertiary }]}>
            {interState ? "IGST" : "CGST + SGST"} · {draft.lines.length}{" "}
            {draft.lines.length === 1 ? "item" : "items"}
          </Text>
          <Text style={[styles.footerValue, { color: t.text }]}>{formatCurrency(totals.grandTotal)}</Text>
        </View>
        <Button label={editingId ? "Save" : "Create"} onPress={save} loading={saving} disabled={!canSave} />
      </View>

      <CustomerPickerSheet
        visible={customerOpen}
        onClose={() => setCustomerOpen(false)}
        onPick={(customer) => {
          setCustomerOpen(false)
          set({ customer })
        }}
      />

      <StatePickerSheet
        visible={stateOpen !== null}
        value={stateOpen === "shipTo" ? draft.shipTo?.stateCode : draft.customer.stateCode}
        onClose={() => setStateOpen(null)}
        onPick={(code) => {
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
              if (resumeOffer) setDraft(resumeOffer)
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
    </KeyboardAvoidingView>
  )
}

function SectionTitle({ text }: { text: string }) {
  const t = useTheme()
  return <Text style={[styles.sectionTitle, { color: t.textTertiary }]}>{text}</Text>
}

function FieldButton({
  label,
  value,
  hint,
  onPress,
}: {
  label: string
  value: string
  hint?: string
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <View style={styles.fieldButtonWrap}>
      <Text style={[styles.fieldButtonLabel, { color: t.textSecondary }]}>{label}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.fieldButton,
          { backgroundColor: t.searchBg, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text numberOfLines={1} style={[styles.fieldButtonValue, { color: t.text }]}>
          {value}
        </Text>
        <Icon name="down" size={16} color={t.textTertiary} />
      </Pressable>
      {!!hint && <Text style={[styles.fieldButtonHint, { color: t.textTertiary }]}>{hint}</Text>}
    </View>
  )
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const t = useTheme()
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, { color: strong ? t.text : t.textSecondary }]}>{label}</Text>
      <Text
        style={[
          styles.totalValue,
          { color: t.text, fontFamily: strong ? font.bold : font.medium, fontSize: strong ? 18 : 14.5 },
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
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headTitle: { marginLeft: 6, fontSize: 17, fontFamily: font.semibold },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28 },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 8,
    fontFamily: font.semibold,
  },
  sectionToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  card: { marginBottom: 20 },
  pickerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 16 },
  pickerBody: { flex: 1, marginLeft: 14 },
  pickerLabel: { fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", fontFamily: font.medium },
  pickerValue: { marginTop: 2, fontSize: 16, fontFamily: font.semibold },
  form: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 2 },
  row: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  shipTo: { marginTop: 14 },
  emptyLines: { paddingHorizontal: 18, paddingVertical: 18, fontSize: 14, fontFamily: font.regular },
  lineRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14 },
  lineBody: { flex: 1, marginRight: 10 },
  lineName: { fontSize: 15, fontFamily: font.semibold },
  lineSub: { marginTop: 3, fontSize: 12.5, fontFamily: font.regular },
  lineAmount: { fontSize: 15, fontFamily: font.bold },
  addRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 15 },
  addLabel: { marginLeft: 12, fontSize: 15, fontFamily: font.semibold },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  totalLabel: { fontSize: 14, fontFamily: font.regular },
  totalValue: {},
  discountField: { marginTop: 14 },
  validity: { fontSize: 13, marginBottom: 14, fontFamily: font.regular },
  fieldButtonWrap: { marginBottom: 14 },
  fieldButtonLabel: { marginBottom: 6, fontSize: 13, fontFamily: font.medium },
  fieldButton: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  fieldButtonValue: { flex: 1, fontSize: 15, fontFamily: font.medium },
  fieldButtonHint: { marginTop: 5, fontSize: 12, fontFamily: font.regular },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerTotal: { flex: 1 },
  footerLabel: { fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", fontFamily: font.medium },
  footerValue: { marginTop: 2, fontSize: 22, fontFamily: font.extrabold },
})
