import { toast } from "sonner"
import { repo } from "../../data/store/repository"
import { Button, Card, CardHeader, Badge } from "../../components/ui/Ui"
import { Trash2 } from "../../components/ui/Icons"
import { TRIGGER_EVENTS } from "./helpers"

export default function RulesTab({ rules, templateNameFor, onEdit, onDelete }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Automation rules" description={`${rules.length} ${rules.length === 1 ? "rule" : "rules"}`} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="mt-head">
            <tr>
              <th>Rule</th>
              <th>When it fires</th>
              <th>What it sends</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="mt-body">
            {rules.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-12 text-center text-muted-foreground">No rules configured.</td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-subtle align-top">
                  <td className="px-4 py-3 text-xs font-semibold text-foreground">
                    <div>{rule.name}</div>
                    <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">{rule.description}</div>
                  </td>
                  {/* The trigger and the wait after it are one sentence: "on
                      quote_requested, 30 mins later". */}
                  <td className="px-4 py-3 text-xs">
                    <div className="font-mono text-primary">{rule.triggerEvent}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {rule.delayMinutes === 0 ? "Immediately" : `After ${rule.delayMinutes} mins`}
                    </div>
                    {!TRIGGER_EVENTS.some(ev => ev.value === rule.triggerEvent) && (
                      <div className="mt-0.5 text-[10px] font-semibold text-destructive">
                        Unsupported event - never fires
                      </div>
                    )}
                  </td>
                  {/* The channel and the template it puts on that channel. */}
                  <td className="px-4 py-3 text-xs">
                    <div className="font-bold uppercase text-success-text">{rule.actionType}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {templateNameFor(rule.templateId) || <span className="italic">Built-in message</span>}
                    </div>
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
                      <Button variant="outline" size="sm" onClick={() => onEdit(rule)}>
                        Edit
                      </Button>
                      <Button variant="dangerGhost" size="sm" icon onClick={() => onDelete(rule.id)}>
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
