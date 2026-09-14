import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Lock, Mail, ShieldCheck,Database, LayoutGrid, Eye, EyeOff } from "../components/ui/Icons"
import {
  verifyPassword,
  sendEmailOtp,
  verifyEmailOtp,
  isAuthed,
  sendResetCode,
  verifyResetCode,
  finishPasswordReset,
} from "../lib/auth"
import { hasSupabase } from "../data/store/supabaseClient"
import { Button, Input } from "../components/ui/Ui"

// Supabase rate-limits repeat sends to the same address; keep the resend button
// disabled a little longer than that so a click can't fail for hitting it.
const RESEND_SECONDS = 60
// Supabase's own floor, as on the password card in Settings/Profile.
const MIN_PASSWORD_LENGTH = 6

// Steps: "password" → "code" signs in; "reset-email" → "reset-code" →
// "reset-password" is Forgot password, on the same card.

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
  const [nextPassword, setNextPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  // The verified recovery client, held between the code and the new password.
  const resetRef = useRef(null)

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
    const sent = step === "reset-code" ? await sendResetCode(email) : await sendEmailOtp(email)
    setBusy(false)
    if (sent.ok) setCooldown(RESEND_SECONDS)
    else setError(sent.error || "We could not resend your code.")
  }

  const backToPassword = () => {
    resetRef.current = null
    setStep("password")
    setCode("")
    setPassword("")
    setNextPassword("")
    setConfirmPassword("")
    setError("")
  }

  // ---- Forgot password ----

  const startReset = () => {
    setStep("reset-email")
    setCode("")
    setError("")
  }

  const handleResetEmail = async (e) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter the email address you sign in with.")
      return
    }
    setBusy(true)
    setError("")
    const sent = await sendResetCode(email)
    setBusy(false)
    if (!sent.ok) {
      setError(sent.error || "We could not send your code. Try again in a moment.")
      return
    }
    setStep("reset-code")
    setCooldown(RESEND_SECONDS)
  }

  const handleResetCode = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await verifyResetCode(email, code)
    setBusy(false)
    if (!res.ok) {
      setError(res.error || "That code was not accepted. Check it and try again.")
      setCode("")
      return
    }
    resetRef.current = res.reset
    setNextPassword("")
    setConfirmPassword("")
    setStep("reset-password")
  }

  const handleNewPassword = async (e) => {
    e.preventDefault()
    if (nextPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (nextPassword !== confirmPassword) {
      setError("The two passwords do not match.")
      return
    }
    if (!resetRef.current) {
      setStep("reset-email")
      setError("Your code has expired. Ask for a new one.")
      return
    }
    setBusy(true)
    setError("")
    const res = await finishPasswordReset(resetRef.current, nextPassword)
    setBusy(false)
    if (res.ok) {
      navigate("/", { replace: true })
      return
    }
    if (res.passwordChanged) backToPassword()
    setError(res.error)
  }

  const onCodeStep = step === "code" || step === "reset-code"
  const heading = {
    password: "Operations Console",
    code: "Check your email",
    "reset-email": "Reset your password",
    "reset-code": "Check your email",
    "reset-password": "Choose a new password",
  }[step]
  const subheading = {
    password: "Sign in to run every order from quote to payment.",
    code: <>We sent a 6-digit code to <strong className="font-medium text-foreground">{email}</strong>.</>,
    "reset-email": "Enter the email you sign in with. We will send a 6-digit code to it.",
    "reset-code": <>If <strong className="font-medium text-foreground">{email}</strong> has a console account, a 6-digit code is on its way.</>,
    "reset-password": <>For <strong className="font-medium text-foreground">{email}</strong>. Use at least {MIN_PASSWORD_LENGTH} characters.</>,
  }[step]

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
            <h1 className="lgn-title">{heading}</h1>
            <p className="lgn-sub">{subheading}</p>

            {step === "reset-email" ? (
              <form onSubmit={handleResetEmail} noValidate className="lgn-form">
                <label htmlFor="reset-email" className="mb-1.5 block text-sm font-medium text-foreground">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="reset-email"
                    type="email"
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (error) setError("") }}
                    placeholder="Enter email address"
                    className="pl-10"
                  />
                </div>

                {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}

                <Button type="submit" className="mt-8 w-full justify-center" disabled={busy}>
                  {busy ? "Sending…" : "Send code"}
                </Button>

                <div className="lgn-tophelp lgn-help-below">
                  <button type="button" onClick={backToPassword}>Back to sign in</button>
                </div>
              </form>
            ) : step === "reset-password" ? (
              <form onSubmit={handleNewPassword} noValidate className="lgn-form">
                <div className="mb-5">
                  <label htmlFor="new-pw" className="mb-1.5 block text-sm font-medium text-foreground">
                    New password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="new-pw"
                      type={showPassword ? "text" : "password"}
                      autoFocus
                      autoComplete="new-password"
                      value={nextPassword}
                      onChange={(e) => { setNextPassword(e.target.value); if (error) setError("") }}
                      placeholder="Enter a new password"
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
                </div>

                <label htmlFor="confirm-pw" className="mb-1.5 block text-sm font-medium text-foreground">
                  Confirm new password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirm-pw"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); if (error) setError("") }}
                    placeholder="Enter it again"
                    className="pl-10"
                  />
                </div>

                {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}

                <Button type="submit" className="mt-8 w-full justify-center" disabled={busy}>
                  {busy ? "Saving…" : "Save and sign in"}
                </Button>

                <div className="lgn-tophelp lgn-help-below">
                  <button type="button" onClick={backToPassword}>Back to sign in</button>
                </div>
              </form>
            ) : onCodeStep ? (
              <form onSubmit={step === "reset-code" ? handleResetCode : handleCode} noValidate className="lgn-form">
                <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-foreground">
                  Verification Code
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
                    placeholder="Enter 6-digit code"
                    className="pl-10 tracking-[0.4em] placeholder:tracking-normal"
                  />
                </div>

                {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}

                <Button type="submit" className="mt-8 w-full justify-center" disabled={busy || code.length < 6}>
                  {busy ? "Verifying…" : step === "reset-code" ? "Verify code" : "Verify and sign in"}
                </Button>

                <div className="lgn-tophelp lgn-help-below">
                  {cooldown > 0
                    ? `Didn't get it? You can resend in ${cooldown}s`
                    : <>Didn't get it? <button type="button" onClick={handleResend} disabled={busy}>Resend code</button></>}
                </div>
                <div className="lgn-tophelp lgn-help-alt">
                  <button type="button" onClick={backToPassword}>
                    {step === "reset-code" ? "Back to sign in" : "Use a different account"}
                  </button>
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
                    placeholder="Enter email address"
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
                  placeholder="Enter password"
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

              {hasSupabase && (
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={startReset}
                    disabled={busy}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}

              {/* Offline demo mode has no accounts, so state the passphrase
                  rather than leaving anyone guessing at a locked door. */}
              {!hasSupabase && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Offline demo mode - no database configured. Use any email and the passphrase{" "}
                  <span className="font-semibold text-foreground">ortex@admin</span>.
                </p>
              )}

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
