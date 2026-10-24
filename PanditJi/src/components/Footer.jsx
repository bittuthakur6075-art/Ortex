export default function Footer() {
  return (
    <footer className="border-t bg-secondary">
      <div className="lp-wrap grid gap-8 py-12 md:grid-cols-[1fr_auto]">
        <div className="max-w-2xl">
          <p className="text-[17px] font-semibold tracking-tight">
            Pandit Ji <span className="font-serif font-normal italic text-muted-foreground">an AI purohit</span>
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
            Pandit Ji is an AI guide, not a human priest. The vidhi and mantras follow the Maithil paddhati and are being reviewed by a
            learned Maithil Acharya. Where your family's custom (kulachar) differs, follow your family.
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            The camera and microphone are used only during a live pooja. Nothing is recorded or stored on this website.
          </p>
        </div>
        <p className="deva self-end text-[18px] text-primary">सर्वे भवन्तु सुखिनः</p>
      </div>
    </footer>
  )
}
