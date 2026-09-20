# Releasing Ortex.Mobile from a new PC

The field-sales app updates itself: a phone reads `android/latest.json` from the
public `app-releases` bucket and offers, or forces, the build named there. That
only works while every build is signed with **the same release key**. Android
refuses to replace an installed app with one signed by a different key, and the
only way out is for all reps to uninstall Ortex Sales and install again.

So the whole of this guide is really one rule:

> **Never generate a new signing key to get a release out.** Fetch the existing
> one from the PC that shipped the last build. A new key costs the whole team a
> reinstall, and it has already happened twice (2026-09-14 and 2026-09-18).

The key in use since 1.3.0 (published 2026-09-19) has SHA-256
`A1:81:74:35:6E:B2:9A:69:8A:93:6E:45:05:7D:53:AD:FF:A8:B0:DD:7D:66:98:14:1F:5B:35:38:FB:70:79:AE`.
Check any APK with `apksigner verify --print-certs <file.apk>`.

## What a clone does not give you

`git clone` gets you the source and nothing else. Every file below is
gitignored, and the build is wrong or impossible without it. Copy all five from
the PC that built the last release.

| File | Where it goes | What happens without it |
|---|---|---|
| `android/app/ortex-release.keystore` | `Ortex.Mobile/android/app/` | Gradle silently signs with the **debug** key and every phone fails with "App not installed". `release-android.mjs` refuses the build, which is the safety net. |
| The four `ORTEX_*` lines of `gradle.properties` | `C:\Users\<you>\.gradle\gradle.properties` | Same as above. All four are needed: `ORTEX_STORE_FILE`, `ORTEX_STORE_PASSWORD`, `ORTEX_KEY_ALIAS`, `ORTEX_KEY_PASSWORD`. |
| `.env` | `Ortex.Mobile/` | No `SUPABASE_URL` or anon key. The app builds but cannot sign anyone in, and the release script cannot find the project. |
| `.env.release` | `Ortex.Mobile/` | No `SUPABASE_SERVICE_ROLE_KEY`, so nothing can be uploaded. `release:setup` can refetch this one through the logged-in Supabase CLI. |
| `google-services.json` | `Ortex.Mobile/android/app/` | **Fails silently.** `build.gradle` applies the Google Services plugin only when the file is present, so the build succeeds and ships with no remote push: reps lose server-sent lead alerts and keep only the ones the running app posts itself. |

The keystore backup normally lives in `Documents\Ortex-signing` as well, written
by `npm run release:setup`. Keep a third copy somewhere that survives a PC, such
as a password manager or the company drive.

Move the keystore privately: a password manager, or a zip to yourself. Anyone
holding it and the four passwords can sign an APK that installs as Ortex Sales
over the real one. Do not put it in a team chat.

## Toolchain

* **Node** 20 or newer (`node -v`), which brings npm.
* **JDK 17**. Android Studio's bundled JBR counts, and `release-setup.mjs`
  already looks for `keytool` inside it.
* **Android SDK**, with `ANDROID_HOME` set. Installing Android Studio covers
  this and the JDK in one go.

## Releasing

```bash
cd Ortex.Mobile
git pull                                # make sure no commits are stranded on the old PC
npm install
npm run release:setup                   # ONLY after the keystore is in place
npm version patch                       # or minor/major. This is the one version.
# then add a release at the top of src/constants/whatsNew.ts
npm run release:android -- --required   # omit --required to merely offer the update
```

`npm version` moves `package.json` alone; `android/app/build.gradle` reads it for
`versionName` and derives `versionCode` as major x 10000 + minor x 100 + patch,
so 1.3.3 becomes 10303. Minor and patch must stay under 100.

`--required` writes `minVersion` into the manifest, so a phone below that version
can only see the update screen until it updates. Without it the phone offers the
update once a day and the rep can dismiss it.

The script then:

1. refuses to run unless release signing is really configured,
2. deletes `android/app/build/generated/{assets,res}/react` and builds ARM-only
   (`armeabi-v7a,arm64-v8a`), because Gradle otherwise ships the **previous** JS
   bundle when only `package.json` or `.env` changed, and because the x86 slices
   would push the APK past the 50 MB upload cap on Supabase's free plan,
3. refuses an APK whose aapt2 `versionName` differs from `package.json`, and any
   version not higher than the one already published,
4. uploads `android/ortex-sales-<version>.apk` to the `app-releases` bucket and
   rewrites `android/latest.json`.

The APK is left at `Ortex.Mobile/android/ortex-sales-<version>.apk`. That is the
file to hand anyone who needs to install by sideloading.

## Size budget

Keep the APK under **50 MB**; that is the Supabase free-plan upload limit, and
above it in-app updates stop working. It was 47.6 MB at 1.3.0. After adding any
native library, check with `unzip -l` over the release APK.

## If the key really is lost

Only then:

1. `npm run release:setup` creates a new keystore from the four `ORTEX_*` values
   and backs it up. It leaves an existing keystore alone, so it is safe to run
   after copying the real one in.
2. Say so in `src/constants/whatsNew.ts`, in the release's `summary`, in the
   words a rep needs: uninstall Ortex Sales, then install again from the link
   the admin sends. The 1.3.1 and 1.3.2 entries are the pattern.
3. Send the APK round by hand. No phone can take this one as an update.
4. Back the new key up in three places before shipping anything else.

## Related

* `docs/guides/PUSH_SETUP.md`, Firebase and the server-sent alerts.
* `Ortex.Mobile/scripts/release-android.mjs` and `release-setup.mjs`, which carry
  the same reasoning in their headers.
