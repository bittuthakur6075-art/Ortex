# Push notifications setup (Ortex.Mobile)

The phone app has three kinds of notification. Only the third needs setup.

| Kind | Arrives when the app is closed? | Needs setup |
|---|---|---|
| **Alerts posted by the app** from what it hears over realtime (`lib/push.ts`, `useNotificationEngine`, `ChatNotifier`, `AttendanceApprovalAlerts`, `PayslipAlerts`) | No. The app must be running. | None |
| **Daily motivation (9:00), daily insights (9:30), attendance reminders** (`lib/dailyPush.ts`, `lib/attendanceReminders.ts`) | Yes. Scheduled on the phone. | None |
| **Alerts sent by the server** (`lib/remotePush.ts`, Admin `push-notify`) | Yes | The steps below |

Until the steps below are done the app behaves exactly as before: without
`google-services.json` the build still succeeds and registration fails soft;
without the Vault secrets the database triggers do nothing and every write
goes through as usual.

## What the server sends

| Alert | Who gets it | Tap opens | Setting on the phone | Migration |
|---|---|---|---|---|
| New enquiry (website, IndiaMART) | Active people with the `enquiries` module | `EnquiryDetail` | New enquiries | 0031, 0051 |
| New voice lead (Anu call, first capture only) | Active people with `voice-leads` | `VoiceCallDetail` | Voice calls | 0031 |
| Leave or correction request | Admins with the Team section (`attendance-team`), never the requester | `AttendanceApprovals` | Leave and corrections | 0038, 0065 |
| Approved leave withdrawn by the person | The same admins | `AttendanceApprovals` | Leave and corrections | 0065 |
| Your leave was approved / not approved / cancelled | The requester, when someone else decided | `LeaveRequest` | Leave and corrections | 0038 |
| Your correction was approved / not approved | The requester, when someone else decided | `AttendanceDay` | Leave and corrections | 0038 |
| Team chat message: direct, group and every team channel (Sales, Accounts, Staff, Management, Everyone), Anu's daily team posts included | Other members who have not muted that chat (never the private Anu thread) | `ChatThread` | Team chat | 0047 |
| Punch to review: a code they opened themselves, or a station not theirs | Admins with the Team section, never the person | `AttendanceApprovals` | Leave and corrections | 0074 |
| Your payslip for September 2026 is ready | The employee, when the run is paid or a withheld slip is released. **No amount.** | `Payslip` | My pay | 0074 |
| Your claim was approved / not approved | The claimant, when someone else decided. **No amount.** | `PayClaims` | My pay | 0074 |

Inactive people are never sent anything. Every phone a person is signed in on
gets the alert. The master switch and each setting in Profile → Notifications
also stop the server's copy: the phone saves its switched-off categories with
its token (`push_devices.muted`, 0074) and re-sends them when they change. A
phone on an app older than that release keeps getting everything until it
updates.

## Owner checklist, in order

Do these on the build PC, from `C:\Code\Ortex\Ortex.Admin` unless said
otherwise. The project ref is **`pfoeztiakqtemakfgpgs`**. On Windows
PowerShell write `npx.cmd supabase ...` (script execution is disabled).

### 1. Firebase project (about 5 minutes)

1. Open <https://console.firebase.google.com>, **Add project** (e.g. "Ortex Sales"). Analytics is not needed.
2. **Add app → Android**, package name **`com.ortexmobile`**. Download **`google-services.json`**.
3. Put it at **`Ortex.Mobile\android\app\google-services.json`**. It is gitignored; keep a copy with the release keystore backup.
4. **Project settings → Service accounts → Generate new private key**. A JSON file downloads. Treat it as a password; never commit it or paste it in chat.

### 2. A shared secret

Generate one random value and keep it for steps 3 and 4:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database

```bash
npx.cmd supabase migration list   # 0074 should show as local only
npx.cmd supabase db push          # applies 0074_push_pay_and_prefs.sql
```

Then in the Supabase dashboard → SQL editor, run once (the second line with
the secret from step 2):

```sql
select vault.create_secret('https://pfoeztiakqtemakfgpgs.supabase.co/functions/v1/push-notify', 'push_notify_url');
select vault.create_secret('<the secret from step 2>', 'push_notify_secret');
```

### 4. Edge function secrets and deploy

```bash
npx.cmd supabase secrets set PUSH_NOTIFY_SECRET=<the secret from step 2>
```

`FIREBASE_SERVICE_ACCOUNT` is the whole service-account JSON from step 1.4.
The simplest way is the dashboard: **Edge Functions → Secrets → Add new
secret**, name `FIREBASE_SERVICE_ACCOUNT`, paste the file's contents. From Git
Bash instead:

```bash
npx supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat /c/path/to/service-account.json)"
```

Then deploy (either order with step 3 is safe: the function falls back when
0074 is missing, and an older function just refuses the new tables):

```bash
npx.cmd supabase functions deploy push-notify --no-verify-jwt
```

`--no-verify-jwt` is required because pg_net sends no user token; the shared
secret in the `x-push-secret` header is the guard.

### 5. A new APK

`google-services.json` is compiled into the app, so the phones need a new
build. From `Ortex.Mobile`: bump the version (`npm version minor`), add a
release to `src/constants/whatsNew.ts` (alerts now arrive with the app
closed; new settings Leave and corrections, My pay), then
`npm run release:android`. Each phone registers itself in `push_devices` the
next time it is opened signed in, and removes itself on sign-out.

### 6. Check it works

1. On the phone, sign in, allow notifications when asked, then **swipe the app away**.
2. Submit an enquiry on the website. The phone should ring within seconds with "New enquiry · <name>". Tap it: the enquiry opens.
3. Send that person a Team chat message from the console; decide a test leave request; each should arrive and open its screen.
4. If nothing arrives:
   - `select user_id, app_version, muted, updated_at from push_devices;` should show a row for the account. No row: the APK lacks `google-services.json`, or the phone has not been opened since the update.
   - `select id, status_code, content from net._http_response order by created desc limit 5;` shows what the trigger's call returned (401 = the two secrets differ).
   - The function's logs (dashboard → Edge Functions → push-notify) show `sent`, `failed`, `removed` or `skipped` with the reason (`nobody active`, `no registered phones`, a muted category).
   - On Samsung, Profile → Notifications → Keep alerts working in the background (battery Unrestricted).

## Rules worth knowing

- **Who gets a lead**: active people whose access reaches the module (`enquiries` for web/IndiaMART, `voice-leads` for Anu calls), the console's own `has_module_access` rule including the Super Admin's switches and hide list.
- **Anu calls ring once**: a call is saved as several captures, so only the first capture from a number within 15 minutes rings.
- **No duplicates (tags)**: each server push uses the phone's own notification id as its Android tag: `enq-new-<id>`, `voice-new-<id>`, `leave-<status>-<id>`, `corr-<status>-<id>`, `chat-<conversation>`, `payslip-<id>`, `claim-<status>-<id>`, `punch-flagged-<id>`. A copy the phone posts itself replaces the server's and the other way round. With the app in the foreground the server's copy is hidden whenever the app posts its own (everything except claim decisions and flagged punches).
- **Notification, not data-only**: the server sends FCM notification messages (with `data` for the tap) so a killed app is drawn by Android without starting any JavaScript; data-only messages would need a headless task, which battery managers often block. The data always carries `targetScreen`, `targetId` and `kind`; the phone maps them to a screen with `pushRoute()` and ignores a screen it does not know.
- **Channels**: leads on `leads_v3` (public on the lock screen, loudest), everything else private on `reminders_v3` or `chat_v1`. They must equal the ids in `Ortex.Mobile/src/lib/push.ts`; a channel retired there (`RETIRED_CHANNELS`) must never be sent to.
- **Not sent, on purpose**: a field rep's routine no-code punch (it would ring every admin twice a day per rep), new claims and pay runs to approve (decided only in the console, so a tap has no screen to open), and quotation events (customers do not act in the app).
- **Lock screen privacy**: pay alerts name the month or the claim, never an amount.
- **Dead tokens**: FCM answers for an uninstalled app or a rotated token (UNREGISTERED, SENDER_ID_MISMATCH, an invalid token) delete that `push_devices` row. The phone also replaces its row when FCM rotates the token.
- **Battery**: on Samsung, set Ortex to *Unrestricted* battery use. Server push survives the app being closed; the app's own alerts do not.
