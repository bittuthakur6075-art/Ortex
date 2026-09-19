# Attendance & Leave: research and plan

Status: **plan, not built** (2026-09-19). Owner decisions needed are listed in §10.

## 1. What we are building

Every team member marks attendance on the phone (Ortex.Mobile), **and only there** (owner's decision, 2026-09-19): **a selfie, a location check against the office geofence, and a server timestamp**. The web console views and approves; it never creates a punch. They see their own attendance on the phone and on the web console (Ortex.Admin). Admins see everyone, review flagged punches, and lock the month for payroll. **Leave** follows: balances, apply, approve or reject, and a team calendar.

## 2. Research summary

### 2.1 Reference designs (Mobbin)

Mobbin covers iOS and web only, and none of the Indian HRMS apps are on it (Keka, greytHR, Darwinbox, Zoho People, Jibble). The strongest references are Jobber, Remote, Gusto, Deputy, Square, Employment Hero and Workable, with the selfie oval borrowed from KYC flows.

| Area | Reference | Link | What to take |
|---|---|---|---|
| Clock in/out | Jobber, Clocking in | https://mobbin.com/flows/2d6487e3-1fee-461d-9745-e6d287347359 | One pill button whose label IS the state (Clock In → Clock Out); a timeline of punches beneath |
| On duty | Toggl full-screen timer | https://mobbin.com/screens/1551995b-3134-4ade-81f9-5f473c103847 | A huge running HH:MM with context above |
| Pocket-safe confirm | Waymo "Slide to start" | https://mobbin.com/screens/0e688b5c-a98a-47a4-b7b6-1517e63cb33d | Slide-to-confirm instead of a tap |
| Status strip | Grab Driver | https://mobbin.com/screens/bde9cd75-e090-4056-a7f4-266cd1a28c59 | A strip under the main control: state, location, next action |
| Selfie | Wise face capture | https://mobbin.com/screens/cf99a035-93e4-405a-b110-1e7ed1d205b9 | Oval ring fills when the face is right; live hint chip ("Move closer") |
| Selfie | Uber / Veriff | https://mobbin.com/screens/9d57684e-5fac-48ae-97f4-f6e7a0f175d8 | Dimmed outside the oval, one line of guidance, one shutter |
| Permission | World App pre-permission | https://mobbin.com/screens/1b03f389-e105-4cf0-bef2-5fad252db9fb | Explain first, then the OS prompt |
| Geofence | Lyft pickup radius | https://mobbin.com/screens/4c328a11-8a99-4574-808f-f94b78433dbd | Tinted circle plus "you" dot plus a bottom sheet: the "you are outside" layout |
| Calendar | Bevel / Peerspace / Clue | https://mobbin.com/screens/c68afd39-4b83-4d19-9cd2-0bd8f269a36d · https://mobbin.com/screens/ddb7e1a6-97f1-4906-9b6e-ef368032694d · https://mobbin.com/screens/353d04da-d370-4ba1-a5cb-39ec238afccc | Month grid with per-day marks, a floating legend pill, multi-day leave as bars |
| Leave request | Remote, Requesting time off | https://mobbin.com/flows/75b95f3c-0b4b-4ef5-8ae9-004157a85079 | The whole flow: balance hero, type, dates on an inline calendar, half day, note, document, success sheet |
| Leave request | Gusto, Request time off | https://mobbin.com/flows/dcd0311c-2878-45da-964b-13e92587f080 | Question headings; available balance shown under the type |
| Approvals (phone) | Remote, All requests | https://mobbin.com/screens/6f7ddbc3-3a49-492b-8de8-5f7c791cdf28 | Pending cards with Approve / Decline on the card |
| Approval detail | Revolut Business | https://mobbin.com/screens/9a34e3c2-65fa-49e0-9a6f-5833c749d333 | The approval timeline (submitted → awaiting → decided) |
| Web register | Deputy Timesheets | https://mobbin.com/screens/40b0eeda-18ea-4067-ba0f-1b757cdbe424 | Count tabs, rows grouped by person, exceptions in red, inline Approve |
| Web dashboard | Deputy Attendance & absence | https://mobbin.com/screens/a94b862d-1c9d-4cdf-b7a5-299fa1144bdd | Three KPIs (no-shows, lates, early exits); "Geolocation audit" |
| Web day view | Square Workday | https://mobbin.com/screens/5662c873-eade-4047-bd12-121a166f0e46 | A person × hours timeline, recorded vs scheduled |
| Web leave | Employment Hero Leave | https://mobbin.com/screens/26c02311-88ab-4c30-8feb-62fe53392f65 | Requests / Balances / Calendar; bulk approve; "Remaining if approved" |
| Web leave review | Deputy leave review | https://mobbin.com/screens/4060eb3a-fb01-4b17-976e-dca0af92843c | Balance now / this request / after |
| Team calendar | Workable Work calendar | https://mobbin.com/screens/eb1665f6-d109-4724-999e-89f7cdc569b4 | People × days; "No one out of office today" |
| Holidays | Employment Hero Public holidays | https://mobbin.com/screens/5f7d34f5-03f7-47b5-b093-b5fbec178f19 | A standard calendar with an Enable toggle per holiday |
| Geofence setup | Klaviyo Create geofence | https://mobbin.com/screens/ce8c7dc3-3168-4b53-9adc-e3f396c850b6 | Map and circle; address, latitude/longitude, radius slider |
| Geofence rule | Fresha proximity controls | https://mobbin.com/screens/356b49ea-ce2e-4555-a464-e10006927937 | One toggle: "only clock in within ~50 m" |

No reference exists for two states we need, so these are original designs: **weak GPS** ("Accuracy 85 m. Move near a window · Retry") and **saved offline** ("Punch saved, will sync").

### 2.2 Geofencing

- Android's fused location is 20–100 m accurate inside a factory shed; Google recommends a fence of at least 100–150 m.
- **One reading at the moment of punching** (`expo-location` `getCurrentPositionAsync({ accuracy: High })`), never background tracking. Background tracking needs `ACCESS_BACKGROUND_LOCATION`, drains the battery, gets killed by Samsung, and is continuous tracking under DPDP.
- **Rule:** accept when `distance − accuracy ≤ radius` (the accuracy circle touches the fence). Ask for a retry when accuracy is worse than 100 m.
- **The server decides, not the phone.** A Postgres RPC computes the distance (haversine) against the `work_sites` table and stamps `now()`. A modified APK can lie about "inside: true"; it cannot change the server's maths or its clock.
- **Several sites:** factory, office, a warehouse, each with its own radius.
- **Field reps:** punch in **Field (OD)** mode with no fence. Location and a visit note are still recorded.

### 2.3 Anti-fraud (proportionate for 10–50 people)

- **Flag, don't block.**
- The only hard refusal is a mock location (`location.mocked === true` on Android). Even then the person can ask for a correction (regularisation).
- Everything else becomes a **flag** on the punch for an admin to review: low accuracy, device clock more than 5 minutes off, outside the fence, offline, rooted phone.
- The **server clock** is the time of record. The device's time is stored only for comparison.
- **No Play Integrity.** A sideloaded APK always fails its app check, so it adds cost for no signal.
- The selfie is the deterrent against buddy-punching. Patterns (the same coordinates every day to the decimal) are the detector.

### 2.4 Selfie

| Level | What | Verdict |
|---|---|---|
| (a) Capture and store, admin spot-checks | Front camera, private bucket, shown beside the punch | **Phase 1** |
| (b) A face is present | ML Kit face detection on the captured photo (`@infinitered/react-native-mlkit-face-detection`, no frame processor) | **Phase 4**: stops blank and pocket shots |
| (c) Liveness (blink or turn) | Needs `react-native-vision-camera` plus worklets | Not now: the app has no Reanimated or worklets |
| (d) Face matching against an enrolled photo | AWS Rekognition ≈ $2 a month at our volume | **Not recommended**: it turns the photo into biometric processing (SPDI Rules until May 2027, then DPDP), which needs written consent |

- Size: 640 px long edge, JPEG q0.6, ≈ 60 KB. That is about 160 MB a month for 50 people, so storage cost is negligible.

### 2.5 Law and policy (India)

- **DPDP Act 2023 and Rules (notified 13 Nov 2025):**
  - Notice, security, retention and rights obligations bind from **13 May 2027**.
  - **Section 7(i)** lets an employer process personal data for employment purposes (attendance for pay) without consent.
  - We still show an **in-app notice** before the first punch. It is cheap and it will be mandatory.
- **Selfie:** a photo reviewed by a person is ordinary personal data. Automated face matching would be biometric processing, which is one reason level (d) is excluded.
- **Location:** captured only at punch time, never tracked.
- **Retention:**
  - Selfies: 90 days, then deleted automatically.
  - Punch and day rows: kept for the employment term + 3 years, because they support wage records.
- **Leave law:**
  - **Delhi Shops & Establishments Act:** 15 days privilege leave, 12 days sick/casual, weekly rest, 3 paid national holidays.
  - **OSH Code (in force from 21 Nov 2025):** annual leave of 1 day per 20 days worked once 180 days are worked, carry-forward capped at 30.
  - The default policy below satisfies both. **Have a labour consultant confirm it for the factory headcount.**

### 2.6 Attendance rules (Keka / greytHR defaults, which staff already expect)

| Rule | Default (configurable) |
|---|---|
| Shift | 09:30–18:30, weekly off Sunday |
| Grace | 15 min, then **late** |
| Late penalty | 3 lates in a month = 0.5 day (from leave, else LOP); waived if full hours worked |
| Half day | Worked < 4 h 30 m |
| Absent | Worked < 2 h, or no punch and no leave |
| Missed clock-out | Auto-closed at shift end + 4 h as **MP** (missed punch), counted as HD until regularised |
| Regularisation | Reason + corrected time, admin approves, max 3 a month |
| Month lock | Admin locks the month; it then exports for payroll/Tally |

**Status codes:** `P` present · `L` leave (with its type) · `HD` half day · `A` absent · `WO` weekly off · `H` holiday · `OD` on duty / field · `LOP` loss of pay · `MP` missed punch (pending).

### 2.7 Default leave policy

| Type | Days/yr | Accrual | Carry-forward | Rules |
|---|---|---|---|---|
| EL (earned / privilege) | 15 | 1.25 per month | up to 30, excess encashable | Apply 7 days ahead |
| CL (casual) | 7 | Upfront, pro-rated for joiners | Lapses 31 Dec | Max 3 in a row; half-day allowed |
| SL (sick) | 7 | Upfront | Lapses | Certificate if more than 3 days; half-day allowed |
| National holidays | 3 | 26 Jan, 15 Aug, 2 Oct | n/a | Work on one = comp-off |
| Festival holidays | 7–8 | Admin sets yearly | n/a | Diwali, Holi, etc. |
| CO (comp-off) | Earned | 4 h+ on WO/H = 0.5, 8 h+ = 1 | Expires in 60 days | Admin approves |
| LOP | none | When there is no balance or the absence is unapproved | none | none |

**Sandwich rule** (a weekly off between two leave days counts as leave) is available, and **off by default**.

## 3. How it fits the codebase

- **Module keys:**
  - `attendance`: always on for every signed-in staff member (their own punches and leave).
  - `attendance-admin`: adminOnly (everyone's register, approvals, settings, month lock).
  - Mirror both in `Admin/src/data/domain/modules.js` and `Mobile/src/domain/modules.ts`.
- **Prerequisite:** the phone's `canAccess` currently returns `Boolean(profile)`, so module permissions are bypassed on mobile. Attendance approvals must not ride on that. Fix the mirror first.
- **Real columns, not `doc` jsonb:**
  - The server validates punches, RLS is per person, and every query is by date and by person.
  - `push_devices` (0031) and `profiles` are the precedent.
  - Leave requests opt into the 0023 audit trail. Raw punches do not (high volume, machine-validated), but their review decisions do.
- **Settings:** a new `attendance` block in `settings` (shift, grace, rules, retention), exposed to staff by recreating the `settings_staff` view (0024). Sites and holidays get their own tables because they are lists an admin edits.
- **Storage:** a private bucket `attendance-selfies`, path `<uid>/<yyyy>/<mm>/<punch-uuid>.jpg`.
  - Insert: owner folder only.
  - Select: owner or `attendance-admin`.
  - No update or delete policy, so a photo cannot be swapped after the fact.
  - Signed URLs as in `services/voiceRecordings.js`.
- **Phone native (bare project: by hand, then a native rebuild):**
  - Add `expo-camera`, `expo-location` and `expo-image-manipulator`.
  - Manifest: `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`.
  - iOS: `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`.
- **Realtime:** the new tables join `supabase_realtime` (idempotent block as in 0029), are added to `REALTIME_TABLES` in the phone's `repo.ts`, and to `apiStore.clearAll` / `exportAll` in the console.

## 3a. Roles (decided 2026-09-19)

**All staff** are on attendance. Today there are only two roles, `admin` ("Admin") and `sales` ("Sales Executive"), so a factory worker or an accountant would be labelled a Sales Executive. The owner chose **five roles**:

- **Super Admin**: the owner, and **only the owner: exactly one Super Admin, `louis.sharma37@gmail.com`** (owner's decision, 2026-09-19). Can do everything, including managing the admins themselves, company and integration settings, attendance rules and leave policy, unlocking a locked month, and overriding a day's status.
- **Admin**: runs day-to-day operations. Everything except the Super Admin's list, and one of the **approvers** of leave, corrections and flagged punches.
- **Accounts**: billing and payroll. Invoices, payments, everyone's attendance (read-only), the register with month lock and export. No sales, no approvals.
- **Sales Executive**: field sales. Leads, customers, quotations; views products. Clocks in as Field (OD) by default.
- **Staff**: factory and office workers. Attendance and leave only.

| Capability | Super Admin | Admin | Accounts | Sales Executive | Staff | Note |
|---|---|---|---|---|---|---|
| Sign in to the phone app and the web console | ● | ● | ● | ● | ● |  |
| Mark own attendance (phone only) | ● | ● | ● | ● | ● | Selfie + geofence |
| See own attendance, apply for and track own leave | ● | ● | ● | ● | ● | Phone and web |
| See everyone's attendance and leave | ● | ● | ● | · | · | Accounts needs it for payroll |
| Approve leave and corrections; review flagged punches | ● | ● | · | · | · | Nobody approves their own |
| Attendance register, lock month, payroll export | ● | ● | ● | · | · | Accounts runs payroll |
| Unlock a locked month | ● | · | · | · | · | Logged with a reason |
| Override a day's status (never a punch) | ● | · | · | · | · | Logged with a reason |
| Sites, shifts and holidays | ● | · | · | · | · | Attendance → Settings |
| Attendance rules and leave policy | ● | · | · | · | · | Attendance → Settings |
| Leads (voice calls, enquiries), customers, quotations | ● | ● | · | ● | · | Sales Executive default today |
| Catalogue: products, categories, work photos | ● | ● | · | View | · | Sales can view products to quote |
| Invoices and payments | ● | ● | ● | · | · |  |
| Social, AI call agent | ● | ● | · | Tickable | · | Granted per person |
| Insights | ● | ● | · | · | · |  |
| Add and manage staff (Accounts, Sales, Staff) | ● | ● | · | · | · | Create, set role, deactivate, reset password |
| Add and manage Admins and Super Admins | ● | · | · | · | · | Admins cannot touch them |
| Company settings, GST details, integrations, API keys | ● | · | · | · | · |  |
| Default attendance mode | Office | Office | Office | Field (OD) | Office | Changeable per person |

(● = yes, · = no.)

**How it is enforced:**
- A role sets the **default** section access. A Super Admin or Admin can still tick extra sections per person on the Users page, as today.
- The **powers** stay tied to the role and are checked by the database and the user-management functions, not only the screen:
  - approving (Super Admin, Admin);
  - locking and exporting a month (Super Admin, Admin, Accounts);
  - unlocking, overriding, rules and leave policy (Super Admin);
  - creating, changing or removing an Admin or Super Admin (Super Admin).
- **Every request goes to the Super Admins and Admins.** Nobody approves their own; an admin's leave is approved by another admin or a Super Admin.
- **Guards:**
  - **exactly one Super Admin**: a unique partial index on `profiles (role) where role = 'super_admin'` makes a second one impossible, and the Super Admin cannot be deactivated, deleted or demoted. Handing the role to someone else is a single `transfer_super_admin(new_id)` call only the Super Admin can make; it demotes them to Admin and promotes the other person in one transaction, so there is never zero or two;
  - an Admin cannot promote anyone to Admin or Super Admin, or edit one;
  - a Super Admin's override or unlock always carries a reason and lands in the audit trail.
- Marking attendance stays phone-only for everyone, **Super Admin included**. An override changes a day's status, never creates a punch.

**What changes in the code:**
- A new role list in `Admin/src/lib/roles.js` (`super_admin`, `admin`, `accounts`, `sales`, `staff`), mirrored on the phone.
- `is_admin()` becomes true for both `super_admin` and `admin`, so every existing admin-only policy keeps working. A new `is_super_admin()` guards the owner-only powers.
- Default grants per role in `modules.js` and `modules.ts`, replacing `SALES_DEFAULT_MODULES`.
- `profiles.role` allows the five values. `profiles_protect` still stops anyone changing their own role, and now also stops an Admin changing an Admin's or Super Admin's row.
- `admin-create-user` / `admin-manage-user` and the "active and role in (admin, sales)" checks (0015) accept the new roles and enforce the guards above.
- The phone's `canAccess` bypass is fixed, so the phone honours the same grants as the console.
- **Migration of today's users:**
  - `louis.sharma37@gmail.com` becomes `super_admin` (the migration sets it by email and fails loudly if no such profile exists);
  - other admins stay `admin`;
  - `sales` stays Sales Executive;
  - the owner re-labels the non-sales people once.

## 3b. Attendance settings: managed by the Super Admin in the web console

Owner's decision (2026-09-19): every input the module needs is a **setting that only the Super Admin changes**, on the console at **Attendance → Settings**. Admins and everyone else can see the rules that apply to them but cannot change them. The module ships with the defaults below, so nothing waits on these answers; they can be changed at any time, and each change is recorded in the audit trail with who changed it and when.

| Group | Setting | Ships with |
|---|---|---|
| Sites | Office locations: name, map pin, radius | None until set. The Uttam Nagar factory is suggested first, at 150 m |
| Sites | Must be inside the fence to clock in | On |
| Shift | Start and end time | 09:30 to 18:30 |
| Shift | Weekly off | Sunday |
| Shift | Saturday | Full day (option: half day) |
| Shift | Grace period | 15 min |
| Rules | Late penalty | 3 lates a month = 0.5 day |
| Rules | Half day / absent below | 4 h 30 m / 2 h |
| Rules | Auto clock-out after shift end | 4 h, marked as missed punch |
| Rules | Corrections allowed a month | 3 |
| People | Attendance mode per person (office or field) | From the role: Sales Executive = field, others = office |
| People | Which sites each person may use | All sites |
| Leave | Leave types and yearly quota | EL 15, CL 7, SL 7 |
| Leave | Accrual, carry-forward, half-day, max in a row, certificate rule | As in the leave policy table |
| Leave | Comp-off expiry | 60 days |
| Leave | Sandwich rule | Off |
| Holidays | Holiday calendar for the year | 26 Jan, 15 Aug, 2 Oct pre-filled; festivals added by you |
| Privacy | Keep selfies for | 90 days |
| Privacy | Attendance notice text shown before the first clock-in | Pre-written, editable |

- **Changes apply going forward.** A change never rewrites a locked month. It reshapes unlocked days only after the Super Admin confirms a preview ("12 days in September will be recalculated").
- **Clock-in stays closed until at least one office location exists**, except for people in field mode. The phone says why ("Your office location has not been set up yet") instead of failing.
- **Storage:**
  - Sites and holidays are tables.
  - Shift, rules, leave policy and retention sit in an `attendance` block of `settings`.
  - Staff read it through the `settings_staff` view.
  - Every write goes through `is_super_admin()`.

## 4. Data model (migration `0032_attendance.sql`, then `0033_leave.sql`)

```
work_sites          id, name, lat, lng, radius_m (default 150), address, active
profiles  (+cols)   attendance_mode ('office'|'field'), site_ids uuid[],
                    joined_on date, weekly_off smallint[]  -- admin-only via profiles_protect
attendance_punches  id uuid (client-made, idempotent), user_id, kind ('in'|'out'),
                    at timestamptz (server now()), client_at, lat, lng, accuracy_m, mocked,
                    site_id, distance_m, inside bool, mode ('office'|'field'), note,
                    selfie_path, device jsonb, offline bool,
                    flags text[], review ('ok'|'flagged'|'accepted'|'rejected'),
                    reviewed_by, reviewed_at, review_note
attendance_days     user_id, day date (PK pair), first_in, last_out, worked_min,
                    status (P|HD|A|L|WO|H|OD|LOP|MP), late bool, leave_request_id,
                    flags text[], locked bool   -- computed, never typed by hand
regularisations     id, user_id, day, in_at, out_at, reason, status, decided_by, decided_at, note
holidays            id, day date, name, kind ('national'|'festival'|'optional'), active
attendance_months   month date PK, locked_by, locked_at
leave_types         code PK (EL|CL|SL|CO|LOP), name, annual, accrual ('monthly'|'upfront'|'earned'),
                    carry_max, half_day, max_run, doc_after_days, paid, expires_days
leave_ledger        id, user_id, type_code, delta numeric(5,1), reason
                    ('accrual'|'grant'|'taken'|'reversal'|'lapse'|'encash'|'adjust'), ref_id, at, by
                    -- balance = SUM(delta); every change is a row, so every balance is explainable
leave_requests      id, user_id, type_code, from_day, to_day, from_half ('full'|'first'|'second'),
                    to_half, days numeric (server-computed), reason, attachment_path,
                    status ('pending'|'approved'|'rejected'|'cancelled'), approver_id,
                    decided_at, decision_note
```

**RLS:** staff read and insert their own rows (`user_id = auth.uid()`); `attendance-admin` reads everything. **Nobody writes `attendance_punches`, `attendance_days` or `leave_ledger` directly**: only the RPCs below (security definer) do, which is what makes the server's checks binding.

## 5. Server logic (Postgres RPCs, security definer)

- **`attendance_punch(p_id, p_kind, p_lat, p_lng, p_accuracy, p_mocked, p_client_at, p_selfie_path, p_mode, p_note, p_offline)`**
  - Checks:
    - the caller is signed in and active;
    - the selfie object exists under the caller's folder;
    - the order is right (in, then out);
    - the nearest assigned site, the distance and the accuracy rule pass;
    - `mocked` is false;
    - the device clock is within 5 minutes of the server's;
    - the month is not locked.
  - Stamps `now()`, stores the flags, and recomputes the day.
  - Returns `{ status, distance_m, site, message }` for the phone to show.
  - Idempotent on `p_id`, so a retry or an offline sync can never double-punch.
  - **Phone-only by construction:** it refuses a punch without a selfie object in the caller's own folder and a location reading. The console has no UI that calls it.
- **`attendance_recompute_day(user, day)`**
  - Derives the status from punches, leave, holidays and the weekly off, applying grace, late, half-day and absent rules.
  - Called by every punch, regularisation and leave decision.
- **`regularise_request` / `regularise_decide`.**
- **`leave_apply(type, from, to, halves, reason, attachment)`**
  - Computes the days server-side: excludes weekly offs and holidays unless the sandwich rule is on.
  - Checks balance, overlap, `max_run`, notice and document rules.
- **`leave_decide(id, approve, note)`**
  - Super Admin or Admin; never the requester.
  - Writes `taken` to the ledger and recomputes the affected days.
  - `leave_cancel` reverses the ledger entry.
- **`attendance_lock_month(month)`** and **`attendance_month_export(month)`**. The export returns one row per person: payable days = P + WO + H + paid L + OD + 0.5 × HD, then LOP, lates, and CO earned.
- **Nightly job** (pg_cron at 23:55 IST, calling an `attendance-housekeeping` edge function, because Storage deletes must go through the API):
  - auto-close open punches as MP;
  - mark A / WO / H for anyone with no row;
  - monthly EL accrual on the 1st;
  - CO expiry and 31 Dec lapses;
  - selfies older than 90 days deleted.

The phone and console also compute distance and day status in a **shared pure module** (`Mobile/src/domain/attendance.ts` ⇄ `Admin/src/lib/attendance.js`, with a parity test like `pricing.test.mjs`). That is only so the screen can say "you are 340 m away" before anyone presses anything. The server's answer is the one that counts.

## 6. Phone (Ortex.Mobile) screens and flow

Entry point: an **Attendance card at the top of Home**, where the Clock In button lives. It is the most frequent action in the app, and one tap from launch. It also appears as a quick action. The five tabs stay as they are.

1. **Attendance home** (`Attendance`)
   - Live clock, greeting, today's shift.
   - One big **Clock In / Clock Out** control, slide-to-confirm (Jobber + Waymo).
   - Status strip: "On duty since 9:42 · Factory · 40 m" (Grab).
   - Today's punches as a timeline with selfie thumbnails.
   - Links: My attendance, Leave, Approvals (admins).
2. **First-run notice + permissions**: what is collected and why, retention, and who sees it (DPDP notice), then camera and location explained before the OS prompts (World App).
3. **Locating**: a map-less radius card (Lyft). The office circle and your dot are drawn as a diagram rather than a map, so no map SDK is needed; "Accuracy 18 m"; states:
   - inside;
   - outside by N m ("Switch to Field visit" if the person's mode allows);
   - weak GPS (Retry);
   - fake location detected (refused, with "Request correction").
4. **Selfie** (`AttendanceSelfie`, `expo-camera` front): dark canvas, oval, one line of guidance, shutter, retake (Wise / Veriff). Compressed to 640 px before upload.
5. **Confirm and result**: server-validated success, with the time from the server; or the flag reason in words. Haptic plus a One UI press animation.
6. **My attendance** (`AttendanceHistory`)
   - Month grid with a status colour per day and a floating legend (Bevel / Peerspace).
   - Month totals: present, late, leave, absent, LOP.
   - Pinned month switcher.
7. **Day detail** (`AttendanceDay`)
   - Punch timeline, each punch with its selfie, site, distance, accuracy and flags.
   - "Request correction" for MP, A or a wrong time.
8. **Leave home** (`Leave`)
   - Balance cards per type (available / taken / pending).
   - Upcoming leave, request history, holidays list.
9. **Apply leave** (`LeaveApply`, the Remote flow)
   - Type, then an inline range calendar with holidays and weekly offs marked, then half-day toggles.
   - The day count and the **balance after this request**, computed live.
   - Reason, optional certificate photo, submit, success sheet.
10. **Leave request detail**: an approval timeline (Revolut Business), with cancel while pending.
11. **Approvals** (Super Admin, Admin)
    - Pending leave and corrections as cards with Approve / Decline on the card (Remote).
    - Flagged punches with the selfie beside the location.

**Offline:** a punch taken with no network is queued, selfie included, with the device time. It syncs when the network returns and is flagged `offline` for review. This is a deliberate, narrow exception to the app's "writes are never queued" rule, made safe by the client-generated id.

**Notifications** (reusing the new daily and remote push work):
- "You have not clocked in" at shift start + grace;
- "Clock out?" at shift end;
- leave decided;
- a new request for approvers;
- a correction approved.

## 7. Web console (Ortex.Admin)

A new hub, **`/attendance`**, with a sidebar entry in a new "People" section. **It never marks attendance**: there is no clock-in on the web, and an admin cannot type a punch for someone. A missed or wrong punch is corrected through a regularisation the person requests on the phone and an admin approves (on either client).

| Tab | Who | What (reference) |
|---|---|---|
| **Today** | admin | KPIs: in, late, not in yet, on leave, field (Deputy); person × hours timeline (Square); flagged punches |
| **My attendance** | everyone | The same month grid and day detail as the phone, for staff at a desk |
| **Register** | admin | Month table, people × days with status codes, count tabs, exceptions in red, filters, Lock month, Export CSV/XLSX for payroll/Tally (Deputy Timesheets) |
| **Leave** | everyone / admin | Staff: balances + Apply. Admin: requests table with bulk approve, a "remaining if approved" drawer (Employment Hero, Deputy); team calendar "out today" (Workable) |
| **Corrections** | admin | The regularisation queue |
| **Settings** | admin | Sites with a map and radius slider (Klaviyo) and a "must be inside" toggle (Fresha); shift, grace and rules; leave types and policy; holiday calendar with enable toggles (Employment Hero); retention |

Plus an **Attendance** section on `/users/:id` (month summary and leave balances) and on the phone's `UserDetailScreen`. Also an **Insights → Attendance** tab: late trend, absence rate, leave usage.

## 8. Phased delivery

| Phase | Scope | Size |
|---|---|---|
| **0. Groundwork** | Owner decisions (§10); fix the phone `canAccess` bypass; add camera/location/manipulator packages and permissions, then a native rebuild; the employee notice text (shown in the app before the first clock-in, editable by the Super Admin; the public Privacy Policy is for website customers and stays as it is) | S |
| **1. Clock in/out** | `work_sites`, `attendance_punches`, the selfie bucket, the `attendance_punch` RPC; phone screens 1–5 and 7; console Today, My attendance and Settings → Sites | L |
| **2. Rules and register** | `attendance_days`, recompute, grace/late/HD/A, holidays, nightly job, regularisation, month lock and export; phone screen 6 plus corrections; console Register and Corrections | L |
| **3. Leave** | Leave types, ledger, accrual, apply/decide/cancel, sandwich option, team calendar; phone screens 8–11; console Leave tab; notifications | L |
| **4. Hardening** | Face-present check on the selfie, offline queue, reminders, Insights → Attendance, remote push for approvals, 90-day selfie purge verified | M |

Each phase ships on its own and is usable. Phase 1 alone replaces a paper register.

## 9. Testing

- **Pure rules** (distance, day status, late/HD, leave-day counting with holidays, weekly offs, halves and the sandwich rule; ledger balance): unit-tested on both sides, with a parity test between the phone and console copies.
- **RPCs:** SQL tests against a scratch schema:
  - a mock-location refusal;
  - an outside-fence flag;
  - clock skew;
  - idempotent retry;
  - a punch in a locked month;
  - leave that overlaps existing leave;
  - insufficient balance.
- **On a real Samsung**, inside the factory shed: measure actual accuracy before fixing the default radius.

## 10. Decisions

**Decided (2026-09-19):**
- All staff are on attendance, and it is marked only in the phone app.
- Roles: Super Admin (only `louis.sharma37@gmail.com`), Admin, Accounts, Sales Executive, Staff. No Manager; the Super Admin and Admins approve.
- Sites, shift, weekly off, grace, rules, per-person mode, leave policy, sandwich rule, holidays and selfie retention are **Super Admin settings in the web console** (§3b), shipped with defaults.

**Still to confirm:**
1. The Super Admin's sign-in email is `louis.sharma37@gmail.com` (the git account on this machine is `louis.sharma61@gmail.com`).
2. Fixing the phone's module-permission bypass in Phase 0 (recommended; proceeding unless told otherwise).
3. A labour consultant's check of the default leave table for the factory headcount.
