import * as DocumentPicker from "expo-document-picker"
import { File } from "expo-file-system"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { sheetToEnquiries, type SheetResult } from "@/domain/enquiryImport"
import { formatDate, formatNumber } from "@/domain/format"
import { ENQUIRY_STATUS, LEAD_SOURCES, type Enquiry } from "@/domain/schema"
import { feedback } from "@/lib/feedback"
import { useCompany } from "@/store/CompanyContext"
import { useTheme } from "@/store/ThemeContext"
import { radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Button from "@/ui/Button"
import { Chip } from "@/ui/Chips"
import Icon from "@/ui/Icon"
import Sheet from "@/ui/Sheet"
import { SquircleBackground } from "@/ui/Squircle"
import { useToast } from "@/ui/Toast"

// Leads -> Import: the same spreadsheet import as the console's Enquiries ->
// Import (Ortex.Admin/src/components/editors/EnquiryImport.jsx), through the
// shared converter in domain/enquiryImport.ts. Rows already in the console are
// skipped, so importing the same file from both places adds nothing twice. A row
// whose mobile is already a lead (another product or day) is left out unless
// the person includes them.
//
// The file goes into ONE company (Admin migration 0075): the one being worked
// in, or, in the All companies view, the one picked here. Rows already in are
// looked for in that company only.

const CHUNK = 200
const TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/comma-separated-values",
]

type Props = { visible: boolean; onClose: () => void; existing: Enquiry[]; onImported: () => void }

export default function EnquiryImportSheet({ visible, onClose, existing, onImported }: Props) {
  const t = useTheme()
  const toast = useToast()
  const [rows, setRows] = React.useState<unknown[][] | null>(null)
  const [fileName, setFileName] = React.useState("")
  const [source, setSource] = React.useState("Phone")
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState(0)
  const [error, setError] = React.useState("")
  const [withRepeats, setWithRepeats] = React.useState(false)
  const company = useCompany()
  const [picked, setPicked] = React.useState("")
  const companyId = company.defaultCompany || picked
  const needsCompany = company.multi && !companyId

  const result: SheetResult | null = React.useMemo(
    () =>
      rows
        ? sheetToEnquiries(rows as never, {
            source,
            fileName,
            existing: (companyId ? existing.filter((e) => e.companyId === companyId) : existing) as never,
          })
        : null,
    [rows, source, fileName, existing, companyId],
  )

  const reset = () => {
    setRows(null)
    setFileName("")
    setDone(0)
    setError("")
    setWithRepeats(false)
  }
  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  const pick = async () => {
    setError("")
    const picked = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true })
    const asset = picked.canceled ? null : picked.assets[0]
    if (!asset) return
    if ((asset.size || 0) > 20 * 1024 * 1024) return setError("That file is over 20 MB.")
    setBusy(true)
    try {
      // SheetJS is large; load it only when someone imports.
      const XLSX = await import("xlsx")
      const wb = XLSX.read(await new File(asset.uri).base64(), { type: "base64" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      setRows(XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }) as unknown[][])
      setFileName(asset.name)
    } catch (e) {
      setError(errorMessage(e, "Could not read that file"))
    } finally {
      setBusy(false)
    }
  }

  const importAll = async () => {
    if (!list.length || needsCompany) return
    let saved = 0
    setBusy(true)
    setDone(0)
    try {
      for (let i = 0; i < list.length; i += CHUNK) {
        await repo.bulkCreate("enquiries", list.slice(i, i + CHUNK).map((e) => ({ ...e, companyId })))
        saved = Math.min(list.length, i + CHUNK)
        setDone(saved)
      }
      feedback.created()
      toast.show({ message: `${formatNumber(list.length)} enquiries imported`, tone: "success" })
      setBusy(false)
      onImported()
      close()
    } catch (e) {
      setBusy(false)
      setError(`Stopped after ${formatNumber(saved)}: ${errorMessage(e, "import failed")}. Import the file again to add the rest; rows already in are skipped.`)
    }
  }

  const repeatRows = new Set((result?.repeats || []).map((r) => r.row))
  const list = (result?.enquiries || []).filter((e) => withRepeats || !repeatRows.has(e.imported.row))
  const inDb = (result?.skipped || []).filter((x) => x.reason !== "No name or mobile").length
  const dates = list.map((e) => e.createdAt).filter(Boolean).sort() as string[]
  const counts = ENQUIRY_STATUS.map((s) => [s.label, list.filter((e) => e.status === s.id).length] as const).filter(([, n]) => n)

  return (
    <Sheet visible={visible} onClose={close} title="Import enquiries">
      {!rows ? (
        <>
          <Text style={[textVariants.body, { color: t.textSecondary, marginBottom: spacing.md }]}>
            Choose the Excel or CSV call log. It needs a header row with Name and Mobile No.; Date, Status, Mobile No.2, Type of Product, Quantity, Rate, City, company Name and Email id are used when present.
          </Text>
          <Button label={busy ? "Reading…" : "Choose file"} icon="upload" onPress={() => void pick()} loading={busy} fullWidth />
        </>
      ) : result?.error ? (
        <Text style={[textVariants.body, { color: t.dangerText }]}>{result.error}</Text>
      ) : (
        <>
          <Text style={[textVariants.caption, { color: t.textTertiary }]} numberOfLines={1}>
            {fileName}
          </Text>
          <View style={styles.stats}>
            <Stat label="Ready" value={formatNumber(list.length)} />
            <Stat label="Already in" value={formatNumber(inDb)} />
            <Stat label="No name or mobile" value={formatNumber((result?.skipped.length || 0) - inDb)} />
          </View>
          {inDb ? (
            <Text style={[textVariants.small, { color: t.textSecondary, marginBottom: spacing.sm }]}>
              {result?.enquiries.length
                ? `${formatNumber(inDb)} ${inDb === 1 ? "row is" : "rows are"} already in the database (same mobile, product and date), so ${inDb === 1 ? "it is" : "they are"} left out.`
                : "Everything in this file is already in the database. There is nothing new to import."}
            </Text>
          ) : null}
          {repeatRows.size ? (
            <View style={[styles.note, { marginTop: 0, marginBottom: spacing.md }]}>
              <SquircleBackground fill={t.warningBg} radius={radius.card} />
              <Icon name="warning" size={16} color={t.warning} variant="Bulk" />
              <View style={styles.noteText}>
                <Text style={[textVariants.small, { color: t.warningText, marginBottom: spacing.sm }]}>
                  {formatNumber(repeatRows.size)} {repeatRows.size === 1 ? "mobile is" : "mobiles are"} already a lead, asking about another product or on another day.{" "}
                  {withRepeats ? "They will be added as new enquiries." : "They are left out."}
                </Text>
                <Chip label={withRepeats ? "Leave them out" : "Include them"} active={withRepeats} onPress={() => setWithRepeats((v) => !v)} />
              </View>
            </View>
          ) : null}
          {dates.length ? (
            <Text style={[textVariants.small, { color: t.textSecondary, marginBottom: spacing.sm }]}>
              {formatDate(dates[0])} to {formatDate(dates[dates.length - 1])}
            </Text>
          ) : null}
          <Text style={[textVariants.small, { color: t.textSecondary, marginBottom: spacing.md }]}>
            {counts.map(([label, n]) => `${label} ${formatNumber(n)}`).join(" · ")}
          </Text>

          {company.choice === "all" ? (
            <>
              <Text style={[textVariants.label, { color: t.text, marginBottom: spacing.sm }]}>Company</Text>
              <View style={styles.chips}>
                {company.companies.map((c) => (
                  <Chip key={c.id} label={c.name} active={picked === c.id} onPress={() => setPicked(c.id)} />
                ))}
              </View>
            </>
          ) : null}

          <Text style={[textVariants.label, { color: t.text, marginBottom: spacing.sm }]}>Source</Text>
          <View style={styles.chips}>
            {["Phone", "WhatsApp", "Referral", "Trade show", "Email", "Other"]
              .filter((s) => (LEAD_SOURCES as readonly string[]).includes(s))
              .map((s) => (
                <Chip key={s} label={s} active={source === s} onPress={() => setSource(s)} />
              ))}
          </View>

          <Text style={[textVariants.caption, { color: t.textTertiary, marginBottom: spacing.md }]}>
            The Status words are kept in each enquiry&apos;s notes. Each person is also added to Customers. Imported enquiries send no alerts.
          </Text>
        </>
      )}

      {error ? (
        <View style={styles.note} accessibilityLiveRegion="polite">
          <SquircleBackground fill={t.dangerBg} radius={radius.card} />
          <Icon name="warning" size={16} color={t.danger} variant="Bulk" />
          <Text style={[textVariants.small, styles.noteText, { color: t.dangerText }]}>{error}</Text>
        </View>
      ) : null}

      {rows && !result?.error ? (
        <View style={styles.actions}>
          <Button label="Other file" variant="secondary" onPress={reset} disabled={busy} />
          <Button
            label={
              needsCompany
                ? "Choose a company"
                : busy && done
                ? `${formatNumber(done)} of ${formatNumber(list.length)}`
                : `Import ${formatNumber(list.length)}`
            }
            icon="upload"
            onPress={() => void importAll()}
            loading={busy}
            disabled={!list.length || needsCompany}
            style={styles.grow}
          />
        </View>
      ) : rows ? (
        <View style={styles.actions}>
          <Button label="Choose another file" variant="secondary" onPress={reset} fullWidth />
        </View>
      ) : null}
    </Sheet>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme()
  return (
    <View style={styles.stat}>
      <SquircleBackground fill={t.surfaceInset} radius={radius.card} />
      <Text style={[textVariants.title, { color: t.text }]}>{value}</Text>
      <Text style={[textVariants.caption, { color: t.textTertiary }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: spacing.sm, marginVertical: spacing.md },
  stat: { flex: 1, padding: spacing.md, gap: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  note: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, marginTop: spacing.md },
  noteText: { flex: 1 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  grow: { flex: 1 },
})
