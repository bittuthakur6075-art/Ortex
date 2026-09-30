// Small shared bits of the Modules page.

/** Modules grouped the way the sidebar groups them: [[section, [module]]]. */
export function groupBySection(modules) {
  const by = new Map()
  for (const m of modules) {
    if (!by.has(m.section)) by.set(m.section, [])
    by.get(m.section).push(m)
  }
  return [...by.entries()]
}

/** The registry label without its section ("Catalogue · Products" -> "Products"). */
export const shortLabel = (m) => m.label.replace(/^[^·]+·\s*/, "")
