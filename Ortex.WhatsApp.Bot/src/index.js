#!/usr/bin/env node
// Ortex WhatsApp bot. See README.md.
//
//   npm start                       run: digests, alerts, answers (links by QR on first run)
//   npm run groups                  list the account's groups and their ids
//   npm run digest                  send today's digest to the group now, then exit
//   npm run preview                 print the messages from live data, WhatsApp not needed
//   npm run preview -- --sample     print them from built-in sample data, no config needed
import { loadConfig } from "./config.js"
import { connect, list, snapshot, cachedSnapshot } from "./data.js"
import { WhatsApp } from "./whatsapp.js"
import { loadState, saveState } from "./state.js"
import { dailyDigest, periodReport, leadsReport, dueReport } from "./reports.js"
import { detectAlerts, bundle, remember } from "./alerts.js"
import { parseCommand, runCommand, askModel, HELP } from "./ask.js"
import { dueDigests, alertsHeld } from "./schedule.js"
import { zoned } from "./time.js"

const args = new Set(process.argv.slice(2))
const log = (...a) => console.log(new Date().toLocaleString("en-IN", { hour12: false }), "·", ...a)
const MUTE_MS = 2 * 3600000
const HISTORY_TURNS = 6
// Chatter between admins in the group, not a question for the bot.
const CHATTER = /^(ok|okay|k|kk|thanks|thank you|thx|ty|done|noted|yes|no|hmm+|great|nice|cool|sure|👍|🙏|👌|✅)[\s.!]*$/iu

async function preview() {
  const tz = "Asia/Kolkata"
  const now = Date.now()
  let data
  if (args.has("--sample")) {
    const { sampleData } = await import("../test/fixture.js")
    data = sampleData(now)
  } else {
    const cfg = loadConfig()
    data = await snapshot(connect(cfg), now)
  }
  const line = "\n" + "-".repeat(60) + "\n"
  console.log([dailyDigest(data, now, tz), periodReport(data, now, tz, "7d"), leadsReport(data, now), dueReport(data, now)].join(line))
}

// Alerts need only recent rows, so the poll stays cheap however long the bot
// has run: the last two days (enough to fold a voice call from its captures,
// and to catch up after a restart). Older news belongs to the digest.
async function alertData(db) {
  const from = new Date(Date.now() - 2 * 86400000).toISOString()
  const [enquiries, quotations, payments] = await Promise.all([
    list(db, "enquiries", { since: from, max: 3000 }),
    list(db, "quotations", { updatedSince: from, max: 1000 }),
    list(db, "payments", { since: from, max: 1000 }),
  ])
  return { enquiries, quotations, payments }
}

// Link WhatsApp (QR) and list the account's groups. Needs no config.json, so
// the phone can be linked before the Supabase key is in place.
async function link() {
  const wa = new WhatsApp({ log })
  log("Connecting to WhatsApp… a QR appears here and opens as link-qr.html")
  await wa.start()
  const groups = await wa.groups()
  log(groups.length ? "Linked. This account's groups:" : "Linked. This account is in no groups yet.")
  for (const g of groups) console.log(`  ${g.name}  ·  ${g.members} members  ·  ${g.id}`)
  // Give WhatsApp a moment to finish saving the session before closing.
  await new Promise((resolve) => setTimeout(resolve, 3000))
  await wa.stop()
  process.exit(0)
}

async function main() {
  if (args.has("--preview")) return preview()
  if (args.has("--link") || args.has("--groups")) return link()

  const cfg = loadConfig()
  const tz = cfg.timezone
  const db = connect(cfg)
  const getData = cachedSnapshot(db)
  let state = loadState()
  const save = (patch) => {
    state = { ...state, ...patch }
    saveState(state)
  }

  let group = null
  const histories = new Map() // chat -> recent Gemini turns
  let chain = Promise.resolve() // answer one message at a time, in order

  const wa = new WhatsApp({
    log,
    onMessage: ({ jid, text }) => {
      if (!group || jid !== group.id) return // only ever the configured group
      chain = chain.then(() => handle(text)).catch((err) => log("Answer failed:", err.message))
    },
  })

  async function handle(raw) {
    let text = raw
    if (!cfg.whatsapp.answerEverything) {
      const prefix = cfg.whatsapp.prefixes.find((p) => text.toLowerCase().startsWith(p.toLowerCase()))
      if (!prefix) return
      text = text.slice(prefix.length).trim()
    }
    if (!text) return
    const cmd = parseCommand(text)
    if (!cmd && CHATTER.test(text)) return
    log(`Asked: ${text.slice(0, 80)}${cmd ? ` [${cmd}]` : ""}`)

    if (cmd === "mute") {
      save({ mutedUntil: new Date(Date.now() + MUTE_MS).toISOString() })
      return wa.send(group.id, "🔕 Alerts paused for 2 hours. Anything that happens meanwhile comes as one message after. Send *unmute* to resume now.")
    }
    if (cmd === "unmute") {
      save({ mutedUntil: null })
      return wa.send(group.id, "🔔 Alerts are back on.")
    }
    if (cmd === "help") return wa.send(group.id, HELP)

    await wa.typing(group.id)
    let data
    try {
      data = await getData()
    } catch (err) {
      log("Data read failed:", err.message)
      return wa.send(group.id, "🤖 Sorry, I could not read the console's data just now. Please try again in a minute.")
    }
    if (cmd) return wa.send(group.id, runCommand(cmd, data, Date.now(), tz))

    if (!cfg.gemini.apiKey) {
      return wa.send(group.id, "🤖 I can only answer the set questions until a Gemini key is added to my config. Type *help* to see them.")
    }
    const history = histories.get(group.id) || []
    let answer
    try {
      answer = await askModel({ question: text, history, data, now: Date.now(), tz, apiKey: cfg.gemini.apiKey, model: cfg.gemini.model })
    } catch (err) {
      log("Gemini failed:", err.message)
      return wa.send(group.id, "🤖 Sorry, I could not work that out just now. The set questions still work: type *help*.")
    }
    const turns = [...history, { role: "user", parts: [{ text }] }, { role: "model", parts: [{ text: answer }] }]
    histories.set(group.id, turns.slice(-HISTORY_TURNS * 2))
    return wa.send(group.id, `🤖 ${answer}`)
  }

  log("Connecting to WhatsApp…")
  await wa.start()

  if (args.has("--groups")) {
    const groups = await wa.groups()
    if (!groups.length) console.log("This account is in no groups yet.")
    for (const g of groups) console.log(`${g.name}  ·  ${g.members} members  ·  ${g.id}`)
    await wa.stop()
    process.exit(0)
  }

  group = await wa.findGroup(cfg.whatsapp.group)
  if (!group) {
    log(`No group called "${cfg.whatsapp.group}". Create it on the phone (add the other admins), or put its id in config.json whatsapp.group. Run "npm run groups" to list them.`)
    await wa.stop()
    process.exit(1)
  }
  log(`Posting to "${group.name}" (${group.members} members)`)

  if (args.has("--digest-now")) {
    await wa.send(group.id, dailyDigest(await snapshot(db), Date.now(), tz))
    log("Digest sent.")
    await wa.stop()
    process.exit(0)
  }

  if (!state.since) save({ since: new Date().toISOString() })
  if (!state.greeted) {
    await wa.send(group.id, `🤖 *Ortex bot is on.*\nI'll post a summary every morning at ${cfg.digest.daily || "(off)"}, a weekly report on ${cfg.digest.weekly?.day || "(off)"}, and an alert when a lead, call, win or payment comes in.\n\nType *help* to see what you can ask.`)
    save({ greeted: true })
  }

  // ---- scheduled digests ----
  let digesting = false
  async function digestTick() {
    if (digesting) return
    const due = dueDigests(Date.now(), cfg, state)
    if (!due.length) return
    digesting = true
    try {
      const now = Date.now()
      const data = await snapshot(db, now)
      const today = zoned(now, tz).date
      if (due.includes("daily")) {
        await wa.send(group.id, dailyDigest(data, now, tz))
        save({ lastDaily: today })
        log("Daily digest sent")
      }
      if (due.includes("weekly")) {
        await wa.send(group.id, periodReport(data, now, tz, "7d"))
        save({ lastWeekly: today })
        log("Weekly report sent")
      }
    } catch (err) {
      log("Digest failed, will retry:", err.message)
    } finally {
      digesting = false
    }
  }

  // ---- instant alerts ----
  let alerting = false
  async function alertTick() {
    if (alerting || cfg.alerts.enabled === false) return
    alerting = true
    try {
      const now = Date.now()
      const { alerts, keys } = detectAlerts(await alertData(db), state, now, cfg.alerts)
      if (alerts.length) {
        // Recorded first, so a crash after sending can never repeat an alert.
        state = remember(state, keys)
        saveState(state)
        if (alertsHeld(now, cfg, state)) {
          save({ pending: [...(state.pending || []), ...alerts] })
          log(`${alerts.length} alert(s) held (${alertsHeld(now, cfg, state)})`)
        } else {
          for (const text of alerts) await wa.send(group.id, text)
          log(`${alerts.length} alert(s) sent`)
        }
      }
      if (state.pending?.length && !alertsHeld(now, cfg, state)) {
        const held = state.pending
        save({ pending: [] })
        await wa.send(group.id, bundle(held))
        log(`${held.length} held alert(s) delivered`)
      }
    } catch (err) {
      log("Alert check failed, will retry:", err.message)
    } finally {
      alerting = false
    }
  }

  setInterval(digestTick, 30000)
  setInterval(alertTick, Math.max(20, Number(cfg.alerts.checkEverySeconds) || 60) * 1000)
  digestTick()
  alertTick()
  log("Running. Press Ctrl+C to stop.")

  const shutdown = async () => {
    log("Stopping…")
    await wa.stop()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
