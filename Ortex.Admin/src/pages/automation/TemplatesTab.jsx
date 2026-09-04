import { Button, Card, Badge } from "../../components/ui/Ui"
import { Trash2 } from "../../components/ui/Icons"

export default function TemplatesTab({ templates, onEdit, onDelete }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {templates.length === 0 ? (
        <div className="col-span-3 py-12 text-center text-muted-foreground">No message templates created yet.</div>
      ) : (
        templates.map((tmpl) => (
          <Card key={tmpl.id} className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <Badge tone="blue">{tmpl.category}</Badge>
                <span className="text-[10px] text-muted-foreground font-mono">{tmpl.name}</span>
              </div>
              <div className="p-3 bg-muted/60 text-xs rounded-lg text-foreground font-medium mb-3 italic">
                "{tmpl.body}"
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {tmpl.placeholders?.map(p => (
                  <span key={p} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
                    {`{${p}}`}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(tmpl)}
              >
                Edit
              </Button>
              <Button
                variant="dangerGhost"
                size="sm"
                onClick={() => onDelete(tmpl.id)}
                className="p-1"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
