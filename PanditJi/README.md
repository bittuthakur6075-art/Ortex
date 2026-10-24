# Pandit Ji

An AI purohit for doing pooja properly at home, in the **Maithil Brahmin (Mithila) paddhati**.
**Independent of Ortex**: it lives in this repo but shares no code, database, keys or deployment with the Ortex apps.

* **Live pooja** (`#/pooja/<id>/live`): voice + laptop camera. Pandit Ji (Gemini Live) sees the altar about once a second,
  conducts the pooja step by step, recites each mantra phrase by phrase for the devotee to repeat, and narrates the katha.
  He moves the on-screen step card with the `show_step` tool.
* **Pooja page** (`#/pooja/<id>`): vidhi with mantras (Devanagari, transliteration, meaning), a samagri checklist, the katha,
  and a text chat with Pandit Ji (Gemini text model).
* Maithili, Hindi or English. Polite and warm ("aap" / "ahaan", encouragement, blessings), and he stops to answer any question at any time, then carries on.
* **Design**: the Ortex design language (Manrope + Instrument Serif italic, hairline borders, no shadows, 12px buttons, `lp-wrap` / `section-y` spacing) with a saffron primary instead of Ortex blue: one token, `--primary` in `src/index.css`. Component classes sit in `@layer components` so Tailwind utilities still override them.
* **Pandit Ji's face**: a living particle portrait in the style of the Epiminds hero avatar (`ParticlePandit.jsx`). The lit SVG portrait in `panditFace.js` is rasterised and sampled into ~9,000 points whose density follows its light; the jaw moves with his real voice, the eyes blink, the head sways, dots part around the pointer, and ॐ / श्री / a diya / a kalash float around him. Canvas 2D, drawn in colour buckets with additive blending.

## Run

```bash
cp .env.example .env     # put GEMINI_API_KEY in it
npm install
npm run dev              # http://localhost:5173, /api/* served by the same handlers as production
```

Camera and mic need `localhost` or HTTPS. In dev, `.env` is re-read on every API call, so a key saved while the server runs works straight away.

## How it fits together

| Path | What |
|---|---|
| `src/data/` | Curated pooja content. **Mantras live here and only here**: the model is told to recite these, never its own. One file per pooja; set `available: true` in `poojas.js` when it is complete and verified. |
| `src/lib/prompt.js` | Pandit Ji's rules (warm speaking style, Maithil tradition, accuracy, answering every question, camera use), shared by chat and live. |
| `src/components/ParticlePandit.jsx`, `panditFace.js` | The particle face (see above). Change the portrait in `panditFace.js`; brightness there is density on screen. |
| `src/live/PanditCall.js` | The live session: ephemeral token, mic worklet (16 kHz PCM), camera frames (JPEG, 1 fps), 24 kHz playback, session-resumption reconnects for a pooja that outlasts one connection. |
| `api/live-token.js` | Mints a single-use Gemini Live token locked to `GEMINI_LIVE_MODEL`. The real key never reaches the browser. |
| `api/ask.js` | Streams text chat answers from `GEMINI_TEXT_MODEL`. |
| `server/limit.js` | Best-effort per-IP and daily rate limits, and a same-origin check so other websites cannot spend the quota. |
| `vercel.json` | CSP (only Gemini may be reached), camera/mic limited to this site. |

`api/*.js` are Web-standard handlers (`export function POST(request)`), so they deploy as Vercel functions as they are;
`vite.config.js` serves the same files in dev.

## Before launch

* Have a learned Maithil Acharya check every mantra, step and katha chapter in `src/data/satyanarayan.js`.
* The Gemini key is on the free tier: image models have no quota there, and the Live and text quotas are small. Move it to a paid plan before real traffic.
* Deploy on its own Vercel project with `GEMINI_API_KEY` set as an environment variable.
* Swap the in-memory rate limit for a shared store (Upstash, Vercel KV) once traffic grows.
* Privacy page: camera and voice go to Google Gemini during a call; the site stores nothing.
