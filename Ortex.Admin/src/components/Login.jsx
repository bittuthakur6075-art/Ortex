import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Lock, Mail, ShieldCheck, Inbox, CheckCircle2, Database, LayoutGrid, Eye, EyeOff } from "./icons"
import { verifyPassword, sendEmailOtp, verifyEmailOtp, isAuthed } from "../lib/auth"
import { hasSupabase } from "../data/supabaseClient"
import { Button, Input } from "./ui"

// Supabase rate-limits repeat sends to the same address; keep the resend button
// disabled a little longer than that so a click can't fail for hitting it.
const RESEND_SECONDS = 60

export default function Login() {
  const navigate = useNavigate()
  const [step, setStep] = useState("password")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (isAuthed()) navigate("/", { replace: true })
  }, [navigate])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // Step 1 → check the password, then mail a code. The password alone never
  // signs anyone in here; only verifyEmailOtp below creates a session.
  const handlePassword = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError("")

    const res = await verifyPassword(email, password)
    if (!res.ok) {
      setBusy(false)
      setError(res.error || "Those credentials did not match. Check your email and password, then try again.")
      setPassword("")
      return
    }

    // Legacy passphrase mode has no email to send to; verifyPassword already
    // opened the local session, so go straight in.
    if (!hasSupabase) {
      setBusy(false)
      navigate("/", { replace: true })
      return
    }

    const sent = await sendEmailOtp(email)
    setBusy(false)
    if (!sent.ok) {
      setError(sent.error || "We could not send your code. Try again in a moment.")
      return
    }
    setStep("code")
    setCooldown(RESEND_SECONDS)
  }

  // Step 2 → the code is what actually signs the user in.
  const handleCode = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError("")

    const res = await verifyEmailOtp(email, code)
    setBusy(false)
    if (res.ok) {
      navigate("/", { replace: true })
    } else {
      setError(res.error || "That code was not accepted. Check it and try again.")
      setCode("")
    }
  }

  const handleResend = async () => {
    setBusy(true)
    setError("")
    const sent = await sendEmailOtp(email)
    setBusy(false)
    if (sent.ok) setCooldown(RESEND_SECONDS)
    else setError(sent.error || "We could not resend your code.")
  }

  const backToPassword = () => {
    setStep("password")
    setCode("")
    setPassword("")
    setError("")
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
            <h1 className="lgn-title">{step === "code" ? "Check your email" : "Operations Console"}</h1>
            <p className="lgn-sub">
              {step === "code"
                ? <>We sent a 6-digit code to <strong className="font-medium text-foreground">{email}</strong>.</>
                : "Sign in to run every order from quote to payment."}
            </p>

            {step === "code" ? (
              <form onSubmit={handleCode} noValidate className="lgn-form">
                <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-foreground">
                  Verification code
                </label>
                <div className="relative">
                  <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="code"
                    type="text"
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); if (error) setError("") }}
                    placeholder="000000"
                    className="pl-10 tracking-[0.4em]"
                  />
                </div>

                {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}

                <Button type="submit" className="mt-8 w-full justify-center" disabled={busy || code.length < 6}>
                  {busy ? "Verifying…" : "Verify and sign in"}
                </Button>

                <div className="lgn-tophelp lgn-help-below">
                  {cooldown > 0
                    ? `Didn't get it? You can resend in ${cooldown}s`
                    : <>Didn't get it? <button type="button" onClick={handleResend} disabled={busy}>Resend code</button></>}
                </div>
                <div className="lgn-tophelp lgn-help-alt">
                  <button type="button" onClick={backToPassword}>Use a different account</button>
                </div>
              </form>
            ) : (
            <form onSubmit={handlePassword} noValidate className="lgn-form">
              <div className="mb-5">
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
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

              <label htmlFor="pw" className="mb-1.5 block text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="pw"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError("") }}
                  placeholder="Your password"
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
                {busy ? "Checking…" : "Continue"}
              </Button>

            </form>
            )}
          </div>

          <div className="lgn-copyright">
            Copyright &copy; {year} <span className="lgn-copyright-co">Ortex Industries</span>. All Rights Reserved.
          </div>
        </section>

        {/* ---- Right: decorative operations-insight panel ---- */}
        <aside className="lgn-right" aria-hidden="true">
          <img className="lgn-img" src="/img/login-floor.avif" alt="" />
          <div className="lgn-overlay">

            <div className="lgn-acts">
              <div className="lgn-act">
                <span className="lgn-act-ic" style={{ background: "color-mix(in srgb, hsl(var(--primary)) 16%, #fff)", color: "hsl(var(--primary))" }}>
                  <Inbox size={22} />
                </span>
                <div className="lgn-act-t"><strong>Enquiry logged</strong><span>Corporate gifting · 500 units</span></div>
              </div>
              <div className="lgn-act">
                <span className="lgn-act-ic" style={{ background: "color-mix(in srgb, #12B886 18%, #fff)", color: "#0E9F6E" }}>
                  <CheckCircle2 size={22} />
                </span>
                <div className="lgn-act-t"><strong>Payment cleared</strong><span>₹1,24,000 settled via UPI</span></div>
              </div>

              <div className="lgn-trust">
                <div className="lgn-trust-head"><span className="lgn-trust-ic"><ShieldCheck size={22} /></span> Secure by default</div>
                <ul className="lgn-trust-list">
                  <li><Lock size={16} /> Every session encrypted</li>
                  <li><LayoutGrid size={16} /> Access scoped to your role</li>
                  <li><Database size={16} /> Records stay in your own database</li>
                </ul>
              </div>
            </div>

            <div className="lgn-caption">
              <h2>From first enquiry to final payment</h2>
              <p>Quote it, invoice it, reconcile it. Every job stays on one thread, so nothing slips between the floor and the books.</p>
            </div>

          </div>
        </aside>

      </div>
    </div>
  )
}
