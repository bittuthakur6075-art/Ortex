import { useState } from "react"
import { toast } from "sonner"
import { Button, Field, Modal, Textarea } from "../../components/ui/Ui"
import { supabase, functionErrorMessage } from "../../data/store/supabaseClient"

// Connect Instagram on its own (no Facebook Page): paste the long-lived token
// from the Meta app's "Generate token". The function checks it against
// Instagram and stores it server-side; the browser never keeps it.
export default function InstagramTokenModal({ open, onClose, onConnected }) {
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke("social-accounts", {
        body: { action: "instagram-connect", token: token.trim() },
      })
      if (error) throw new Error(await functionErrorMessage(error, "Could not connect Instagram"))
      if (data?.error) throw new Error(data.error)
      toast.success(`Instagram connected${data?.username ? ` as @${data.username}` : ""}`)
      setToken("")
      onConnected?.()
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect Instagram"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy || token.trim().length < 50}>
            {busy ? "Checking…" : "Connect"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm text-muted-foreground">
        <ol className="list-decimal space-y-1 pl-5">
          <li>In your Meta app, open <span className="text-foreground">Instagram → API setup with Instagram login</span>.</li>
          <li>Under <span className="text-foreground">Generate access tokens</span>, add the Ortex Instagram account and click <span className="text-foreground">Generate token</span>.</li>
          <li>Copy the token and paste it below.</li>
        </ol>
        <Field label="Instagram access token" hint="Checked with Instagram, then kept on the server only. It renews itself every week.">
          <Textarea
            rows={4}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste the token (starts with IG…)"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </div>
    </Modal>
  )
}
