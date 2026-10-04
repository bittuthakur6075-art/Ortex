import { companyMarkSvg, isMedinetix } from "../../lib/companyMark"

// The issuing company's mark on a printed document (0075, 0078): its uploaded
// logo; else /medinetix.svg for Medinetix; else Ortex's own /logo.svg for Ortex
// (and any record from before companies); else the monogram from lib/companyMark.js,
// the same initials and colour the phone prints. crossOrigin lets html2canvas
// read a storage URL into the PDF; buildSheetPdf waits for every image before capturing.
function companyLogoSrc(companyId, company) {
  if (isMedinetix(companyId, company?.name)) return "/medinetix.svg"
  if (company?.logoUrl) return company.logoUrl
  if (!companyId || companyId === "ortex") return "/logo.svg"
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(companyMarkSvg(companyId, company?.name))}`
}

export default function CompanyMark({ companyId, company, className, style }) {
  const src = companyLogoSrc(companyId, company)
  return <img src={src} alt={company?.name || ""} className={className} style={style} crossOrigin={src.startsWith("http") ? "anonymous" : undefined} />
}


