import { Send, CheckCircle2, ArrowUpRight } from "../../components/ui/Icons"
import { Button, Card } from "../../components/ui/Ui"

export default function ApprovalCard({ form, isAdmin, submitForReview, approve, publish, publishing }) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 border-b border-border pb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Approval
      </h3>
      <div className="space-y-3">
        {form.status === "draft" || form.status === "idea" ? (
          <Button variant="outline" className="w-full" onClick={submitForReview}>
            <ArrowUpRight className="h-4 w-4" /> Send for approval
          </Button>
        ) : null}

        {form.status === "review" && (
          isAdmin ? (
            <Button variant="success" className="w-full" onClick={approve}>
              <CheckCircle2 className="h-4 w-4" /> Approve
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Waiting on an admin to approve this post.</p>
          )
        )}

        {["approved", "scheduled", "failed"].includes(form.status) && (
          isAdmin ? (
            <Button className="w-full" onClick={publish} disabled={publishing}>
              <Send className="h-4 w-4" /> {publishing ? "Publishing…" : "Publish now"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Only an admin can publish to the company profile.</p>
          )
        )}

        {form.status === "scheduled" && (
          <p className="text-xs text-muted-foreground">
            This will publish automatically at the scheduled time. Publish now to send it early.
          </p>
        )}

        {form.error && (
          <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{form.error}</p>
        )}

        {Object.entries(form.results || {}).map(([platform, r]) => (
          <div key={platform} className="text-xs">
            <span className="font-semibold capitalize text-foreground">{platform}: </span>
            {r?.id ? (
              r.permalink ? (
                <a href={r.permalink} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  View post
                </a>
              ) : (
                <span className="text-muted-foreground">Published</span>
              )
            ) : (
              <span className="text-destructive">{r?.error || "Not published"}</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
