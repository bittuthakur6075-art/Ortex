import { useState } from "react"
import { toast } from "sonner"
import { repo } from "../../data/store/repository"

// Drawer + form state and CRUD handlers for message_templates.
export function useTemplateEditor() {
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)

  // Form states for Template
  const [templateForm, setTemplateForm] = useState({ name: "", category: "", body: "", placeholders: [] })

  // Template operations
  const handleOpenTemplateDrawer = (tmpl = null) => {
    if (tmpl) {
      setEditingTemplate(tmpl)
      setTemplateForm({
        name: tmpl.name || "",
        category: tmpl.category || "",
        body: tmpl.body || "",
        placeholders: tmpl.placeholders || []
      })
    } else {
      setEditingTemplate(null)
      setTemplateForm({ name: "", category: "General", body: "", placeholders: ["name"] })
    }
    setTemplateDrawerOpen(true)
  }

  const handleSaveTemplate = async (e) => {
    e.preventDefault()
    // Parse placeholders from body (anything inside {})
    const matches = templateForm.body.match(/{([^}]+)}/g) || []
    const parsedPlaceholders = matches.map(m => m.replace(/[{}]/g, ""))

    const payload = {
      ...templateForm,
      placeholders: Array.from(new Set(parsedPlaceholders))
    }

    try {
      if (editingTemplate) {
        await repo.update("message_templates", editingTemplate.id, payload)
        toast.success("Template updated successfully")
      } else {
        await repo.create("message_templates", payload)
        toast.success("New message template created")
      }
      setTemplateDrawerOpen(false)
    } catch (err) {
      toast.error("Failed to save template: " + err.message)
    }
  }

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm("Are you sure you want to delete this template?")) return
    try {
      await repo.remove("message_templates", id)
      toast.success("Template deleted")
    } catch (err) {
      toast.error("Failed to delete template: " + err.message)
    }
  }

  return {
    templateDrawerOpen,
    setTemplateDrawerOpen,
    editingTemplate,
    templateForm,
    setTemplateForm,
    handleOpenTemplateDrawer,
    handleSaveTemplate,
    handleDeleteTemplate
  }
}
