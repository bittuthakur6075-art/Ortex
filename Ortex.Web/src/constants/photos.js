// Static product photos list extracted from the IndiaMART gallery. The data
// itself lives in photos.json; this wrapper keeps the import-attribute syntax in
// one place and gives the list a named export.
import data from "./photos.json" with { type: "json" }

export const photosData = data
