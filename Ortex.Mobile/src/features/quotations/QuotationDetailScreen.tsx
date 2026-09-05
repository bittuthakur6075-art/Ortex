import React from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { daysUntil, formatCurrency, formatDate } from "@/domain/format"
import { stateLabel } from "@/domain/gstStates"
import { LOST_REASONS, QUOTATION_STATUS, type Quotation } from "@/domain/schema"
import { useSettings } from "@/hooks/useSettings"
import { callNumber, prettyPhone, whatsapp } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import { printQuotation, shareQuotationPdf } from "@/lib/pdf"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import { Button, Card, Divider, Icon, IconButton, Sheet, Spinner, StatusBadge, useToast } from "@/ui"

export default function QuotationDetailScreen({ route, navigation }: StackScreenProps<"QuotationDetail">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { settings } = useSettings()
  const [doc, setDoc] = React.useState<Quotation | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [statusOpen, setStatusOpen] = React.useState(false)
  const [lostOpen, setLostOpen] = React.useState(false)
  const [sharing, setSharing] = React.useState(false)

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
    return repo.subscribe(() => void load())
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

  const share = async () => {
    if (!doc) return
    setSharing(true)
    try {
      await shareQuotationPdf(doc, settings)
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
      <View style={[styles.root, styles.centre, { backgroundColor: t.bg }]}>
        <Spinner label="Loading quotation" />
      </View>
    )
  }

  if (!doc) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: t.bg, paddingTop: insets.top }]}>
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
  const left = doc.validUntil ? daysUntil(doc.validUntil) : null

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={[styles.head, { paddingTop: insets.top + 6 }]}>
        <IconButton name="back" onPress={() => navigation.goBack()} accessibilityLabel="Back" />
        <View style={styles.headSpacer} />
        <IconButton
          name="edit"
          onPress={() => navigation.navigate("QuotationEditor", { id: doc.id })}
          accessibilityLabel="Edit quotation"
        />
        <IconButton
          name="print"
          onPress={() => void printQuotation(doc, settings)}
          accessibilityLabel="Print quotation"
        />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
        <Text style={[styles.number, { color: t.textTertiary }]}>{doc.number}</Text>
        <Text style={[styles.amount, { color: t.text }]}>{formatCurrency(totals?.grandTotal || 0)}</Text>
        <View style={styles.headline}>
          <StatusBadge list={QUOTATION_STATUS} id={doc.status} />
          <Text style={[styles.validity, { color: left != null && left < 0 ? t.danger : t.textSecondary }]}>
            {doc.validUntil
              ? left != null && left < 0
                ? `Expired ${formatDate(doc.validUntil)}`
                : `Valid until ${formatDate(doc.validUntil)}`
              : formatDate(doc.issueDate)}
          </Text>
        </View>

        <Card padding={16} style={styles.card}>
          <Text style={[styles.cardTitle, { color: t.textTertiary }]}>Quotation for</Text>
          <Text style={[styles.customer, { color: t.text }]}>
            {doc.customer?.company || doc.customer?.name || "-"}
          </Text>
          {!!(doc.customer?.company && doc.customer?.name) && (
            <Text style={[styles.customerSub, { color: t.textSecondary }]}>{doc.customer.name}</Text>
          )}
          {hasPhone && (
            <Text style={[styles.customerSub, { color: t.textSecondary }]}>{prettyPhone(phone)}</Text>
          )}
          {!!doc.customer?.gstin && (
            <Text style={[styles.customerSub, { color: t.textSecondary }]}>GSTIN {doc.customer.gstin}</Text>
          )}
          <Text style={[styles.customerSub, { color: t.textTertiary }]}>
            Place of supply: {stateLabel(doc.shipTo?.stateCode || doc.customer?.stateCode) || "Not set"}
          </Text>
          <View style={styles.contactRow}>
            <Button
              label="Call"
              icon="call"
              size="sm"
              variant="secondary"
              disabled={!hasPhone}
              onPress={() => void callNumber(phone)}
            />
            <Button
              label="WhatsApp"
              icon="whatsapp"
              size="sm"
              variant="secondary"
              disabled={!hasPhone}
              onPress={() =>
                void whatsapp(
                  phone,
                  `Hello${doc.customer?.name ? ` ${doc.customer.name}` : ""}, here is quotation ${
                    doc.number
                  } for ${formatCurrency(totals?.grandTotal || 0)}. — ${settings.company.name}`,
                )
              }
            />
          </View>
        </Card>

        <Card padding={0} style={styles.card}>
          {(doc.lines || []).map((line, i) => {
            const computed = totals?.lines?.[i]
            return (
              <View key={i}>
                {i > 0 && <Divider inset={20} />}
                <View style={styles.lineRow}>
                  <View style={styles.lineBody}>
                    <Text style={[styles.lineName, { color: t.text }]}>{line.description || "Item"}</Text>
                    <Text style={[styles.lineSub, { color: t.textTertiary }]}>
                      {line.quantity} {line.unit} × {formatCurrency(line.rate)}
                      {line.discountPercent ? ` · ${line.discountPercent}% off` : ""} · {line.gstRate}% GST
                    </Text>
                  </View>
                  <Text style={[styles.lineAmount, { color: t.text }]}>
                    {formatCurrency(computed?.taxable ?? 0)}
                  </Text>
                </View>
              </View>
            )
          })}
          {!doc.lines?.length && (
            <Text style={[styles.emptyLines, { color: t.textTertiary }]}>No itemised lines.</Text>
          )}
        </Card>

        <Card padding={16} style={styles.card}>
          <TotalRow label="Subtotal" value={formatCurrency(totals?.subTotal)} />
          {(totals?.totalDiscount || 0) > 0 && (
            <TotalRow label="Discount" value={`-${formatCurrency(totals?.totalDiscount)}`} />
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
          <Divider />
          <TotalRow label="Total" value={formatCurrency(totals?.grandTotal)} strong />
        </Card>

        {(!!doc.terms || !!doc.notes) && (
          <Card padding={16} style={styles.card}>
            {!!doc.notes && (
              <>
                <Text style={[styles.cardTitle, { color: t.textTertiary }]}>Notes</Text>
                <Text style={[styles.body, { color: t.textSecondary }]}>{doc.notes}</Text>
              </>
            )}
            {!!doc.terms && (
              <>
                <Text style={[styles.cardTitle, { color: t.textTertiary, marginTop: doc.notes ? 14 : 0 }]}>
                  Terms
                </Text>
                <Text style={[styles.body, { color: t.textSecondary }]}>{doc.terms}</Text>
              </>
            )}
          </Card>
        )}

        <Pressable onPress={() => setStatusOpen(true)} style={styles.statusButton}>
          <Icon name="tick" size={18} color={t.accent} />
          <Text style={[styles.statusLabel, { color: t.accent }]}>Change status</Text>
        </Pressable>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { backgroundColor: t.headerBg, borderTopColor: t.divider, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <Button
          label={sharing ? "Preparing…" : "Share PDF"}
          icon="share"
          onPress={share}
          loading={sharing}
          fullWidth
        />
      </View>

      <Sheet visible={statusOpen} onClose={() => setStatusOpen(false)} title="Quotation status">
        {QUOTATION_STATUS.map((s) => (
          <Pressable
            key={s.id}
            onPress={() =>
              s.id === "rejected" ? (setStatusOpen(false), setLostOpen(true)) : void setStatus(s.id)
            }
            android_ripple={{ color: t.ripple }}
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
            {s.id === doc.status && <Icon name="tick" size={20} color={t.accent} variant="Bold" />}
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
            android_ripple={{ color: t.ripple }}
            style={styles.sheetRow}
          >
            <Text style={[styles.sheetLabel, { color: t.text }]}>{reason}</Text>
          </Pressable>
        ))}
      </Sheet>
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
  centre: { alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 4 },
  headSpacer: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  number: { fontSize: 13, letterSpacing: 0.4, fontFamily: font.medium },
  amount: { marginTop: 2, fontSize: 34, letterSpacing: -1, fontFamily: font.extrabold },
  headline: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 20 },
  validity: { fontSize: 13, fontFamily: font.medium },
  card: { marginBottom: 16 },
  cardTitle: {
    fontSize: 11.5,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
    fontFamily: font.semibold,
  },
  customer: { fontSize: 18, fontFamily: font.bold },
  customerSub: { marginTop: 2, fontSize: 13.5, fontFamily: font.regular },
  contactRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  lineRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14 },
  lineBody: { flex: 1, marginRight: 10 },
  lineName: { fontSize: 15, fontFamily: font.semibold },
  lineSub: { marginTop: 3, fontSize: 12.5, fontFamily: font.regular },
  lineAmount: { fontSize: 15, fontFamily: font.bold },
  emptyLines: { padding: 18, fontSize: 14, fontFamily: font.regular },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  totalLabel: { fontSize: 14, fontFamily: font.regular },
  totalValue: {},
  body: { fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  statusButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  statusLabel: { marginLeft: 8, fontSize: 15, fontFamily: font.semibold },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 6 },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 12 },
  sheetLabel: { flex: 1, fontSize: 16 },
})
