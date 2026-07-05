import { useState, useEffect } from "react"
import { Upload, CheckCircle2, AlertTriangle } from "./icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { createInvoice } from "../data/domain"
import { Button, Modal, Badge } from "./ui"
import { formatCurrency, formatDate } from "../lib/format"

// Map of standard Indian state names to code for GST supply calculations
const STATE_MAP = {
  "jammu & kashmir": "01",
  "jammu and kashmir": "01",
  "himachal pradesh": "02",
  "punjab": "03",
  "chandigarh": "04",
  "uttarakhand": "05",
  "haryana": "06",
  "delhi": "07",
  "rajasthan": "08",
  "uttar pradesh": "09",
  "bihar": "10",
  "sikkim": "11",
  "arunachal pradesh": "12",
  "assam": "18",
  "west bengal": "19",
  "jharkhand": "20",
  "odisha": "21",
  "chhattisgarh": "22",
  "madhya pradesh": "23",
  "gujarat": "24",
  "daman & diu": "25",
  "daman and diu": "25",
  "dadra & nagar haveli": "26",
  "dadra and nagar haveli": "26",
  "maharashtra": "27",
  "karnataka": "29",
  "goa": "30",
  "lakshadweep": "31",
  "kerala": "32",
  "tamil nadu": "33",
  "puducherry": "34",
  "telangana": "36",
  "andhra pradesh": "37",
  "ladakh": "38"
}

function stateNameToCode(name) {
  if (!name) return ""
  const normalized = name.trim().toLowerCase()
  // If it's already a 2-digit number, return it
  if (/^\d{2}$/.test(normalized)) return normalized
  return STATE_MAP[normalized] || ""
}

export function parseTallyInvoiceXml(xmlText) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, "text/xml")
  
  const voucherNodes = doc.getElementsByTagName("VOUCHER")
  const invoices = []
  
  for (let i = 0; i < voucherNodes.length; i++) {
    const node = voucherNodes[i]
    
    // Check if it's a Sales voucher
    const vchTypeAttr = node.getAttribute("VCHTYPE") || ""
    const vchTypeNameNode = node.getElementsByTagName("VOUCHERTYPENAME")[0]
    const vchTypeName = vchTypeNameNode ? vchTypeNameNode.textContent : ""
    
    if (vchTypeAttr.toLowerCase() !== "sales" && vchTypeName.toLowerCase() !== "sales") {
      continue 
    }
    
    // Invoice number
    const numNode = node.getElementsByTagName("VOUCHERNUMBER")[0]
    const number = numNode ? numNode.textContent.trim() : `TALLY-${Date.now()}-${i}`
    
    // Issue Date (YYYYMMDD to ISO)
    const dateNode = node.getElementsByTagName("DATE")[0]
    let issueDate = new Date().toISOString()
    if (dateNode && dateNode.textContent.trim().length === 8) {
      const dtStr = dateNode.textContent.trim()
      const year = dtStr.substring(0, 4)
      const month = dtStr.substring(4, 6)
      const day = dtStr.substring(6, 8)
      issueDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day))).toISOString()
    }
    
    // Customer name
    const partyNode = node.getElementsByTagName("PARTYLEDGERNAME")[0] || node.getElementsByTagName("PARTYNAME")[0]
    const partyName = partyNode ? partyNode.textContent.trim() : "Cash Customer"
    
    // Customer fields extracted from LEDGER blocks (if included in the export XML)
    let gstin = ""
    let stateCode = ""
    let address = ""
    let phone = ""
    let email = ""
    
    const parentDoc = node.ownerDocument
    const ledgers = parentDoc.getElementsByTagName("LEDGER")
    for (let j = 0; j < ledgers.length; j++) {
      const ledName = ledgers[j].getAttribute("NAME") || ""
      if (ledName.toLowerCase() === partyName.toLowerCase()) {
        const gstNode = ledgers[j].getElementsByTagName("PARTYGSTIN")[0]
        if (gstNode) gstin = gstNode.textContent.trim()
        
        const stateNode = ledgers[j].getElementsByTagName("STATENAME")[0]
        if (stateNode) stateCode = stateNameToCode(stateNode.textContent.trim())
        
        const addrList = ledgers[j].getElementsByTagName("ADDRESS")
        if (addrList.length) {
          const addrs = []
          for (let k = 0; k < addrList.length; k++) addrs.push(addrList[k].textContent.trim())
          address = addrs.join(", ")
        }
        
        const phoneNode = ledgers[j].getElementsByTagName("LEDGERPHONE")[0]
        if (phoneNode) phone = phoneNode.textContent.trim()
        const emailNode = ledgers[j].getElementsByTagName("EMAIL")[0]
        if (emailNode) email = emailNode.textContent.trim()
        break
      }
    }
    
    // Fallback: If stateCode wasn't found in master ledger definitions, try to get it from invoice mailing details
    if (!stateCode) {
      const stateNameNode = node.getElementsByTagName("STATENAME")[0]
      if (stateNameNode) stateCode = stateNameToCode(stateNameNode.textContent.trim())
    }
    
    // Address fallback
    if (!address) {
      const addrList = node.getElementsByTagName("ADDRESS")
      if (addrList.length) {
        const addrs = []
        for (let k = 0; k < addrList.length; k++) addrs.push(addrList[k].textContent.trim())
        address = addrs.join(", ")
      }
    }
    
    // Line items
    const lines = []
    const invNodes = node.getElementsByTagName("ALLINVENTORYENTRIES.LIST")
    
    if (invNodes.length > 0) {
      for (let j = 0; j < invNodes.length; j++) {
        const invNode = invNodes[j]
        const itemNameNode = invNode.getElementsByTagName("STOCKITEMNAME")[0]
        if (!itemNameNode) continue
        const itemName = itemNameNode.textContent.trim()
        
        const qtyNode = invNode.getElementsByTagName("BILLEDQTY")[0] || invNode.getElementsByTagName("ACTUALQTY")[0]
        let quantity = 1
        let unit = "pcs"
        if (qtyNode) {
          const qtyText = qtyNode.textContent.trim()
          const parts = qtyText.split(/\s+/)
          quantity = parseFloat(parts[0]) || 1
          if (parts[1]) unit = parts[1]
        }
        
        const rateNode = invNode.getElementsByTagName("RATE")[0]
        let rate = 0
        if (rateNode) {
          rate = parseFloat(rateNode.textContent.trim().split("/")[0]) || 0
        }
        
        // HSN
        const hsnNode = invNode.getElementsByTagName("HSNCODE")[0]
        const hsn = hsnNode ? hsnNode.textContent.trim() : ""
        
        lines.push({
          productId: null,
          description: itemName,
          hsn,
          quantity,
          unit,
          rate,
          discountPercent: 0,
          gstRate: 18, // Default rate, will align with totals if matched
        })
      }
    }
    
    // Parse ledger entries to build invoice calculations
    const ledEntries = node.getElementsByTagName("ALLLEDGERENTRIES.LIST")
    let grandTotal = 0
    let taxable = 0
    let cgst = 0
    let sgst = 0
    let igst = 0
    let roundOff = 0
    
    for (let j = 0; j < ledEntries.length; j++) {
      const entryNode = ledEntries[j]
      const ledgerNameNode = entryNode.getElementsByTagName("LEDGERNAME")[0]
      if (!ledgerNameNode) continue
      const ledgerName = ledgerNameNode.textContent.trim()
      
      const amountNode = entryNode.getElementsByTagName("AMOUNT")[0]
      if (!amountNode) continue
      const rawAmt = parseFloat(amountNode.textContent.trim()) || 0
      const absAmt = Math.abs(rawAmt)
      
      // Match ledger roles
      if (ledgerName.toLowerCase() === partyName.toLowerCase()) {
        grandTotal = absAmt
      } else if (ledgerName.toLowerCase().includes("cgst")) {
        cgst += absAmt
      } else if (ledgerName.toLowerCase().includes("sgst")) {
        sgst += absAmt
      } else if (ledgerName.toLowerCase().includes("igst")) {
        igst += absAmt
      } else if (ledgerName.toLowerCase().includes("round") || ledgerName.toLowerCase().includes("round off")) {
        roundOff = rawAmt
      } else if (
        ledgerName.toLowerCase().includes("sales") || 
        ledgerName.toLowerCase().includes("revenue") ||
        ledgerName.toLowerCase().includes("income")
      ) {
        taxable += absAmt
        // Fallback line item if no inventory details were included
        if (invNodes.length === 0) {
          // Extract GST Rate from ledger name if available (e.g. Sales @ 18%)
          const rateMatch = ledgerName.match(/(\d+)\s*%/);
          const parsedRate = rateMatch ? parseInt(rateMatch[1]) : 18;
          lines.push({
            productId: null,
            description: ledgerName,
            hsn: "",
            quantity: 1,
            unit: "pcs",
            rate: absAmt,
            discountPercent: 0,
            gstRate: parsedRate,
          })
        }
      }
    }
    
    // Fallbacks if aggregates are zero
    const computedLinesSum = lines.reduce((sum, l) => sum + (l.rate * l.quantity), 0)
    if (taxable === 0) taxable = computedLinesSum
    if (grandTotal === 0) grandTotal = taxable + cgst + sgst + igst + roundOff
    
    const interState = igst > 0
    
    // Assign GST rate back to line items based on totals ratio if simple
    if (lines.length === 1 && lines[0].gstRate === 18 && taxable > 0) {
      const totGst = cgst + sgst + igst
      const ratio = Math.round((totGst / taxable) * 100)
      if (ratio > 0) lines[0].gstRate = ratio
    }
    
    invoices.push({
      number,
      status: "sent",
      customer: {
        name: partyName,
        company: partyName,
        email,
        phone,
        gstin,
        stateCode: stateCode || "07", // Default to Delhi state code if unresolved
        address,
      },
      shipTo: null,
      lines,
      extraDiscountPercent: 0,
      paymentTerms: "",
      totals: {
        taxable: Math.round(taxable * 100) / 100,
        cgst: Math.round(cgst * 100) / 100,
        sgst: Math.round(sgst * 100) / 100,
        igst: Math.round(igst * 100) / 100,
        roundOff: Math.round(roundOff * 100) / 100,
        grandTotal: Math.round(grandTotal * 100) / 100,
        interState,
      },
      issueDate,
      dueDate: new Date(new Date(issueDate).getTime() + 15 * 86400000).toISOString(),
      notes: "Imported from Tally XML",
      terms: "",
      amountPaid: 0,
      tally: {
        status: "synced",
        syncedAt: new Date().toISOString(),
        voucherRef: number,
      }
    })
  }
  
  return invoices
}

export default function TallyInvoiceImport({ open, onClose, onImportDone }) {
  const [invoices, setInvoices] = useState(null)
  const [fileName, setFileName] = useState("")
  const [existingList, setExistingList] = useState([])
  const [selectedIndices, setSelectedIndices] = useState(new Set())
  const [duplicateActions, setDuplicateActions] = useState({}) // index -> "skip" | "overwrite"
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (open) {
      repo.list("invoices")
        .then(setExistingList)
        .catch((e) => console.error("Error loading invoices for comparison:", e))
    }
  }, [open])

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    
    try {
      const text = await file.text()
      const parsed = parseTallyInvoiceXml(text)
      
      if (!parsed.length) {
        toast.error("No valid Tally Sales vouchers found in the XML file.")
        setInvoices([])
        return
      }

      // Check duplicates
      const actions = {}
      const selected = new Set()
      parsed.forEach((inv, index) => {
        const dup = existingList.find((ex) => ex.number.toLowerCase() === inv.number.toLowerCase())
        if (dup) {
          actions[index] = "skip" // Default to skip duplicates
        } else {
          selected.add(index) // Default to select new ones
        }
      })
      
      setInvoices(parsed)
      setSelectedIndices(selected)
      setDuplicateActions(actions)
      toast.success(`Successfully parsed ${parsed.length} invoice(s) from XML`)
    } catch (err) {
      console.error(err)
      toast.error(`Error parsing XML file: ${err.message}`)
    }
    
    e.target.value = "" // Reset
  }

  const reset = () => {
    setInvoices(null)
    setFileName("")
    setSelectedIndices(new Set())
    setDuplicateActions({})
  }

  const toggleSelectAll = () => {
    if (selectedIndices.size === invoices.length) {
      setSelectedIndices(new Set())
    } else {
      setSelectedIndices(new Set(invoices.map((_, i) => i)))
    }
  }

  const toggleSelectIndex = (idx) => {
    const next = new Set(selectedIndices)
    if (next.has(idx)) {
      next.delete(idx)
    } else {
      next.add(idx)
    }
    setSelectedIndices(next)
  }

  const changeDuplicateAction = (idx, act) => {
    setDuplicateActions((prev) => ({ ...prev, [idx]: act }))
    
    // Automatically check the item if it was marked as overwrite
    if (act === "overwrite") {
      const next = new Set(selectedIndices)
      next.add(idx)
      setSelectedIndices(next)
    } else {
      const next = new Set(selectedIndices)
      next.delete(idx)
      setSelectedIndices(next)
    }
  }

  const commit = async () => {
    if (selectedIndices.size === 0) return
    setProcessing(true)
    
    let createdCount = 0
    let updatedCount = 0

    try {
      for (const idx of selectedIndices) {
        const inv = invoices[idx]
        const existing = existingList.find((ex) => ex.number.toLowerCase() === inv.number.toLowerCase())
        
        if (existing) {
          const action = duplicateActions[idx]
          if (action === "overwrite") {
            await repo.update("invoices", existing.id, inv)
            updatedCount++
          }
        } else {
          await createInvoice(inv)
          createdCount++
        }
      }
      
      toast.success(`Import complete: ${createdCount} created, ${updatedCount} updated.`)
      if (onImportDone) onImportDone()
      reset()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(`Failed to import invoices: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!processing) {
          reset()
          onClose()
        }
      }}
      title="Import Invoices from Tally"
      width="max-w-4xl"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {invoices ? `${selectedIndices.size} selected of ${invoices.length} parsed from ${fileName}` : "Upload a TallyPrime Sales Voucher XML export file"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reset} disabled={!invoices || processing}>
              Clear
            </Button>
            <Button size="sm" onClick={commit} disabled={selectedIndices.size === 0 || processing}>
              {processing ? "Importing..." : `Import Selected (${selectedIndices.size})`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {!invoices ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 text-center bg-muted/20">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
              <Upload className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-foreground text-base mb-1">Upload Tally XML Export</h3>
            <p className="text-xs text-muted-foreground max-w-sm mb-4">
              Export your sales transactions from TallyPrime as XML (Display &gt; Day Book or Ledger &gt; Export XML) and upload it here.
            </p>
            <label className="cursor-pointer">
              <span className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-colors">
                Choose XML file
              </span>
              <input type="file" accept=".xml,text/xml" onChange={onFile} className="hidden" />
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-foreground">Invoices List</span>
                <Badge tone="emerald">{invoices.length} found</Badge>
              </div>
              <Button variant="outline" size="xs" onClick={toggleSelectAll}>
                {selectedIndices.size === invoices.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            
            <div className="max-h-96 overflow-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-border bg-muted/80 text-xs uppercase tracking-wide text-muted-foreground z-10 font-sans">
                  <tr>
                    <th className="px-3 py-3 w-10 font-medium">Select</th>
                    <th className="px-3 py-3 font-medium">Inv Number</th>
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Customer Name</th>
                    <th className="px-3 py-3 text-right font-medium">Total</th>
                    <th className="px-3 py-3 font-medium">Import Action / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv, idx) => {
                    const isDup = existingList.some((ex) => ex.number.toLowerCase() === inv.number.toLowerCase())
                    const isChecked = selectedIndices.has(idx)
                    const action = duplicateActions[idx] || "new"
                    
                    return (
                      <tr key={idx} className={`hover:bg-muted/30 transition-colors ${isDup && action === "skip" ? "opacity-60" : ""}`}>
                        <td className="px-3 py-3 text-center">
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectIndex(idx)}
                            className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-3 font-semibold tabular text-foreground">{inv.number}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(inv.issueDate)}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-foreground">{inv.customer.company || inv.customer.name}</div>
                          <div className="text-xs text-muted-foreground">{inv.lines.length} item(s)</div>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-foreground">
                          {formatCurrency(inv.totals.grandTotal)}
                        </td>
                        <td className="px-3 py-3">
                          {isDup ? (
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3.5 w-3.5" /> Duplicate
                              </span>
                              <select
                                value={action}
                                onChange={(e) => changeDuplicateAction(idx, e.target.value)}
                                className="text-xs rounded border-border bg-background py-1 px-2 focus:ring-primary focus:border-primary text-foreground"
                              >
                                <option value="skip">Skip import</option>
                                <option value="overwrite">Overwrite existing</option>
                              </select>
                            </div>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-[hsl(var(--success))]">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Ready to Import
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
