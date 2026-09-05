// HTML for the emails this app sends itself (as opposed to Supabase Auth's
// templates, which live in supabase/templates/ and are pushed with
// `npm run push:emails`).
//
// Same visual language as the sign-in code email: tables and inline styles,
// because Outlook and several webmail clients strip <style> blocks; a text
// wordmark rather than an image, because most clients block remote images until
// the reader clicks "show images" and this is the first mail a new colleague
// receives from us.

const BLUE = "#2F50E4"
const INK = "#010101"
const MUTED = "#5b5b66"
const FAINT = "#8a8a94"

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const shell = (inner: string) => `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
       style="background:#f4f4f5;margin:0;padding:40px 12px;
              font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="max-width:520px;background:#ffffff;border:1px solid #e8e8ea;border-radius:14px;overflow:hidden">
      <tr><td style="height:3px;background:${BLUE};font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:30px 36px 0 36px">
        <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
          <td style="width:34px;height:34px;background:${BLUE};border-radius:9px;text-align:center;
                     vertical-align:middle;font-size:19px;font-weight:700;color:#ffffff;line-height:34px">O</td>
          <td style="padding-left:11px;vertical-align:middle">
            <div style="font-size:17px;font-weight:700;color:${INK};letter-spacing:-0.3px;line-height:19px">Ortex</div>
            <div style="font-size:9.5px;font-weight:600;color:${FAINT};letter-spacing:2.4px;line-height:13px">INDUSTRIES</div>
          </td>
        </tr></table>
      </td></tr>
      ${inner}
      <tr><td style="padding:20px 36px 30px 36px">
        <p style="margin:0;font-size:11px;line-height:17px;color:#a8a8b2">
          Ortex Industries &nbsp;&middot;&nbsp; operations console
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`

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
  const greeting = opts.name?.trim() ? `Hi ${esc(opts.name.trim().split(/\s+/)[0])},` : "Hi,"
  const access = opts.modules.length
    ? opts.modules.map(esc).join(" &middot; ")
    : "Dashboard only for now — an admin can grant more."

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:9px 0;font-size:12px;color:${FAINT};width:150px;vertical-align:top">${label}</td>
      <td style="padding:9px 0;font-size:14px;color:${INK};font-weight:600;
                 font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,Courier,monospace;
                 word-break:break-all">${value}</td>
    </tr>`

  return shell(`
    <tr><td style="padding:28px 36px 0 36px">
      <h1 style="margin:0;font-size:21px;line-height:28px;font-weight:600;color:${INK};letter-spacing:-0.3px">
        You've been added to the Ortex console
      </h1>
      <p style="margin:9px 0 0 0;font-size:14px;line-height:22px;color:${MUTED}">
        ${greeting} an admin has created an account for you as
        <strong style="color:${INK}">${esc(opts.roleLabel)}</strong>. Here are your sign-in details.
      </p>
    </td></tr>

    <tr><td style="padding:22px 36px 0 36px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
             style="background:#f3f5ff;border:1px solid #d7ddfb;border-radius:12px">
        <tr><td style="padding:6px 20px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
            ${row("Console", `<a href="${esc(opts.url)}" style="color:${BLUE};text-decoration:none">${esc(opts.url)}</a>`)}
            ${row("Email", esc(opts.email))}
            ${row("Temporary password", esc(opts.password))}
          </table>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:20px 36px 0 36px">
      <p style="margin:0;font-size:14px;line-height:22px;color:${MUTED}">
        <strong style="color:${INK}">Change this password once you're in</strong> — Settings → Password.
        It was sent by email, so treat it as temporary and never reuse it anywhere else.
      </p>
      <p style="margin:12px 0 0 0;font-size:14px;line-height:22px;color:${MUTED}">
        You can also sign in without it: enter your email on the sign-in screen and we'll send
        you a 6-digit code.
      </p>
    </td></tr>

    <tr><td style="padding:22px 36px 0 36px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr><td style="border-top:1px solid #eeeeef;padding-top:18px">
          <div style="font-size:10.5px;font-weight:700;color:${BLUE};letter-spacing:1.6px;
                      text-transform:uppercase;margin-bottom:8px">Your access</div>
          <p style="margin:0;font-size:13px;line-height:21px;color:${MUTED}">${access}</p>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:18px 36px 0 36px">
      <p style="margin:0;font-size:12px;line-height:19px;color:${FAINT}">
        Not expecting this? Tell whoever runs your Ortex console — the account can be removed.
      </p>
    </td></tr>`)
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
  const greeting = opts.name?.trim() ? `Hi ${esc(opts.name.trim().split(/\s+/)[0])},` : "Hi,"

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:9px 0;font-size:12px;color:${FAINT};width:150px;vertical-align:top">${label}</td>
      <td style="padding:9px 0;font-size:14px;color:${INK};font-weight:600;
                 font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,Courier,monospace;
                 word-break:break-all">${value}</td>
    </tr>`

  return shell(`
    <tr><td style="padding:28px 36px 0 36px">
      <h1 style="margin:0;font-size:21px;line-height:28px;font-weight:600;color:${INK};letter-spacing:-0.3px">
        Your Ortex console password was reset
      </h1>
      <p style="margin:9px 0 0 0;font-size:14px;line-height:22px;color:${MUTED}">
        ${greeting} an admin has set a new temporary password on your account.
        Your old password no longer works.
      </p>
    </td></tr>

    <tr><td style="padding:22px 36px 0 36px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
             style="background:#f3f5ff;border:1px solid #d7ddfb;border-radius:12px">
        <tr><td style="padding:6px 20px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
            ${row("Console", `<a href="${esc(opts.url)}" style="color:${BLUE};text-decoration:none">${esc(opts.url)}</a>`)}
            ${row("Email", esc(opts.email))}
            ${row("New password", esc(opts.password))}
          </table>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:20px 36px 0 36px">
      <p style="margin:0;font-size:14px;line-height:22px;color:${MUTED}">
        <strong style="color:${INK}">Change it as soon as you sign in</strong> — Settings &rarr; Password.
        A password sent by email stays in that inbox for as long as the inbox does.
      </p>
    </td></tr>

    <tr><td style="padding:18px 36px 0 36px">
      <p style="margin:0;font-size:12px;line-height:19px;color:${FAINT}">
        Didn't ask for this? Tell whoever runs your Ortex console straight away.
      </p>
    </td></tr>`)
}
