import { useMemo } from "react"
import { Button, Card, Badge } from "../../components/ui/Ui"
import { formatDateTime } from "../../lib/format"
import { WA_PENDING, maskPhone } from "./helpers"

export default function WhatsAppTab({ whatsappLogs, searchQuery, maskSensitiveData, onOpenWhatsApp }) {
  const filteredWhatsappLogs = useMemo(() => {
    if (!searchQuery) return whatsappLogs
    const query = searchQuery.toLowerCase()
    return whatsappLogs.filter(l =>
      (l.customerName || "").toLowerCase().includes(query) ||
      (l.phone || "").includes(query) ||
      (l.messageText || "").toLowerCase().includes(query) ||
      (l.status || "").toLowerCase().includes(query)
    )
  }, [whatsappLogs, searchQuery])

  const failedMessages = useMemo(() => {
    return whatsappLogs.filter(l => l.status === "failed")
  }, [whatsappLogs])

  const queuedMessages = useMemo(() => {
    return whatsappLogs.filter(l => WA_PENDING.includes(l.status))
  }, [whatsappLogs])

  return (
    <div className="space-y-6">
      {/* Monitor Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-4 flex items-center justify-between border-dashed">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Active Dispatch Queue</span>
            <div className="text-lg font-bold">{queuedMessages.length} queued messages</div>
          </div>
          <Badge tone="amber">Auto Dispatching</Badge>
        </Card>

        <Card className="p-4 flex items-center justify-between border-dashed">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Failed Deliveries</span>
            <div className="text-lg font-bold text-destructive">{failedMessages.length} failures logged</div>
          </div>
          {failedMessages.length > 0
            ? <Badge tone="rose">Error Check Needed</Badge>
            : <Badge tone="emerald">All Clear</Badge>}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-subtle text-[11px] font-semibold uppercase tracking-[0.05em] text-subtle-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]">
              <tr>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Message Text</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border rows-in text-foreground">
              {filteredWhatsappLogs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-muted-foreground">No WhatsApp logs found.</td>
                </tr>
              ) : (
                filteredWhatsappLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-subtle">
                    <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDateTime(log.createdAt)}</td>
                    <td className="px-4 py-3 font-semibold text-xs">{log.customerName}</td>
                    <td className="px-4 py-3 font-mono text-xs">{maskPhone(log.phone, maskSensitiveData)}</td>
                    <td className="px-4 py-3 text-xs text-primary">{log.templateName}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-sm">{log.messageText}</td>
                    <td className="px-4 py-3">
                      <Badge tone={
                        log.status === "delivered" || log.status === "read" ? "emerald" :
                        log.status === "failed" ? "rose" :
                        log.status === "sending" ? "blue" : "slate"
                      }>
                        {log.status}
                      </Badge>
                      {/* Only failed rows show their error; rows already
                          re-sent before this fix still carry a stale one. */}
                      {log.errorMessage && log.status === "failed" && (
                        <div className="text-[10px] text-destructive mt-1 font-mono max-w-xs">{log.errorMessage}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right space-x-2">
                      {(log.status === "failed" || log.status === "queued") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenWhatsApp(log)}
                          className="h-7 text-[11px] border-success text-success-text hover:bg-success/10"
                        >
                          📱 Send via WhatsApp
                        </Button>
                      )}
                      {log.status === "sent" && (
                        <span className="text-xs text-muted-foreground italic">Sent via WhatsApp Web</span>
                      )}
                      {log.status === "delivered" && (
                        <span className="text-xs text-success-text font-semibold">✓ Delivered</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
