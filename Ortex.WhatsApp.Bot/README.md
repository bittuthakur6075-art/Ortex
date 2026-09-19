# Ortex WhatsApp bot

Posts the Admin console's insights to a WhatsApp group of the owners, and answers
questions asked there.

- **Every morning** (09:00 by default): the last 24 hours (leads, quotations made and won,
  invoices, payments, website visitors), the Dashboard's *Needs you today* list, and money
  to collect.
- **Every week** (Monday 09:00 by default): the 7-day report with changes against the week
  before, the pipeline, receivables by age, and the website.
- **Instantly**: a new website enquiry or quote request, a call Anu took (a complaint is
  flagged 🚨), a quotation marked won, a payment received. Anything that happens during
  quiet hours (21:00 to 08:00) or while muted arrives as one message afterwards.
- **Answers**: `today`, `week`, `month`, `quarter`, `due`, `leads`, `quotes`, `website`,
  `needs`, `mute`, `unmute`, `help` are answered instantly. Any other question ("Did Sharma
  Traders pay?", "How many leads came from Anu this month?") goes to Gemini, which can only
  answer by looking things up through read-only tools. It is told never to state a figure a
  lookup did not return.

**No WhatsApp Business API and no new number.** The bot is a *linked device* on an
existing WhatsApp account, the same mechanism as WhatsApp Web. It posts **as that
account**, so every bot message starts with 🤖 (or 🔔 📞 🚨 🎉 💰 🌅 🔕) to tell it apart
from the person.

Every figure comes from the console's own code: the bot imports
`Ortex.Admin/src/lib/analytics/today.js` (the Dashboard), `data/domain/domain.js`
(invoice balances) and `pages/automation/visitors.js` (Web events → Visitors). "Leads",
"won", "overdue" and "outstanding" therefore mean exactly what they mean in the console,
and a change there changes the bot too.

## Read this first

- **This is unofficial.** Automating a personal WhatsApp account is against WhatsApp's
  terms, and WhatsApp can ban an account it thinks is a bot. The risk comes from bulk
  messages and messages to strangers. This bot does neither: it posts to **one private
  group** of the owners, a handful of times a day, and never messages a customer. Keep it
  that way. To be safe, link a **spare** WhatsApp account (an old SIM on WhatsApp is
  enough) and add it to the group, rather than the owner's main number.
- **`auth/` is a logged-in WhatsApp session.** Anyone with that folder can read and send
  as the account. It is gitignored; never copy it off the PC. To unlink, remove "Ortex
  Bot" under *WhatsApp > Settings > Linked devices*, or delete `auth/`.
- **Customer data goes to Google** when a question goes to Gemini: the lookup results
  (names, phone numbers, amounts). On Gemini's free tier Google may use prompts to improve
  its models. Use a paid-tier key, or leave `gemini.apiKey` empty, in which case only the
  set questions work.
- **The PC must stay on**, like the Tally connector's. When it is off, nothing is sent. On
  restart the bot sends a digest it missed that day and alerts from the last two days that
  it has not sent yet.

## Setup (Windows, once)

1. **Make the group.** On the phone whose WhatsApp will post, create a group, for example
   **Ortex Bot**, and add the other admins. Only this group is ever read or posted to, so
   **everyone in it can see the business figures**. Add admins only.
2. **Configure.**
   ```bash
   cd Ortex.WhatsApp.Bot
   npm install
   copy config.example.json config.json
   ```
   Fill in `config.json`:
   - `supabase.serviceKey`: the **service_role** key (Supabase dashboard → Project Settings →
     API). It reads every table and bypasses RLS, which is why the file is gitignored and
     stays on this PC. It is the same key the Tally connector uses. The bot never writes.
   - `gemini.apiKey`: optional, see above. `gemini.model` defaults to the model the site's
     chat uses.
   - `whatsapp.group`: the group's exact name, or its id from `npm run groups`.
3. **Check the messages before linking anything:**
   ```bash
   npm run preview -- --sample   # built-in sample data, no config needed
   npm run preview               # your live data, printed here, nothing sent
   ```
4. **Link WhatsApp.** Run `npm start`. A QR code appears; on the phone open *WhatsApp >
   Settings > Linked devices > Link a device* and scan it. The bot posts a hello message
   in the group, then runs. The session is saved in `auth/`, so later starts need no scan.
5. **Keep it running.** Leave the window open, or start it with Windows (Task Scheduler →
   *At log on* → `npm start` in this folder, or `pm2`).

## Commands

```bash
npm start                    # run: digests, alerts, answers
npm run groups               # list the account's groups and their ids
npm run digest               # send today's digest to the group now, then exit
npm run preview              # print the messages from live data (nothing sent)
npm run preview -- --sample  # print them from sample data
npm test                     # reports, alerts, schedule, commands, the AI tool loop
```

## Configuration

| Key | Default | |
|---|---|---|
| `whatsapp.group` | `Ortex Bot` | Group name or id. The bot ignores every other chat. |
| `whatsapp.answerEverything` | `true` | `false` = answer only messages starting with a `prefixes` entry (`/`, `bot`, `?`), for a group where people also talk to each other. "ok", "thanks" and 👍 are always ignored. |
| `timezone` | `Asia/Kolkata` | Clock for the digest times and quiet hours, whatever the PC is set to. |
| `digest.daily` | `09:00` | `""` turns the daily digest off. |
| `digest.weekly` | Monday `09:00` | `{ "day": "", "time": "" }` turns it off. |
| `alerts.enabled` | `true` | Plus `newEnquiry`, `voiceCall`, `quoteWon`, `paymentReceived` one by one. |
| `alerts.checkEverySeconds` | `60` | How often to look for new records (20 minimum). |
| `alerts.quietHours` | 21:00 to 08:00 | Alerts are held, then delivered together. Digests are not sent in quiet hours either. |

## How it works

- `src/index.js`: runs everything. It checks the digest schedule every 30 s and polls for
  alerts every `checkEverySeconds`, and answers one message at a time, in order.
- `src/reports.js`: the wording of every report (pure, tested).
- `src/alerts.js`: what counts as new (pure, tested). It polls the last two days rather
  than listening over realtime, so it does not depend on Supabase's realtime publication
  and catches up after a restart. `state.json` holds when alerts started and every alert
  already sent, so nothing is announced twice and nothing from before the first start is
  announced at all. Anu saves a call several times as it goes, so a call is announced once
  it has been quiet for 3 minutes, as one message.
- `src/ask.js`: commands, and the Gemini tool loop (at most 5 lookups a question). The
  last 6 exchanges are remembered, so "and last month?" works.
- `src/whatsapp.js`: the linked device ([Baileys](https://github.com/WhiskeySockets/Baileys)).
  It reconnects on its own and ignores its own messages by the 🤖-style marks.
- `src/register.js` + `src/loader.js`: let plain Node import the console's source. They
  add the `.js` that Vite normally supplies, and stub the console's browser-only data
  store and email notifier, which today.js reaches through `domain.js` but never calls
  here. **If a console analytics file gains a browser-only import, `npm test` fails** (CI
  runs it).
