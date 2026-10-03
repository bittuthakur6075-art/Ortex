// Edge Function: admin-manage-user
//
// The privileged things an admin can do to an EXISTING console account, all of
// which need the service-role key (auth.admin.*) and so cannot happen in the
// browser. Creating an account is admin-create-user; this is everything after.
//
//   { action: "set-active",     id, active }            enable / disable a login
//   { action: "reset-password", id, password?, notify }  set a new password
//   { action: "delete",         id }                     remove the account (409 while it
//                                                         has attendance, leave or payroll rows)
//   { action: "set-companies",  id, companies }          the companies they work in (0075),
//                                                         Super Admin only; returns { companies }
//
// Callable ONLY by a signed-in, active admin. Two self-protection rules are
// enforced here rather than only in the UI, because the UI is not the security
// boundary: an admin may not disable and may not delete their own account —
// otherwise the last admin can lock everyone out of the console with one click.
//
// Deploy:  supabase functions deploy admin-manage-user

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, json } from "../_shared/http.ts"
import { checkCompanies, COMPANIES_SUPER_ADMIN_ONLY, OWNER_ONLY, requireStaff } from "../_shared/auth.ts"
import { consoleUrl, isMailerConfigured, sendMail } from "../_shared/mailer.ts"
import { passwordResetEmail } from "../_shared/emails.ts"

// Disabling is a ban with a very long duration — Supabase has no boolean for
// it. 100 years is "forever" for this purpose; re-enabling sets it back to "0".
const FOREVER = "876000h"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  try {
    const url = Deno.env.get("SUPABASE_URL")!
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const staff = await requireStaff(req, ["admin"], "Admin access required")
    if (staff instanceof Response) return staff

    const body = await req.json()
    const action = String(body?.action ?? "")
    const id = String(body?.id ?? "")
    if (!id) return json({ error: "User id is required" }, 400)

    const admin = createClient(url, service)
    const { data: target } = await admin
      .from("profiles").select("id, email, name, role, active, is_owner").eq("id", id).maybeSingle()
    if (!target) return json({ error: "That user no longer exists" }, 404)

    // Migrations 0032 and 0067, checked before any auth.admin call (a ban or a
    // password is not a profiles write, so the database cannot see it):
    //   the Owner can never be disabled or deleted, by anyone, and only the
    //   Owner resets their own password;
    //   only the Owner acts on another Super Admin;
    //   only a Super Admin acts on an Admin.
    if (target.is_owner) {
      if (action === "delete" || (action === "set-active" && !body?.active)) {
        return json({ error: "The Owner cannot be disabled or deleted." }, 400)
      }
      if (id !== staff.userId) return json({ error: "Only the Owner can change the Owner's account." }, 403)
    }
    if (target.role === "super_admin" && id !== staff.userId && !staff.isOwner) {
      return json({ error: OWNER_ONLY }, 403)
    }
    if (target.role === "admin" && staff.role !== "super_admin") {
      return json({ error: "Only the Super Admin can change an Admin's account" }, 403)
    }

    // ---- companies (0075) ---------------------------------------------------
    if (action === "set-companies" || body?.companies !== undefined) {
      if (staff.role !== "super_admin") return json({ error: COMPANIES_SUPER_ADMIN_ONLY }, 403)
      if (action !== "set-companies") return json({ error: 'Send companies with action "set-companies"' }, 400)
      const checked = await checkCompanies(admin, body?.companies)
      if (typeof checked === "string") return json({ error: checked }, 400)
      const { error } = await admin.from("profiles").update({ companies: checked }).eq("id", id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true, id, companies: checked })
    }

    // ---- enable / disable ---------------------------------------------------
    if (action === "set-active") {
      const active = Boolean(body?.active)
      if (!active && id === staff.userId) return json({ error: "You can't disable your own account" }, 400)

      // Both halves matter. profiles.active gates every RLS policy through
      // is_active_staff(), so a disabled user sees nothing; the auth ban stops
      // them signing in at all, including via the emailed one-time code.
      const { error: banErr } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? "0" : FOREVER })
      if (banErr) return json({ error: banErr.message }, 400)

      const { error: profErr } = await admin.from("profiles").update({ active }).eq("id", id)
      if (profErr) {
        await admin.auth.admin.updateUserById(id, { ban_duration: active ? FOREVER : "0" }) // put the ban back
        return json({ error: profErr.message }, 400)
      }
      return json({ ok: true, active })
    }

    // ---- reset password -----------------------------------------------------
    if (action === "reset-password") {
      const password = String(body?.password ?? "")
      if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400)

      const { error } = await admin.auth.admin.updateUserById(id, { password })
      if (error) return json({ error: error.message }, 400)

      // Every other session that user has open keeps working on its old access
      // token until it expires, so revoke them — a reset exists precisely for
      // the case where somebody else may be holding a session.
      try {
        await admin.auth.admin.signOut(id, "global")
      } catch {
        /* older platform builds lack this; the password change still stands */
      }

      let emailed = false
      let emailError: string | null = null
      if (body?.notify !== false && target.email) {
        if (!isMailerConfigured()) {
          emailError = "SMTP secrets are not set on this project (SMTP_HOST / SMTP_USER / SMTP_PASS)"
        } else {
          try {
            await sendMail({
              to: target.email,
              subject: "Your Ortex console password was reset",
              html: passwordResetEmail({ email: target.email, password, name: target.name ?? "", url: consoleUrl() }),
            })
            emailed = true
          } catch (e) {
            emailError = String((e as Error)?.message ?? e)
          }
        }
      }
      return json({ ok: true, emailed, emailError })
    }

    // ---- delete -------------------------------------------------------------
    if (action === "delete") {
      if (id === staff.userId) return json({ error: "You can't delete your own account" }, 400)

      // Each of these tables references auth.users ON DELETE CASCADE (migrations
      // 0034, 0036, 0040), so deleting the login would silently erase that
      // person's attendance, leave and payroll history. Refuse while any exists;
      // the console offers Deactivate instead, which keeps it all.
      const HISTORY: [string, string][] = [
        ["payslips", "payslips"],
        ["employees", "a payroll employee record"],
        ["loans", "loans"],
        ["reimbursement_claims", "expense claims"],
        ["attendance_punches", "attendance punches"],
        ["attendance_days", "attendance days"],
        ["regularisations", "attendance corrections"],
        ["leave_requests", "leave requests"],
        ["leave_ledger", "leave balance entries"],
      ]
      const found: string[] = []
      for (const [table, label] of HISTORY) {
        const { count, error } = await admin.from(table).select("user_id", { count: "exact", head: true }).eq("user_id", id)
        if (error) return json({ error: `Could not check ${label}: ${error.message}` }, 500)
        if (count) found.push(label)
      }
      if (found.length) {
        return json({
          error: `This account has ${found.join(", ")}. Deleting it would erase them for good, so deactivate the account instead.`,
          hasRecords: true,
        }, 409)
      }

      // Strip access first. If the auth delete then fails for any reason, the
      // account is left with no role and no modules rather than fully powered.
      await admin.from("profiles").update({ active: false, role: "sales", modules: [] }).eq("id", id)

      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) return json({ error: error.message }, 400)

      // profiles.id references auth.users(id) on delete cascade (migration
      // 0001), so the profile row goes with it. Delete it explicitly anyway in
      // case a restore or an older environment left the constraint off.
      await admin.from("profiles").delete().eq("id", id)
      return json({ ok: true })
    }

    return json({ error: `Unknown action "${action}"` }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
