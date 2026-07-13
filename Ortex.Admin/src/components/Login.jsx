import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Lock, Mail, ShieldCheck, Inbox, CheckCircle2, Database, LayoutGrid, Eye, EyeOff } from "./icons"
import { login, isAuthed } from "../lib/auth"
import { hasSupabase } from "../data/supabaseClient"
import { Button, Input } from "./ui"

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isAuthed()) navigate("/", { replace: true })
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError("")

    const res = await login(email, password)
    setBusy(false)
    if (res.ok) {
      navigate("/", { replace: true })
    } else {
      setError(res.error || "Sign in failed.")
      setPassword("")
    }
  }

  const year = new Date().getFullYear()

  return (
    <div className="lgn">
      <div className="lgn-card">

        {/* ---- Left: sign-in/up form ---- */}
        <section className="lgn-left">
          <div className="lgn-body">
            <a href="/" className="lgn-brand lgn-brand-top" aria-label="Ortex Industries home">
              <img src="/img/logo.svg" alt="Ortex Industries" className="h-10 w-auto" />
            </a>
            <h1 className="lgn-title">Admin Console</h1>
            <p className="lgn-sub">
              Manage enquiries, quotations, invoices and payments.
            </p>

            <form onSubmit={handleSubmit} noValidate className="lgn-form">
              <div className="mb-5">
                <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoFocus
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (error) setError("") }}
                    placeholder="you@ortexindustries.in"
                    className="pl-10"
                  />
                </div>
              </div>

              <label htmlFor="pw" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="pw"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError("") }}
                  placeholder="Enter your password"
                  className="pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}

              <Button type="submit" className="mt-8 w-full justify-center" disabled={busy}>
                {busy ? "Signing in…" : "Sign In"}
              </Button>

              <div className="lgn-tophelp lgn-help-below">
                Need help? <a href="mailto:sales@ortexindustries.in">Contact IT</a>
              </div>

            </form>
          </div>

          <div className="lgn-copyright">
            Copyright &copy; {year} <span className="lgn-copyright-co">Ortex Industries</span>. All Rights Reserved.
          </div>
          <nav className="lgn-botlinks" aria-label="Legal">
            <a href="http://localhost:5175/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            <a href="http://localhost:5175/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
            <a href="http://localhost:5175/acceptable-use" target="_blank" rel="noopener noreferrer">Acceptable Use</a>
          </nav>
        </section>

        {/* ---- Right: decorative operations-insight panel ---- */}
        <aside className="lgn-right" aria-hidden="true">
          <img className="lgn-img" src="/img/login-laser.jpg" alt="" />
          <div className="lgn-overlay">

            <div className="lgn-acts">
              <div className="lgn-act">
                <span className="lgn-act-ic" style={{ background: "color-mix(in srgb, hsl(var(--primary)) 16%, #fff)", color: "hsl(var(--primary))" }}>
                  <Inbox size={22} />
                </span>
                <div className="lgn-act-t"><strong>New enquiry received</strong><span>Corporate gifting · 500 units</span></div>
              </div>
              <div className="lgn-act">
                <span className="lgn-act-ic" style={{ background: "color-mix(in srgb, #12B886 18%, #fff)", color: "#0E9F6E" }}>
                  <CheckCircle2 size={22} />
                </span>
                <div className="lgn-act-t"><strong>Invoice paid</strong><span>₹1,24,000 settled via UPI</span></div>
              </div>

              <div className="lgn-trust">
                <div className="lgn-trust-head"><span className="lgn-trust-ic"><ShieldCheck size={22} /></span> Secured & private</div>
                <ul className="lgn-trust-list">
                  <li><Lock size={16} /> Encrypted sessions</li>
                  <li><LayoutGrid size={16} /> Role-based access</li>
                  <li><Database size={16} /> Your data stays in Supabase</li>
                </ul>
              </div>
            </div>

            <div className="lgn-caption">
              <h2>Run your operation from one console</h2>
              <p>Track and reconcile enquiries, quotations, invoices, and payments in one workspace.</p>
            </div>

          </div>
        </aside>

      </div>
    </div>
  )
}
