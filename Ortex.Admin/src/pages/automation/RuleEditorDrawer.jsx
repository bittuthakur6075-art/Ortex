import { Button, Input, Textarea, Select, Field, Drawer } from "../../components/ui/Ui"
import { TRIGGER_EVENTS } from "./helpers"

export default function RuleEditorDrawer({ open, onClose, editingRule, ruleForm, setRuleForm, onSubmit, templates }) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editingRule ? "Edit Automation Rule" : "Configure New Rule"}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Rule Name" required>
          <Input
            required
            value={ruleForm.name}
            onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
            placeholder="e.g. Quote Request Follow-up"
          />
        </Field>

        <Field label="Trigger Event" required>
          <Select
            value={ruleForm.triggerEvent}
            onChange={(e) => setRuleForm({ ...ruleForm, triggerEvent: e.target.value })}
          >
            {TRIGGER_EVENTS.map(ev => (
              <option key={ev.value} value={ev.value}>{ev.label}</option>
            ))}
            {ruleForm.triggerEvent && !TRIGGER_EVENTS.some(ev => ev.value === ruleForm.triggerEvent) && (
              <option value={ruleForm.triggerEvent}>
                {ruleForm.triggerEvent} - unsupported, never fires
              </option>
            )}
          </Select>
        </Field>

        <Field label="Message Template" hint="Without a template the engine sends its built-in message for the event.">
          <Select
            value={ruleForm.templateId}
            onChange={(e) => setRuleForm({ ...ruleForm, templateId: e.target.value })}
          >
            <option value="">No template - use built-in message</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
            ))}
          </Select>
        </Field>

        <Field label="Delay (Minutes)" hint="Set to 0 for immediate dispatch">
          <Input
            type="number"
            min="0"
            value={ruleForm.delayMinutes}
            onChange={(e) => setRuleForm({ ...ruleForm, delayMinutes: parseInt(e.target.value) || 0 })}
          />
        </Field>

        <Field label="Description">
          <Textarea
            value={ruleForm.description}
            onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
            placeholder="Describe the logic or purpose of this trigger rule."
          />
        </Field>

        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="ruleActive"
            checked={ruleForm.active}
            onChange={(e) => setRuleForm({ ...ruleForm, active: e.target.checked })}
            className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
          />
          <label htmlFor="ruleActive" className="text-sm font-semibold text-foreground cursor-pointer">
            Enable this rule trigger
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            Save Rule
          </Button>
        </div>
      </form>
    </Drawer>
  )
}
