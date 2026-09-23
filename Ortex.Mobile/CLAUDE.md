# Ortex.Mobile (field-sales app)

Repo-wide rules, environments, roles and cross-app mirrors are in the root `CLAUDE.md`. This app is a second client of the Admin's Supabase project and talks to LIVE data.

```bash
# needs .env (copy .env.example: SUPABASE_URL, SUPABASE_ANON_KEY)
npm start          # Metro
npm run android    # native build + install (bare RN CLI, not Expo Go)
npm run ios        # needs a Mac + pod install; never yet compiled
npm run lint       # oxlint
npm run typecheck  # tsc --noEmit
npm test           # node --test test/*.test.mjs (incl. GST parity with Ortex.Admin)
npm run format     # prettier
npm run icons      # regenerate launcher icons from assets/app-icon-1000.png
npm version minor  # bump the ONE version (package.json)
npm run release:setup                  # once per PC: signing key + service key
npm run release:android                # build + publish; phones are offered the update
npm run release:android -- --required  # phones must update before use
```

## Versions, releases and signing (`docs/guides/MOBILE_RELEASE.md`)

* **Version lives only in `package.json`**. `src/constants/app.ts` requires it; `android/app/build.gradle` derives `versionName` and `versionCode` = major*10000 + minor*100 + patch. iOS versions are still moved by hand. Add a release at the top of `src/constants/whatsNew.ts` with every bump.
* **In-app updates** (Android side-loaded APKs): `scripts/release-android.mjs` checks signing, builds ARM-only, refuses a version not newer than the published one and an APK whose versionName differs from package.json, deletes the generated JS bundle first (Gradle otherwise ships the PREVIOUS bundle), uploads to the `app-releases` bucket and rewrites `android/latest.json`. Needs `SUPABASE_SERVICE_ROLE_KEY` in gitignored `.env.release`. In the app, `features/update/UpdateGate.tsx` + `lib/appUpdate.ts` + `domain/appVersion.ts`: below `minVersion` only the update screen renders; below `version` a dialog at most once a day. It compares the INSTALLED `nativeApplicationVersion`, applies the cached manifest first, and races the fetch against a timer (a dropped connection hangs rather than fails). A broken manifest never blocks anyone. Never ship `UPDATE_BASE_URL`.
* **APK must stay under 50 MB** (Supabase free-plan upload cap). ML Kit barcode scanning is the UNBUNDLED Play-services variant; see the exclusions in `android/app/build.gradle` and `proguard-rules.pro`. **Run `unzip -l` on a release APK after adding any native library.**
* **Signing**: `android/app/ortex-release.keystore` (gitignored) + four `ORTEX_*` properties in `~/.gradle/gradle.properties`; without all four the release silently signs with the debug key. Current key SHA-256 `A1:81:74:35:6E:B2:9A:69:8A:93:6E:45:05:7D:53:AD:FF:A8:B0:DD:7D:66:98:14:1F:5B:35:38:FB:70:79:AE` (first build 1.3.0). **Back the keystore up**: a lost key means every phone reinstalls (it has happened twice). Verify an APK with `apksigner verify --print-certs`.

## Bare-workflow gotchas

* `app.json` config plugins **do not run**. Permissions and manifest entries are written by hand in `AndroidManifest.xml` and `Info.plist` (biometric, camera, mic, media images, notifications, install packages, and the Android 11+ `<queries>` block that lets `Linking` see phone/mail/WhatsApp).
* The `@/` alias is `babel-plugin-module-resolver` in `babel.config.js`, not tsconfig `paths`. Env is `react-native-dotenv`.
* **No Reanimated**: gesture callbacks are `runOnJS(true)`; do not write worklets.
* Changing resources under `android/app/src/main/res` (transitions, sounds, icons) needs a native rebuild.
* **`ui/ListRefreshControl` must forward `style` and `children` to `RefreshControl`**: on Android the ScrollView renders itself INSIDE the refresh control, so a wrapper that drops children renders an empty page with no error. iOS hides this bug.
* **Keyboard**: always read the keyboard top through `keyboardTopInWindow(e)` in `hooks/useKeyboardAwareScroll.ts` (Android 16 status-bar offset). That hook is the one answer to fields behind the keyboard (used by `KeyboardAwareScrollView`, `AppScreen` forms and `ui/Sheet`); `adjustResize` does not reach inside a `Modal`.
* Photo uploads read base64 -> bytes; an RN `Blob` uploads 0 bytes silently. Every image picker crops **1:1** (iOS ignores `aspect`). Pickers call `requestMediaLibraryPermissionsAsync()` first, because a denied library returns a plain `canceled`.
* Android freezes a notification channel's sound and vibration at creation: changing either needs a new channel id, with the old one added to `RETIRED_CHANNELS` in `lib/push.ts`.
* Lint: `react/refs` and `react/set-state-in-effect` are off on purpose (false positives on RN idioms).

## Data

* `src/domain/` is a **mirror** of Admin logic (list in the root `CLAUDE.md`). `test/loadTs.mjs` lets Node load TS files with `@/` aliases, rewriting specifiers recursively.
* **Deliberate divergences from the console**: `format.ts` hand-rolls Indian lakh/crore grouping instead of `toLocaleString("en-IN")` (Hermes' `Intl` silently falls back to Western grouping on some builds); PDFs use `expo-print`, not `html2pdf.js`.
* `data/repo.ts` flattens `{ id, doc }` rows, pages past PostgREST's 1000-row cap, and opens **one realtime channel per table** (one channel for all fails silently if any table is missing from the `supabase_realtime` publication). `data/collectionStore.ts` keeps one in-memory copy per collection shared by every `useCollection`; realtime events refetch once (250ms coalesce); foregrounding refreshes anything older than 15s.
* **Reads are cached, writes are never queued**. `repo.fetch()` mirrors each collection to AsyncStorage and serves it on failure with `fromCache` / `cachedAt` / `error`, drawn as `ui/DataNotice` + pull-to-refresh. The profile is cached per user so a cold start offline still draws the right tabs; no profile or no module renders `AccountUnavailableView`.
* Company settings come from the `settings_staff` view; an empty read is an ERROR, never merged over demo defaults (that once printed a placeholder GSTIN on PDFs).

## Screens

* **Tabs** (gated by the console's `canAccess`): Home, Quotes, Leads, Catalogue (route `Products`), Customers (route `Contacts`), plus the notification bell and the Anu button on every tab bar. Invoices, payments, settings and user administration stay in the console.
* **Home** (`features/home/`): a page for the next ten minutes. Order: attendance card, "Needs you today" (with a Call button per row), shortcuts, Performance (7/30/90 with change stated in words), Leads, Pipeline, Insights rows, then payslip line and Anu's card. `InsightsScreen` shares `useDashboard.ts` so the two pages cannot disagree. Every figure is a pure function in `domain/dashboard.ts` (tested); vocabulary matches the console (won = accepted|invoiced, a quotation is dated by `issueDate`, a voice lead is a folded call). Website traffic is admin-only (`useWebTraffic.ts`, never IP/ISP/coordinates). Charts: `features/home/widgets.tsx`, `charts.tsx`; the finger is the pointer (`motion.ts` `useScrub`, `interaction.tsx` `ChartTooltip`). All motion is skipped under reduce-motion.
* **Leads**: Enquiries and folded Voice calls. `EnquiryDetailScreen` / `VoiceCallDetailScreen` put advisories first, then contact actions, then what they asked for. Quote-calculator enquiries carry the order as JSON; `domain/quoteRfq.ts` prices it **from our catalogue, never from the payload** (an anonymous insert could forge a rate). A status change on a call writes to every folded row. Recordings play through `features/leads/CallRecordings.tsx` + `lib/voiceRecordings.ts` (`expo-audio`, 1-hour signed URLs).
* **Quotations**: `QuotationEditorScreen` = WHO (customer, inline fields, place of supply tinted until set, since unset taxes it as local), WHAT (lines via `LineItemSheet`, lifting quantity to MOQ), HOW MUCH (tax treatment stated in words first). The sticky footer shows the blocking reason instead of the total while unsavable. Drafts are kept locally (`useQuotationDraft.ts`). PDFs are `documents/quotationHtml.ts` via `expo-print`. **WhatsApp share cannot be one tap into one chat** (`lib/pdf.ts` explains): the PDF goes through WhatsApp's picker and the message is put on the clipboard.
* **Catalogue**: Products / Categories / Our work, each with a read page (`ProductDetail`, `CategoryDetail`, `WorkDetail`) and an editor. The phone lists only active products and has **no status control**: status is the console's decision. A category rename moves every product across (products reference categories by NAME). Categories and work are gated on their own module keys to match their RLS policies.
* **Customers**: a Samsung Contacts port (A-Z sections, index rail, swipe to call/WhatsApp, local favourites in `lib/favourites.ts`). `ContactEditorScreen` rules are in `features/contacts/validateContact.ts` (tested): name or company, phone or email, GSTIN state code must match place of supply, duplicate check by email then national digits.
* **Attendance** (`features/attendance/`): a QR scanner (`AttendanceClockScreen.tsx`, `expo-camera` with `barcodeTypes: ["qr"]`). `isAttendanceCode()` checks the `ORTEX-ATT1:` prefix locally, and one `sent` latch stops a second code being burned. **No location permission and no offline queue** (see Admin `CLAUDE.md`). Also history, day timeline, corrections, approvals. `domain/attendance.ts` is the source that generates Admin's `lib/attendance.js`.
* **Leave** (`features/leave/`) and **My pay** (`features/pay/`: payslips + PDF, salary, reimbursement claims, payslip alerts).
* **Social** (`features/social/`): the console's Social on the phone, same rows. `domain/social.ts` mirrors the console's vocabulary (`test/social.test.mjs`). The phone never posts itself; the server sweep does.
* **Anu for staff** (`features/anu/`, full-screen modal): Hinglish by default, answers only from tool results, never sells. **The voice runs in an invisible WebView** (`engineHtml.ts`, raw Gemini Live protocol, since RN has no streaming PCM module); the token, brief and **every tool run in React Native** (`useAnuSession.ts`, `tools.ts`) against `collectionStore` under the user's session, each checking `canAccess`. Writes need `confirmed: true` or the on-screen Confirm card. Pure answers in `domain/anu.ts` (mirror of Admin `lib/anu.js`), transcript merging in `domain/anuConversation.ts`.
* **Profile**: hub (`ProfileScreen`), `AccountDetailsScreen` (name + phone editable; email/role/modules read-only because a trigger reverts them), `ChangePasswordScreen` (re-checks the current password on an ephemeral client), `QuotationDefaultsScreen` (`profiles.quotation_defaults`; a field left as the company wrote it is stored `null` so it stays linked), `WhatsNewScreen`, `LegalScreen` (mirror of the website's Privacy/Terms), `TeamScreen` and `UserDetailScreen` (admins: activate/deactivate and reset password through `admin-manage-user`).
* **Auth**: password -> emailed OTP, and forgot-password on one ephemeral client (`lib/auth.ts`), with an optional biometric app lock (`useAppLock.ts`, 60s grace). `BRAND` in `features/auth/brandField.ts` must equal `splash_background` in `colors.xml`, or every cold start flashes. No sign-up.

## Notifications

* **Derived, not stored**: a notification is a view of the `enquiries` and `quotations` rows the app already holds (`domain/notifications.ts`, tested). Ids are deterministic; read/archived/pushed flags live in AsyncStorage on the handset. Access is checked with `canAccess`.
* **Local push** (`expo-notifications`, `lib/push.ts`, channels `leads_v3` and `reminders_v3`, custom ring `res/raw/ortex_ring.wav`). Call / WhatsApp / Open actions live only on the push, never on the in-app row. The engine's first pass after a cold start marks everything as announced, silently.
* **Daily** (`lib/dailyPush.ts`, `domain/dailyDigest.ts`): scheduled motivation at 9:00 and insight at 9:30 on channel `daily_v1`; cancelled on sign-out.
* **Remote push** (`lib/remotePush.ts`, Admin migration 0031 + `push-notify`): registers the FCM token and deletes it on sign-out. The google-services plugin applies only when `android/app/google-services.json` exists, so without Firebase the build still works with local alerts only. Setup: `docs/guides/PUSH_SETUP.md`.

## Design system (One UI, `src/theme/`, `src/ui/`)

* **Owner's hard rules**: no shadows anywhere except the bottom tab bar; no glow except the tab bar's glass; no em dash in on-screen text.
* **Page gutter is 20** (`theme/tokens.ts`); nothing hardcodes an inset. Sections are full-bleed `ui/Panel` / `ui/Section` panels separated by a 2dp `colors.border` band that each panel draws itself. A page adds no horizontal padding; loose content between panels carries the gutter itself.
* **Status colours have three tokens**: bare name (`warning`) for fills, glyphs and rules; `warningBg` for the tint; `warningText` for text on the tint (AA contrast). Text on a tinted well always uses `*Text`. Keep `lightTones` / `darkTones` in step. `textFaint` / `textHint` are for decoration only, never words.
* Font is **Zalando Sans**; set `fontFamily` from `theme/typography.ts`, never `fontWeight` (Android does not synthesise weights).
* **Skeletons mirror real components**: `SkeletonRow` matches `ListRow` to the pixel (keep them in step), `ui/DetailSkeleton.tsx` keeps a live back arrow, and one shared pulse drives every block. `ui/ScreenLoader.tsx` is the one whole-screen loader (a bar, hidden for 400ms). `ui/ImageViewer.tsx` is the one photo viewer.
* A page with a sticky footer reserves the footer's **measured** height (`onLayout`), never a constant. `Button` sets `alignSelf: "flex-start"` on itself, which beats a parent's `alignItems: "center"`.
* **Motion**: `ui/motion.ts` is the one vocabulary (`EASE`, `SPRING`, `useReducedMotion`, `usePressMotion`, `useArrival`). An `AnimatedPressable` takes a plain style, not a `({ pressed })` function.
* **Launcher icons are generated** by `npm run icons` (Android rounded + adaptive + notification icon; iOS opaque, no alpha). Never hand-edit them.
