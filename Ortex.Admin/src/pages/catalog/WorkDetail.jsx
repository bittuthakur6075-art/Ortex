import { useState } from "react"
import { LayoutGrid, Pencil } from "../../components/ui/Icons"
import { Badge, Button, Drawer } from "../../components/ui/Ui"
import { RecordActivity } from "../../components/ui/RecordActivity"
import { ImageViewer } from "../../components/ui/ImageViewer"
import { Section, Pair, Copy } from "./DetailParts"

// A work photo as the website shows it, the console's port of the phone's
// WorkDetailScreen: the photograph, the caption the site prints, where it sits
// in the gallery, the alt text, and who changed it. Tapping a tile used to open
// the editor straight away, so looking at a photo meant holding a form open.
export default function WorkDetail({ open, work, position, total, onClose, onEdit }) {
  const [viewerOpen, setViewerOpen] = useState(false)

  if (!open || !work) return null

  const live = work.active !== false
  const title = work.title || "Untitled"

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="w-[40vw] min-w-[460px] max-w-none"
      title={title}
      subtitle={[work.category || "Uncategorised", live ? "Live on /work" : "Hidden"].join(" · ")}
      footer={
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => onEdit(work)}>
            <Pencil className="h-4 w-4" /> Edit photo
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {work.image ? (
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            aria-label="View photo full screen"
            className="squircle block aspect-square w-full cursor-zoom-in overflow-hidden rounded-[16px] bg-muted"
          >
            <img src={work.image} alt={work.alt || title} className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="squircle flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-[16px] bg-muted text-muted-foreground">
            <LayoutGrid className="h-8 w-8 opacity-50" />
            <span className="text-[11px]">No photo</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={live ? "emerald" : "slate"} className="h-[22px] rounded-full px-2 text-xs">
            {live ? "Shown on website" : "Hidden from website"}
          </Badge>
          {work.category && (
            <Badge tone="outline" className="h-[22px] rounded-full px-2 text-xs">
              {work.category}
            </Badge>
          )}
        </div>

        <Section title="On the website">
          <div className="space-y-3">
            <Copy label="Caption" value={work.title} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
              <Pair label="Sort order" value={String(Number(work.sortOrder) || 0)} mono />
              <Pair
                label="Gallery position"
                value={live && position ? `${position} of ${total}` : live ? "Not placed" : "Not shown"}
              />
            </dl>
            <Copy
              label="Alt text"
              value={work.alt}
              missing="Not written. Screen readers and Google Images fall back to the caption"
            />
          </div>
        </Section>

        <Section title="Activity">
          <RecordActivity collection="work" record={work} bare title="" />
        </Section>
      </div>
      <ImageViewer
        open={viewerOpen && !!work.image}
        images={work.image ? [work.image] : []}
        alt={work.alt || title}
        onClose={() => setViewerOpen(false)}
      />
    </Drawer>
  )
}
