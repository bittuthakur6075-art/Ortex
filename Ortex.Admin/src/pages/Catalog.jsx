import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { Package, Tags, LayoutGrid } from "../components/ui/Icons"
import { useProfile } from "../hooks/useProfile"
import { useCollections } from "../hooks/useCollection"
import { canAccess } from "../data/domain/modules"
import PageHeader from "../components/layout/PageHeader"
import { Tabs } from "../components/ui/Ui"
import Products from "./Products"
import Categories from "./Categories"
import Work from "./Work"

// One Catalog workspace. The three tabs are the former Products, Categories
// and Work pages, embedded unchanged. Access is still granted per tab through
// the original module keys, so a user's permissions carry over without
// migration.
const TABS = [
  { value: "products", moduleKey: "products", label: "Products", icon: Package, Page: Products },
  { value: "categories", moduleKey: "categories", label: "Categories", icon: Tags, Page: Categories },
  { value: "work", moduleKey: "work", label: "Work photos", icon: LayoutGrid, Page: Work },
]

export const CATALOG_MODULE_KEYS = TABS.map((t) => t.moduleKey)

function Count({ n }) {
  if (!n) return null
  return <span className="rounded-md bg-muted px-1.5 text-[11px] font-semibold leading-4 text-muted-foreground tabular">{n}</span>
}

export default function Catalog() {
  const profile = useProfile()
  const [params, setParams] = useSearchParams()
  const { data } = useCollections(["products", "categories", "work"])

  const allowed = useMemo(() => TABS.filter((t) => canAccess(profile, t.moduleKey)), [profile])
  const current = allowed.find((t) => t.value === params.get("tab")) || allowed[0]

  const counts = useMemo(() => {
    const products = data.products || []
    const categories = data.categories || []
    const work = data.work || []
    return {
      products: products.filter((p) => p.status === "active").length,
      categories: categories.length,
      work: work.filter((w) => w.active !== false).length,
    }
  }, [data])

  if (!current) return null

  const items = allowed.map((t) => ({
    value: t.value,
    icon: t.icon,
    label: (
      <>
        {t.label} <Count n={counts[t.value]} />
      </>
    ),
  }))

  const Page = current.Page

  return (
    <div>
      <PageHeader title="Catalog" subtitle="Products, website categories and work photos" />
      <Tabs
        className="mb-5"
        items={items}
        value={current.value}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
      />
      <Page key={current.value} embedded />
    </div>
  )
}
