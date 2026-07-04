import { useEffect } from "react"

export default function useDocumentMetadata(title, description) {
  useEffect(() => {
    if (title) {
      document.title = title
    }
    if (description) {
      const metaDescription = document.querySelector('meta[name="description"]')
      if (metaDescription) {
        metaDescription.setAttribute("content", description)
      } else {
        const meta = document.createElement("meta")
        meta.name = "description"
        meta.content = description
        document.head.appendChild(meta)
      }
    }
  }, [title, description])
}
