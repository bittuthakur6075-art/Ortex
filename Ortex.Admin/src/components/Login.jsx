import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Lock, ShieldCheck, ArrowRight } from "./icons"
import { login, isAuthed } from "../lib/auth"
import { hasSupabase } from "../data/supabaseClient"
import { Button, Card, Input } from "./ui"

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isAuthed()) navigate("/", { replace: true })
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const res = await login(email, password)
    setBusy(false)
    if (res.ok) {
      navigate("/", { replace: true })
    } else {
      setError(res.error || "Sign in failed.")
      setPassword("")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Ortex Admin Console</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to manage operations</p>
        </div>

        <Card className="p-6 sm:p-8">
          <form onSubmit={handleSubmit}>
            {hasSupabase && (
              <>
                <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Email
                </label>
                <div className="relative mb-4">
                  <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoFocus
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (error) setError("")
                    }}
                    placeholder="you@ortexindustries.in"
                    className="pl-10"
                  />
                </div>
              </>
            )}
            <label htmlFor="pw" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="pw"
                type="password"
                autoFocus={!hasSupabase}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError("")
                }}
                placeholder={hasSupabase ? "Enter your password" : "Enter admin password"}
                className="pl-10"
              />
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="mt-5 w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
          {!hasSupabase && (
            <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
              Demo password: <span className="font-mono font-semibold text-foreground">ortex@admin</span>
            </p>
          )}
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {hasSupabase ? "Secured by Supabase Auth" : "Client-side demo console — not a security boundary."}
        </p>
      </div>
    </div>
  )
}
