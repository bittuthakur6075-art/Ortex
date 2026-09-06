import React from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"

import { formatCurrency } from "@/domain/format"
import { computeLine } from "@/domain/pricing"
import { GST_RATES, newLine, type Line, type Product } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { radius, size, spacing } from "@/theme/tokens"
import { font } from "@/theme/typography"
import { Button, Chip, Icon, Sheet, TextField } from "@/ui"

// The console edits line items in a `table-fixed` grid with a 1024px minimum
// width. That cannot survive on a phone, so a line is edited one at a time in a
// sheet: pick the product, then four large number fields, with the line total
// recomputed live by the same `computeLine` the document uses.

type Mode = "product" | "fields"

export default function LineItemSheet({
  visible,
  line,
  onClose,
  onSave,
  onRemove,
}: {
  visible: boolean
  /** null = adding a new line, which opens straight on the product picker. */
  line: Line | null
  onClose: () => void
  onSave: (line: Line) => void
  onRemove?: () => void
}) {
  const t = useTheme()
  const { items: products } = useCollection<Product>("products")
  const [draft, setDraft] = React.useState<Line>(line ?? newLine())
  const [mode, setMode] = React.useState<Mode>(line ? "fields" : "product")
  const [query, setQuery] = React.useState("")

  // Re-seed whenever the sheet is opened for a different line.
  React.useEffect(() => {
    if (!visible) return
    setDraft(line ?? newLine())
    setMode(line ? "fields" : "product")
    setQuery("")
  }, [visible, line])

  const set = (patch: Partial<Line>) => setDraft((d) => ({ ...d, ...patch }))

  // Exactly the console's `pickProduct`: fill description, HSN, rate and GST
  // from the master, and raise the quantity to the product's MOQ if it is below
  // it — you cannot order 10 of something that is only made in 500s.
  const pickProduct = (p: Product) => {
    feedback.select()
    setDraft((d) => ({
      ...d,
      productId: p.id,
      description: p.name,
      hsn: p.hsn || "",
      unit: p.unit || d.unit,
      rate: p.basePrice || 0,
      gstRate: p.gstRate ?? 18,
      quantity: d.quantity < (p.moq || 1) ? p.moq || 1 : d.quantity,
    }))
    setMode("fields")
  }

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = products.filter((p) => (p.status || "active") === "active")
    if (!q) return pool.slice(0, 30)
    return pool
      .filter((p) =>
        [p.name, p.sku, p.category, p.hsn].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
      )
      .slice(0, 30)
  }, [products, query])

  const computed = computeLine(draft)
  /**
   * What a line has to be before it can go on a quotation.
   *
   * Only the description was checked before, so a line could be added with a
   * quantity of zero — which prices at zero, prints as a row nobody ordered, and
   * is invisible in the total. A rate of zero IS allowed: free samples and
   * bundled items are quoted at zero on purpose.
   */
  const problems = {
    description: draft.description.trim() ? undefined : "Describe what is being quoted",
    quantity: draft.quantity > 0 ? undefined : "Quantity must be at least 1",
    rate: draft.rate < 0 ? "A rate cannot be negative" : undefined,
    discountPercent:
      draft.discountPercent < 0 || draft.discountPercent > 100
        ? "A discount runs from 0 to 100%"
        : undefined,
  }
  const valid = !Object.values(problems).some(Boolean)

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={mode === "product" ? "Add an item" : draft.description || "Line item"}
    >
      {mode === "product" ? (
        <>
          <View style={[styles.search, { backgroundColor: t.fieldBg }]}>
            <Icon name="search" size={18} color={t.textTertiary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search products"
              placeholderTextColor={t.textTertiary}
              autoCorrect={false}
              style={[styles.searchInput, { color: t.text }]}
            />
          </View>

          <Pressable
            onPress={() => {
              // Not everything quoted is in the catalogue — a one-off job, a
              // custom size. A free-text line is a first-class option, not a
              // fallback buried at the bottom.
              set({ productId: null, description: query.trim() })
              setMode("fields")
            }}
            android_ripple={{ color: t.accentTint }}
            style={styles.customRow}
          >
            <View style={[styles.customIcon, { backgroundColor: t.primary10 }]}>
              <Icon name="edit" size={18} color={t.primary} />
            </View>
            <Text style={[styles.customLabel, { color: t.primary }]}>
              {query.trim() ? `Custom item “${query.trim()}”` : "Custom item (not in the catalogue)"}
            </Text>
          </Pressable>

          {matches.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => pickProduct(p)}
              android_ripple={{ color: t.accentTint }}
              style={styles.productRow}
            >
              <View style={styles.productBody}>
                <Text numberOfLines={1} style={[styles.productName, { color: t.text }]}>
                  {p.name}
                </Text>
                {/* MOQ and category. The SKU and the GST rate were here before
                    and are gone deliberately: neither helps you choose a product
                    — the SKU is an internal string nobody recognises by sight,
                    and the rate is carried onto the line for you. The minimum
                    order does decide whether you can quote this at all. */}
                <Text numberOfLines={1} style={[styles.productSub, { color: t.textTertiary }]}>
                  {[p.moq > 1 ? `MOQ ${p.moq}` : null, p.category].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Text style={[styles.productPrice, { color: t.text }]}>{formatCurrency(p.basePrice)}</Text>
            </Pressable>
          ))}
        </>
      ) : (
        <>
          <TextField
            label="Description"
            value={draft.description}
            onChangeText={(v) => set({ description: v })}
            placeholder="Enter description"
            trailingIcon="catalogue"
            onTrailingPress={() => setMode("product")}
          />

          {/* THE UNIT IS NOT PICKED HERE. It is a property of the product, set
              once when the product is created, and `pickProduct` copies it onto
              the line. Offering it again on every quotation invites a line that
              says "500 kg" of something sold in boxes — the quotation and the
              catalogue would then disagree about what was ordered. A custom item
              (nothing in the catalogue to copy from) takes `newLine()`'s default.
              It is shown, in the quantity's own label, so it is never a secret. */}
          {/* The two numbers that multiply into the line total, side by side —
              they are read together, and a quantity typed without its rate in
              view is a figure with nothing to check it against. */}
          <View style={styles.grid}>
            <View style={styles.half}>
              <NumberField
                label={`Quantity (${draft.unit})`}
                value={draft.quantity}
                onChange={(n) => set({ quantity: n })}
                error={problems.quantity}
                decimals
              />
            </View>
            <View style={styles.half}>
              <NumberField
                label="Rate (₹)"
                value={draft.rate}
                onChange={(n) => set({ rate: n })}
                error={problems.rate}
                decimals
              />
            </View>
          </View>
          <NumberField
            label="Discount (%)"
            value={draft.discountPercent}
            onChange={(n) => set({ discountPercent: n })}
            error={problems.discountPercent}
            decimals
          />

          <Text style={[styles.fieldLabel, { color: t.textSecondary, marginTop: 4 }]}>GST Rate</Text>
          <View style={styles.chips}>
            {GST_RATES.map((r) => (
              <Chip
                key={r}
                label={`${r}%`}
                active={draft.gstRate === r}
                onPress={() => set({ gstRate: r })}
              />
            ))}
          </View>

          <TextField
            label="HSN / SAC"
            value={draft.hsn}
            onChangeText={(v) => set({ hsn: v })}
            placeholder="Enter HSN or SAC code"
            keyboardType="number-pad"
          />

          <View style={[styles.summary, { backgroundColor: t.surfaceInset }]}>
            <SummaryRow label="Taxable" value={formatCurrency(computed.taxable)} />
            <SummaryRow label={`GST ${draft.gstRate}%`} value={formatCurrency(computed.gstAmount)} />
            <SummaryRow label="Line Total" value={formatCurrency(computed.total)} strong />
          </View>

          {/* One row: destructive on the left, the confirming action on the
              right where the thumb rests. Stacked, "Remove item" sat directly
              under the primary as a full-width bar of the same size — two
              opposite outcomes a few dp apart, one of them irreversible. */}
          <View style={styles.actions}>
            {/* Icon only, and TINTED rather than filled: a bare trash glyph is
                unambiguous, and next to a filled primary a second solid bar of
                colour competes with the action you actually came to press. The
                accessibility label carries the word the button no longer shows. */}
            {onRemove && (
              <Pressable
                onPress={onRemove}
                accessibilityRole="button"
                accessibilityLabel="Remove item"
                style={({ pressed }) => [
                  styles.removeAction,
                  { backgroundColor: t.dangerBg, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Icon name="trash" size={20} color={t.danger} variant="Bulk" />
              </Pressable>
            )}
            <View style={styles.saveAction}>
              <Button
                label={line ? "Save Changes" : "Add to Quote"}
                onPress={() => {
                  feedback.tap()
                  onSave(draft)
                }}
                disabled={!valid}
                fullWidth
              />
            </View>
          </View>
        </>
      )}
    </Sheet>
  )
}

/**
 * A number field that keeps what the user typed as a string while they type.
 * Binding a TextInput straight to a number eats the decimal point the moment it
 * is entered ("12." parses to 12 and re-renders as "12"), which makes any
 * fractional rate impossible to type.
 */
function NumberField({
  label,
  value,
  onChange,
  error,
  decimals,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  error?: string
  decimals?: boolean
}) {
  const [text, setText] = React.useState(String(value ?? 0))
  const [focused, setFocused] = React.useState(false)

  React.useEffect(() => {
    if (!focused) setText(value === 0 ? "" : String(value))
  }, [value, focused])

  // The kit's TextField, so a rate here looks and behaves exactly like a phone
  // number on the customer form: same 48px height, same permanent hairline, same
  // focus and caret. Only the string-while-typing behaviour above is local.
  return (
    <TextField
      label={label}
      value={text}
      onChangeText={(v) => {
        const cleaned = decimals ? v.replace(/[^0-9.]/g, "") : v.replace(/[^0-9]/g, "")
        setText(cleaned)
        onChange(Number(cleaned) || 0)
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      error={error}
      keyboardType={decimals ? "decimal-pad" : "number-pad"}
      placeholder={`Enter ${label.toLowerCase()}`}
      fieldStyle={styles.numberField}
    />
  )
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const t = useTheme()
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: strong ? t.text : t.textSecondary }]}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          { color: t.text, fontFamily: strong ? font.bold : font.medium, fontSize: strong ? 16 : 14 },
        ]}
      >
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  searchInput: { flex: 1, marginLeft: 8, padding: 0, fontSize: 15, fontFamily: font.regular },
  customRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 4 },
  customIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  customLabel: { marginLeft: 12, fontSize: 15, fontFamily: font.semibold },
  productRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 4 },
  productBody: { flex: 1, marginRight: 10 },
  // The product name is what the eye lands on, so it carries the weight; the
  // MOQ and category line under it steps down in size and weight both. Same
  // 16/600 over 12/500 pair as the customer picker, so the two sheets reached
  // from this page read as one component.
  productName: { fontSize: 16, lineHeight: 21, fontFamily: font.semibold },
  productSub: { marginTop: 2, fontSize: 12, lineHeight: 16, fontFamily: font.medium },
  productPrice: { fontSize: 14, fontFamily: font.semibold },
  grid: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  // TextField owns its own bottom margin; the grid rows below set the rhythm.
  numberField: { marginBottom: spacing.md },
  fieldLabel: { marginBottom: 6, fontSize: 13, fontFamily: font.medium },
  chips: { flexDirection: "row", flexWrap: "wrap" },
  summary: { borderRadius: 18, padding: 14, marginTop: 6, marginBottom: spacing.md },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  summaryLabel: { fontSize: 14, fontFamily: font.regular },
  summaryValue: {},
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  // Square and one step down from the primary (buttonMd, not buttonLg): it is
  // the lesser action of the two and should not read as its equal.
  removeAction: {
    width: size.buttonMd,
    height: size.buttonMd,
    borderRadius: radius.buttonMd,
    alignItems: "center",
    justifyContent: "center",
  },
  saveAction: { flex: 1 },
})
