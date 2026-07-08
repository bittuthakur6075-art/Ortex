import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Lock, Mail, ShieldCheck, ArrowRight, Inbox, CheckCircle2, Database, LayoutGrid, Users } from "./icons"
import { login, signUp, isAuthed } from "../lib/auth"
import { hasSupabase } from "../data/supabaseClient"
import { Button, Input } from "./ui"

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isAuthed()) navigate("/", { replace: true })
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    
    if (isSignUp) {
      const res = await signUp(email, password, name)
      if (res.ok) {
        // Auto sign in after sign up
        const loginRes = await login(email, password)
        setBusy(false)
        if (loginRes.ok) {
          navigate("/", { replace: true })
        } else {
          setError("Account created, but automatic sign in failed. Please sign in manually.")
          setIsSignUp(false)
        }
      } else {
        setBusy(false)
        setError(res.error || "Registration failed.")
      }
    } else {
      const res = await login(email, password)
      setBusy(false)
      if (res.ok) {
        navigate("/", { replace: true })
      } else {
        setError(res.error || "Sign in failed.")
        setPassword("")
      }
    }
  }

  const year = new Date().getFullYear()

  return (
    <div className="lgn">
      <div className="lgn-card">

        {/* ---- Left: sign-in/up form ---- */}
        <section className="lgn-left">
          <div className="lgn-top">
            <a href="/" className="lgn-brand" aria-label="Ortex Industries home">
              <img src="/img/logo.svg" alt="Ortex Industries" className="h-7 w-auto" />
            </a>
            <div className="lgn-tophelp">
              Need help? <a href="mailto:sales@ortexindustries.in">Contact IT</a>
            </div>
          </div>

          <div className="lgn-body">
            <h1 className="lgn-title">Admin Console</h1>
            <p className="lgn-sub">
              {isSignUp 
                ? "Create a staff/admin account to access the console."
                : "Sign in to manage enquiries, quotations, invoicing and payments for Ortex Industries."}
            </p>

            <form onSubmit={handleSubmit} noValidate className="lgn-form">
              {isSignUp && (
                <div className="mb-4">
                  <label htmlFor="name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Name
                  </label>
                  <div className="relative">
                    <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => { setName(e.target.value); if (error) setError("") }}
                      placeholder="Your Full Name"
                      className="pl-10"
                    />
                  </div>
                </div>
              )}

              <div className="mb-4">
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
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError("") }}
                  placeholder="Enter your password"
                  className="pl-10"
                />
              </div>

              {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}

              <Button type="submit" className="mt-5 w-full justify-center" disabled={busy}>
                {busy ? (isSignUp ? "Creating account…" : "Signing in…") : (isSignUp ? "Create Account" : "Sign In")}
                <ArrowRight className="h-4 w-4" />
              </Button>
              
              {hasSupabase && (
                <div className="mt-4 text-center text-xs">
                  <button 
                    type="button" 
                    onClick={() => { setIsSignUp(!isSignUp); setError(""); }}
                    className="text-primary hover:underline font-medium"
                  >
                    {isSignUp ? "Already have an account? Sign in" : "Don't have an account yet? Register/Sign up"}
                  </button>
                </div>
              )}
            </form>

            <div className="lgn-secure">
              <ShieldCheck size={16} />
              <span>
                {hasSupabase
                  ? "Encrypted sign-in, secured by Supabase Auth."
                  : "Database and authentication not configured. Set Supabase keys in .env"}
              </span>
            </div>
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
          <img className="lgn-img" src="/img/login-glass.webp" alt="" />
          <div className="lgn-overlay">

            <div className="lgn-stat">
              <span className="lgn-stat-l">Quotations this quarter</span>
              <div className="lgn-stat-v">₹18,42,600 <span className="lgn-stat-d">↑ 12%</span></div>
              <div className="lgn-stat-chart">
                <div className="lgn-donut" />
                <ul className="lgn-legend">
                  <li><i style={{ background: "hsl(var(--primary))" }} /> Enquiries <b>42%</b></li>
                  <li><i style={{ background: "#12B886" }} /> Quotes <b>26%</b></li>
                  <li><i style={{ background: "#F59E0B" }} /> Invoices <b>20%</b></li>
                  <li><i style={{ background: "#7C3AED" }} /> Payments <b>12%</b></li>
                </ul>
              </div>
              <div className="lgn-stat-foot">
                <div className="lgn-stat-foot-item">
                  <span className="lgn-stat-foot-l">Period</span>
                  <span className="lgn-stat-foot-v">Q2 FY26</span>
                </div>
                <div className="lgn-stat-foot-item">
                  <span className="lgn-stat-foot-l">Open enquiries</span>
                  <span className="lgn-stat-foot-v">37</span>
                </div>
                <div className="lgn-stat-foot-item">
                  <span className="lgn-stat-foot-l">Status</span>
                  <span className="lgn-stat-foot-v lgn-stat-foot-ok">Reconciled</span>
                </div>
              </div>
            </div>

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
              <h2>Run Ortex operations from one console</h2>
              <p>Track and reconcile enquiries, quotations, invoicing, and payments in one unified workspace.</p>
            </div>

          </div>
        </aside>

      </div>
    </div>
  )
}
