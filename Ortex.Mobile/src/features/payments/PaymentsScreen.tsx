import React from "react"
import { StyleSheet, Text, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { formatCurrency } from "@/domain/format"
import { canAccess, isSuperAdmin } from "@/domain/modules"
import type { Payment } from "@/domain/schema"
import { SECTION_TITLE } from "@/features/attendance/format"
import { todayIST } from "@/features/leave/leaveFormat"
import { StatStrip } from "@/features/pay/payUi"
import {
  inPeriod,
  inTally,
  METHOD_ICON,
  monthSections,
  paymentDay,
  paymentTotals,
  TALLY_LOCKED,
  visiblePayments,
  type PaymentFilter,
  type PaymentPeriod,
} from "@/features/payments/payments"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  Button,
  DataNotice,
  EmptyState,
  Icon,
  ListRefreshControl,
  ListRow,
  Panel,
  RowSeparator,
  SearchField,
  SegmentedControl,
  Sheet,
  SkeletonList,
  SquircleBackground,
} from "@/ui"
import CountChips from "@/ui/CountChips"
import { SubHeader } from "@/ui/OneUi"

/** Whole rupees in a list, the paise in the detail. */
const rupees = (n: number) => formatCurrency(n).replace(/\.00$/, "")

const PERIODS: { key: PaymentPeriod; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "fy", label: "This FY" },
  { key: "all", label: "All" },
]

/**
 * Payments, for whoever holds the `payments` module (the database's gate, so
 * Accounts too): the console's Billing -> Payments on the phone. A period
 * (this month, this financial year, all), received, paid out and net on one
 * strip, then All / Received / Paid out and a search, then the ledger newest
 * first under month headings. A row opens its details, with Edit; the footer
 * records money paid out or received.
 */
export default function PaymentsScreen(props: StackScreenProps<"Payments">) {
  const { profile } = useAuth()
  // Gate before the ledger is fetched: no module, no read, no false "No payments yet".
  if (!canAccess(profile, "payments")) {
    return (
      <AppScreen title="Payments" back onBack={() => props.navigation.goBack()} inTabs={false}>
        <Panel>
          <EmptyState
            icon="lock"
            title="Not in your access"
            hint="Payments need the Payments module. An admin can grant it."
          />
        </Panel>
      </AppScreen>
    )
  }
  return <PaymentsLedger {...props} />
}

function PaymentsLedger({ navigation }: StackScreenProps<"Payments">) {
  const t = useTheme()
  const { profile } = useAuth()
  const { items, loading, error, fromCache, cachedAt, reload } = useCollection<Payment>("payments")
  const [period, setPeriod] = React.useState<PaymentPeriod>("month")
  const [filter, setFilter] = React.useState<PaymentFilter>("all")
  const [query, setQuery] = React.useState("")
  const [refreshing, setRefreshing] = React.useState(false)
  const [open, setOpen] = React.useState<Payment | null>(null)

  const today = todayIST()
  const inRange = React.useMemo(() => inPeriod(items, period, today), [items, period, today])
  const totals = React.useMemo(() => paymentTotals(inRange), [inRange])
  const sections = React.useMemo(
    () => monthSections(visiblePayments(inRange, filter, query)),
    [inRange, filter, query],
  )

  const insets = useSafeAreaInsets()
  const [footerH, setFooterH] = React.useState(0)
  // Two buttons side by side clip at 360dp with large text: stack them.
  const { width, fontScale } = useWindowDimensions()
  const stacked = width < 380 || fontScale > 1.15

  const record = (type: "inflow" | "payout") => {
    feedback.tap()
    navigation.navigate("PaymentNew", { type })
  }

  const locked = !!open && inTally(open) && !isSuperAdmin(profile)

  return (
    <AppScreen
      title="Payments"
      subtitle="Received and paid out"
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      overlay={
        <View
          onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
          style={[
            styles.footer,
            stacked ? styles.footerStacked : null,
            { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: insets.bottom + spacing.sm },
          ]}
        >
          <View style={stacked ? null : styles.half}>
            <Button
              label="Paid out"
              icon="moneyOut"
              variant="danger-tonal"
              fullWidth
              accessibilityLabel="Record a payout"
              onPress={() => record("payout")}
            />
          </View>
          <View style={stacked ? null : styles.half}>
            <Button
              label="Received"
              icon="moneyIn"
              variant="success"
              fullWidth
              accessibilityLabel="Record a payment received"
              onPress={() => record("inflow")}
            />
          </View>
        </View>
      }
      sections={{
        contentContainerStyle: { paddingBottom: footerH + spacing.lg },
        // Virtualised: thousands of rows draw only what is on screen.
        sections: loading || items.length === 0 ? [] : sections,
        keyExtractor: (p: unknown) => (p as Payment).id,
        stickySectionHeadersEnabled: false,
        renderSectionHeader: ({ section }: { section: unknown }) => (
          <View style={{ backgroundColor: t.surface }}>
            <SubHeader flush titleStyle={SECTION_TITLE} title={(section as { title: string }).title} />
          </View>
        ),
        ItemSeparatorComponent: RowSeparator,
        renderSectionFooter: () => <RowSeparator />,
        ListEmptyComponent:
          loading || items.length === 0 ? null : (
            <Panel>
              <Text style={[textVariants.small, styles.empty, { color: t.textTertiary }]}>
                {inRange.length ? "No payments match." : "No payments in this period."}
              </Text>
            </Panel>
          ),
        renderItem: ({ item }: { item: unknown }) => {
          const p = item as Payment
          const inflow = p.type === "inflow"
          return (
            <View style={{ backgroundColor: t.surface }}>
              <ListRow
                leading={<MethodWell method={p.method} />}
                title={p.party || p.customer?.name || "Unnamed"}
                subtitle={[paymentDay(p.date), p.method, p.reference].filter(Boolean).join(" · ")}
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
            </View>
          )
        },
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
        error ? null : (
          <Panel>
            <EmptyState
              icon="wallet"
              title="No payments yet"
              hint="Record a payment received or a payout made. It shows in the console too."
            />
          </Panel>
        )
      ) : (
        <>
          <View style={[styles.top, { backgroundColor: t.surface }]}>
            <SegmentedControl<PaymentPeriod>
              options={PERIODS}
              value={period}
              onChange={(k) => {
                feedback.select()
                setPeriod(k)
              }}
            />
            <View style={styles.gap}>
              <StatStrip
                stats={[
                  { key: "in", label: "Received", value: rupees(totals.inflow) },
                  { key: "out", label: "Paid out", value: rupees(totals.payout) },
                  { key: "net", label: "Net", value: rupees(totals.net), tone: "accent" },
                ]}
              />
            </View>
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
        </>
      )}

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.number}>
        {open ? (
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <MethodWell method={open.method} size={48} />
              <View style={styles.sheetHeadBody}>
                <Text
                  style={[textVariants.statLarge, { color: t.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatCurrency(open.amount)}
                </Text>
                <Text
                  style={[
                    textVariants.small,
                    { color: open.type === "inflow" ? t.successText : t.dangerText },
                  ]}
                >
                  {open.type === "inflow" ? "Received" : "Paid out"}
                </Text>
              </View>
            </View>
            <View style={styles.facts}>
              <SquircleBackground fill={t.surfaceInset} radius={radius.card} />
              <Fact
                label={open.type === "inflow" ? "From" : "To"}
                value={open.party || open.customer?.name || "-"}
              />
              <Fact label="Date" value={paymentDay(open.date)} />
              <Fact label="Method" value={open.method} />
              {open.reference ? <Fact label="Reference" value={open.reference} /> : null}
              {open.invoiceNumber ? <Fact label="Invoice" value={open.invoiceNumber} /> : null}
            </View>
            {open.note ? (
              <Text style={[textVariants.body, { color: t.textSecondary }]}>{open.note}</Text>
            ) : null}
            <Button
              label={open.type === "inflow" ? "Edit payment" : "Edit payout"}
              icon="edit"
              variant="outline"
              fullWidth
              disabled={locked}
              onPress={() => {
                feedback.tap()
                const id = open.id
                setOpen(null)
                navigation.navigate("PaymentNew", { id })
              }}
            />
            <Text style={[textVariants.caption, { color: t.textTertiary }]}>
              {locked ? TALLY_LOCKED : "Delete or print a receipt in the console."}
            </Text>
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
    <View
      style={[
        styles.well,
        { width: size, height: size, borderRadius: radius.pill, backgroundColor: tone.bg },
      ]}
    >
      <Icon
        name={METHOD_ICON[method] || "wallet"}
        size={Math.round(size * 0.48)}
        color={tone.fg}
        variant="Bulk"
      />
    </View>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  const t = useTheme()
  return (
    <View style={styles.fact}>
      <Text style={[textVariants.small, { color: t.textTertiary }]}>{label}</Text>
      <Text
        style={[textVariants.smallStrong, { color: t.text, flex: 1, textAlign: "right" }]}
        numberOfLines={2}
      >
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
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerStacked: { flexDirection: "column", gap: spacing.sm },
  half: { flex: 1 },
  sheetHeadBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  facts: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  fact: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: spacing.md },
})
