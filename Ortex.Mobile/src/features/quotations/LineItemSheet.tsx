import React from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"

import { formatCurrency } from "@/domain/format"
import { computeLine } from "@/domain/pricing"
import { GST_RATES, UNITS, newLine, type Line, type Product } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
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
  const valid = !!draft.description.trim()

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={mode === "product" ? "Add an item" : draft.description || "Line item"}
    >
      {mode === "product" ? (
        <>
          <View style={[styles.search, { backgroundColor: t.searchBg }]}>
            <Icon name="search" size={18} color={t.textTertiary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search the catalogue"
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
            android_ripple={{ color: t.ripple }}
            style={styles.customRow}
          >
            <View style={[styles.customIcon, { backgroundColor: t.accentSoft }]}>
              <Icon name="edit" size={18} color={t.accent} />
            </View>
            <Text style={[styles.customLabel, { color: t.accent }]}>
              {query.trim() ? `Custom item “${query.trim()}”` : "Custom item (not in the catalogue)"}
            </Text>
          </Pressable>

          {matches.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => pickProduct(p)}
              android_ripple={{ color: t.ripple }}
              style={styles.productRow}
            >
              <View style={styles.productBody}>
                <Text numberOfLines={1} style={[styles.productName, { color: t.text }]}>
                  {p.name}
                </Text>
                <Text numberOfLines={1} style={[styles.productSub, { color: t.textTertiary }]}>
                  {[p.sku, p.moq > 1 ? `MOQ ${p.moq}` : null, `${p.gstRate ?? 18}% GST`]
                    .filter(Boolean)
                    .join(" · ")}
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
            placeholder="What are you quoting for?"
            trailingIcon="catalogue"
            onTrailingPress={() => setMode("product")}
          />

          <View style={styles.grid}>
            <NumberField
              label="Quantity"
              value={draft.quantity}
              onChange={(n) => set({ quantity: n })}
              decimals
            />
            <NumberField label="Rate ₹" value={draft.rate} onChange={(n) => set({ rate: n })} decimals />
          </View>
          <View style={styles.grid}>
            <NumberField
              label="Discount %"
              value={draft.discountPercent}
              onChange={(n) => set({ discountPercent: n })}
              decimals
            />
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Unit</Text>
              <View style={styles.chips}>
                {UNITS.map((u) => (
                  <Chip key={u} label={u} small active={draft.unit === u} onPress={() => set({ unit: u })} />
                ))}
              </View>
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: t.textSecondary, marginTop: 4 }]}>GST rate</Text>
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
            placeholder="Optional"
            keyboardType="number-pad"
          />

          <View style={[styles.summary, { backgroundColor: t.surface }]}>
            <SummaryRow label="Taxable" value={formatCurrency(computed.taxable)} />
            <SummaryRow label={`GST ${draft.gstRate}%`} value={formatCurrency(computed.gstAmount)} />
            <SummaryRow label="Line total" value={formatCurrency(computed.total)} strong />
          </View>

          <View style={styles.actions}>
            <Button
              label={line ? "Save item" : "Add item"}
              onPress={() => {
                feedback.tap()
                onSave(draft)
              }}
              disabled={!valid}
              fullWidth
            />
            {onRemove && (
              <View style={styles.remove}>
                <Button label="Remove item" variant="danger" onPress={onRemove} fullWidth />
              </View>
            )}
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
  decimals,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  decimals?: boolean
}) {
  const t = useTheme()
  const [text, setText] = React.useState(String(value ?? 0))
  const [focused, setFocused] = React.useState(false)

  React.useEffect(() => {
    if (!focused) setText(value === 0 ? "" : String(value))
  }, [value, focused])

  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={(v) => {
          const cleaned = decimals ? v.replace(/[^0-9.]/g, "") : v.replace(/[^0-9]/g, "")
          setText(cleaned)
          onChange(Number(cleaned) || 0)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType={decimals ? "decimal-pad" : "number-pad"}
        placeholder="0"
        placeholderTextColor={t.textTertiary}
        style={[styles.numberInput, { backgroundColor: t.searchBg, color: t.text }]}
      />
    </View>
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
  productName: { fontSize: 15, fontFamily: font.medium },
  productSub: { marginTop: 2, fontSize: 12.5, fontFamily: font.regular },
  productPrice: { fontSize: 14, fontFamily: font.semibold },
  grid: { flexDirection: "row", gap: 12 },
  field: { flex: 1, marginBottom: 14 },
  fieldLabel: { marginBottom: 6, fontSize: 13, fontFamily: font.medium },
  numberInput: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 17,
    fontFamily: font.semibold,
  },
  chips: { flexDirection: "row", flexWrap: "wrap" },
  summary: { borderRadius: 18, padding: 14, marginTop: 6, marginBottom: 16 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  summaryLabel: { fontSize: 14, fontFamily: font.regular },
  summaryValue: {},
  actions: {},
  remove: { marginTop: 8 },
})
