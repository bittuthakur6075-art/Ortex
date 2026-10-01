import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { formatCurrency, formatDate } from "@/domain/format"
import { isAdmin } from "@/domain/modules"
import type { Payment } from "@/domain/schema"
import { StatStrip } from "@/features/pay/payUi"
import { METHOD_ICON, paymentTotals, visiblePayments, type PaymentFilter } from "@/features/payments/payments"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  DataNotice,
  EmptyState,
  Fab,
  Icon,
  ListRefreshControl,
  ListRow,
  Panel,
  RowSeparator,
  SearchField,
  Sheet,
  SkeletonList,
} from "@/ui"
import CountChips from "@/ui/CountChips"

/** Whole rupees in a list, the paise in the detail. */
const rupees = (n: number) => formatCurrency(n).replace(/\.00$/, "")

/**
 * Payments, for the Super Admin and Admins: the console's Billing -> Payments
 * on the phone. Received, paid out and net on one strip, then All / Received /
 * Paid out and a search, then the ledger newest first: who, how (the method's
 * glyph and the UTR) and the signed amount. A row opens its details; Record
 * opens the form.
 */
export default function PaymentsScreen({ navigation }: StackScreenProps<"Payments">) {
  const t = useTheme()
  const { profile } = useAuth()
  const { items, loading, error, fromCache, cachedAt, reload } = useCollection<Payment>("payments")
  const [filter, setFilter] = React.useState<PaymentFilter>("all")
  const [query, setQuery] = React.useState("")
  const [refreshing, setRefreshing] = React.useState(false)
  const [open, setOpen] = React.useState<Payment | null>(null)

  const totals = React.useMemo(() => paymentTotals(items), [items])
  const shown = React.useMemo(() => visiblePayments(items, filter, query), [items, filter, query])

  if (!isAdmin(profile)) {
    return (
      <AppScreen title="Payments" back onBack={() => navigation.goBack()} inTabs={false}>
        <Panel>
          <EmptyState icon="lock" title="Admins only" hint="Payments are open to the Super Admin and Admins." />
        </Panel>
      </AppScreen>
    )
  }

  const record = () => {
    feedback.tap()
    navigation.navigate("PaymentNew")
  }

  return (
    <AppScreen
      title="Payments"
      subtitle="Received and paid out"
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      overlay={<Fab label="Record" icon="add" inTabs={false} accessibilityLabel="Record a payment" onPress={record} />}
      list={{
        data: [],
        renderItem: () => null,
        refreshControl: (
          <ListRefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await reload()
              setRefreshing(false)
            }}
          />
        ),
      }}
    >
      <DataNotice error={error} fromCache={fromCache} cachedAt={cachedAt} onRetry={() => void reload()} />

      {loading ? (
        <SkeletonList count={5} />
      ) : items.length === 0 ? (
        <Panel>
          <EmptyState icon="wallet" title="No payments yet" hint="Record a payment received or a payout made. It shows in the console too." />
        </Panel>
      ) : (
        <>
          <View style={[styles.top, { backgroundColor: t.surface }]}>
            <StatStrip
              stats={[
                { key: "in", label: "Received", value: rupees(totals.inflow) },
                { key: "out", label: "Paid out", value: rupees(totals.payout) },
                { key: "net", label: "Net", value: rupees(totals.net), tone: "accent" },
              ]}
            />
            <View style={styles.gap}>
              <SearchField value={query} onChangeText={setQuery} placeholder="Search name, UTR, number" />
            </View>
          </View>
          <CountChips
            options={[
              { key: "all", label: "All", count: totals.count.all },
              { key: "inflow", label: "Received", count: totals.count.inflow },
              { key: "payout", label: "Paid out", count: totals.count.payout },
            ]}
            value={filter}
            onChange={(k: PaymentFilter) => {
              feedback.select()
              setFilter(k)
            }}
          />
          <RowSeparator />

          {shown.length === 0 ? (
            <Panel>
              <Text style={[textVariants.small, styles.empty, { color: t.textTertiary }]}>No payments match.</Text>
            </Panel>
          ) : (
            <Panel>
              {shown.map((p, i) => {
                const inflow = p.type === "inflow"
                return (
                  <React.Fragment key={p.id}>
                    {i > 0 && <RowSeparator />}
                    <ListRow
                      leading={<MethodWell method={p.method} />}
                      title={p.party || p.customer?.name || "Unnamed"}
                      subtitle={[formatDate(p.date), p.method, p.reference].filter(Boolean).join(" · ")}
                      value={`${inflow ? "+" : "−"}${rupees(p.amount)}`}
                      valueSub={
                        <Text style={[textVariants.caption, { color: inflow ? t.successText : t.dangerText }]}>
                          {inflow ? "Received" : "Paid out"}
                        </Text>
                      }
                      onPress={() => {
                        feedback.tap()
                        setOpen(p)
                      }}
                    />
                  </React.Fragment>
                )
              })}
            </Panel>
          )}
        </>
      )}

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.number}>
        {open ? (
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <MethodWell method={open.method} size={48} />
              <View style={styles.sheetHeadBody}>
                <Text style={[textVariants.statLarge, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatCurrency(open.amount)}
                </Text>
                <Text style={[textVariants.small, { color: open.type === "inflow" ? t.successText : t.dangerText }]}>
                  {open.type === "inflow" ? "Received" : "Paid out"}
                </Text>
              </View>
            </View>
            <View style={[styles.facts, { backgroundColor: t.surfaceInset }]}>
              <Fact label={open.type === "inflow" ? "From" : "To"} value={open.party || open.customer?.name || "-"} />
              <Fact label="Date" value={formatDate(open.date)} />
              <Fact label="Method" value={open.method} />
              {open.reference ? <Fact label="Reference" value={open.reference} /> : null}
              {open.invoiceNumber ? <Fact label="Invoice" value={open.invoiceNumber} /> : null}
            </View>
            {open.note ? <Text style={[textVariants.body, { color: t.textSecondary }]}>{open.note}</Text> : null}
            <Text style={[textVariants.caption, { color: t.textTertiary }]}>Edit, delete or print a receipt in the console.</Text>
          </View>
        ) : (
          <View />
        )}
      </Sheet>
    </AppScreen>
  )
}

/** The method's glyph on a round well. */
export function MethodWell({ method, size = 38 }: { method: string; size?: number }) {
  const t = useTheme()
  const tone = t.tones.slate
  return (
    <View style={[styles.well, { width: size, height: size, borderRadius: radius.pill, backgroundColor: tone.bg }]}>
      <Icon name={METHOD_ICON[method] || "wallet"} size={Math.round(size * 0.48)} color={tone.fg} variant="Bulk" />
    </View>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  const t = useTheme()
  return (
    <View style={styles.fact}>
      <Text style={[textVariants.small, { color: t.textTertiary }]}>{label}</Text>
      <Text style={[textVariants.smallStrong, { color: t.text, flex: 1, textAlign: "right" }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: gutter, paddingVertical: gutter },
  gap: { marginTop: spacing.md },
  empty: { paddingHorizontal: gutter, paddingVertical: spacing.xl, textAlign: "center" },
  well: { alignItems: "center", justifyContent: "center" },
  sheet: { gap: spacing.md, paddingBottom: spacing.md },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sheetHeadBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  facts: { borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  fact: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: spacing.md },
})
