export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="lp-wrap flex h-16 items-center justify-between">
        <a href="#/" className="flex items-center gap-3">
          <span className="deva grid h-9 w-9 place-items-center rounded-full bg-primary text-lg text-primary-foreground">ॐ</span>
          <span className="text-[17px] font-semibold tracking-tight">
            Pandit Ji <span className="hidden font-serif text-[18px] font-normal italic text-muted-foreground sm:inline">Mithila paddhati</span>
          </span>
        </a>
        <nav className="flex items-center gap-1">
          <a href="#/pooja/satyanarayan" className="btn btn-ghost hidden sm:inline-flex">Satyanarayan Pooja</a>
          <a href="#/pooja/satyanarayan/live" className="btn btn-primary">Start a pooja</a>
        </nav>
      </div>
    </header>
  )
}
