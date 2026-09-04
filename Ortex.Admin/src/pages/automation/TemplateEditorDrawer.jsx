import { Button, Input, Textarea, Field, Drawer } from "../../components/ui/Ui"

export default function TemplateEditorDrawer({ open, onClose, editingTemplate, templateForm, setTemplateForm, onSubmit }) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editingTemplate ? "Edit Message Template" : "Create New Template"}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Template Name" required hint="Must be lowercase snake_case (e.g. template_new_quote)">
          <Input
            required
            value={templateForm.name}
            onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
            placeholder="e.g. template_new_quote"
          />
        </Field>

        <Field label="Category" required>
          <Input
            required
            value={templateForm.category}
            onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
            placeholder="e.g. Quote Request"
          />
        </Field>

        <Field label="Message Body" required hint="Use placeholders in curly braces: {name}, {product_name}, {quantity}, {unit}, {amount}, {invoice_number}, {message_snippet}">
          <Textarea
            required
            value={templateForm.body}
            onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
            placeholder="Hi {name}, thank you for your request regarding {product_name}..."
          />
        </Field>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            Save Template
          </Button>
        </div>
      </form>
    </Drawer>
  )
}
