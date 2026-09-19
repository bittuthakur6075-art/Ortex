import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Card, Button, Badge } from "../../components/ui/Ui"
import { Instagram, Facebook, LinkedIn } from "../../components/ui/Icons"
import { supabase, functionErrorMessage } from "../../data/store/supabaseClient"
import { formatDate } from "../../lib/format"
import InstagramTokenModal from "./InstagramTokenModal"

const DAY = 86_400_000

// The accounts posts can go to, in one strip above the posts: what is connected,
// and for an admin the LinkedIn connect / reconnect button. LinkedIn's sign-in
// ends back here with ?linkedin=connected or ?linkedin=error&reason=…
export default function AccountsCard({ accounts, isAdmin }) {
  const { status, loading, reload } = accounts
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState("")
  const [igOpen, setIgOpen] = useState(false)

  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const outcome = q.get("linkedin")
    if (!outcome) return
    if (outcome === "connected") {
      toast.success("LinkedIn connected")
      reload()
    } else {
      toast.error(q.get("reason") || "LinkedIn sign-in failed")
    }
    navigate(location.pathname, { replace: true })
  }, [location.search, location.pathname, navigate, reload])

  const connect = async () => {
    setBusy("connect")
    try {
      const { data, error } = await supabase.functions.invoke("social-accounts", {
        body: { action: "connect", returnTo: window.location.origin },
      })
      if (error) throw new Error(await functionErrorMessage(error, "Could not start the LinkedIn sign-in"))
      if (data?.error) throw new Error(data.error)
      window.location.assign(data.url)
    } catch (e) {
      toast.error(e.message)
      setBusy("")
    }
  }

  const disconnectInstagram = async () => {
    if (!window.confirm("Disconnect Instagram? Posts will stop going to Instagram until the token is pasted again.")) return
    setBusy("ig")
    try {
      const { data, error } = await supabase.functions.invoke("social-accounts", { body: { action: "instagram-disconnect" } })
      if (error) throw new Error(await functionErrorMessage(error, "Could not disconnect Instagram"))
      if (data?.error) throw new Error(data.error)
      toast.success("Instagram disconnected")
      reload()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy("")
    }
  }

  const disconnect = async () => {
    if (!window.confirm("Disconnect LinkedIn? Posts will stop going to the LinkedIn page until an admin connects it again.")) return
    setBusy("disconnect")
    try {
      const { data, error } = await supabase.functions.invoke("social-accounts", { body: { action: "disconnect" } })
      if (error) throw new Error(await functionErrorMessage(error, "Could not disconnect LinkedIn"))
      if (data?.error) throw new Error(data.error)
      toast.success("LinkedIn disconnected")
      reload()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy("")
    }
  }

  const li = status?.linkedin
  // Older function builds have no `instagram` block; fall back to the flag.
  const ig = status?.instagram || (status ? { connected: Boolean(status.meta?.instagram), via: status.meta?.instagram ? "facebook" : null } : null)
  const reconnectIn = li?.reconnectBy ? Math.ceil((new Date(li.reconnectBy).getTime() - Date.now()) / DAY) : null
  const reconnectSoon = li?.connected && reconnectIn != null && reconnectIn <= 30

  const row = (Icon, name, state, tone, detail, action) => (
    <div className="flex flex-wrap items-center gap-3 py-2.5">
      <Icon className="h-5 w-5 flex-none text-muted-foreground" />
      <span className="min-w-[110px] text-sm font-medium text-foreground">{name}</span>
      <Badge tone={tone}>{state}</Badge>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  )

  return (
    <Card className="mb-4 px-5 py-2">
      {loading && !status ? (
        <p className="py-3 text-sm text-muted-foreground">Checking connected accounts…</p>
      ) : !status ? (
        <p className="py-3 text-sm text-muted-foreground">Could not check the connected accounts.</p>
      ) : (
        <div className="divide-y divide-border">
          {row(
            Instagram,
            "Instagram",
            ig?.connected ? "Connected" : ig?.expired ? "Expired" : "Not connected",
            ig?.connected ? "emerald" : ig?.expired ? "rose" : "slate",
            ig?.connected
              ? ig.via === "instagram"
                ? `${ig.username ? `@${ig.username}` : "Instagram account"} · renews itself every week`
                : "Through the Facebook Page"
              : ig?.expired
                ? "The token ran out. Paste a new one."
                : "No Facebook Page needed: paste a token from the Meta app",
            isAdmin ? (
              <span className="flex gap-2">
                {ig?.via === "instagram" && (
                  <Button variant="ghost" size="sm" onClick={disconnectInstagram} disabled={Boolean(busy)}>
                    {busy === "ig" ? "Disconnecting…" : "Disconnect"}
                  </Button>
                )}
                {ig?.via !== "facebook" && (
                  <Button size="sm" variant={ig?.connected ? "outline" : "primary"} onClick={() => setIgOpen(true)} disabled={Boolean(busy)}>
                    {ig?.connected ? "Replace token" : "Connect Instagram"}
                  </Button>
                )}
              </span>
            ) : null,
          )}
          {row(Facebook, "Facebook Page", status.meta.facebook ? "Connected" : "Not connected", status.meta.facebook ? "emerald" : "slate",
            status.meta.facebook ? "" : "Optional. Needs a Facebook Page, see docs/guides/META_SETUP.md")}
          {row(
            LinkedIn,
            "LinkedIn Page",
            !li?.configured ? "Not set up" : li.connected ? "Connected" : li.expired ? "Expired" : "Not connected",
            !li?.configured ? "slate" : li.connected ? (reconnectSoon ? "amber" : "emerald") : li.expired ? "rose" : "slate",
            !li?.configured
              ? "Waiting for LinkedIn app approval, see docs/guides/LINKEDIN_SETUP.md"
              : li.connected
                ? `${li.name || "Company Page"}${li.reconnectBy ? ` · ${reconnectSoon ? "reconnect needed by" : "renews automatically until"} ${formatDate(li.reconnectBy)}` : ""}`
                : li.expired
                  ? "The yearly sign-in ran out. An admin needs to connect again."
                  : "An admin of the LinkedIn Company Page needs to connect it once.",
            li?.configured && isAdmin ? (
              <span className="flex gap-2">
                {li.connected && (
                  <Button variant="ghost" size="sm" onClick={disconnect} disabled={Boolean(busy)}>
                    {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
                  </Button>
                )}
                {(!li.connected || reconnectSoon) && (
                  <Button size="sm" onClick={connect} disabled={Boolean(busy)}>
                    {busy === "connect" ? "Opening LinkedIn…" : li.connected ? "Reconnect LinkedIn" : "Connect LinkedIn"}
                  </Button>
                )}
              </span>
            ) : null,
          )}
        </div>
      )}
      <InstagramTokenModal open={igOpen} onClose={() => setIgOpen(false)} onConnected={reload} />
    </Card>
  )
}
