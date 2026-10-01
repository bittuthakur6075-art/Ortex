// EVERY PDF the console makes is one A4 portrait sheet, built by
// components/documents/documentPdf.jsx (src/lib/a4Only.test.js fails if
// html2pdf.js is used anywhere else). The sheet is captured at A4 at 96dpi and
// laid on an A4 page with no margin.
export const A4_SHEET = { width: "794px", minHeight: "1123px" }
export const A4_JSPDF = { unit: "pt", format: "a4", orientation: "portrait" }
