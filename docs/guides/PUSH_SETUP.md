# Push notifications setup (Ortex.Mobile)

The field-sales app has three kinds of notification. Only the third needs setup.

| Kind | Arrives when the app is closed? | Needs setup |
|---|---|---|
| **Lead alerts, posted by the app** (`lib/push.ts`, `useNotificationEngine`) | No. The app must be running. | None |
| **Daily motivation (9:00) and daily insights (9:30)** (`lib/dailyPush.ts`, `domain/dailyDigest.ts`) | Yes. Scheduled on Android's alarm clock, re-armed after a reboot. | None |
| **Lead alerts, sent by the server** (`lib/remotePush.ts`, Admin `push-notify`) | Yes | The steps below |

Until the steps below are done, the app behaves exactly as before. Without
`google-services.json` the build still succeeds and registration fails soft.
Without the Vault secrets the database trigger does nothing.

## 1. Firebase project (owner, about 5 minutes)

1. Go to <https://console.firebase.google.com>, add a project (e.g. "Ortex Sales"). Analytics is not needed.
2. **Add app → Android**, package name **`com.ortexmobile`**. Download **`google-services.json`**.
3. Put the file at `Ortex.Mobile/android/app/google-services.json`. It is gitignored. Keep a copy with the release keystore.
4. **Project settings → Service accounts → Generate new private key**. This downloads a JSON file. Treat it as a password; never commit it.

## 2. Database (from `Ortex.Admin/`)

```bash
npm run sb:db:push          # applies 0031_push_devices.sql (push_devices, register_push_device, the trigger)
```

Then, in the Supabase SQL editor, give the trigger its target and a shared secret
(generate one with `openssl rand -hex 32`):

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/push-notify', 'push_notify_url');
select vault.create_secret('<the random secret>', 'push_notify_secret');
```

## 3. Edge function (from `Ortex.Admin/`)

```bash
supabase secrets set PUSH_NOTIFY_SECRET=<the same random secret>
supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat path/to/service-account.json)"
supabase functions deploy push-notify --no-verify-jwt
```

`--no-verify-jwt` is required because pg_net sends no user token; the shared
secret is the guard.

## 4. App

Rebuild the APK (the Firebase file is compiled in), install it, and sign in.
The phone registers itself in `push_devices` after sign-in and removes itself
on sign-out.

## Checking it works

1. Sign in on the phone, then **close the app** (swipe it away).
2. Submit an enquiry on the website.
3. The phone should ring within a few seconds with "New enquiry · <name>".
4. If it does not:
   - `select * from push_devices;` should show a row for your account. If not, the build lacks `google-services.json` or 0031 is not applied.
   - `select * from net._http_response order by created desc limit 5;` shows what the trigger's call returned.
   - The function's logs in the Supabase dashboard show `sent`, `failed` or `skipped` with the reason.

## Rules worth knowing

- **Who gets a lead**: active staff whose profile grants the module (`enquiries` for web/IndiaMART, `voice-leads` for Anu calls); admins get both. This is the console's own `has_module_access` rule.
- **Anu calls ring once**: a call is saved as several captures, so only the first capture from a number within 15 minutes rings.
- **No duplicates**: the server uses the app's own notification id (`enq-new-<id>`, `voice-new-<id>`) as the Android tag. When the app is open it hides the server copy and posts its own, which has the Call/WhatsApp buttons.
- **Battery**: on Samsung, set Ortex to *Unrestricted* battery use (Profile → Notifications → Keep alerts working in the background). Server push survives the app being closed; the app's own alerts do not.
- **Daily insights are a snapshot**: they are scheduled while the app runs, so they show the figures as of the last time the app was open, and say so ("as of 6:40 PM").
