import { useState } from "react"
import { toast } from "sonner"
import { repo } from "../../data/store/repository"

// Drawer + form state and CRUD handlers for automation_rules.
export function useRuleEditor(templates) {
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false)
  const [editingRule, setEditingRule] = useState(null)

  // Form states for Rule
  const [ruleForm, setRuleForm] = useState({ name: "", triggerEvent: "", templateId: "", delayMinutes: 0, active: true, description: "" })

  // Rules used to store the template's name in `templateId`. Map that back to a
  // real id when editing, so an old rule is migrated on its next save. An
  // unresolvable ref (template deleted) falls back to the built-in message.
  const resolveTemplateId = (stored) => {
    if (!stored) return ""
    if (templates.some(t => t.id === stored)) return stored
    return templates.find(t => t.name === stored)?.id || ""
  }

  const templateNameFor = (stored) =>
    templates.find(t => t.id === stored)?.name || templates.find(t => t.name === stored)?.name || ""

  // Rule operations
  const handleOpenRuleDrawer = (rule = null) => {
    if (rule) {
      setEditingRule(rule)
      setRuleForm({
        name: rule.name || "",
        triggerEvent: rule.triggerEvent || "",
        templateId: resolveTemplateId(rule.templateId),
        delayMinutes: rule.delayMinutes || 0,
        active: rule.active !== false,
        description: rule.description || ""
      })
    } else {
      setEditingRule(null)
      setRuleForm({ name: "", triggerEvent: "quote_requested", templateId: templates[0]?.id || "", delayMinutes: 0, active: true, description: "" })
    }
    setRuleDrawerOpen(true)
  }

  const handleSaveRule = async (e) => {
    e.preventDefault()
    try {
      if (editingRule) {
        await repo.update("automation_rules", editingRule.id, ruleForm)
        toast.success("Automation rule updated successfully")
      } else {
        await repo.create("automation_rules", ruleForm)
        toast.success("New automation rule created")
      }
      setRuleDrawerOpen(false)
    } catch (err) {
      toast.error("Failed to save rule: " + err.message)
    }
  }

  const handleDeleteRule = async (id) => {
    if (!window.confirm("Are you sure you want to delete this automation rule?")) return
    try {
      await repo.remove("automation_rules", id)
      toast.success("Rule deleted")
    } catch (err) {
      toast.error("Failed to delete rule: " + err.message)
    }
  }

  return {
    ruleDrawerOpen,
    setRuleDrawerOpen,
    editingRule,
    ruleForm,
    setRuleForm,
    templateNameFor,
    handleOpenRuleDrawer,
    handleSaveRule,
    handleDeleteRule
  }
}
