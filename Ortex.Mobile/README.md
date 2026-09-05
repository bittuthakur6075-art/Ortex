# Ortex.Mobile — field-sales companion

A React Native app for the Ortex sales team. It carries the four things that
matter away from a desk: **quotations**, **enquiries and voice leads**,
**products**, and a **contact directory whose primary action is Call / WhatsApp**.

It is another client of the **same Supabase project** as `Ortex.Admin` — same
anon key, same session, same `profiles` roles and per-user module permissions,
same RLS. It needs no migration, no edge function and no schema change of its
own. Everything it cannot do (invoices, payments, catalogue editing, settings,
users) stays in the console.

| | |
|---|---|
| Stack | React Native 0.85 (bare) · Expo SDK 56 modules · TypeScript · React Navigation 7 |
| Design | Samsung One UI, ported from `C:\Dev\Mobile App` |
| Type | Zalando Sans (`@expo-google-fonts/zalando-sans`) |
| Auth | Supabase password → emailed OTP, plus an optional biometric app-lock |

## Quick start

```bash
cd Ortex.Mobile
npm install
cp .env.example .env          # fill from the same Supabase project Ortex.Admin uses
npm start                     # Metro
npm run android               # build and install on a connected device/emulator
```

Other scripts: `npm run lint` (oxlint), `npm run typecheck` (tsc), `npm test`
(node --test), `npm run format` (prettier).

> **iOS is scaffolded but unbuilt.** `ios/` is generated and wired (Info.plist
> carries the Face ID and `LSApplicationQueriesSchemes` entries), but it has
> never been compiled — the project is developed on Windows. `npm run ios`
> needs a Mac and a `pod install` first.

## Layout

```text
src/
├── theme/        theme.ts (palette + light/dark) · typography.ts (Zalando Sans)
├── ui/           the ported One UI kit — Button, Card, Sheet, TextField, …
├── navigation/   RootNavigator · Tabs · OneUiTabBar · types
├── store/        ThemeContext (theme only) · AuthContext (session + profile)
├── data/         supabase.ts (client) · repo.ts (collections) · cache.ts
├── domain/       PURE LOGIC PORTED FROM Ortex.Admin — see below
├── hooks/        useCollection · useSettings
├── lib/          auth · contact (call/WhatsApp/email) · pdf · feedback (haptics)
├── documents/    quotationHtml.ts — the printable A4 quotation
└── features/     auth · quotations · leads · products · contacts · profile
```

## `src/domain/` is a mirror of `Ortex.Admin` — keep it in step

These files are line-for-line ports. They are the contract with the console: a
divergence means a phone and a desk disagree about a customer's GST.

| Mobile | Ported from |
|---|---|
| `pricing.ts` | `Ortex.Admin/src/lib/pricing.js` |
| `format.ts` | `Ortex.Admin/src/lib/format.js` |
| `id.ts` | `Ortex.Admin/src/lib/id.js` |
| `gstStates.ts` | `Ortex.Admin/src/lib/gstStates.js` |
| `schema.ts` | `Ortex.Admin/src/data/domain/schema.js` |
| `settings.ts` | `Ortex.Admin/src/data/domain/settingsDefaults.js` |
| `quotations.ts` | `Ortex.Admin/src/data/domain/domain.js` (quotation slice) |
| `modules.ts` | `Ortex.Admin/src/data/domain/modules.js` |
| `voice.ts` | `Ortex.Admin/src/pages/voice-leads/helpers.js` |
| `data/repo.ts` | `Ortex.Admin/src/data/store/apiStore.js` |

`npm test` is what enforces this: `test/pricing.test.mjs` imports **both**
implementations and asserts they produce identical totals, so changing the
console's engine without following here fails the build rather than a customer's
invoice. `test/loadTs.mjs` is the shim that lets Node load both a TypeScript
file with an `@/` alias and a Vite-style extensionless-import file.

### Two deliberate divergences

* **`format.ts` does not use `toLocaleString("en-IN")`.** Hermes ships a
  cut-down `Intl` whose availability varies by build, and when it is missing the
  failure is *silent*: grouping degrades from `12,34,567.00` to `1,234,567.00`
  on a printed quotation. The lakh/crore grouper is written out by hand and
  covered by `test/format.test.mjs`.
* **PDFs are not `html2pdf.js`.** The console rasterises the DOM with
  html2canvas; here `documents/quotationHtml.ts` emits the same A4 layout as an
  HTML string and `expo-print` renders it with the platform's own PDF engine —
  real selectable text, and `expo-sharing` puts the file straight into WhatsApp.

## Data and offline behaviour

Every table is `{ id, doc jsonb, created_at, updated_at }`; `repo.ts` flattens
rows to `{ ...doc, id, createdAt, updatedAt }` exactly as the console does, pages
past PostgREST's 1000-row cap, and shares one realtime channel across all
screens.

`repo.list()` mirrors each collection into AsyncStorage and serves the cache when
the fetch throws, so a salesperson with no signal still has their catalogue and
contacts. **Writes are never queued offline**: a quotation number comes from the
server's atomic `next_sequence`, and two phones saving offline would both believe
they had the next one. What *is* kept locally is the half-finished draft
(`features/quotations/useQuotationDraft.ts`), offered back on the next launch.

## Design system

Ported from `C:\Dev\Mobile App` per that project's `src/ui/README.md`. The
palette in `theme/theme.ts` is unchanged — it is the same Metronic-derived ramp
`Ortex.Admin/src/index.css` uses (`#2567E8` primary, `#071437` heading,
`#E82646` error). `theme.tones` maps the console's status `tone` names
(`blue`, `amber`, `emerald`, …) onto it, so an "Accepted" badge is the same
green in both apps.

Conventions the screens follow: a slim toolbar row above a big 30px title;
**bottom sheets, never dialogs**, for short choice lists (`Dialog` is reserved
for destructive confirms); hairline dividers inset 16px past the leading icon;
a 60px circular FAB lifted clear of the tab bar; 28px squircle cards, 16px
buttons, 12px fields.

**One departure from the source kit:** its `GlassTabBar` is an iOS-26 Liquid
Glass design, not One UI, and its Android blur backend is switched on by an Expo
config plugin — which never runs in a bare project. `navigation/OneUiTabBar.tsx`
replaces it with an opaque One UI bar (hairline rule, Linear→Bold icon swap, the
same spring lens). `expo-blur` is not installed.

## Bare-workflow notes

`app.json` config plugins **do not run** here, so native wiring is by hand:

* `android/app/src/main/AndroidManifest.xml` — `USE_BIOMETRIC`, `VIBRATE`, and an
  Android 11+ `<queries>` block. Without those queries `Linking` cannot see the
  phone/mail/WhatsApp apps and the Contacts buttons silently do nothing.
* `ios/OrtexMobile/Info.plist` — `NSFaceIDUsageDescription` and
  `LSApplicationQueriesSchemes` for the same reason.
* `babel.config.js` carries the `@/` → `./src` alias via
  `babel-plugin-module-resolver`. tsconfig `paths` alone is not enough: that is
  resolved by Expo's Metro integration, and bundles here are built by the RN
  CLI's Metro.
* Env comes from `react-native-dotenv` (Babel-only, no native module):
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

## Style

Double quotes, no semicolons, 2-space indent, LF — the repo's `.editorconfig`
covers this folder. `npm run lint` is oxlint. Two rules are switched off in
`.oxlintrc.json` because they fire only on correct React Native idioms:
`react/refs` (the `useRef(new Animated.Value(…)).current` pattern the whole kit
is built on) and `react/set-state-in-effect` (async loads). Leaving them on
buried ~40 false positives and hid the real warnings.

Unlike the three JS projects, this one keeps the React Native template's own
`.gitignore` — the root file knows nothing about Gradle, Xcode or CocoaPods
build output.
