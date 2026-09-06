import React from "react"
import { Keyboard, Pressable, SectionList, StyleSheet, Text, TextInput, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { formatCurrency, relativeTime } from "@/domain/format"
import {
  ENQUIRY_STATUS,
  PRODUCT_STATUS,
  QUOTATION_STATUS,
  type Customer,
  type Enquiry,
  type Product,
  type Quotation,
  type Row,
} from "@/domain/schema"
import { VOICE_SOURCE } from "@/domain/voice"
import { useCollection } from "@/hooks/useCollection"
import { prettyPhone } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, size as sizes, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { EmptyState, Icon, ListRow, RowSeparator, StatusBadge } from "@/ui"

/**
 * Global search.
 *
 * One field over everything a salesperson might be holding in their head — a
 * quotation number, half a company name, the last four digits of a phone. Per-tab
 * search fields could only ever find what you were already looking at, which is
 * the wrong way round: you reach for search precisely when you do not know which
 * list the thing is in.
 *
 * The app bar's search button opens this on every tab, so the gesture is the same
 * wherever you are.
 */

type Hit =
  | { kind: "quotation"; doc: Quotation }
  | { kind: "enquiry"; doc: Enquiry }
  | { kind: "product"; doc: Product }
  | { kind: "customer"; doc: Customer & Row }

const matches = (needle: string, ...haystack: (string | undefined | null)[]) =>
  haystack.filter(Boolean).some((v) => String(v).toLowerCase().includes(needle))

export default function GlobalSearchScreen({ navigation }: StackScreenProps<"Search">) {
  const c = useTheme()
  const insets = useSafeAreaInsets()
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef<TextInput>(null)

  const { items: quotations } = useCollection<Quotation>("quotations")
  const { items: enquiries } = useCollection<Enquiry>("enquiries")
  const { items: products } = useCollection<Product>("products")
  const { items: customers } = useCollection<Customer & Row>("customers")

  // Open the keyboard on arrival: the screen exists to be typed into.
  React.useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250)
    return () => clearTimeout(t)
  }, [])

  const sections = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []

    // Digits-only too, so "9876" finds a number stored as "+91 98765 43210".
    const digits = q.replace(/\D/g, "")
    const phoneHit = (phone?: string) =>
      digits.length >= 3 &&
      String(phone || "")
        .replace(/\D/g, "")
        .includes(digits)

    const quoteHits: Hit[] = quotations
      .filter(
        (d) =>
          matches(q, d.number, d.customer?.name, d.customer?.company, d.customer?.gstin) ||
          phoneHit(d.customer?.phone),
      )
      .slice(0, 8)
      .map((doc) => ({ kind: "quotation", doc }))

    const enquiryHits: Hit[] = enquiries
      .filter(
        (d) =>
          matches(q, d.customer?.name, d.customer?.company, d.productInterest, d.message, d.source) ||
          phoneHit(d.customer?.phone),
      )
      .slice(0, 8)
      .map((doc) => ({ kind: "enquiry", doc }))

    const productHits: Hit[] = products
      .filter((d) => matches(q, d.name, d.sku, d.category, d.hsn, d.material))
      .slice(0, 8)
      .map((doc) => ({ kind: "product", doc }))

    const customerHits: Hit[] = customers
      .filter((d) => matches(q, d.name, d.company, d.email, d.gstin) || phoneHit(d.phone))
      .slice(0, 8)
      .map((doc) => ({ kind: "customer", doc }))

    return [
      { title: "Quotations", data: quoteHits },
      { title: "Leads", data: enquiryHits },
      { title: "Contacts", data: customerHits },
      { title: "Products", data: productHits },
    ].filter((s) => s.data.length)
  }, [query, quotations, enquiries, products, customers])

  const total = sections.reduce((n, s) => n + s.data.length, 0)

  const open = (hit: Hit) => {
    feedback.tap()
    Keyboard.dismiss()
    switch (hit.kind) {
      case "quotation":
        navigation.replace("QuotationDetail", { id: hit.doc.id })
        break
      case "customer":
        navigation.replace("CustomerDetail", { id: hit.doc.id })
        break
      case "product":
        // A searched-for product goes STRAIGHT onto a quotation rather than to its
        // page (ProductDetail): you came here from the editor's own hunt for a line
        // item, and a detail page in the middle of that is a step, not a service.
        navigation.replace("QuotationEditor", {
          prefill: {
            lines: [
              {
                productId: hit.doc.id,
                description: hit.doc.name,
                hsn: hit.doc.hsn || "",
                quantity: hit.doc.moq || 1,
                unit: hit.doc.unit || "pcs",
                rate: hit.doc.basePrice || 0,
                discountPercent: 0,
                gstRate: hit.doc.gstRate ?? 18,
              },
            ],
          },
        })
        break
      case "enquiry":
        navigation.replace("QuotationEditor", {
          prefill: { customer: hit.doc.customer, enquiryId: hit.doc.id },
        })
        break
    }
  }

  const renderHit = (hit: Hit) => {
    switch (hit.kind) {
      case "quotation":
        return (
          <ListRow
            leadingIcon="quote"
            title={hit.doc.customer?.company || hit.doc.customer?.name || "No customer"}
            subtitle={hit.doc.number}
            value={formatCurrency(hit.doc.totals?.grandTotal || 0)}
            valueSub={<StatusBadge list={QUOTATION_STATUS} id={hit.doc.status} small />}
            chevron={false}
            onPress={() => open(hit)}
          />
        )
      case "enquiry":
        return (
          <ListRow
            leadingIcon={hit.doc.source === VOICE_SOURCE ? "voice" : "enquiry"}
            title={hit.doc.customer?.name || hit.doc.customer?.company || "Unnamed enquiry"}
            subtitle={[hit.doc.productInterest, relativeTime(hit.doc.createdAt)].filter(Boolean).join(" · ")}
            valueSub={<StatusBadge list={ENQUIRY_STATUS} id={hit.doc.status} small />}
            chevron={false}
            onPress={() => open(hit)}
          />
        )
      case "customer":
        return (
          <ListRow
            leadingIcon="customer"
            title={hit.doc.company || hit.doc.name || "Unnamed contact"}
            subtitle={hit.doc.phone ? prettyPhone(hit.doc.phone) : hit.doc.email}
            onPress={() => open(hit)}
          />
        )
      case "product":
        return (
          <ListRow
            leadingIcon="product"
            title={hit.doc.name}
            subtitle={[hit.doc.sku, hit.doc.category].filter(Boolean).join(" · ")}
            value={formatCurrency(hit.doc.basePrice)}
            valueSub={<StatusBadge list={PRODUCT_STATUS} id={hit.doc.status} small />}
            chevron={false}
            onPress={() => open(hit)}
          />
        )
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <View style={[styles.bar, { height: sizes.appBar }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close search"
          style={styles.backSlot}
        >
          <Icon name="back" size={24} color={c.text} />
        </Pressable>

        <View style={[styles.field, { backgroundColor: c.fieldBg }]}>
          <Icon name="search" size={18} color={c.textTertiary} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Quotes, leads, products, contacts"
            placeholderTextColor={c.textTertiary}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            cursorColor={c.fieldCursor}
            selectionColor={c.fieldCursor}
            style={[textVariants.body, styles.input, { color: c.text }]}
          />
          {query.length > 0 && (
            <Pressable hitSlop={10} onPress={() => setQuery("")} accessibilityLabel="Clear search">
              <Icon name="close" size={18} color={c.textTertiary} variant="Bulk" />
            </Pressable>
          )}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(hit) => `${hit.kind}:${hit.doc.id}`}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead}>
            <Text style={[textVariants.sectionLabel, { color: c.textTertiary }]}>
              {section.title.toUpperCase()}
            </Text>
          </View>
        )}
        ItemSeparatorComponent={RowSeparator}
        renderItem={({ item }) => renderHit(item)}
        ListEmptyComponent={
          <View style={{ paddingTop: spacing.xxl }}>
            <EmptyState
              icon="search"
              title={query.trim().length < 2 ? "Search everything" : `Nothing matches “${query.trim()}”`}
              hint={
                query.trim().length < 2
                  ? "A quotation number, a company, or the last digits of a phone number."
                  : "Try fewer characters, or a different spelling."
              }
            />
          </View>
        }
      />

      {total > 0 && (
        <View
          style={[
            styles.count,
            {
              borderTopColor: c.divider,
              backgroundColor: c.appBar,
              paddingBottom: insets.bottom + spacing.sm,
            },
          ]}
        >
          <Text style={[textVariants.caption, { color: c.textTertiary }]}>
            {total} result{total === 1 ? "" : "s"}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: gutter,
  },
  backSlot: {
    width: sizes.touchMin,
    height: sizes.touchMin,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: gutter - 10,
  },
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    marginLeft: spacing.xs,
  },
  input: { flex: 1, marginLeft: spacing.sm, padding: 0 },
  sectionHead: {
    paddingHorizontal: gutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  count: {
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    paddingTop: spacing.sm,
  },
})
