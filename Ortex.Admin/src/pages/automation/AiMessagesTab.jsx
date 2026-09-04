import { Card, Badge, EmptyState } from "../../components/ui/Ui"
import { Sparkles } from "../../components/ui/Icons"
import { formatDateTime } from "../../lib/format"

export default function AiMessagesTab({ aiMessages }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {aiMessages.length === 0 ? (
        <div className="col-span-2 py-16 text-center">
          <EmptyState
            icon={Sparkles}
            title="No suggested messages yet"
            description="Suggested follow-ups are drafted from a template when a visitor activity trigger fires."
          />
        </div>
      ) : (
        aiMessages.map((msg) => (
          <Card key={msg.id} className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase text-primary tracking-wider">{msg.triggerType}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(msg.createdAt)}</span>
              </div>
              <div className="text-sm font-semibold text-foreground mb-2">Customer: {msg.customerName}</div>
              <div className="bg-muted p-2.5 rounded-lg text-xs font-mono text-muted-foreground mb-4">
                <strong>Trigger context:</strong> {msg.context}
              </div>
              <div className="text-sm border border-border/80 bg-background p-3 rounded-lg text-foreground font-medium italic relative">
                <span className="absolute -top-2 left-3 bg-card px-1.5 text-[9px] uppercase font-bold text-muted-foreground">Drafted Message</span>
                "{msg.generatedMessage}"
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Recipient ID: {msg.userId}</span>
              <Badge tone="violet">Suggested</Badge>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
