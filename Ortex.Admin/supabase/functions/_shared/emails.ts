// HTML for the emails this app sends itself (as opposed to Supabase Auth's
// templates, which live in supabase/templates/ and are pushed with
// `npm run push:emails`). supabase/templates/magic-link.html uses the same
// design by hand: change one, change the other.
//
// Tables and inline styles, because Outlook and several webmail clients strip
// <style> blocks. Inter loads where the client allows web fonts (Apple Mail,
// iOS, Outlook for Mac); Gmail and Outlook for Windows fall back down the stack.
// The logo is a PNG on the console's own deployment (Gmail will not render
// SVG); its alt text is styled because most clients block remote images on a
// first open, so the alt is what many people see.

const BLUE = "#2F50E4"
const INK = "#071437"
const TEXT2 = "#252F4A"
const MUTED = "#4B5675"
const FAINT = "#78829D"
const LINE = "#E6E9F0"
const TINT = "#F3F5FF"
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,Courier,monospace"
export const LOGO_URL = "https://ortex-admin.vercel.app/img/logo-email.png"

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const firstName = (name?: string) => (name?.trim() ? esc(name.trim().split(/\s+/)[0]) : "")

const shell = (preheader: string, inner: string) => `
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
       style="background:#F4F6FA;margin:0;padding:40px 12px;font-family:${FONT}">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:520px">
      <tr><td align="center" style="padding:0 0 24px 0">
        <img src="${LOGO_URL}" alt="Ortex Industries" width="150" height="44"
             style="display:block;width:150px;height:44px;border:0;outline:none;text-decoration:none;
                    font-family:${FONT};font-size:18px;font-weight:700;color:${BLUE}">
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="max-width:520px;background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden">
      ${inner}
      <tr><td style="height:36px;font-size:0;line-height:0">&nbsp;</td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:520px">
      <tr><td align="center" style="padding:22px 24px 0 24px;font-family:${FONT};font-size:12px;line-height:19px;color:${FAINT}">
        Ortex Industries &middot; Operations Console<br>
        Custom MDF and acrylic manufacturing, lanyards and corporate gifting.
      </td></tr>
    </table>
  </td></tr>
</table>`

const heading = (title: string, sub: string) => `
  <tr><td style="padding:36px 40px 0 40px;font-family:${FONT}">
    <h1 style="margin:0;font-size:24px;line-height:32px;font-weight:600;color:${INK};letter-spacing:-0.4px">${title}</h1>
    <p style="margin:10px 0 0 0;font-size:15px;line-height:24px;color:${TEXT2}">${sub}</p>
  </td></tr>`

// Label / value rows inside the tinted credentials card.
const details = (rows: [string, string][]) => `
  <tr><td style="padding:24px 40px 0 40px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="background:${TINT};border:1px solid #D7DDFB;border-radius:12px">
      <tr><td style="padding:8px 20px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
          ${rows.map(([label, value], i) => `
          <tr>
            <td style="padding:12px 0;${i ? "border-top:1px solid #E3E7FB;" : ""}font-family:${FONT};font-size:12px;
                       font-weight:500;color:${FAINT};width:140px;vertical-align:top;line-height:20px">${label}</td>
            <td style="padding:12px 0;${i ? "border-top:1px solid #E3E7FB;" : ""}font-family:${MONO};font-size:14px;
                       font-weight:600;color:${INK};word-break:break-all;line-height:20px">${value}</td>
          </tr>`).join("")}
        </table>
      </td></tr>
    </table>
  </td></tr>`

// Bulletproof button: a table cell carries the colour, so it survives Outlook.
const button = (label: string, url: string) => `
  <tr><td style="padding:24px 40px 0 40px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
      <tr><td align="center" bgcolor="${BLUE}" style="border-radius:12px;background:${BLUE}">
        <a href="${esc(url)}" target="_blank"
           style="display:block;padding:15px 24px;font-family:${FONT};font-size:15px;font-weight:600;
                  line-height:20px;color:#ffffff;text-decoration:none;border-radius:12px">${label}</a>
      </td></tr>
    </table>
  </td></tr>`

const steps = (title: string, items: string[]) => `
  <tr><td style="padding:28px 40px 0 40px;font-family:${FONT}">
    <div style="font-size:11px;font-weight:600;color:${BLUE};letter-spacing:1.4px;text-transform:uppercase;
                margin:0 0 12px 0">${title}</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
      ${items.map((text, i) => `
      <tr>
        <td width="34" style="padding:0 0 12px 0;vertical-align:top">
          <div style="width:24px;height:24px;border-radius:12px;background:${TINT};color:${BLUE};font-family:${FONT};
                      font-size:12px;font-weight:600;line-height:24px;text-align:center">${i + 1}</div>
        </td>
        <td style="padding:2px 0 12px 0;font-family:${FONT};font-size:14px;line-height:21px;color:${TEXT2};
                   vertical-align:top">${text}</td>
      </tr>`).join("")}
    </table>
  </td></tr>`

const note = (html: string) => `
  <tr><td style="padding:12px 40px 0 40px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
      <tr><td style="border-top:1px solid ${LINE};padding-top:18px;font-family:${FONT};font-size:13px;
                     line-height:20px;color:${MUTED}">${html}</td></tr>
    </table>
  </td></tr>`

/**
 * The email a new colleague receives when an admin creates their login.
 *
 * Carries the temporary password because that is what was asked for, and pushes
 * hard on changing it: a password sitting in an inbox outlives the person's job,
 * and inboxes are the most commonly breached thing anyone owns.
 */
export function inviteEmail(opts: {
  email: string
  password: string
  name?: string
  roleLabel: string
  modules: string[]
  url: string
}) {
  const name = firstName(opts.name)
  const role = esc(opts.roleLabel)
  const chips = opts.modules.length
    ? opts.modules.map((m) => `<span style="display:inline-block;margin:0 6px 8px 0;padding:5px 11px;border-radius:999px;
        background:#F4F6FA;border:1px solid ${LINE};font-family:${FONT};font-size:12px;font-weight:500;
        line-height:16px;color:${TEXT2}">${esc(m)}</span>`).join("")
    : `<span style="font-size:13px;color:${MUTED}">Dashboard only for now. An admin can give you more pages.</span>`

  return shell(
    `${name ? `${name}, your` : "Your"} Ortex console account is ready. Sign in details inside.`,
    `
    ${heading(
      `Welcome to Ortex${name ? `, ${name}` : ""}`,
      `An admin has created your Operations Console account as
       <strong style="color:${INK};font-weight:600">${role}</strong>. Your sign-in details are below.`,
    )}
    ${details([
      ["Email", esc(opts.email)],
      ["Temporary password", esc(opts.password)],
    ])}
    ${button("Sign in to the console", opts.url)}
    <tr><td align="center" style="padding:10px 40px 0 40px;font-family:${FONT};font-size:12px;line-height:18px;color:${FAINT}">
      Or open <a href="${esc(opts.url)}" style="color:${BLUE};text-decoration:none">${esc(opts.url.replace(/^https?:\/\//, ""))}</a>
    </td></tr>
    ${steps("Getting started", [
      "Sign in with your email and the temporary password above.",
      "Enter the 6-digit code we email you to finish signing in.",
      `<strong style="color:${INK};font-weight:600">Change your password</strong> in Settings, then Password. Never reuse it anywhere else.`,
    ])}
    <tr><td style="padding:8px 40px 0 40px;font-family:${FONT}">
      <div style="font-size:11px;font-weight:600;color:${BLUE};letter-spacing:1.4px;text-transform:uppercase;
                  margin:0 0 12px 0">Your access</div>
      <div style="line-height:0">${chips}</div>
    </td></tr>
    ${note("Not expecting this email? Tell whoever runs your Ortex console and the account can be removed.")}`,
  )
}

/**
 * Sent when an admin resets someone's password from the Users page.
 *
 * Same shape as the invite: the new temporary password in the body, and the
 * same insistence on replacing it. Deliberately says who is affected and what
 * to do if it was not expected, because an unrequested password reset is the
 * one email that should make a person suspicious.
 */
export function passwordResetEmail(opts: {
  email: string
  password: string
  name?: string
  url: string
}) {
  const name = firstName(opts.name)

  return shell(
    "An admin set a new temporary password on your Ortex console account.",
    `
    ${heading(
      "Your password was reset",
      `${name ? `Hi ${name}, an` : "An"} admin has set a new temporary password on your Operations Console
       account. Your old password no longer works.`,
    )}
    ${details([
      ["Email", esc(opts.email)],
      ["New password", esc(opts.password)],
    ])}
    ${button("Sign in to the console", opts.url)}
    ${steps("Next", [
      `<strong style="color:${INK};font-weight:600">Change it as soon as you sign in</strong>: Settings, then Password.
       A password sent by email stays in that inbox for as long as the inbox does.`,
    ])}
    ${note(`<strong style="color:${INK};font-weight:600">Didn't ask for this?</strong> Tell whoever runs your Ortex console straight away.`)}`,
  )
}
