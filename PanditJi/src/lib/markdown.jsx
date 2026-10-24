// Just enough markdown for Pandit Ji's chat replies: paragraphs, headings,
// bullet and numbered lists, and **bold**. Rendered as React nodes, never HTML.

function inline(text, key) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : part,
  )
}

export function Markdown({ text }) {
  const blocks = []
  let list = null
  text.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd()
    const item = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/)
    if (item) {
      const ordered = Boolean(item[1])
      if (!list || list.ordered !== ordered) {
        list = { ordered, items: [] }
        blocks.push(list)
      }
      list.items.push(inline(item[2], i))
      return
    }
    list = null
    if (!line.trim()) return
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    blocks.push(heading ? { heading: inline(heading[1], i) } : { para: inline(line, i) })
  })

  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (b.items) {
          const List = b.ordered ? "ol" : "ul"
          return (
            <List key={i} className={`space-y-1 pl-5 ${b.ordered ? "list-decimal" : "list-disc"}`}>
              {b.items.map((it, j) => <li key={j}>{it}</li>)}
            </List>
          )
        }
        if (b.heading) return <p key={i} className="font-semibold text-maroon">{b.heading}</p>
        return <p key={i}>{b.para}</p>
      })}
    </div>
  )
}
