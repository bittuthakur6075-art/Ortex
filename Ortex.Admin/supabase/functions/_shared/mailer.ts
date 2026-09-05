// Outbound email for Edge Functions, over the same Hostinger mailbox that
// Supabase Auth uses for sign-in codes.
//
// WHY A MAILER OF OUR OWN
// Supabase's built-in templates only render what GoTrue gives them, and the one
// place a password could be smuggled through is user_metadata -- which would
// persist the plaintext on the auth user indefinitely. Sending the message
// ourselves keeps the temporary password in exactly one place: the email.
//
// SECRETS (set once per project; they are NOT the Supabase SMTP settings, which
// live in the dashboard and are not readable by functions):
//   supabase secrets set SMTP_HOST=smtp.hostinger.com --project-ref <ref>
//   supabase secrets set SMTP_PORT=465                --project-ref <ref>
//   supabase secrets set SMTP_USER=noreply@ortexindustries.in --project-ref <ref>
//   supabase secrets set SMTP_PASS=...                --project-ref <ref>
//   supabase secrets set CONSOLE_URL=https://admin.ortexindustries.in --project-ref <ref>
//
// If they are absent, isMailerConfigured() is false and callers should carry on
// without mail rather than failing the operation they were actually asked to do.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

export const isMailerConfigured = () =>
  Boolean(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USER") && Deno.env.get("SMTP_PASS"))

export const consoleUrl = () => Deno.env.get("CONSOLE_URL") || "https://admin.ortexindustries.in"

export async function sendMail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const hostname = Deno.env.get("SMTP_HOST")!
  const port = Number(Deno.env.get("SMTP_PORT") || 465)
  const username = Deno.env.get("SMTP_USER")!
  const password = Deno.env.get("SMTP_PASS")!

  const client = new SMTPClient({
    connection: {
      hostname,
      port,
      // Port 465 is implicit TLS; 587 upgrades with STARTTLS after connecting.
      tls: port === 465,
      auth: { username, password },
    },
  })

  try {
    await client.send({
      from: `Ortex Industries <${username}>`,
      to,
      subject,
      html,
      // A text/plain alternative is not optional in practice: some corporate
      // filters score HTML-only mail as spam, and this message must arrive.
      content: htmlToText(html),
    })
  } finally {
    // Always close, or the isolate holds the socket open until it is recycled.
    await client.close()
  }
}

// Crude but sufficient: the templates here are ours and structurally simple.
function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h1|h2|h3)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
}
