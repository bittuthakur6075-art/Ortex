import React, { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import type { Collection, HistoryEntry, StaffDirectory } from "@/data/repo"
import { formatCurrency, formatDateTime, relativeTime } from "@/domain/format"
import { actorOf, useRecordHistory } from "@/hooks/useRecordHistory"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import Avatar from "@/ui/Avatar"
import Panel from "@/ui/Panel"

/**
 * Who made this record, who last touched it, and every change since.
 *
 * MIRRORS Ortex.Admin/src/components/ui/RecordActivity.jsx — the same three
 * states, the same wording, the same field labels — drawn as a Panel because
 * that is this app's only section language.
 *
 * Reads as prose rather than a table: the question a person opens this to ask
 * is "who changed the rate on this?", and a grid of uuids and JSON answers a
 * different one.
 */

// doc keys are camelCase and several are meaningless on their own ("gstRate"
// reads as a variable, not a fact), so the ones that show up in real changes
// get a human label. Anything unmapped is de-camelised, which is right often
// enough not to enumerate every key in the schema.
const FIELD_LABELS: Record<string, string> = {
  amount: "Amount",
  balance: "Balance",
  category: "Category",
  cost: "Cost price",
  costPrice: "Cost price",
  customer: "Customer",
  description: "Description",
  discount: "Discount",
  dueDate: "Due date",
  gstRate: "GST rate",
  hsn: "HSN code",
  images: "Photos",
  imageUrls: "Photos",
  items: "Line items",
  lines: "Line items",
  moq: "Minimum order qty",
  name: "Name",
  notes: "Notes",
  number: "Number",
  owner: "Owner",
  placeOfSupply: "Place of supply",
  basePrice: "Price",
  price: "Price",
  productInterest: "Product interest",
  quantity: "Quantity",
  rate: "Rate",
  reference: "Reference",
  showOnWebsite: "Website visibility",
  sku: "SKU",
  starred: "Starred",
  status: "Status",
  total: "Total",
  validUntil: "Valid until",
}

const MONEY_KEYS = new Set(["amount", "balance", "cost", "costPrice", "basePrice", "discount", "price", "rate", "total", "subtotal"])

function labelFor(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// A value out of a jsonb diff can be anything. Print the scalars a person can
// read and summarise the rest by shape — "3 items" says more about a line-items
// change than 400 characters of JSON, and the document itself is on the screen
// this panel sits on.
function valueText(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty"
  if (typeof value === "boolean") return value ? "yes" : "no"
  if (typeof value === "number") return MONEY_KEYS.has(key) ? formatCurrency(value) : String(value)
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "item" : "items"}`
  if (typeof value === "object") {
    const v = value as Record<string, unknown>
    const name = (v.name || v.company || v.title) as string | undefined
    return name ? String(name) : "details"
  }
  const s = String(value)
  if (s === "…") return "(too long to record)"
  return s.length > 80 ? `${s.slice(0, 80)}…` : s
}

const ACTION_VERB: Record<HistoryEntry["action"], string> = {
  insert: "Created",
  update: "Edited",
  delete: "Deleted",
}

function Person({ name, avatarUrl, known }: { name: string; avatarUrl: string; known: boolean }) {
  const t = useTheme()
  return (
    <View style={styles.person}>
      <Avatar name={name} uri={avatarUrl || undefined} size={20} />
      <Text style={[styles.personName, { color: known ? t.text : t.textTertiary, fontFamily: known ? font.medium : font.regular }]}>
        {name}
      </Text>
    </View>
  )
}

function Entry({ entry, directory, isLast }: { entry: HistoryEntry; directory: StaffDirectory; isLast: boolean }) {
  const t = useTheme()
  // A null actor inside a history entry is not a gap: it is the service role,
  // which has no auth.uid() — the website's own lead insert, the telecaller
  // sweep, the Tally connector.
  const actor = actorOf(entry.actor, directory, "Automation")
  const keys = entry.action === "update" ? Object.keys(entry.changes || {}) : []

  return (
    <View style={styles.entry}>
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: t.textTertiary }]} />
        {/* The rail joins this entry to the next, so the last one has none. */}
        {!isLast && <View style={[styles.line, { backgroundColor: t.border }]} />}
      </View>

      <View style={styles.entryBody}>
        <View style={styles.entryHead}>
          <Text style={[styles.verb, { color: t.text }]}>{ACTION_VERB[entry.action] || entry.action}</Text>
          <Text style={[styles.by, { color: t.textTertiary }]}>by</Text>
          <Person name={actor.name} avatarUrl={actor.avatarUrl} known={actor.known} />
        </View>
        <Text style={[styles.when, { color: t.textTertiary }]}>
          {formatDateTime(entry.at)} · {relativeTime(entry.at)}
        </Text>

        {keys.map((k) => (
          <Text key={k} style={[styles.change, { color: t.textSecondary }]}>
            <Text style={{ fontFamily: font.medium, color: t.text }}>{labelFor(k)}</Text>
            {"  "}
            <Text style={styles.strike}>{valueText(k, entry.changes[k]?.from)}</Text>
            {" → "}
            <Text style={{ color: t.text }}>{valueText(k, entry.changes[k]?.to)}</Text>
          </Text>
        ))}
      </View>
    </View>
  )
}

const INITIAL_VISIBLE = 5

export default function RecordActivityPanel({
  collection,
  record,
  title = "Activity",
  bare = false,
}: {
  collection: Collection
  record: { id?: string; createdAt?: string; updatedAt?: string; createdBy?: string | null; updatedBy?: string | null } | null
  title?: string
  /**
   * Drop the Panel shell for a screen that owns its own section rhythm — the
   * quotation detail page is a receipt of ruled rows under its own
   * SectionTitle, and a full-bleed panel dropped into it would read as a
   * different document.
   */
  bare?: boolean
}) {
  const t = useTheme()
  const { entries, directory, loading } = useRecordHistory(collection, record?.id)
  const [expanded, setExpanded] = useState(false)

  if (!record) return null

  // The two actor columns on the row answer the headline question without
  // reading the log at all, and they survive even if the log is trimmed.
  // "Not recorded" is the honest reading of a null: everything written before
  // the audit trail was switched on has one, and it cannot be reconstructed.
  const creator = actorOf(record.createdBy, directory, "Not recorded")
  const editor = actorOf(record.updatedBy, directory, "Not recorded")
  const edited = Boolean(record.updatedAt && record.updatedAt !== record.createdAt)
  const visible = expanded ? entries : entries.slice(0, INITIAL_VISIBLE)

  const body = (
    <>
      <View style={styles.facts}>
        <View style={styles.fact}>
          <Text style={[styles.factLabel, { color: t.textTertiary }]}>CREATED</Text>
          <Person name={creator.name} avatarUrl={creator.avatarUrl} known={creator.known} />
          {!!record.createdAt && (
            <Text style={[styles.factWhen, { color: t.textTertiary }]}>{formatDateTime(record.createdAt)}</Text>
          )}
        </View>
        <View style={styles.fact}>
          <Text style={[styles.factLabel, { color: t.textTertiary }]}>LAST MODIFIED</Text>
          {edited ? (
            <>
              <Person name={editor.name} avatarUrl={editor.avatarUrl} known={editor.known} />
              <Text style={[styles.factWhen, { color: t.textTertiary }]}>
                {formatDateTime(record.updatedAt)} · {relativeTime(record.updatedAt)}
              </Text>
            </>
          ) : (
            <Text style={[styles.factWhen, { color: t.textSecondary }]}>Never edited since it was created</Text>
          )}
        </View>
      </View>

      {loading ? (
        <Text style={[styles.note, { color: t.textTertiary }]}>Loading history…</Text>
      ) : entries.length === 0 ? (
        // Two different nothings, and the difference matters: a record made
        // before the audit trail existed has no history and never will, which
        // is not the same as one nobody has touched.
        <Text style={[styles.note, { color: t.textTertiary }]}>
          No change history. Records created before the audit trail was switched on carry none, and it cannot be
          reconstructed — every edit from now on is logged here.
        </Text>
      ) : (
        <View style={styles.timeline}>
          {visible.map((e, i) => (
            <Entry key={e.id} entry={e} directory={directory} isLast={i === visible.length - 1} />
          ))}
          {entries.length > INITIAL_VISIBLE && (
            <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8}>
              <Text style={[styles.more, { color: t.primary }]}>
                {expanded ? "Show less" : `Show all ${entries.length} changes`}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </>
  )

  if (bare) return <View style={styles.bare}>{body}</View>

  return (
    <Panel title={title} padded>
      {body}
    </Panel>
  )
}

const styles = StyleSheet.create({
  bare: { paddingHorizontal: gutter, paddingTop: spacing.md },
  facts: { gap: spacing.md, paddingBottom: spacing.md },
  fact: { gap: spacing.xs },
  factLabel: { ...textVariants.fieldLabel },
  factWhen: { ...textVariants.caption },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  personName: { fontSize: 14, lineHeight: 20 },
  note: { ...textVariants.caption, lineHeight: 18 },
  timeline: { gap: 0 },
  entry: { flexDirection: "row", gap: spacing.sm },
  rail: { width: 8, alignItems: "center", paddingTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  line: { width: 1, flex: 1, marginTop: 2 },
  entryBody: { flex: 1, paddingBottom: spacing.md, gap: 2 },
  entryHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  verb: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20 },
  by: { ...textVariants.caption },
  when: { ...textVariants.caption },
  change: { fontSize: 13, lineHeight: 19, fontFamily: font.regular },
  strike: { textDecorationLine: "line-through" },
  more: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, paddingTop: spacing.xs },
})

