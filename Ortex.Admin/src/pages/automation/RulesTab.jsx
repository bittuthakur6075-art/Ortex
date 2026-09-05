import { toast } from "sonner"
import { repo } from "../../data/store/repository"
import { Button, Card, Badge } from "../../components/ui/Ui"
import { Trash2 } from "../../components/ui/Icons"
import { TRIGGER_EVENTS } from "./helpers"

export default function RulesTab({ rules, templateNameFor, onEdit, onDelete }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="mt-head">
            <tr>
              <th className="px-4 py-3">Rule Name</th>
              <th className="px-4 py-3">Trigger Event</th>
              <th className="px-4 py-3">Action Channel</th>
              <th className="px-4 py-3">Template Mapping</th>
              <th className="px-4 py-3">Delay</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="mt-body">
            {rules.length === 0 ? (
              <tr>
                <td colSpan="7" className="py-12 text-center text-muted-foreground">No rules configured.</td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-subtle">
                  <td className="px-4 py-3 font-semibold text-xs text-foreground">
                    <div>{rule.name}</div>
                    <div className="text-[10px] text-muted-foreground font-normal mt-0.5">{rule.description}</div>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-primary">
                    {rule.triggerEvent}
                    {!TRIGGER_EVENTS.some(ev => ev.value === rule.triggerEvent) && (
                      <div className="text-[10px] font-sans font-semibold text-destructive mt-0.5">
                        Unsupported event — never fires
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-bold uppercase text-success-text">{rule.actionType}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {templateNameFor(rule.templateId) || (
                      <span className="italic">Built-in message</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {rule.delayMinutes === 0 ? "Immediate" : `${rule.delayMinutes} mins`}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={async () => {
                        await repo.update("automation_rules", rule.id, { active: !rule.active })
                        toast.success(`Rule ${!rule.active ? "enabled" : "disabled"}`)
                      }}
                    >
                      <Badge tone={rule.active ? "emerald" : "slate"}>
                        {rule.active ? "Active" : "Disabled"}
                      </Badge>
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(rule)}
                        className="h-7 text-xs"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="dangerGhost"
                        size="sm"
                        onClick={() => onDelete(rule.id)}
                        className="h-7 p-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
