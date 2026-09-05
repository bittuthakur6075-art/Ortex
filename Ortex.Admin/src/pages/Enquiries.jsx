import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Inbox, Star, Mail, Phone, MessageCircle, FileText, ImageIcon, Search } from "../components/ui/Icons"
import { useCollection, useSettings } from "../hooks/useCollection"
import { ENQUIRY_STATUS } from "../data/domain/schema"
import { relativeTime, formatDateTime, formatNumber } from "../lib/format"
import { isQuoteEnquiry, parseQuoteRfq, rfqToQuotationLines, rfqSummary, rfqArtwork } from "../lib/quoteRfq"
import { exportCsv } from "../lib/csv"
import { cn } from "../lib/cn"
import DocumentView from "../components/documents/DocumentView"
import {
  ExportButton,
  Card,
  SearchInput,
  StatusBadge,
  EmptyState,
  Avatar,
  Chip, ChipGroup,
  PageLoader,
} from "../components/ui/Ui"

// A new enquiry that has sat untouched is the thing worth surfacing: an unworked
// RFQ older than two days is a lost order in slow motion.
function ageOf(e) {
  const days = Math.floor((Date.now() - new Date(e.createdAt || Date.now())) / 86400000)
  return { days, label: days >= 1 ? `${days}d` : "today", overdue: e.status === "new" && days >= 2 }
}

export default function Enquiries() {
  const { items, loading } = useCollection("enquiries")
  const { items: products } = useCollection("products")
  const settings = useSettings()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const navigate = useNavigate()
  const [preview, setPreview] = useState(null) // generated quotation to print

  const quoteCount = useMemo(() => items.filter(isQuoteEnquiry).length, [items])

  const filtered = useMemo(() => {
    let rows = items
    if (statusFilter === "starred") rows = rows.filter((e) => e.starred)
    else if (statusFilter === "quotes") rows = rows.filter(isQuoteEnquiry)
    else if (statusFilter !== "all") rows = rows.filter((e) => e.status === statusFilter)
    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter((e) =>
        [e.reference, e.customer?.name, e.customer?.company, e.customer?.email, e.productInterest, e.message, e.source]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(q)),
      )
    }
    return [...rows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [items, query, statusFilter])


  const handleExport = () => {
    exportCsv(
      `ortex-enquiries-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Reference", value: (e) => e.reference },
        { header: "Date", value: (e) => formatDateTime(e.createdAt) },
        { header: "Name", value: (e) => e.customer?.name },
        { header: "Company", value: (e) => e.customer?.company },
        { header: "Email", value: (e) => e.customer?.email },
        { header: "Phone", value: (e) => e.customer?.phone },
        { header: "Source", value: (e) => e.source },
        { header: "Interest", value: (e) => e.productInterest },
        { header: "Status", value: (e) => e.status },
        { header: "Message", value: (e) => e.message },
      ],
      filtered,
    )
  }

  const startQuotation = (e) => {
    const rfq = parseQuoteRfq(e)
    navigate("/quotations", {
      state: {
        fromEnquiry: {
          id: e.id,
          customer: e.customer,
          message: e.reference || "",
          lines: rfq ? rfqToQuotationLines(rfq.items, products) : [],
        },
      },
    })
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <ChipGroup className="min-w-0">
          <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            All
          </Chip>
          <Chip active={statusFilter === "starred"} onClick={() => setStatusFilter("starred")}>
            Starred
          </Chip>
          <Chip active={statusFilter === "quotes"} onClick={() => setStatusFilter("quotes")}>
            Quote requests{quoteCount > 0 && ` (${quoteCount})`}
          </Chip>
          {ENQUIRY_STATUS.map((s) => (
            <Chip key={s.id} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)}>
              {s.label}
            </Chip>
          ))}
        </ChipGroup>
        <div className="flex items-center gap-[10px] md:ml-auto">
          <SearchInput
            className="md:w-[320px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search enquiries"
          />
          <ExportButton onClick={handleExport} disabled={!filtered.length} />
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} title="No enquiries yet" description="Leads captured from the website or added manually appear here." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="Try adjusting your search or filters." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => (
            <EnquiryCard key={e.id} e={e} products={products} onOpen={(row) => navigate(`/enquiries/${row.id}`)} onQuote={startQuotation} />
          ))}
        </div>
      )}

      <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settings} type="quotation" />
    </div>
  )
}

// One enquiry, everything the sales desk needs to act without opening it: who,
// what they asked for, what it is worth at catalogue rates, whether artwork
// arrived, how stale it is, and one tap to reach them.
function EnquiryCard({ e, products, onOpen, onQuote, onDragStart, dragging }) {
  const rfq = parseQuoteRfq(e)
  const sum = rfq ? rfqSummary(rfq.items, products) : null
  const art = rfqArtwork(e)
  const phone = (e.customer?.phone || "").replace(/[^0-9]/g, "")
  const age = ageOf(e)
  return (
              <Card
                  draggable={Boolean(onDragStart)}
                  onDragStart={onDragStart}
                  onClick={() => onOpen(e)}
                  className={cn(
                    "cursor-pointer gap-0 p-4 transition-[background-color,opacity] hover:bg-subtle",
                    dragging && "opacity-40",
                  )}
                >
                {/* Who it is, and how urgent */}
                <div className="flex items-start gap-3">
                  <Avatar name={e.customer?.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold text-foreground">{e.customer?.name || "Unknown"}</span>
                      {e.starred && <Star className="h-3.5 w-3.5 flex-none text-warning" />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {e.customer?.company || e.customer?.email || "No company given"}
                    </div>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-1.5">
                    <StatusBadge list={ENQUIRY_STATUS} status={e.status} />
                    {age.overdue && <span className="text-[11px] font-semibold text-destructive-text">{age.label} old</span>}
                  </div>
                </div>

                {/* What they actually asked for */}
                {rfq ? (
                  <div className="mt-3 rounded-lg bg-muted px-3 py-2.5">
                    <ul className="space-y-1">
                      {rfq.items.slice(0, 3).map((it, i) => (
                        <li key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
                          <span className="truncate text-foreground">{it.name}</span>
                          <span className="flex-none font-semibold tabular text-foreground">
                            {formatNumber(it.quantity)} {it.unit || "pcs"}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {rfq.items.length > 3 && (
                      <div className="mt-1 text-[11px] text-muted-foreground">+{rfq.items.length - 3} more line(s)</div>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 line-clamp-2 text-[13px] text-muted-foreground">{e.message || "No message"}</p>
                )}

                {/* What it is worth and what it needs */}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  {sum && sum.units > 0 && (
                    <span className="text-muted-foreground">
                      {formatNumber(sum.units)} units across {sum.lines} line{sum.lines > 1 ? "s" : ""}
                    </span>
                  )}
                  {!rfq && e.productInterest && <span className="text-muted-foreground">{e.productInterest}</span>}
                  {art && (
                    <span className={cn("inline-flex items-center gap-1", art.failed ? "text-destructive-text" : "text-success-text")}>
                      <ImageIcon className="h-3.5 w-3.5" /> {art.failed ? "Artwork missing" : "Artwork attached"}
                    </span>
                  )}
                </div>

                {/* Where it came from, how old, and how to reach them */}
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                  <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                    {e.source || "Direct"} · {relativeTime(e.createdAt)}
                  </span>
                  <span className="flex flex-none items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                    {rfq && (
                      <button
                        type="button"
                        onClick={() => onQuote(e)}
                        title="Create quotation"
                        className="mr-1 inline-flex h-7 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
                      >
                        <FileText className="h-3.5 w-3.5" /> Quote
                      </button>
                    )}
                    {e.customer?.email && (
                      <a href={`mailto:${e.customer.email}`} title={e.customer.email} className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-primary">
                        <Mail className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {phone && (
                      <a href={`tel:${e.customer.phone}`} title={e.customer.phone} className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-primary">
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {phone.length >= 10 && (
                      <a href={`https://wa.me/${phone.length === 10 ? "91" + phone : phone}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-success-text">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </span>
                </div>
              </Card>
  )
}

