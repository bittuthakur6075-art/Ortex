# GEMINI.md — Ortex.Mobile (Field-Sales App)

Field-sales and operations companion app built with React Native 0.85 (bare workflow) and Expo SDK 56 modules.
This app is a direct client of the production Supabase instance.
Cross-repo rules and invariants are defined in the root `GEMINI.md`.

---

## 1. Quick Commands (Windows PowerShell)

```bash
# Ensure .env contains SUPABASE_URL and SUPABASE_ANON_KEY
cmd /c "npm start"          # Start Metro bundler
cmd /c "npm run android"    # Compile and install native Android debug build
cmd /c "npm run lint"       # oxlint + mobile ui-guard
cmd /c "npm run typecheck"  # tsc --noEmit
cmd /c "npm test"           # Node test runner for parity tests (270 checks)
cmd /c "npm run format"     # Prettier formatting
cmd /c "npm run icons"      # Generate app icons from assets/app-icon-1000.png

# Attendance Code Generation (Mirrored into Admin)
cmd /c "npm run gen:attendance" # Compiles attendance.ts into Ortex.Admin/src/lib/attendance.js
```

---

## 2. Release Management & APK Constraints

* **Version Location**: Version is incremented solely in `package.json`. `android/app/build.gradle` automatically computes `versionCode` and `versionName`.
* **50 MB APK Ceiling**: Supabase free storage caps uploads at 50 MB.
  * ML Kit Barcode Scanning uses the unbundled Play Services model to keep APK size lean.
  * Always inspect build sizes using `unzip -l <apk>` before uploading.
* **Signing Keystore**:
  * Releases must be compiled on the designated build PC using `android/app/ortex-release.keystore` and gradle properties in `~/.gradle/gradle.properties`.
* **In-App Self-Updating**:
  * `scripts/release-android.mjs` uploads new builds to the `app-releases` bucket and updates `android/latest.json`.
  * `features/update/UpdateGate.tsx` prompts users when an update is available or enforces an update if below `minVersion`.

---

## 3. Bare Workflow & React Native Gotchas

1. **`app.json` Config Plugins Do Not Run**:
   - Permissions, queries, and intents must be manually declared in `android/app/src/main/AndroidManifest.xml` and `ios/OrtexMobile/Info.plist`.
2. **Keyboard Offsets**:
   - Always calculate keyboard positions using `keyboardTopInWindow(e)` in `hooks/useKeyboardAwareScroll.ts`. Do not rely on `adjustResize` inside modals.
3. **No Reanimated**:
   - Gesture callbacks must run with `runOnJS(true)`. Do not author Reanimated worklets.
4. **List Refresh Control**:
   - `ui/ListRefreshControl` must forward `style` and `children` to React Native's `RefreshControl`. On Android, `ScrollView` renders inside the refresh component; dropping children results in a blank view.
5. **Image Processing**:
   - Read image data as base64 and upload raw byte buffers. React Native `Blob` objects can silently post 0-byte files to Supabase.
   - Crop images 1:1 before uploading.

---

## 4. Domain Parity & Data Layer

* **Domain Mirror (`src/domain/`)**:
  * Contains pure TypeScript mirrors of Admin calculations (`pricing.ts`, `validateDocument.ts`, `leads.ts`, `chat.ts`, `attendance.ts`, `settings.ts`).
  * `cmd /c "npm test"` runs automated assertions verifying that Mobile and Admin engines produce identical GST tax allocations, roundings, and document checks.
* **Data Caching & Offline Strategy**:
  * `src/data/repo.ts` flattens `{ id, doc }` records and manages dedicated Realtime channels per table.
  * Reads are persistently cached in `AsyncStorage`. If network calls fail, data is served offline accompanied by a `ui/DataNotice` and pull-to-refresh.
  * **Writes are transactional and latched**: Actions race a 20-second timeout. If a timeout occurs, `justSaved()` re-reads the database before presenting an error to prevent duplicate submissions.

---

## 5. Screen Modules & Features

* **Navigation & Role Access**:
  * Role `staff` receives only Home, Team Contacts (`team_contacts()` RPC), and Chat tabs.
  * Roles `sales`, `admin`, `super_admin` access Home, Quotes, Leads, Products, and Contacts.
* **Attendance Screen (`features/attendance/`)**:
  * Scans rotating 30-second QR codes via `expo-camera`.
  * Verifies the `ORTEX-ATT1:` prefix locally and sets a send latch to prevent burning multiple codes.
  * Field sales punch without a QR code, which records a `no_code` flag for manager approval.
* **Quotations & Invoices (`features/quotations/`)**:
  * Quotes are created using `QuotationEditorScreen` with real-time validation via `validateDocument.ts`.
  * Renders single-page A4 PDFs using `documents/quotationHtml.ts` and `expo-print`.
  * WhatsApp sharing attaches a page-1 image preview with a caption, followed by the complete PDF document.
* **Payments (`features/payments/`)**:
  * Records payment inflows and payouts (`PaymentNewScreen`) using atomic numbers from `next_sequence("payment")`.
  * Flags duplicate UTRs in real time before submission.
* **Contacts Directory (`features/contacts/`)**:
  * Samsung Contacts style interface featuring an alphabet jump rail, fast search, and swipe-to-call or swipe-to-WhatsApp.
* **Staff Anu Voice Assistant (`features/anu/`)**:
  * Executes the Gemini Live protocol inside an invisible WebView (`engineHtml.ts`) while handling session tokens and tool routing natively in React Native.

---

## 6. One UI Design System (`src/theme/`, `src/ui/`)

* **Squircle Geometry (Figma 100% Smoothing)**:
  * All cards, chips, and modals use `ui/Squircle.tsx` (`SquircleBackground`) to render curvature rather than standard `borderRadius`.
* **Zero Shadow Rule**:
  * Box shadows and glows are forbidden across the UI, with the sole exception of the floating bottom navigation bar.
* **Typography**:
  * Uses the **Zalando Sans** font family. Always specify weights via `fontFamily` tokens in `src/theme/typography.ts`. Never set `fontWeight` in styles.
* **Three Status Tokens**:
  * Every status tone provides three coordinated tokens: base (e.g. `warning`), background (`warningBg`), and high-contrast text (`warningText`).
