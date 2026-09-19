// The WhatsApp side: a LINKED DEVICE on an existing WhatsApp account, exactly
// like WhatsApp Web, through Baileys (an unofficial client of WhatsApp's own
// web protocol). No Business API, no new number: scan the QR once from
// WhatsApp > Settings > Linked devices on the phone whose account should post.
//
// The session lives in ./auth (gitignored). Delete that folder, or remove the
// device from the phone, to unlink.
//
// This is not an API WhatsApp offers for automation, and its terms do not allow
// it; an account that sends in bulk or to strangers can be banned. The bot is
// built to look like a person's own low-volume use: it only ever posts to ONE
// group the owner created, a few messages a day, never to customers.
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from "baileys"
import qrcode from "qrcode-terminal"
import QRCode from "qrcode"
import pino from "pino"
import path from "node:path"
import { rmSync, writeFileSync, existsSync } from "node:fs"
import { ROOT } from "./config.js"

const AUTH_DIR = path.join(ROOT, "auth")
const SENT_MEMORY = 500

// Every message the bot sends starts with one of these. The bot IS the linked
// account, so its own posts come back as incoming messages, sometimes before
// send() has even returned their id; the mark is what stops it answering itself.
export const BOT_MARK = /^(🤖|🔔|📞|🚨|🎉|💰|🌅|🔕)/u

// The QR as a page too (link-qr.html, gitignored), because a terminal QR is
// often too cramped to scan. WhatsApp replaces the code about every 20 s, so the
// page reloads itself every 3 s and always shows the current one.
export const QR_PAGE = path.join(ROOT, "link-qr.html")

async function writeQrPage(qr) {
  const img = await QRCode.toDataURL(qr, { width: 360, margin: 2 })
  writeFileSync(QR_PAGE, `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>Link Ortex Bot</title>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:40px;background:#fff;color:#111">
<h2>Link the Ortex WhatsApp bot</h2>
<p>On the phone: <b>WhatsApp &gt; Settings &gt; Linked devices &gt; Link a device</b>, then scan.</p>
<img src="${img}" width="360" height="360" alt="WhatsApp link QR code">
<p style="color:#666">The code refreshes on its own. Updated ${new Date().toLocaleTimeString("en-IN")}.</p></body>`)
}

function clearQrPage() {
  if (!existsSync(QR_PAGE)) return
  writeFileSync(QR_PAGE, `<!doctype html><meta charset="utf-8"><title>Linked</title>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:60px"><h2>✅ Linked</h2><p>The Ortex bot is connected. You can close this page.</p></body>`)
}

// Text of an incoming message, unwrapping disappearing / view-once envelopes.
export function textOf(m) {
  const msg = m?.message?.ephemeralMessage?.message || m?.message?.viewOnceMessage?.message || m?.message
  return (msg?.conversation || msg?.extendedTextMessage?.text || "").trim()
}

export class WhatsApp {
  constructor({ onMessage, log = console.log } = {}) {
    this.onMessage = onMessage
    this.log = log
    this.sock = null
    this.open = false
    this.waiters = []
    this.sentIds = [] // ids of messages the bot sent, so it never answers itself
    this.stopped = false
  }

  // Resolves once the connection is open (after a QR scan on first run).
  async start() {
    await this.connect()
    return this.ready()
  }

  ready() {
    if (this.open) return Promise.resolve()
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }))
    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      browser: Browsers.windows("Ortex Bot"),
      markOnlineOnConnect: false, // do not stop the phone from getting notifications
      syncFullHistory: false,
    })
    this.sock = sock
    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        this.log("\nScan this with WhatsApp on the phone: Settings > Linked devices > Link a device\n")
        qrcode.generate(qr, { small: true })
        writeQrPage(qr).catch((err) => this.log("Could not write the QR page:", err.message))
      }
      if (connection === "open") {
        clearQrPage()
        this.open = true
        this.log(`WhatsApp connected as ${sock.user?.name || sock.user?.id || "linked device"}`)
        this.waiters.splice(0).forEach((resolve) => resolve())
      }
      if (connection === "close") {
        this.open = false
        const code = lastDisconnect?.error?.output?.statusCode
        if (code === DisconnectReason.loggedOut) {
          this.log("WhatsApp logged this device out (removed from Linked devices). Clearing the session; restart to link again.")
          rmSync(AUTH_DIR, { recursive: true, force: true })
          process.exit(1)
        }
        if (this.stopped) return
        // restartRequired (just after pairing), a dropped connection, a phone
        // that was offline: all are fixed by reconnecting.
        const wait = code === DisconnectReason.restartRequired ? 0 : 5000
        this.log(`WhatsApp connection closed (${code || "network"}), reconnecting${wait ? " in 5s" : ""}…`)
        setTimeout(() => this.connect().catch((err) => this.log("Reconnect failed:", err.message)), wait)
      }
    })

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return
      for (const m of messages) {
        if (!m.message || this.sentIds.includes(m.key.id)) continue
        const text = textOf(m)
        if (!text || BOT_MARK.test(text)) continue
        Promise.resolve(this.onMessage?.({ jid: m.key.remoteJid, text, message: m })).catch((err) =>
          this.log("Message handler failed:", err.message),
        )
      }
    })
  }

  async send(jid, text) {
    await this.ready()
    const sent = await this.sock.sendMessage(jid, { text })
    if (sent?.key?.id) {
      this.sentIds.push(sent.key.id)
      if (this.sentIds.length > SENT_MEMORY) this.sentIds.splice(0, this.sentIds.length - SENT_MEMORY)
    }
    return sent
  }

  async typing(jid) {
    try {
      await this.sock?.sendPresenceUpdate("composing", jid)
    } catch {
      /* cosmetic */
    }
  }

  async groups() {
    await this.ready()
    const all = await this.sock.groupFetchAllParticipating()
    return Object.values(all).map((g) => ({ id: g.id, name: g.subject, members: g.participants?.length || 0 }))
  }

  // A configured group, by its id (…@g.us) or its exact name.
  async findGroup(nameOrId) {
    const groups = await this.groups()
    const want = String(nameOrId || "").trim().toLowerCase()
    return groups.find((g) => g.id === nameOrId) || groups.find((g) => g.name.trim().toLowerCase() === want) || null
  }

  async stop() {
    this.stopped = true
    try {
      this.sock?.end(undefined)
    } catch {
      /* already closed */
    }
  }
}
