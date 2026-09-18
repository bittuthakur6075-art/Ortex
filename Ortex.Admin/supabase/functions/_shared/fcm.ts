// Firebase Cloud Messaging (HTTP v1) from an Edge Function, with no SDK.
//
// Auth is a Google service account: the function signs a short JWT with the
// account's private key (RS256, WebCrypto), trades it for an OAuth access token,
// and caches that token for its lifetime (an hour) across warm invocations.
//
// Secret: FIREBASE_SERVICE_ACCOUNT, the whole service-account JSON downloaded
// from Firebase console > Project settings > Service accounts > Generate new
// private key. Its `project_id` names the project the messages are sent through.

type ServiceAccount = { project_id: string; client_email: string; private_key: string }

let cached: { token: string; expires: number } | null = null

export function serviceAccount(): ServiceAccount | null {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT")
  if (!raw) return null
  try {
    const sa = JSON.parse(raw) as ServiceAccount
    return sa.project_id && sa.client_email && sa.private_key ? sa : null
  } catch {
    return null
  }
}

const b64url = (bytes: Uint8Array | string) => {
  const s = typeof bytes === "string" ? bytes : String.fromCharCode(...bytes)
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
}

async function signJwt(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const input = `${header}.${claims}`
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input)))
  return `${input}.${b64url(sig)}`
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await signJwt(sa),
    }),
  })
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${await res.text()}`)
  const body = (await res.json()) as { access_token: string; expires_in: number }
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 }
  return cached.token
}

export type PushMessage = {
  title: string
  body: string
  /** String values only: FCM `data` is a flat string map. */
  data: Record<string, string>
  /** Android notification tag: a later message with the same tag replaces it. */
  tag: string
  channelId: string
}

export type SendResult = { token: string; ok: boolean; unregistered: boolean; error?: string }

/** Send one message to each token. Tokens FCM reports as gone are flagged for deletion. */
export async function sendToTokens(sa: ServiceAccount, tokens: string[], msg: PushMessage): Promise<SendResult[]> {
  if (!tokens.length) return []
  const bearer = await accessToken(sa)
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`
  return Promise.all(
    tokens.map(async (token): Promise<SendResult> => {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: msg.title, body: msg.body },
            data: msg.data,
            android: {
              // HIGH delivers through Doze straight away; a lead is time-critical.
              priority: "HIGH",
              notification: {
                channel_id: msg.channelId,
                tag: msg.tag,
                color: "#2F50E4",
                notification_priority: "PRIORITY_MAX",
                visibility: "PUBLIC",
              },
            },
          },
        }),
      })
      if (res.ok) return { token, ok: true, unregistered: false }
      const text = await res.text()
      // UNREGISTERED / NOT_FOUND: the app was uninstalled or the token rotated.
      const unregistered = res.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(text)
      return { token, ok: false, unregistered, error: `${res.status}: ${text.slice(0, 300)}` }
    }),
  )
}
