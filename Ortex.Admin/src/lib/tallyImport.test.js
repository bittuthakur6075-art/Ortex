import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { round2 } from "./format"
import {
  decodeXmlBytes, cleanXml, parseXml, tallyNumber, tallyDate, financialYear,
  parseTallyFiles, planTallyImport, countByStatus, invoiceDoc,
} from "./tallyImport"

// A Day Book export as TallyPrime writes it (Export > XML (Data Interchange)),
// trimmed to the tags the import reads plus some it must ignore.
const DAYBOOK = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY><IMPORTDATA>
  <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>Ortex Industries</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
  <REQUESTDATA>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER REMOTEID="a1b2-0001" VCHKEY="a1b2:0001" VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">
     <OLDAUDITENTRYIDS.LIST TYPE="Number"><OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS></OLDAUDITENTRYIDS.LIST>
     <DATE>20250415</DATE>
     <GUID>a1b2-0001</GUID>
     <STATENAME>Maharashtra</STATENAME>
     <PARTYGSTIN>27AACCA1234F1Z1</PARTYGSTIN>
     <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
     <PARTYLEDGERNAME>Acme Corp Ltd</PARTYLEDGERNAME>
     <VOUCHERNUMBER>1</VOUCHERNUMBER>
     <NARRATION>Badges for the annual meet&#4;</NARRATION>
     <ADDRESS.LIST TYPE="String"><ADDRESS>123 Business Park</ADDRESS><ADDRESS>Bandra East, Mumbai</ADDRESS></ADDRESS.LIST>
     <ALTERID> 101</ALTERID>
     <ISCANCELLED>No</ISCANCELLED>
     <ALLINVENTORYENTRIES.LIST>
      <STOCKITEMNAME>Custom Acrylic Badge</STOCKITEMNAME>
      <RATE>50.00/pcs</RATE>
      <AMOUNT>10000.00</AMOUNT>
      <ACTUALQTY> 200 pcs</ACTUALQTY>
      <BILLEDQTY> 200 pcs</BILLEDQTY>
      <ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>Sales GST 18%</LEDGERNAME><AMOUNT>10000.00</AMOUNT></ACCOUNTINGALLOCATIONS.LIST>
      <RATEDETAILS.LIST><GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD><GSTRATE> 18</GSTRATE></RATEDETAILS.LIST>
     </ALLINVENTORYENTRIES.LIST>
     <LEDGERENTRIES.LIST>
      <LEDGERNAME>Acme Corp Ltd</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><ISPARTYLEDGER>Yes</ISPARTYLEDGER>
      <AMOUNT>-11800.00</AMOUNT>
      <BILLALLOCATIONS.LIST><NAME>1</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>-11800.00</AMOUNT></BILLALLOCATIONS.LIST>
     </LEDGERENTRIES.LIST>
     <LEDGERENTRIES.LIST><LEDGERNAME>CGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>900.00</AMOUNT></LEDGERENTRIES.LIST>
     <LEDGERENTRIES.LIST><LEDGERNAME>SGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>900.00</AMOUNT></LEDGERENTRIES.LIST>
    </VOUCHER>
   </TALLYMESSAGE>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER REMOTEID="a1b2-0002" VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">
     <DATE>20250420</DATE>
     <GUID>a1b2-0002</GUID>
     <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
     <PARTYLEDGERNAME>Tech Innovators Corp</PARTYLEDGERNAME>
     <PARTYGSTIN>29AACCB5678H2Z2</PARTYGSTIN>
     <VOUCHERNUMBER>2</VOUCHERNUMBER>
     <ALTERID>102</ALTERID>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>Tech Innovators Corp</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-23,600.00</AMOUNT></ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>20000.40</AMOUNT></ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>IGST @ 18%</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>3600.07</AMOUNT></ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>Round Off</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-0.47</AMOUNT></ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME></LEDGERNAME><AMOUNT></AMOUNT></ALLLEDGERENTRIES.LIST>
    </VOUCHER>
   </TALLYMESSAGE>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER VCHTYPE="Receipt" ACTION="Create">
     <DATE>20250425</DATE>
     <GUID>a1b2-0003</GUID>
     <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
     <PARTYLEDGERNAME>Acme Corp Ltd</PARTYLEDGERNAME>
     <VOUCHERNUMBER>1</VOUCHERNUMBER>
     <ALTERID>103</ALTERID>
     <NARRATION>NEFT from Acme</NARRATION>
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Acme Corp Ltd</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>11800.00</AMOUNT>
      <BILLALLOCATIONS.LIST><NAME>1</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>11800.00</AMOUNT></BILLALLOCATIONS.LIST>
     </ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>HDFC Bank</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-11800.00</AMOUNT>
      <BANKALLOCATIONS.LIST><TRANSACTIONTYPE>NEFT</TRANSACTIONTYPE><UNIQUEREFERENCENUMBER>HDFCN52025042512345</UNIQUEREFERENCENUMBER><AMOUNT>-11800.00</AMOUNT></BANKALLOCATIONS.LIST>
     </ALLLEDGERENTRIES.LIST>
    </VOUCHER>
   </TALLYMESSAGE>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER VCHTYPE="Receipt" ACTION="Create">
     <DATE>20250428</DATE>
     <GUID>a1b2-0004</GUID>
     <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
     <VOUCHERNUMBER>2</VOUCHERNUMBER>
     <ALTERID>104</ALTERID>
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Walk-in Buyer</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>5000.00</AMOUNT>
      <BILLALLOCATIONS.LIST><NAME>Adv-1</NAME><BILLTYPE>On Account</BILLTYPE><AMOUNT>5000.00</AMOUNT></BILLALLOCATIONS.LIST>
     </ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-5000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
    </VOUCHER>
   </TALLYMESSAGE>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER VCHTYPE="Payment" ACTION="Create">
     <DATE>20250430</DATE>
     <GUID>a1b2-0005</GUID>
     <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
     <PARTYLEDGERNAME>Sharma Acrylics</PARTYLEDGERNAME>
     <VOUCHERNUMBER>1</VOUCHERNUMBER>
     <ALTERID>105</ALTERID>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sharma Acrylics</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-7,500.00</AMOUNT></ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>ICICI Current A/c</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>7500.00</AMOUNT>
      <BANKALLOCATIONS.LIST><TRANSACTIONTYPE>Cheque</TRANSACTIONTYPE><INSTRUMENTNUMBER>000123</INSTRUMENTNUMBER></BANKALLOCATIONS.LIST>
     </ALLLEDGERENTRIES.LIST>
    </VOUCHER>
   </TALLYMESSAGE>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER REMOTEID="ortex-invoice-5f0c" VCHTYPE="Sales" ACTION="Create">
     <DATE>20250501</DATE><GUID>a1b2-0006</GUID><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
     <PARTYLEDGERNAME>Acme Corp Ltd</PARTYLEDGERNAME><VOUCHERNUMBER>INV-2526-0007</VOUCHERNUMBER><ALTERID>106</ALTERID>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>Acme Corp Ltd</LEDGERNAME><AMOUNT>-100.00</AMOUNT></ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>100.00</AMOUNT></ALLLEDGERENTRIES.LIST>
    </VOUCHER>
   </TALLYMESSAGE>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER VCHTYPE="Journal" ACTION="Create"><DATE>20250502</DATE><GUID>a1b2-0007</GUID><VOUCHERTYPENAME>Journal</VOUCHERTYPENAME></VOUCHER>
   </TALLYMESSAGE>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER VCHTYPE="Sales" ACTION="Create"><DATE>20250503</DATE><GUID>a1b2-0008</GUID><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><ISCANCELLED>Yes</ISCANCELLED><VOUCHERNUMBER>3</VOUCHERNUMBER></VOUCHER>
   </TALLYMESSAGE>
  </REQUESTDATA>
 </IMPORTDATA></BODY>
</ENVELOPE>`

// List of Accounts export with masters (ledgers, stock items, a custom voucher type).
const MASTERS = `<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
  <REQUESTDATA>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <LEDGER NAME="Acme Corp Ltd" RESERVEDNAME="">
     <ADDRESS.LIST TYPE="String"><ADDRESS>123 Business Park</ADDRESS><ADDRESS>Bandra East, Mumbai</ADDRESS></ADDRESS.LIST>
     <GUID>led-0001</GUID>
     <PARENT>Sundry Debtors</PARENT>
     <EMAIL>accounts@acme.example</EMAIL>
     <LEDSTATENAME>Maharashtra</LEDSTATENAME>
     <PARTYGSTIN>27aacca1234f1z1</PARTYGSTIN>
     <PINCODE>400051</PINCODE>
     <LEDGERPHONE>022 2654 1111</LEDGERPHONE>
     <LEDGERMOBILE>+91 98200 11111</LEDGERMOBILE>
     <LEDGERCONTACT>Ravi Mehta</LEDGERCONTACT>
     <ALTERID> 55</ALTERID>
     <LANGUAGENAME.LIST><NAME.LIST TYPE="String"><NAME>Acme Corp Ltd</NAME></NAME.LIST></LANGUAGENAME.LIST>
    </LEDGER>
   </TALLYMESSAGE>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <LEDGER NAME="HDFC Bank"><GUID>led-0002</GUID><PARENT>Bank Accounts</PARENT><ALTERID>56</ALTERID></LEDGER>
   </TALLYMESSAGE>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <LEDGER NAME="Delhi Schools Trust">
     <GUID>led-0003</GUID><PARENT>Sundry Debtors</PARENT><ALTERID>57</ALTERID>
     <LEDGSTREGDETAILS.LIST><GSTIN>07AABCD1234E1Z5</GSTIN></LEDGSTREGDETAILS.LIST>
     <LEDMAILINGDETAILS.LIST><ADDRESS.LIST><ADDRESS>Plot 4, Dwarka</ADDRESS></ADDRESS.LIST><STATE>Delhi</STATE><PINCODE>110075</PINCODE></LEDMAILINGDETAILS.LIST>
     <EMAIL></EMAIL>
    </LEDGER>
   </TALLYMESSAGE>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <STOCKITEM NAME="Custom Acrylic Badge" RESERVEDNAME="">
     <GUID>stk-0001</GUID>
     <PARENT>Acrylic products</PARENT>
     <BASEUNITS>Pcs</BASEUNITS>
     <ALTERID>60</ALTERID>
     <GSTDETAILS.LIST>
      <HSNCODE>3926</HSNCODE>
      <STATEWISEDETAILS.LIST><RATEDETAILS.LIST><GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD><GSTRATE> 18</GSTRATE></RATEDETAILS.LIST></STATEWISEDETAILS.LIST>
     </GSTDETAILS.LIST>
     <STANDARDPRICELIST.LIST><DATE>20250401</DATE><RATE>55.00/Pcs</RATE></STANDARDPRICELIST.LIST>
     <LANGUAGENAME.LIST><NAME.LIST TYPE="String"><NAME>Custom Acrylic Badge</NAME><NAME>AB-100</NAME></NAME.LIST></LANGUAGENAME.LIST>
    </STOCKITEM>
   </TALLYMESSAGE>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <STOCKITEM NAME="Printed Lanyard"><GUID>stk-0002</GUID><PARENT>Primary</PARENT><BASEUNITS>Nos</BASEUNITS><ALTERID>61</ALTERID></STOCKITEM>
   </TALLYMESSAGE>
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHERTYPE NAME="Export Invoice"><PARENT>Sales</PARENT></VOUCHERTYPE>
   </TALLYMESSAGE>
  </REQUESTDATA>
 </IMPORTDATA></BODY>
</ENVELOPE>`

// A custom Sales type, a receipt settling two bills, and a Dr/Cr amount.
const EXTRA = `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
 <TALLYMESSAGE><VOUCHER VCHTYPE="Export Invoice" ACTION="Create">
  <DATE>20260410</DATE><GUID>x-0001</GUID><VOUCHERTYPENAME>Export Invoice</VOUCHERTYPENAME>
  <PARTYLEDGERNAME>Acme Corp Ltd</PARTYLEDGERNAME><VOUCHERNUMBER>1</VOUCHERNUMBER><ALTERID>300</ALTERID>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>Acme Corp Ltd</LEDGERNAME><AMOUNT>5900.00 Dr</AMOUNT></ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>Export Sales</LEDGERNAME><AMOUNT>5000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>Output IGST</LEDGERNAME><AMOUNT>900.00</AMOUNT></ALLLEDGERENTRIES.LIST>
 </VOUCHER></TALLYMESSAGE>
 <TALLYMESSAGE><VOUCHER VCHTYPE="Receipt" ACTION="Create">
  <DATE>20250510</DATE><GUID>x-0002</GUID><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>3</VOUCHERNUMBER><ALTERID>301</ALTERID>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>Acme Corp Ltd</LEDGERNAME><AMOUNT>12800.00</AMOUNT>
   <BILLALLOCATIONS.LIST><NAME>1</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>11800.00</AMOUNT></BILLALLOCATIONS.LIST>
   <BILLALLOCATIONS.LIST><NAME>INV-OLD-9</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>1000.00</AMOUNT></BILLALLOCATIONS.LIST>
  </ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>HDFC Bank</LEDGERNAME><AMOUNT>-12800.00</AMOUNT></ALLLEDGERENTRIES.LIST>
 </VOUCHER></TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`

const files = [{ name: "DayBook.xml", text: DAYBOOK }, { name: "Masters.xml", text: MASTERS }]
const SYNCED = "2026-10-03T10:00:00.000Z"

describe("reading the file", () => {
  it("decodes UTF-16 LE with and without a BOM, and UTF-8", () => {
    const s = "<A>₹ Café</A>"
    const le = new Uint8Array([0xff, 0xfe, ...new Uint8Array(new Uint16Array([...s].map((c) => c.charCodeAt(0))).buffer)])
    expect(decodeXmlBytes(le)).toBe(s)
    expect(decodeXmlBytes(le.slice(2))).toBe(s)
    expect(decodeXmlBytes(new TextEncoder().encode("﻿" + s))).toBe(s)
  })

  it("strips characters XML forbids and reads entities", () => {
    expect(cleanXml("a&#4;b&#x1F;c&#10;d\u0004e")).toBe("abc&#10;de")
    const root = parseXml(cleanXml("<X A=\"1 &amp; 2\"><N>Tom &amp; Jerry&#4; &#8377;</N><E/><E></E></X>"))
    const x = root.kids[0]
    expect(x.attrs.A).toBe("1 & 2")
    expect(x.kids[0].text).toBe("Tom & Jerry ₹")
    expect(x.kids.filter((k) => k.tag === "E")).toHaveLength(2)
  })

  it("reads Tally numbers and dates", () => {
    expect(tallyNumber("-23,600.00")).toBe(-23600)
    expect(tallyNumber("1,18,000.00 Dr")).toBe(-118000)
    expect(tallyNumber("500 Cr")).toBe(500)
    expect(tallyNumber("(-)42.5")).toBe(-42.5)
    expect(tallyNumber("50.00/pcs")).toBe(50)
    expect(tallyNumber("")).toBe(0)
    expect(tallyDate("20250415")).toBe("2025-04-15")
    expect(tallyDate("15-Apr-2025")).toBe("")
    expect(financialYear("2025-04-01")).toBe("2526")
    expect(financialYear("2026-03-31")).toBe("2526")
    expect(financialYear("2026-04-01")).toBe("2627")
  })

  it("parses the repo's sample Sales export (the old import's fixture)", () => {
    const text = readFileSync(new URL("../../test/fixtures/tally-sales-invoice.xml", import.meta.url), "utf8")
    const p = parseTallyFiles([{ name: "f.xml", text }])
    expect(p.invoices.map((i) => [i.number, i.totals.grandTotal, i.totals.taxable, i.totals.interState])).toEqual([
      ["INV-TALLY-999", 11800, 10000, false],
      ["INV-TALLY-888", 23600, 20000, true],
    ])
    expect(p.invoices[0].lines[0]).toMatchObject({ description: "Custom Acrylic Badge", quantity: 200, rate: 50, gstRate: 18 })
    expect(p.invoices[0].customer).toMatchObject({ gstin: "27AACCA1234F1Z1", stateCode: "27", address: "123 Business Park, Bandra East, Mumbai" })
  })
})

describe("parseTallyFiles", () => {
  const p = parseTallyFiles(files)

  it("finds what each file holds", () => {
    expect(p.files).toEqual([
      { name: "DayBook.xml", vouchers: 8, ledgers: 0, stockItems: 0 },
      { name: "Masters.xml", vouchers: 0, ledgers: 3, stockItems: 2 },
    ])
    expect(p.others).toEqual({ Journal: 1 })
    expect(p.cancelled).toBe(1)
    expect(p.otherLedgers).toBe(1)
  })

  it("reads a Sales invoice with items, GST ledgers and the party", () => {
    const inv = p.invoices[0]
    expect(inv).toMatchObject({ number: "1", date: "2025-04-15", party: "Acme Corp Ltd", narration: "Badges for the annual meet" })
    expect(inv.tally).toEqual({ guid: "a1b2-0001", alterId: 101, voucherNumber: "1", remoteId: "a1b2-0001" })
    expect(inv.totals).toMatchObject({ taxable: 10000, cgst: 900, sgst: 900, igst: 0, gstTotal: 1800, roundOff: 0, grandTotal: 11800, interState: false })
    expect(inv.lines).toEqual([{ productId: null, description: "Custom Acrylic Badge", hsn: "", quantity: 200, unit: "pcs", rate: 50, discountPercent: 0, gstRate: 18, amount: 10000 }])
  })

  it("reads a totals-only invoice with round off and comma amounts", () => {
    const inv = p.invoices[1]
    expect(inv.lines).toEqual([])
    expect(inv.totals).toMatchObject({ taxable: 20000.4, igst: 3600.07, roundOff: -0.47, grandTotal: 23600, interState: true, rate: 18 })
    expect(inv.customer.stateCode).toBe("29")
  })

  it("reads receipts (Agst Ref, On Account) and payments", () => {
    expect(p.receipts.map((r) => [r.number, r.party, r.amount, r.method, r.reference, r.billRef])).toEqual([
      ["1", "Acme Corp Ltd", 11800, "Bank transfer / NEFT", "HDFCN52025042512345", "1"],
      ["2", "Walk-in Buyer", 5000, "Cash", "", ""],
    ])
    expect(p.payouts.map((r) => [r.number, r.party, r.amount, r.method, r.reference])).toEqual([["1", "Sharma Acrylics", 7500, "Cheque", "000123"]])
  })

  it("reads masters: Sundry Debtors ledgers and stock items", () => {
    expect(p.customers.map((c) => c.customer)).toEqual([
      { name: "Ravi Mehta", company: "Acme Corp Ltd", email: "accounts@acme.example", phone: "9820011111", gstin: "27AACCA1234F1Z1", stateCode: "27", address: "123 Business Park, Bandra East, Mumbai, 400051" },
      { name: "Delhi Schools Trust", company: "Delhi Schools Trust", email: "", phone: "", gstin: "07AABCD1234E1Z5", stateCode: "07", address: "Plot 4, Dwarka, 110075" },
    ])
    expect(p.products.map(({ tally: _t, ...x }) => x)).toEqual([
      { name: "Custom Acrylic Badge", sku: "AB-100", group: "Acrylic products", hsn: "3926", gstRate: 18, unit: "pcs", basePrice: 55, description: "" },
      { name: "Printed Lanyard", sku: "", group: "Primary", hsn: "", gstRate: null, unit: "nos", basePrice: 0, description: "" },
    ])
  })

  it("follows a custom voucher type to its parent, splits a receipt over two bills, keeps the newest copy", () => {
    const q = parseTallyFiles([...files, { name: "extra.xml", text: EXTRA }, { name: "again.xml", text: DAYBOOK.replace("<ALTERID> 101</ALTERID>", "<ALTERID>150</ALTERID>") }])
    const exp = q.invoices.find((i) => i.tally.guid === "x-0001")
    expect([exp.kind, exp.guessedType, exp.totals.grandTotal, exp.totals.igst]).toEqual(["sales", false, 5900, 900])
    expect(q.receipts.filter((r) => r.tally.guid.startsWith("x-0002")).map((r) => [r.number, r.amount, r.billRef, r.tally.guid])).toEqual([
      ["3", 11800, "1", "x-0002"],
      ["3-2", 1000, "INV-OLD-9", "x-0002/2"],
    ])
    expect(q.invoices.filter((i) => i.tally.guid === "a1b2-0001").map((i) => i.tally.alterId)).toEqual([150])
  })

  it("guesses a Sales type by name when the masters are not uploaded", () => {
    const q = parseTallyFiles([{ name: "x", text: EXTRA.replaceAll("Export Invoice", "GST Sales") }])
    expect(q.invoices[0]).toMatchObject({ kind: "sales", guessedType: true })
  })
})

describe("planTallyImport", () => {
  const parsed = parseTallyFiles(files)
  const empty = { customers: [], products: [], invoices: [], payments: [] }

  it("a first import: everything new, console-made vouchers left out", () => {
    const plan = planTallyImport(parsed, empty, { syncedAt: SYNCED, categories: ["Acrylic products"] })
    expect(countByStatus(plan.invoices)).toEqual({ new: 2, changed: 0, same: 0, console: 1, skipped: 0, problem: 0 })
    expect(plan.customers.map((r) => [r.title, r.status])).toEqual([
      ["Acme Corp Ltd", "new"], ["Delhi Schools Trust", "new"], ["Tech Innovators Corp", "new"],
    ])
    const inv = plan.invoices[0].doc
    expect(inv.tally).toEqual({ status: "synced", source: "tally", syncedAt: SYNCED, voucherRef: "1", guid: "a1b2-0001", alterId: 101 })
    expect(inv.customer).toMatchObject({ company: "Acme Corp Ltd", email: "accounts@acme.example", phone: "9820011111" })
    expect([inv.issueDate, inv.status, inv.totals.grandTotal, inv.totals.taxByRate]).toEqual(["2025-04-15T06:30:00.000Z", "sent", 11800, { 18: 1800 }])
    const prod = plan.products[0].doc
    expect([prod.status, prod.showOnWebsite, prod.category, prod.gstRate, prod.sku]).toEqual(["draft", false, "Acrylic products", 18, "AB-100"])
    expect(plan.products[1].doc.category).toBe("")
    // The receipt pays invoice 1 from this same upload.
    expect(plan.receipts[0]).toMatchObject({ status: "new", link: { invoiceKey: "a1b2-0001" } })
    expect(plan.receipts[0].doc).toMatchObject({ number: "1", type: "inflow", amount: 11800, invoiceNumber: "1", date: "2025-04-25T06:30:00.000Z" })
    expect(plan.receipts[1].reason).toMatch(/On Account/)
    expect(plan.receipts[1].doc.invoiceId).toBe(null)
    // Receipt 1 took number "1": payment voucher 1 (another series, same year) becomes P-1.
    expect(plan.payouts[0]).toMatchObject({ title: "P-1", flagged: true })
    expect(plan.payouts[0].doc).toMatchObject({ type: "payout", customer: null, invoiceId: null })
  })

  it("a repeat upload: already imported, or changed in Tally when ALTERID grew", () => {
    const first = planTallyImport(parsed, empty, { syncedAt: SYNCED })
    let n = 0
    const saved = (rows) => rows.filter((r) => r.doc).map((r) => ({ ...r.doc, id: `id-${++n}` }))
    const existing = { customers: saved(first.customers), products: saved(first.products), invoices: saved(first.invoices), payments: [...saved(first.receipts), ...saved(first.payouts)] }
    const again = planTallyImport(parsed, existing, { syncedAt: SYNCED })
    for (const k of ["invoices", "receipts", "payouts", "products"]) expect(again[k].every((r) => r.status === "same" || r.status === "console")).toBe(true)
    expect(again.customers.every((r) => r.status === "same")).toBe(true)
    // The receipt now links to the saved invoice by id.
    const edited = parseTallyFiles([{ name: "d", text: DAYBOOK.replace("<ALTERID>103</ALTERID>", "<ALTERID>203</ALTERID>").replace(/11800\.00/g, "11000.00") }])
    const changed = planTallyImport(edited, existing, { syncedAt: SYNCED })
    const r = changed.receipts[0]
    expect([r.status, r.action, r.patch.amount, r.patch.tally.alterId, r.patch.invoiceId]).toEqual(["changed", "update", 11000, 203, existing.invoices[0].id])
  })

  it("matches console customers and products and fills blanks only", () => {
    const existing = {
      ...empty,
      customers: [{ id: "c1", name: "Ravi", company: "ACME", email: "accounts@acme.example", phone: "", gstin: "", stateCode: "27", address: "Old address" }],
      products: [{ id: "p1", name: "Badge (acrylic)", sku: "ab-100", hsn: "", unit: "pcs", basePrice: 60, status: "active" }],
    }
    const plan = planTallyImport(parsed, existing, { syncedAt: SYNCED })
    const acme = plan.customers[0]
    expect([acme.status, acme.id, Object.keys(acme.patch).sort()]).toEqual(["changed", "c1", ["gstin", "phone", "tally"]])
    expect(acme.reason).toMatch(/Matches ACME in the console: fills phone, gstin/)
    const badge = plan.products[0]
    expect([badge.status, badge.patch.hsn, badge.patch.basePrice, badge.patch.status]).toEqual(["changed", "3926", undefined, undefined])
    // The invoice carries the console's customer, filled.
    expect(plan.invoices[0].doc.customer).toMatchObject({ name: "Ravi", company: "ACME", address: "Old address", gstin: "27AACCA1234F1Z1" })
  })

  it("matches a customer on GSTIN, then on name", () => {
    const existing = { ...empty, customers: [{ id: "g", company: "Some Trust", gstin: "07AABCD1234E1Z5" }, { id: "n", name: "x", company: "tech innovators corp" }] }
    const plan = planTallyImport(parsed, existing, { syncedAt: SYNCED })
    expect(plan.customers.filter((r) => r.id).map((r) => [r.title, r.id])).toEqual([["Delhi Schools Trust", "g"], ["Tech Innovators Corp", "n"]])
  })

  it("gives a number used by another invoice the financial year, and links a bill to the right year", () => {
    const existing = { ...empty, invoices: [{ id: "old1", number: "1", issueDate: "2024-04-02T06:30:00.000Z", customer: { company: "Acme Corp Ltd" }, totals: { grandTotal: 999 } }] }
    const plan = planTallyImport(parseTallyFiles([...files, { name: "e", text: EXTRA }]), existing, { syncedAt: SYNCED })
    const first = plan.invoices.find((r) => r.key === "a1b2-0001")
    expect([first.title, first.flagged, first.reason]).toEqual(["1/2526", true, "Number 1 is already used, saved as 1/2526."])
    const next = plan.invoices.find((r) => r.key === "x-0001")
    expect(next.title).toBe("1/2627")
    // Receipt 1 (25 Apr 2025, Agst Ref 1) pays the new 1/2526, not the old "1".
    expect(plan.receipts[0].link).toEqual({ invoiceKey: "a1b2-0001" })
    expect(plan.receipts[0].doc.invoiceNumber).toBe("1/2526")
    const unknown = plan.receipts.find((r) => r.key === "x-0002/2")
    expect(unknown.reason).toMatch(/Bill INV-OLD-9 is not in the console/)
  })

  it("leaves an invoice from the old Tally XML import alone", () => {
    const existing = { ...empty, invoices: [{ id: "legacy", number: "2", tally: { status: "synced", syncedAt: "x", voucherRef: "2" }, totals: { grandTotal: 23600 } }] }
    const plan = planTallyImport(parsed, existing, { syncedAt: SYNCED })
    expect(plan.invoices.find((r) => r.key === "a1b2-0002")).toMatchObject({ status: "same", id: "legacy" })
  })

  it("reports problems instead of importing them", () => {
    const broken = DAYBOOK.replace("<GUID>a1b2-0002</GUID>", "").replace("<DATE>20250430</DATE>", "")
    const plan = planTallyImport(parseTallyFiles([{ name: "b", text: broken }]), empty, { syncedAt: SYNCED })
    expect(plan.invoices.find((r) => r.status === "problem").reason).toMatch(/No GUID/)
    expect(plan.payouts[0]).toMatchObject({ status: "problem", reason: "No date" })
  })
})

describe("invoiceDoc", () => {
  it("builds the console's invoice shape with Tally's totals", () => {
    const inv = parseTallyFiles(files).invoices[1]
    const d = invoiceDoc(inv, { syncedAt: SYNCED })
    expect(Object.keys(d.totals).sort()).toEqual(["cgst", "docDiscount", "grandTotal", "gstTotal", "igst", "interState", "lineDiscount", "lines", "roundOff", "sgst", "subTotal", "taxByRate", "taxable", "totalDiscount"])
    expect([d.number, d.totals.subTotal, d.lines, d.dueDate]).toEqual(["2", 20000.4, [], "2025-05-05T06:30:00.000Z"])
  })
})

// ---- the fixes from the test-file run (one small XML each) --------------------------

const env = (body) => `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>${body}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`
const msg = (x) => `<TALLYMESSAGE>${x}</TALLYMESSAGE>`
const led = (name, parent, extra = "") => msg(`<LEDGER NAME="${name}"><GUID>g-${name}</GUID><PARENT>${parent}</PARENT><ALTERID>1</ALTERID>${extra}</LEDGER>`)
const entry = (name, amount, extra = "") => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${name}</LEDGERNAME><AMOUNT>${amount}</AMOUNT>${extra}</ALLLEDGERENTRIES.LIST>`
const vch = (type, guid, { date = "20260410", number = "1", party = "", body = "" } = {}) =>
  msg(`<VOUCHER VCHTYPE="${type}" ACTION="Create"><DATE>${date}</DATE><GUID>${guid}</GUID><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME>${party ? `<PARTYLEDGERNAME>${party}</PARTYLEDGERNAME>` : ""}<VOUCHERNUMBER>${number}</VOUCHERNUMBER><ALTERID>5</ALTERID>${body}</VOUCHER>`)
const newRef = (n, a) => `<BILLALLOCATIONS.LIST><NAME>${n}</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>${a}</AMOUNT></BILLALLOCATIONS.LIST>`
const agstRef = (n, a) => `<BILLALLOCATIONS.LIST><NAME>${n}</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>${a}</AMOUNT></BILLALLOCATIONS.LIST>`
const bankAlloc = (inner) => `<BANKALLOCATIONS.LIST>${inner}</BANKALLOCATIONS.LIST>`
const item = (amount) => `<ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Badge</STOCKITEMNAME><AMOUNT>${amount}</AMOUNT><BILLEDQTY>10 pcs</BILLEDQTY></ALLINVENTORYENTRIES.LIST>`
const one = (text, opts) => parseTallyFiles([{ name: "f.xml", text: env(text) }], opts)
const none = () => ({ customers: [], products: [], invoices: [], payments: [] })
const save = (plan) => {
  let n = 0
  const ids = (rows) => rows.filter((r) => r.doc).map((r) => ({ ...r.doc, id: `s-${++n}` }))
  return { customers: ids(plan.customers), products: ids(plan.products), invoices: ids(plan.invoices), payments: [...ids(plan.receipts), ...ids(plan.payouts)] }
}

describe("custom voucher types (fix 1)", () => {
  const taxInvoice = vch("Tax Invoice", "ti-1", { party: "Acme", body: item(1000) + entry("Acme", "-1180.00", newRef("TI/1", "-1180.00")) + entry("Revenue A", "1000.00") + entry("Output IGST", "180.00") })

  it("reads an unknown type from its entries, and lists what is still unknown by type name", () => {
    const p = one(
      taxInvoice +
        vch("Collections", "c-1", { party: "Acme", body: entry("Acme", "500.00", agstRef("TI/1", "500.00")) + entry("HDFC Bank", "-500.00", bankAlloc("<TRANSFERMODE>NEFT</TRANSFERMODE>")) }) +
        vch("Outgo", "o-1", { party: "Vendor", body: entry("Vendor", "-200.00") + entry("Cash", "200.00") }) +
        vch("Stock Shift", "s-1", { body: entry("Depreciation", "-10.00") + entry("Plant", "10.00") }),
    )
    expect(p.invoices.map((i) => [i.typeName, i.guessedType, i.totals.grandTotal, i.totals.igst])).toEqual([["Tax Invoice", true, 1180, 180]])
    expect(p.receipts.map((r) => [r.typeName, r.amount, r.billRef])).toEqual([["Collections", 500, "TI/1"]])
    expect(p.payouts.map((r) => [r.typeName, r.amount, r.method])).toEqual([["Outgo", 200, "Cash"]])
    expect(p.others).toEqual({ "Stock Shift": 1 })
  })

  it("remembers voucher types, groups and ledgers from an earlier upload", () => {
    const masters = one(msg(`<VOUCHERTYPE NAME="Tax Invoice"><PARENT>Sales</PARENT></VOUCHERTYPE>`) + msg(`<GROUP NAME="Corporate Clients" RESERVEDNAME=""><PARENT>Sundry Debtors</PARENT></GROUP>`) + led("Acme", "Corporate Clients")).masters
    expect(masters).toMatchObject({ types: { "tax invoice": "Sales" }, groups: { "corporate clients": "Sundry Debtors" }, ledgers: { acme: "Corporate Clients" } })
    // A totals-only voucher whose entries alone say nothing.
    const bare = vch("Tax Invoice", "ti-2", { party: "Acme", body: entry("Acme", "-100.00") + entry("Revenue A", "100.00") })
    expect(one(bare).others).toEqual({ "Tax Invoice": 1 })
    const later = one(bare, { masters: JSON.parse(JSON.stringify(masters)) })
    expect(later.invoices.map((i) => [i.kind, i.guessedType, i.partyRoot])).toEqual([["sales", false, "sundry debtors"]])
  })
})

describe("who is a customer (fixes 2 and 7)", () => {
  const masters =
    msg(`<GROUP NAME="Sundry Debtors" RESERVEDNAME="Sundry Debtors"><PARENT>Current Assets</PARENT></GROUP>`) +
    msg(`<GROUP NAME="Corporate Clients" RESERVEDNAME=""><PARENT>Sundry Debtors</PARENT></GROUP>`) +
    msg(`<GROUP NAME="Key Accounts" RESERVEDNAME=""><PARENT>Corporate Clients</PARENT></GROUP>`) +
    led("Orbit Events", "Key Accounts") + led("Director Capital A/c", "Capital Account") + led("HDFC Bank", "Bank Accounts")
  const money = (type, guid, party, amount, bills = "") =>
    vch(type, guid, { party, body: entry(party, type === "Receipt" ? amount : `-${amount}`, bills) + entry("HDFC Bank", type === "Receipt" ? `-${amount}` : amount) })

  it("a ledger in a sub-group of a sub-group of Sundry Debtors is a customer", () => {
    const p = one(masters)
    expect(p.customers.map((c) => c.name)).toEqual(["Orbit Events"])
    expect(p.otherLedgers).toBe(2)
  })

  it("money in from a ledger that is not a debtor is left out, and makes no customer", () => {
    const p = one(masters + money("Receipt", "r-1", "Director Capital A/c", "100000.00") + money("Receipt", "r-2", "Orbit Events", "500.00") + money("Payment", "p-1", "Speedy Couriers", "300.00"))
    const plan = planTallyImport(p, none(), { syncedAt: SYNCED })
    expect(plan.receipts.map((r) => [r.title, r.status, r.reason, !!r.action])).toEqual([
      ["1", "skipped", "Not from a customer: Capital Account", false],
      ["1", "new", "On Account: saved unlinked.", true],
    ])
    expect(plan.customers.map((r) => r.title)).toEqual(["Orbit Events"])
    expect(countByStatus(plan.receipts)).toMatchObject({ new: 1, skipped: 1 })
  })

  it("an unknown ledger becomes a customer only when it pays a bill; a payee never", () => {
    const p = one(money("Receipt", "r-1", "Stranger A", "100.00") + money("Receipt", "r-2", "Stranger B", "100.00", agstRef("7", "100.00")) + money("Payment", "p-1", "Vendor C", "50.00"))
    const plan = planTallyImport(p, none(), { syncedAt: SYNCED })
    expect(plan.customers.map((r) => r.title)).toEqual(["Stranger B"])
    expect(plan.receipts.map((r) => r.status)).toEqual(["new", "new"])
  })
})

describe("tax ledgers (fix 3)", () => {
  const sale = (salesLedger) => vch("Sales", "s-1", { party: "Sahyadri", body: entry("Sahyadri", "-47200.00", newRef("53", "-47200.00")) + entry(salesLedger, "40000.00") + entry("Output IGST", "7200.00") })
  const adds = (t) => expect(round2(t.taxable + t.gstTotal + t.roundOff)).toBe(t.grandTotal)

  it("a sales ledger with IGST in its name is not tax, with or without the masters", () => {
    const masters = led("Sales Interstate IGST 18%", "Sales Accounts") + led("Output IGST", "Duties &amp; Taxes", "<TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>Integrated Tax</GSTDUTYHEAD>")
    for (const text of [sale("Sales Interstate IGST 18%"), masters + sale("Sales Interstate IGST 18%")]) {
      const t = one(text).invoices[0].totals
      expect([t.taxable, t.igst, t.gstTotal, t.grandTotal, t.interState]).toEqual([40000, 7200, 7200, 47200, true])
      adds(t)
    }
  })

  it("the master's duty head decides a tax ledger whatever its name", () => {
    const masters = led("Revenue", "Sales Accounts") + led("Tax A", "Duties &amp; Taxes", "<TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>Central Tax</GSTDUTYHEAD>") + led("Tax B", "Duties &amp; Taxes", "<TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>State Tax</GSTDUTYHEAD>")
    const v = vch("Sales", "s-2", { party: "Bright", body: entry("Bright", "-1180.00") + entry("Revenue", "1000.00") + entry("Tax A", "90.00") + entry("Tax B", "90.00") })
    const t = one(masters + v).invoices[0].totals
    expect([t.taxable, t.cgst, t.sgst, t.igst]).toEqual([1000, 90, 90, 0])
    adds(t)
    // Without the masters "Tax A" says nothing: the 180 stays in the taxable value.
    expect(one(v).invoices[0].totals).toMatchObject({ taxable: 1180, gstTotal: 0 })
  })
})

describe("reference and method (fix 4)", () => {
  const rcpt = (guid, bank) => vch("Receipt", guid, { party: "Acme", body: entry("Acme", "100.00") + entry("HDFC Bank", "-100.00", bankAlloc(bank)) })

  it("the UTR or cheque number, never Tally's own key; RTGS, IMPS, UPI, cheque", () => {
    const p = one(
      rcpt("a", "<TRANSACTIONTYPE>e-Fund Transfer</TRANSACTIONTYPE><TRANSFERMODE>RTGS</TRANSFERMODE><INSTRUMENTNUMBER>HDFCR52026041012345</INSTRUMENTNUMBER><UNIQUEREFERENCENUMBER>JCfL5rSLN6SSLC3r</UNIQUEREFERENCENUMBER><PAYMENTMODE>Transacted</PAYMENTMODE>") +
        rcpt("b", "<TRANSACTIONTYPE>e-Fund Transfer</TRANSACTIONTYPE><TRANSFERMODE>IMPS</TRANSFERMODE><UNIQUEREFERENCENUMBER>3vA8zdbrQhk3pdEJ</UNIQUEREFERENCENUMBER>") +
        rcpt("c", "<TRANSACTIONTYPE>Others</TRANSACTIONTYPE><TRANSFERMODE>UPI</TRANSFERMODE><UNIQUEREFERENCENUMBER>412345678901</UNIQUEREFERENCENUMBER>") +
        rcpt("d", "<TRANSACTIONTYPE>Cheque</TRANSACTIONTYPE><INSTRUMENTNUMBER>004512</INSTRUMENTNUMBER><UNIQUEREFERENCENUMBER>5vxfQmE5U85kUE34</UNIQUEREFERENCENUMBER>"),
    )
    expect(p.receipts.map((r) => [r.method, r.reference])).toEqual([
      ["RTGS", "HDFCR52026041012345"],
      ["Bank transfer / NEFT", ""],
      ["UPI", "412345678901"],
      ["Cheque", "004512"],
    ])
  })
})

describe("a receipt imported before its invoice (fix 5)", () => {
  it("says it can link, and writes nothing until Tally's ALTERID grows", () => {
    const receipt = vch("Receipt", "r-287", { date: "20260415", number: "6", party: "Shah", body: entry("Shah", "5000.00", agstRef("287", "5000.00")) + entry("HDFC Bank", "-5000.00") })
    const invoice = vch("Sales", "s-287", { date: "20260320", number: "287", party: "Shah", body: entry("Shah", "-5000.00") + entry("Sales", "5000.00") })
    const first = planTallyImport(one(receipt), none(), { syncedAt: SYNCED })
    expect(first.receipts[0].reason).toMatch(/Bill 287 is not in the console/)
    const existing = save(first)
    const again = planTallyImport(one(invoice + receipt), existing, { syncedAt: SYNCED })
    expect(again.invoices[0]).toMatchObject({ status: "new", title: "287" })
    expect(again.receipts[0]).toMatchObject({ status: "same", flagged: true, reason: "Can link to invoice 287: open and save this receipt in Tally, then export it again." })
    expect(again.receipts[0].action).toBeUndefined()
    // Saved again in Tally: a normal change that carries the link.
    const edited = planTallyImport(one(invoice + receipt.replace("<ALTERID>5</ALTERID>", "<ALTERID>9</ALTERID>")), existing, { syncedAt: SYNCED })
    expect(edited.receipts[0]).toMatchObject({ status: "changed", action: "update", link: { invoiceKey: "s-287" } })
  })
})

describe("stock items (fix 6)", () => {
  const stock = (prices) =>
    msg(`<STOCKITEM NAME="Polyester Lanyard"><GUID>st-1</GUID><BASEUNITS>pcs</BASEUNITS><ALTERID>3</ALTERID><OPENINGRATE>165.00/pcs</OPENINGRATE>
    <GSTDETAILS.LIST><APPLICABLEFROM>20240401</APPLICABLEFROM><STATEWISEDETAILS.LIST><RATEDETAILS.LIST><GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD><GSTRATE> 12</GSTRATE></RATEDETAILS.LIST></STATEWISEDETAILS.LIST></GSTDETAILS.LIST>
    <GSTDETAILS.LIST><APPLICABLEFROM>20250922</APPLICABLEFROM><STATEWISEDETAILS.LIST><RATEDETAILS.LIST><GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD><GSTRATE> 5</GSTRATE></RATEDETAILS.LIST></STATEWISEDETAILS.LIST></GSTDETAILS.LIST>
    <STANDARDCOSTLIST.LIST><DATE>20250401</DATE><RATE>10.00/pcs</RATE></STANDARDCOSTLIST.LIST>${prices}</STOCKITEM>`)

  it("takes the GST rate and selling price in force today, never the opening (cost) rate", () => {
    const prices = "<STANDARDPRICELIST.LIST><DATE>20250401</DATE><RATE>22.00/pcs</RATE></STANDARDPRICELIST.LIST><STANDARDPRICELIST.LIST><DATE>20260101</DATE><RATE>24.00/pcs</RATE></STANDARDPRICELIST.LIST>"
    expect(one(stock(prices), { today: "2026-10-03" }).products[0]).toMatchObject({ gstRate: 5, basePrice: 24 })
    expect(one(stock(prices), { today: "2025-06-01" }).products[0]).toMatchObject({ gstRate: 12, basePrice: 22 })
    expect(one(stock(""), { today: "2026-10-03" }).products[0]).toMatchObject({ gstRate: 5, basePrice: 0 })
  })
})

describe("numbers (fix 8)", () => {
  const money = (type, guid, number, date) =>
    vch(type, guid, { date, number, party: "Acme", body: entry("Acme", type === "Receipt" ? "100.00" : "-100.00") + entry("Cash", type === "Receipt" ? "-100.00" : "100.00") })

  it("the other series gets P- or R-, another year /FY, a same-year duplicate -2", () => {
    const plan = planTallyImport(one(money("Receipt", "r1", "1", "20260410") + money("Payment", "p1", "1", "20260411") + money("Receipt", "r5", "5", "20260412") + money("Receipt", "r5b", "5", "20260413")), none(), { syncedAt: SYNCED })
    expect([...plan.receipts, ...plan.payouts].map((r) => r.title)).toEqual(["1", "5", "5-2", "P-1"])
    const later = planTallyImport(one(money("Payment", "p1-next", "1", "20270410") + money("Receipt", "r1-next", "1", "20270411")), save(plan), { syncedAt: SYNCED })
    expect([later.payouts[0].title, later.receipts[0].title]).toEqual(["P-1/2728", "1/2728"])
  })
})

describe("problem messages (fix 9)", () => {
  it("a sales voucher with no party says so", () => {
    const plan = planTallyImport(one(vch("Sales", "s-x", { body: entry("Sales", "100.00") })), none(), { syncedAt: SYNCED })
    expect(plan.invoices[0]).toMatchObject({ status: "problem", reason: "No customer: the voucher names no party and has no debit line" })
  })
})
