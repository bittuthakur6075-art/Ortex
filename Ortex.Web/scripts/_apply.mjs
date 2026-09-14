import fs from "node:fs"
import { NEW, CAT } from "./_meta.mjs"
import { STATIC_ROUTES, ROUTE_SOURCE } from "./routes-meta.mjs"
let meta = fs.readFileSync("scripts/routes-meta.mjs","utf8")
const rep=(file, a, b)=>{ const s=fs.readFileSync(file,"utf8"); if(!s.includes(a)) throw new Error(`${file} missing ${a.slice(0,50)}`); fs.writeFileSync(file, s.split(a).join(b)) }
for (const r of STATIC_ROUTES) {
  const [t,d] = NEW[r.path]; const src = ROUTE_SOURCE[r.path]
  rep(src, r.title, t); rep(src, r.description, d)
  meta = meta.split(JSON.stringify(r.title)).join(JSON.stringify(t)).split(JSON.stringify(r.description)).join(JSON.stringify(d))
}
fs.writeFileSync("scripts/routes-meta.mjs", meta)
// home
rep("src/pages/Home.jsx", `"Ortex Industries - Premium Customized Products for Businesses Worldwide"`, JSON.stringify(NEW["/"][0]))
rep("src/pages/Home.jsx", `"Ortex Industries specializes in manufacturing premium customized products including MDF products, acrylic items, lanyards, badges, and corporate gifts. Serving businesses across India and worldwide."`, JSON.stringify(NEW["/"][1]))
// categories
const { PRODUCT_CATEGORIES } = await import("../src/constants/categories.js")
for (const c of PRODUCT_CATEGORIES) {
  const [t,d] = CAT[c.slug]
  rep("src/constants/categories.js", JSON.stringify(c.seoTitle), JSON.stringify(t))
  rep("src/constants/categories.js", JSON.stringify(c.seoDescription), JSON.stringify(d))
}
