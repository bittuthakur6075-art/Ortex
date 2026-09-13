-- 0027_profile_quotation_defaults.sql
--
-- A staff member's own starting text for new quotations: payment terms, terms
-- and conditions, and notes.
--
-- The field-sales app (Ortex.Mobile, Profile > Quotation defaults) lets a rep
-- set these, and every NEW quotation they start is seeded with them. They are
-- personal on purpose: the company's terms live in the `settings` singleton,
-- which only an admin writes (0007 `admin_settings`; staff read it through the
-- `settings_staff` view, 0024), so a rep cannot and should not change them.
--
-- The app first kept these on the handset only, which meant a new or second
-- phone started from the company defaults again. This column moves them onto
-- the account so they follow the person to any device.
--
-- Shape: { "paymentTerms": string | null, "terms": string | null,
--          "notes": string | null }
-- A missing or null key means "not set": terms then fall back to the company's
-- default terms, payment terms and notes to empty. An empty string is a real
-- "start blank" choice. The app writes all three keys; the check below only
-- insists on an object, so a later key does not need another migration.
--
-- ACCESS. Like avatar_url (0019) and phone (0021), `quotation_defaults` is NOT
-- in the list protect_profile_privileges() (0003/0008) forces back to its old
-- value, so the existing profiles_self_update policy lets a user set their own,
-- and only their own. profiles_self_read (0002) keeps it readable by its owner
-- and by admins only. It is not added to the staff_directory view (0023/0026),
-- which stays an explicit allow-list of id, name, avatar and role.
--
-- SIZE. Terms and conditions run to a few paragraphs; 16 KB is generous for
-- that and stops the column being used as general storage from a client.

alter table public.profiles
  add column if not exists quotation_defaults jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_quotation_defaults_shape;

alter table public.profiles
  add constraint profiles_quotation_defaults_shape
  check (
    jsonb_typeof(quotation_defaults) = 'object'
    and octet_length(quotation_defaults::text) <= 16384
  );

comment on column public.profiles.quotation_defaults is
  'The user''s own payment terms, T&C and notes for new quotations. Null/missing key = fall back to company settings. Set by the user (profiles_self_update); see 0027.';
