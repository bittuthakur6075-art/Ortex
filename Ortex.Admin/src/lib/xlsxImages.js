// Pull pictures out of an .xlsx and work out which row each one sits on.
//
// SheetJS reads cells and ignores drawings entirely, so the pictures a person
// pastes into the product sheet would otherwise be silently dropped. An .xlsx
// is a ZIP, though, and the anchor information is all in there:
//
//   xl/worksheets/sheet1.xml           <drawing r:id="rId1"/>
//   xl/worksheets/_rels/sheet1.xml.rels rId1 -> ../drawings/drawing1.xml
//   xl/drawings/drawing1.xml            anchors: <xdr:from><xdr:row>3</xdr:row>
//                                       + <a:blip r:embed="rId2"/>
//   xl/drawings/_rels/drawing1.xml.rels rId2 -> ../media/image1.png
//   xl/media/image1.png                 the bytes
//
// So: follow the relationship chain from the first worksheet to its drawing,
// read every anchor's starting row, and hand back the bytes keyed by that row.
//
// Rows here are 0-based and include the header, which is exactly how SheetJS
// numbers `sheet_to_json` output rows +1 — see rowOffsetForData below.

import { unzipSync } from "fflate"

const MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
  emf: null, // Office wrappers we cannot render — skipped
  wmf: null,
}

const text = (bytes) => new TextDecoder().decode(bytes)

// Minimal .rels reader: Id -> Target. Regex rather than DOMParser because the
// files are machine-generated, flat, and attribute order is fixed by the spec.
function readRels(files, path) {
  const raw = files[path]
  if (!raw) return {}
  const out = {}
  for (const m of text(raw).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1]
    const target = /Target="([^"]+)"/.exec(m[0])?.[1]
    if (id && target) out[id] = target
  }
  return out
}

// "../media/image1.png" relative to "xl/drawings/" -> "xl/media/image1.png"
function resolve(base, target) {
  const stack = base.split("/").filter(Boolean)
  for (const part of target.split("/")) {
    if (part === "..") stack.pop()
    else if (part !== "." && part !== "") stack.push(part)
  }
  return stack.join("/")
}

/**
 * @param {ArrayBuffer} buffer  the raw .xlsx
 * @param {string} sheetPath    worksheet to read, default the first one
 * @returns {Map<number, {bytes: Uint8Array, type: string, name: string}[]>}
 *          keyed by 0-based spreadsheet row (row 0 = the header row)
 */
export function extractSheetImages(buffer, sheetPath = "xl/worksheets/sheet1.xml") {
  const byRow = new Map()
  let files
  try {
    files = unzipSync(new Uint8Array(buffer))
  } catch {
    return byRow // not a zip, or a legacy .xls — nothing to pull out
  }
  if (!files[sheetPath]) return byRow

  // sheet -> drawing
  const drawingId = /<drawing\b[^>]*r:id="([^"]+)"/.exec(text(files[sheetPath]))?.[1]
  if (!drawingId) return byRow
  const sheetDir = sheetPath.slice(0, sheetPath.lastIndexOf("/"))
  const sheetRels = readRels(files, `${sheetDir}/_rels/${sheetPath.split("/").pop()}.rels`)
  const drawingPath = sheetRels[drawingId] && resolve(sheetDir, sheetRels[drawingId])
  if (!drawingPath || !files[drawingPath]) return byRow

  // drawing -> media
  const drawingDir = drawingPath.slice(0, drawingPath.lastIndexOf("/"))
  const drawingRels = readRels(files, `${drawingDir}/_rels/${drawingPath.split("/").pop()}.rels`)
  const xml = text(files[drawingPath])

  // Each anchor is one picture. Both twoCellAnchor (default when you paste a
  // picture over cells) and oneCellAnchor carry a <xdr:from> row.
  for (const anchor of xml.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g)) {
    const block = anchor[0]
    const row = Number(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(block)?.[1])
    const embedId = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(block)?.[1]
    if (!Number.isInteger(row) || !embedId) continue

    const target = drawingRels[embedId]
    if (!target) continue
    const mediaPath = resolve(drawingDir, target)
    const bytes = files[mediaPath]
    if (!bytes) continue

    const ext = (mediaPath.split(".").pop() || "").toLowerCase()
    const type = MIME[ext]
    if (!type) continue // .emf/.wmf and friends: no browser can decode them

    if (!byRow.has(row)) byRow.set(row, [])
    byRow.get(row).push({ bytes, type, name: mediaPath.split("/").pop() })
  }

  return byRow
}

/**
 * Spreadsheet row for the nth data row returned by SheetJS.
 * `sheet_to_json` skips the header, so data row 0 is spreadsheet row 1.
 */
export const sheetRowForDataIndex = (i) => i + 1
