// Manual "Import from Tally" (Billing -> Import from Tally, admins only). A person
// exports XML from TallyPrime (Day Book for vouchers, List of Accounts for
// masters) and uploads the files; nothing talks to Tally. This module reads the
// files, turns them into console records and matches them against what the
// console already holds. Pure: no DOM (vitest runs in node), no repository. The
// page is pages/billing/TallyImport.jsx.

import { computeDocument } from "./pricing"
import { round2 } from "./format"
import { stateNameToCode, GST_STATES } from "./gstStates"
import { nationalDigits } from "./validateCustomer"
import { GST_RATES, newProduct } from "../data/domain/schema"
import { sameCustomer, paymentDateIso } from "../data/domain/domain"

// ---- reading the file -------------------------------------------------------------

// Tally writes UTF-16 LE with a BOM by default, UTF-8 when asked (or a plain
// ASCII file). The BOM decides; without one a "<" followed by a zero byte is
// UTF-16 too.
export function decodeXmlBytes(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let enc = "utf-8"
  if (b[0] === 0xff && b[1] === 0xfe) enc = "utf-16le"
  else if (b[0] === 0xfe && b[1] === 0xff) enc = "utf-16be"
  else if (b[0] === 0x3c && b[1] === 0) enc = "utf-16le"
  else if (b[0] === 0 && b[1] === 0x3c) enc = "utf-16be"
  return new TextDecoder(enc).decode(b).replace(/^﻿/, "")
}

const xmlChar = (c) => c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || (c >= 0x10000 && c <= 0x10ffff)

// Tally emits characters XML forbids (&#4; in narrations, raw control bytes).
export function cleanXml(text) {
  return String(text || "")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (m, n) => (xmlChar(/^x/i.test(n) ? parseInt(n.slice(1), 16) : Number(n)) ? m : ""))
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }
const unescapeXml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(/^#x/i.test(e) ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()])

function attrsOf(s) {
  const out = {}
  for (const m of s.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = unescapeXml(m[2] ?? m[3])
  return out
}

// A tiny forgiving XML reader: elements { tag, attrs, kids, text }. Tally's
// exports are flat and regular; a stray closing tag closes back to its opener.
export function parseXml(text) {
  const root = { tag: "", attrs: {}, kids: [], text: "" }
  const stack = [root]
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<[?!][^>]*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)([^>]*?)(\/?)>|([^<]+)/g
  for (const m of text.matchAll(re)) {
    const top = stack[stack.length - 1]
    if (m[1] != null) top.text += m[1]
    else if (m[6] != null) top.text += unescapeXml(m[6])
    else if (m[2]) {
      const i = stack.map((e) => e.tag).lastIndexOf(m[2])
      if (i > 0) stack.length = i
    } else if (m[3]) {
      const el = { tag: m[3], attrs: attrsOf(m[4]), kids: [], text: "" }
      top.kids.push(el)
      if (!m[5]) stack.push(el)
    }
  }
  return root
}

const kids = (el, tag) => (el?.kids || []).filter((k) => k.tag === tag)
const kid = (el, tag) => (el?.kids || []).find((k) => k.tag === tag)
// Every descendant named `tag`, not looking inside a match.
function all(el, tag, out = []) {
  for (const k of el?.kids || []) {
    if (k.tag === tag) out.push(k)
    else all(k, tag, out)
  }
  return out
}
const txt = (el) => (el?.text || "").trim()
const val = (el, tag) => txt(kid(el, tag))
// The first non-blank descendant among `tags`, in that order.
function deep(el, ...tags) {
  for (const t of tags) {
    const v = all(el, t).map(txt).find(Boolean)
    if (v) return v
  }
  return ""
}
const yes = (s) => /^yes$/i.test(String(s || "").trim())
const lower = (s) => String(s || "").trim().toLowerCase()

// "1,18,000.00", "-500", "500.00 Dr", "(-)500", "50.00/pcs", "₹ 1,000". Debit is
// negative in Tally's XML, so a "Dr" suffix makes it negative.
export function tallyNumber(s) {
  const str = String(s ?? "").trim()
  const n = parseFloat(str.replace(/,/g, "").replace(/^\(-\)/, "-").replace(/^[^\d.-]+/, ""))
  if (!Number.isFinite(n)) return 0
  if (/\bDr\.?$/i.test(str)) return -Math.abs(n)
  if (/\bCr\.?$/i.test(str)) return Math.abs(n)
  return n
}

// "20250415" -> "2025-04-15"; anything else -> "".
export function tallyDate(s) {
  const m = String(s || "").trim().match(/^(\d{4})(\d{2})(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ""
}

// Indian financial year of a "YYYY-MM-DD" day: 2025-04-01 .. 2026-03-31 -> "2526".
export function financialYear(day) {
  const [y, m] = String(day).split("-").map(Number)
  const start = m >= 4 ? y : y - 1
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`
}

function qtyOf(s) {
  const parts = String(s || "").trim().split(/\s+/)
  return { quantity: Math.abs(tallyNumber(parts[0])) || 0, unit: parts[1] || "" }
}

// A 4-key GST rate on a voucher line or stock item: the IGST (integrated) rate.
function gstRateIn(el) {
  for (const r of all(el, "RATEDETAILS.LIST")) {
    if (/igst|integrated/i.test(val(r, "GSTRATEDUTYHEAD"))) {
      const n = tallyNumber(val(r, "GSTRATE"))
      if (n > 0) return n
    }
  }
  const direct = tallyNumber(deep(el, "IGSTRATE", "GSTRATE"))
  return direct > 0 ? direct : null
}

const snapRate = (r) => GST_RATES.reduce((best, x) => (Math.abs(x - r) < Math.abs(best - r) ? x : best), GST_RATES[0])
const gstinState = (g) => (/^\d{2}/.test(g) && GST_STATES[g.slice(0, 2)] ? g.slice(0, 2) : "")

function addressOf(el) {
  const list = all(el, "ADDRESS.LIST")[0]
  const lines = (list ? kids(list, "ADDRESS") : kids(el, "ADDRESS")).map(txt).filter(Boolean)
  return lines.join(", ")
}

// ---- voucher types ----------------------------------------------------------------

const BASE_TYPES = { sales: "sales", receipt: "receipt", payment: "payment" }

// Sales / Receipt / Payment, following a custom type's PARENT when the file
// carries the VOUCHERTYPE masters; else a name like "GST Sales" is read as Sales.
function voucherKind(name, parents) {
  let n = lower(name)
  for (let i = 0; n && i < 10; i++) {
    if (BASE_TYPES[n]) return { kind: BASE_TYPES[n], guessed: false }
    n = parents.get(n)
  }
  const s = lower(name)
  if (/(return|order|note|quotation|journal|purchase|contra)/.test(s)) return { kind: "", guessed: false }
  if (/\bsales\b/.test(s)) return { kind: "sales", guessed: true }
  if (/\breceipts?\b/.test(s)) return { kind: "receipt", guessed: true }
  if (/\bpayments?\b/.test(s) && !/request/.test(s)) return { kind: "payment", guessed: true }
  return { kind: "", guessed: false }
}

function ledgerEntries(v) {
  const all1 = kids(v, "ALLLEDGERENTRIES.LIST")
  return (all1.length ? all1 : kids(v, "LEDGERENTRIES.LIST"))
    .map((e) => ({
      name: val(e, "LEDGERNAME"),
      amount: tallyNumber(val(e, "AMOUNT")),
      isParty: yes(val(e, "ISPARTYLEDGER")),
      bills: kids(e, "BILLALLOCATIONS.LIST").map((b) => ({ name: val(b, "NAME"), type: val(b, "BILLTYPE"), amount: Math.abs(tallyNumber(val(b, "AMOUNT"))) })),
      bank: kids(e, "BANKALLOCATIONS.LIST"),
    }))
    .filter((e) => e.name)
}

function voucherBase(v, kind, typeName, guessed) {
  const number = val(v, "VOUCHERNUMBER")
  return {
    kind,
    typeName,
    guessedType: guessed,
    number,
    date: tallyDate(val(v, "DATE")),
    party: val(v, "PARTYLEDGERNAME") || val(v, "PARTYNAME"),
    narration: val(v, "NARRATION"),
    cancelled: yes(val(v, "ISCANCELLED")) || yes(val(v, "ISOPTIONAL")) || /delete/i.test(v.attrs.ACTION || ""),
    tally: {
      guid: val(v, "GUID"),
      alterId: Math.trunc(tallyNumber(val(v, "ALTERID"))),
      voucherNumber: number,
      remoteId: v.attrs.REMOTEID || "",
    },
  }
}

function salesVoucher(v, base) {
  const entries = ledgerEntries(v)
  const partyEntry = entries.find((e) => e.isParty) || entries.find((e) => lower(e.name) === lower(base.party)) || entries.find((e) => e.amount < 0)
  const party = base.party || partyEntry?.name || ""
  const grandTotal = round2(Math.abs(partyEntry?.amount || 0))
  let cgst = 0, sgst = 0, igst = 0, roundOff = 0
  for (const e of entries) {
    if (e === partyEntry) continue
    const n = lower(e.name)
    // A credit (positive) adds to the bill, a debit takes away.
    if (/igst|integrated tax/.test(n)) igst += e.amount
    else if (/cgst|central tax/.test(n)) cgst += e.amount
    else if (/sgst|utgst|state tax|ut tax/.test(n)) sgst += e.amount
    else if (/round/.test(n)) roundOff += e.amount
  }
  ;[cgst, sgst, igst, roundOff] = [cgst, sgst, igst, roundOff].map(round2)
  const gstTotal = round2(cgst + sgst + igst)
  const taxable = round2(grandTotal - gstTotal - roundOff)
  const invRate = taxable > 0 && gstTotal > 0 ? snapRate((gstTotal / taxable) * 100) : 0
  const inv = [...kids(v, "ALLINVENTORYENTRIES.LIST"), ...kids(v, "INVENTORYENTRIES.LIST")]
  const lines = inv
    .map((e) => {
      const description = val(e, "STOCKITEMNAME")
      const { quantity, unit } = qtyOf(val(e, "BILLEDQTY") || val(e, "ACTUALQTY"))
      const amount = round2(Math.abs(tallyNumber(val(e, "AMOUNT"))))
      const q = quantity || 1
      const rate = Math.abs(tallyNumber(val(e, "RATE"))) || round2(amount / q)
      const discountPercent = Math.abs(tallyNumber(val(e, "DISCOUNT")))
      return { productId: null, description, hsn: deep(e, "HSNCODE", "GSTHSNNAME"), quantity: q, unit: unit || "pcs", rate, discountPercent, gstRate: gstRateIn(e) ?? invRate, amount }
    })
    .filter((l) => l.description)
  const gstin = val(v, "PARTYGSTIN") || deep(v, "CONSIGNEEGSTIN")
  return {
    ...base,
    party,
    customer: {
      name: party,
      company: party,
      email: "",
      phone: "",
      gstin: gstin.toUpperCase(),
      stateCode: stateNameToCode(val(v, "STATENAME") || val(v, "PLACEOFSUPPLY")) || gstinState(gstin),
      address: addressOf(v),
    },
    lines,
    totals: { taxable, cgst, sgst, igst, gstTotal, roundOff, grandTotal, interState: igst > 0, rate: invRate },
  }
}

const BANK_METHODS = [
  [/cheque|\bdd\b|demand draft/i, "Cheque"],
  [/rtgs/i, "RTGS"],
  [/upi/i, "UPI"],
  [/card/i, "Card"],
]

function moneyVoucher(v, base) {
  const isReceipt = base.kind === "receipt"
  const entries = ledgerEntries(v)
  // Receipt: the cash / bank ledger is debited (negative); Payment: credited.
  const cashSide = entries.filter((e) => (isReceipt ? e.amount < 0 : e.amount > 0))
  const partySide = entries.filter((e) => (isReceipt ? e.amount > 0 : e.amount < 0))
  const amount = round2(Math.abs(cashSide.reduce((s, e) => s + e.amount, 0)) || Math.abs(partySide.reduce((s, e) => s + e.amount, 0)))
  const cashLedger = cashSide[0]?.name || ""
  const bank = cashSide.flatMap((e) => e.bank)
  const txType = bank.map((b) => val(b, "TRANSACTIONTYPE")).find(Boolean) || ""
  const method = /cash/i.test(cashLedger) ? "Cash" : BANK_METHODS.find(([re]) => re.test(txType))?.[1] || "Bank transfer / NEFT"
  const reference = bank.map((b) => val(b, "UNIQUEREFERENCENUMBER") || val(b, "INSTRUMENTNUMBER")).find(Boolean) || ""
  const bills = partySide.flatMap((e) => e.bills).filter((b) => /agst/i.test(b.type) && b.name)
  const party = partySide[0]?.name || base.party
  const one = { ...base, party, amount, method, reference, cashLedger, billRef: bills[0]?.name || "", billCount: bills.length }
  // One receipt settling several bills becomes one payment per bill, as the
  // console links a payment to one invoice. Only when the bills add up to it.
  if (isReceipt && bills.length > 1 && Math.abs(bills.reduce((s, b) => s + b.amount, 0) - amount) <= 0.5) {
    return bills.map((b, i) => ({
      ...one,
      amount: round2(b.amount),
      billRef: b.name,
      billCount: 1,
      splitOf: bills.length,
      number: i ? `${base.number}-${i + 1}` : base.number,
      tally: { ...base.tally, guid: i ? `${base.tally.guid}/${i + 1}` : base.tally.guid },
    }))
  }
  return [one]
}

function ledgerMaster(l) {
  const name = l.attrs.NAME || deep(l, "NAME")
  const gstin = deep(l, "PARTYGSTIN", "GSTIN").toUpperCase()
  const pin = deep(l, "PINCODE")
  const address = [addressOf(l), pin].filter(Boolean).join(", ")
  return {
    name,
    parent: val(l, "PARENT"),
    customer: {
      name: deep(l, "LEDGERCONTACT") || name,
      company: name,
      email: deep(l, "EMAIL"),
      phone: nationalDigits(deep(l, "LEDGERMOBILE", "LEDGERPHONE")),
      gstin,
      stateCode: stateNameToCode(deep(l, "LEDSTATENAME", "STATENAME", "STATE")) || gstinState(gstin),
      address,
    },
    tally: { guid: val(l, "GUID"), alterId: Math.trunc(tallyNumber(val(l, "ALTERID"))), voucherNumber: name, remoteId: l.attrs.REMOTEID || "" },
  }
}

function stockMaster(s) {
  const name = s.attrs.NAME || deep(s, "NAME")
  const names = all(s, "NAME.LIST").flatMap((nl) => kids(nl, "NAME").map(txt)).filter(Boolean)
  const alias = names.find((n) => lower(n) !== lower(name)) || ""
  const price = all(s, "STANDARDPRICELIST.LIST").map((p) => tallyNumber(val(p, "RATE"))).find((n) => n > 0) || tallyNumber(val(s, "OPENINGRATE"))
  const rate = gstRateIn(s)
  return {
    name,
    sku: deep(s, "PARTNUMBER", "PARTNO") || alias,
    group: val(s, "PARENT"),
    hsn: deep(s, "HSNCODE", "HSN"),
    gstRate: rate != null && GST_RATES.includes(rate) ? rate : null,
    unit: lower(val(s, "BASEUNITS")) || "pcs",
    basePrice: round2(Math.abs(price) || 0),
    description: deep(s, "DESCRIPTION"),
    tally: { guid: val(s, "GUID"), alterId: Math.trunc(tallyNumber(val(s, "ALTERID"))), voucherNumber: name, remoteId: s.attrs.REMOTEID || "" },
  }
}

// files: [{ name, text }]. Returns everything found across all of them, each
// Tally object once (the highest ALTERID wins when periods overlap).
export function parseTallyFiles(files) {
  const trees = files.map((f) => ({ name: f.name, root: parseXml(cleanXml(f.text)) }))
  const parents = new Map()
  for (const { root } of trees) {
    for (const t of all(root, "VOUCHERTYPE")) {
      const n = t.attrs.NAME || deep(t, "NAME")
      if (n) parents.set(lower(n), lower(val(t, "PARENT")))
    }
  }
  const out = { customers: [], products: [], invoices: [], receipts: [], payouts: [], others: {}, cancelled: 0, otherLedgers: 0, files: [] }
  const seen = new Map()
  // The same Tally object twice (two overlapping Day Books): keep the newest.
  const keep = (list, rec) => {
    const id = rec.tally.guid ? `${list}:${rec.tally.guid}` : null
    const prev = id && seen.get(id)
    if (prev) {
      if (rec.tally.alterId > prev.tally.alterId) out[list][out[list].indexOf(prev)] = rec
      if (rec.tally.alterId > prev.tally.alterId) seen.set(id, rec)
      return
    }
    if (id) seen.set(id, rec)
    out[list].push(rec)
  }
  for (const { name, root } of trees) {
    const vouchers = all(root, "VOUCHER")
    const ledgers = all(root, "LEDGER")
    const items = all(root, "STOCKITEM")
    out.files.push({ name, vouchers: vouchers.length, ledgers: ledgers.length, stockItems: items.length })
    for (const v of vouchers) {
      const typeName = v.attrs.VCHTYPE || val(v, "VOUCHERTYPENAME")
      const { kind, guessed } = voucherKind(typeName, parents)
      if (!kind) {
        const key = typeName || "Unknown"
        out.others[key] = (out.others[key] || 0) + 1
        continue
      }
      const base = voucherBase(v, kind, typeName, guessed)
      if (base.cancelled) {
        out.cancelled++
        continue
      }
      if (kind === "sales") keep("invoices", salesVoucher(v, base))
      else for (const r of moneyVoucher(v, base)) keep(kind === "receipt" ? "receipts" : "payouts", r)
    }
    for (const l of ledgers) {
      const m = ledgerMaster(l)
      if (/sundry debtors/i.test(m.parent)) keep("customers", m)
      else out.otherLedgers++
    }
    for (const s of items) keep("products", stockMaster(s))
  }
  return out
}

// ---- matching against the console -------------------------------------------------

export const STATUS = {
  new: "New",
  changed: "Changed in Tally",
  same: "Already imported",
  console: "Made in the console",
  problem: "Problems",
}

const madeInConsole = (t) => /^ortex-/i.test(t?.remoteId || "") || /^ortex-/i.test(t?.guid || "")

// The stamp the database accepts from an admin (migration 0070).
function stampOf(t, syncedAt) {
  return { status: "synced", source: "tally", syncedAt, voucherRef: String(t.voucherNumber || ""), guid: String(t.guid), alterId: Number(t.alterId) || 0 }
}

const byGuid = (list) => new Map(list.filter((x) => x.tally?.guid).map((x) => [x.tally.guid, x]))
const newer = (rec, ex) => (Number(rec.tally.alterId) || 0) > (Number(ex.tally?.alterId) || 0)

// Tally restarts numbering every financial year: a number already used gets
// "/<FY>" (then "-2", "-3"). `taken` is lower-cased and grows as numbers are given.
function uniqueNumber(number, day, taken) {
  const fy = financialYear(day)
  let n = number
  for (let i = 1; taken.has(lower(n)); i++) n = i === 1 ? `${number}/${fy}` : `${number}/${fy}-${i}`
  taken.add(lower(n))
  return n
}

function fillBlanks(ex, rec, keys) {
  const patch = {}
  for (const k of keys) {
    const empty = ex[k] == null || ex[k] === "" || ex[k] === 0
    if (empty && rec[k] != null && rec[k] !== "" && rec[k] !== 0) patch[k] = rec[k]
  }
  return patch
}

const CUSTOMER_KEYS = ["name", "company", "email", "phone", "gstin", "stateCode", "address"]
const PRODUCT_KEYS = ["sku", "hsn", "unit", "basePrice", "description"]

function planCustomers(parsed, existing, syncedAt) {
  const masters = parsed.customers.map((m) => ({ ...m.customer, tally: m.tally }))
  const known = new Set(masters.map((c) => lower(c.company)))
  // Parties seen only on vouchers (no List of Accounts in the upload).
  for (const v of [...parsed.invoices, ...parsed.receipts]) {
    if (!v.party || /^cash$/i.test(v.party) || known.has(lower(v.party))) continue
    known.add(lower(v.party))
    masters.push({ ...(v.customer || { name: v.party, company: v.party, email: "", phone: "", gstin: "", stateCode: "", address: "" }), tally: null })
  }
  const guids = byGuid(existing)
  const rows = []
  const snapshots = new Map()
  for (const c of masters) {
    const { tally, ...rec } = c
    const row = { key: tally?.guid || `party:${lower(rec.company)}`, title: rec.company || rec.name, sub: [rec.gstin, rec.phone, rec.email].filter(Boolean).join(" · "), amount: null, date: "" }
    if (!rec.company && !rec.name) {
      rows.push({ ...row, status: "problem", reason: "No name in the file" })
      continue
    }
    const ex =
      (tally?.guid && guids.get(tally.guid)) ||
      existing.find((x) => sameCustomer(rec, x)) ||
      (rec.gstin && existing.find((x) => lower(x.gstin) === lower(rec.gstin))) ||
      existing.find((x) => [x.company, x.name].some((n) => n && lower(n) === lower(rec.company)))
    if (!ex) {
      const doc = { ...rec, ...(tally?.guid ? { tally: stampOf(tally, syncedAt) } : {}) }
      snapshots.set(lower(rec.company), rec)
      rows.push({ ...row, status: "new", reason: tally ? "" : "Taken from the vouchers (no ledger master in the upload)", action: "create", doc })
      continue
    }
    const patch = fillBlanks(ex, rec, CUSTOMER_KEYS)
    const ours = ex.tally?.guid && ex.tally.guid === tally?.guid
    if (tally?.guid && (!ex.tally || (ours && newer(c, ex)))) patch.tally = stampOf(tally, syncedAt)
    const { id: _id, createdAt: _c, updatedAt: _u, createdBy: _cb, updatedBy: _ub, tally: _t, ...exFields } = ex
    snapshots.set(lower(rec.company), { ...exFields, ...patch, tally: undefined })
    const filled = Object.keys(patch).filter((k) => k !== "tally")
    if (!Object.keys(patch).length) {
      rows.push({ ...row, status: "same", reason: ours ? "" : `Matches ${ex.company || ex.name} in the console`, id: ex.id })
    } else {
      const what = filled.length ? `fills ${filled.join(", ")}` : "links it to Tally"
      rows.push({ ...row, status: "changed", reason: ours ? `Changed in Tally: ${what}` : `Matches ${ex.company || ex.name} in the console: ${what}`, action: "update", id: ex.id, patch })
    }
  }
  return { rows, snapshots }
}

function planProducts(parsed, existing, syncedAt, categories) {
  const guids = byGuid(existing)
  return parsed.products.map((p) => {
    const row = { key: p.tally.guid || `item:${lower(p.name)}`, title: p.name, sub: [p.sku, p.hsn && `HSN ${p.hsn}`].filter(Boolean).join(" · "), amount: p.basePrice || null, date: "" }
    if (!p.name) return { ...row, status: "problem", reason: "No name in the file" }
    const ex =
      (p.tally.guid && guids.get(p.tally.guid)) ||
      (p.sku && existing.find((x) => x.sku && lower(x.sku) === lower(p.sku))) ||
      existing.find((x) => lower(x.name) === lower(p.name))
    if (!ex) {
      const category = categories.find((c) => lower(c) === lower(p.group)) || ""
      // Kept off the website and out of the catalogue until a person checks it.
      const doc = newProduct({
        name: p.name, sku: p.sku, hsn: p.hsn, unit: p.unit, basePrice: p.basePrice, description: p.description, category,
        ...(p.gstRate != null ? { gstRate: p.gstRate } : {}),
        status: "draft", showOnWebsite: false,
        ...(p.tally.guid ? { tally: stampOf(p.tally, syncedAt) } : {}),
      })
      return { ...row, status: "new", reason: "Saved as a draft, not on the website", action: "create", doc }
    }
    const patch = fillBlanks(ex, p, PRODUCT_KEYS)
    const ours = ex.tally?.guid && ex.tally.guid === p.tally.guid
    if (p.tally.guid && (!ex.tally || (ours && newer(p, ex)))) patch.tally = stampOf(p.tally, syncedAt)
    const filled = Object.keys(patch).filter((k) => k !== "tally")
    if (!Object.keys(patch).length) return { ...row, status: "same", reason: ours ? "" : `Matches ${ex.name} in the console`, id: ex.id }
    const what = filled.length ? `fills ${filled.join(", ")}` : "links it to Tally"
    return { ...row, status: "changed", reason: ours ? `Changed in Tally: ${what}` : `Matches ${ex.name} in the console: ${what}`, action: "update", id: ex.id, patch }
  })
}

const byDate = (a, b) => (a.date || "").localeCompare(b.date || "") || String(a.number).localeCompare(String(b.number), "en", { numeric: true })

// The console invoice fields for a parsed Sales voucher (also the editor's
// "Import Tally XML" autofill). Totals are Tally's; the lines are for show.
export function invoiceDoc(inv, { number = inv.number, customer = inv.customer, syncedAt = new Date().toISOString() } = {}) {
  const t = inv.totals
  const lines = inv.lines.map(({ amount: _a, ...l }) => l)
  const base = computeDocument(lines, { interState: t.interState })
  const issueDate = paymentDateIso(inv.date)
  return {
    number,
    status: "sent",
    customer: { ...customer },
    shipTo: null,
    lines,
    extraDiscountPercent: 0,
    paymentTerms: "",
    totals: {
      ...base,
      subTotal: lines.length ? base.subTotal : t.taxable,
      taxable: t.taxable,
      taxByRate: lines.length ? base.taxByRate : t.rate ? { [t.rate]: t.gstTotal } : {},
      gstTotal: t.gstTotal,
      cgst: t.cgst,
      sgst: t.sgst,
      igst: t.igst,
      interState: t.interState,
      roundOff: t.roundOff,
      grandTotal: t.grandTotal,
    },
    issueDate,
    dueDate: new Date(new Date(issueDate).getTime() + 15 * 86400000).toISOString(),
    notes: inv.narration || "",
    terms: "",
    quotationId: null,
    amountPaid: 0,
    tally: stampOf(inv.tally, syncedAt),
  }
}

function voucherRow(rec) {
  return { key: rec.tally.guid || `${rec.kind}:${rec.number}:${rec.date}`, title: rec.number || "(no number)", sub: rec.party, date: rec.date, amount: rec.amount ?? rec.totals?.grandTotal ?? null }
}

function voucherProblem(rec, amount) {
  if (!rec.tally.guid) return "No GUID in the file: export as XML (Data Interchange)"
  if (!rec.date) return "No date"
  if (!rec.number) return "No voucher number"
  if (!(amount > 0)) return "Amount is 0"
  if (!rec.party) return "No party ledger"
  return ""
}

function planInvoices(parsed, existing, syncedAt, snapshots) {
  const guids = byGuid(existing)
  const taken = new Set(existing.map((i) => lower(i.number)).filter(Boolean))
  // Every invoice a receipt's Agst Ref may name: { ref, party, date, id | key }.
  const targets = existing.map((i) => ({ refs: [lower(i.number), lower(i.tally?.voucherRef)], party: lower(i.customer?.company || i.customer?.name), date: (i.issueDate || "").slice(0, 10), id: i.id, number: i.number }))
  const rows = [...parsed.invoices].sort(byDate).map((inv) => {
    const row = voucherRow(inv)
    const guessed = inv.guessedType ? `Voucher type "${inv.typeName}" read as Sales. ` : ""
    const problem = voucherProblem(inv, inv.totals.grandTotal)
    if (problem) return { ...row, status: "problem", reason: problem }
    if (madeInConsole(inv.tally)) return { ...row, status: "console", reason: "Sent to Tally by the console's connector" }
    const customer = snapshots.get(lower(inv.party)) || inv.customer
    const ex = guids.get(inv.tally.guid)
    if (ex) {
      if (!newer(inv, ex)) return { ...row, status: "same", id: ex.id }
      const d = invoiceDoc(inv, { number: ex.number, customer, syncedAt })
      const patch = { customer: d.customer, lines: d.lines, totals: d.totals, issueDate: d.issueDate, tally: d.tally }
      return { ...row, title: ex.number, status: "changed", reason: `${guessed}Changed in Tally since the last import`, action: "update", id: ex.id, patch }
    }
    const legacy = existing.find((i) => i.tally?.status === "synced" && !i.tally.guid && lower(i.tally.voucherRef || i.number) === lower(inv.number) && Math.abs((Number(i.totals?.grandTotal) || 0) - inv.totals.grandTotal) <= 0.5)
    if (legacy) return { ...row, status: "same", reason: "Imported earlier by the old Tally XML import", id: legacy.id }
    const number = uniqueNumber(inv.number, inv.date, taken)
    targets.push({ refs: [lower(inv.number)], party: lower(inv.party), date: inv.date, key: row.key, number })
    const renamed = number !== inv.number ? `Number ${inv.number} is already used, saved as ${number}. ` : ""
    return { ...row, title: number, status: "new", reason: `${renamed}${guessed}`.trim(), flagged: !!renamed, action: "create", doc: invoiceDoc(inv, { number, customer, syncedAt }) }
  })
  return { rows, targets }
}

// The invoice a receipt's Agst Ref bill names: same party first, then the latest
// one on or before the receipt (bill numbers repeat across financial years).
function findTarget(targets, rec) {
  const ref = lower(rec.billRef)
  if (!ref) return null
  const hits = targets.filter((t) => t.refs.includes(ref))
  if (!hits.length) return null
  const party = hits.filter((t) => t.party === lower(rec.party))
  const pool = party.length ? party : hits
  const before = pool.filter((t) => !t.date || t.date <= rec.date)
  return (before.length ? before : pool).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]
}

function planPayments(parsed, existing, syncedAt, snapshots, targets) {
  const guids = byGuid(existing)
  const taken = new Set(existing.map((p) => lower(p.number)).filter(Boolean))
  const all1 = [...parsed.receipts, ...parsed.payouts].sort(byDate)
  const rows = { receipts: [], payouts: [] }
  for (const rec of all1) {
    const list = rec.kind === "receipt" ? rows.receipts : rows.payouts
    const row = voucherRow(rec)
    const problem = voucherProblem(rec, rec.amount)
    if (problem) { list.push({ ...row, status: "problem", reason: problem }); continue }
    if (madeInConsole(rec.tally)) { list.push({ ...row, status: "console", reason: "Sent to Tally by the console's connector" }); continue }
    const inflow = rec.kind === "receipt"
    const target = inflow ? findTarget(targets, rec) : null
    const notes = []
    if (rec.guessedType) notes.push(`Voucher type "${rec.typeName}" read as ${inflow ? "Receipt" : "Payment"}.`)
    if (rec.splitOf) notes.push(`One of ${rec.splitOf} bills settled by this receipt.`)
    if (inflow) {
      if (target) notes.push(`Pays ${target.number}.`)
      else if (rec.billRef) notes.push(`Bill ${rec.billRef} is not in the console: saved unlinked.`)
      else notes.push("On Account: saved unlinked.")
      if (rec.billCount > 1) notes.push(`Settles ${rec.billCount} bills that do not add up to the receipt: linked to the first only.`)
    }
    const fields = {
      type: inflow ? "inflow" : "payout",
      amount: rec.amount,
      method: rec.method,
      date: paymentDateIso(rec.date),
      reference: rec.reference,
      note: rec.narration,
      party: rec.party,
      customer: inflow ? snapshots.get(lower(rec.party)) || { name: rec.party, company: rec.party } : null,
      invoiceId: target?.id || null,
      invoiceNumber: target ? target.number : "",
      tally: stampOf(rec.tally, syncedAt),
    }
    const link = target?.key ? { invoiceKey: target.key } : null
    const ex = guids.get(rec.tally.guid)
    if (ex) {
      if (!newer(rec, ex)) { list.push({ ...row, title: ex.number, status: "same", id: ex.id }); continue }
      list.push({ ...row, title: ex.number, status: "changed", reason: ["Changed in Tally since the last import.", ...notes].join(" "), action: "update", id: ex.id, patch: fields, link })
      continue
    }
    const number = uniqueNumber(rec.number, rec.date, taken)
    if (number !== rec.number) notes.unshift(`Number ${rec.number} is already used, saved as ${number}.`)
    list.push({ ...row, title: number, status: "new", reason: notes.join(" "), flagged: number !== rec.number, action: "create", doc: { number, ...fields }, link })
  }
  return rows
}

// existing: { customers, products, invoices, payments } as the repository lists
// them. Returns rows per kind: { key, title, sub, date, amount, status, reason,
// action "create" | "update" | undefined, id, doc | patch, link? }.
export function planTallyImport(parsed, existing, { syncedAt = new Date().toISOString(), categories = [] } = {}) {
  const customers = planCustomers(parsed, existing.customers || [], syncedAt)
  const invoices = planInvoices(parsed, existing.invoices || [], syncedAt, customers.snapshots)
  const payments = planPayments(parsed, existing.payments || [], syncedAt, customers.snapshots, invoices.targets)
  return {
    customers: customers.rows,
    products: planProducts(parsed, existing.products || [], syncedAt, categories),
    invoices: invoices.rows,
    receipts: payments.receipts,
    payouts: payments.payouts,
  }
}

export function countByStatus(rows) {
  const out = { new: 0, changed: 0, same: 0, console: 0, problem: 0 }
  for (const r of rows) out[r.status]++
  return out
}
