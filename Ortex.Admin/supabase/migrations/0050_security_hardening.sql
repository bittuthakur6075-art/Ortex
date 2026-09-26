-- 0050: security hardening from the 2026-09-26 audit.
--
-- Each block closes one gap where the database allowed more than the console
-- does. Nothing here deletes data. Plain drop/create, safe to run twice.

-- ---- 1. The audit log is read per module ---------------------------------------------
-- 0023 let any active staff read every row, and a row carries the FULL doc of
-- invoices, customers, quotations and payments on insert/delete: a "staff"
-- (attendance-only) login could read the company's books through it. Now a row
-- is readable by an admin, or by someone who may open that table's module.
create or replace function public.audit_can_read(p_table text)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_admin() or case p_table
    when 'products'          then public.has_module_access('products')
    when 'categories'        then public.has_module_access('categories')
    when 'work'              then public.has_module_access('work')
    when 'customers'         then public.has_module_access('customers')
    when 'enquiries'         then public.has_module_access('enquiries') or public.has_module_access('voice-leads')
    when 'leads'             then public.has_module_access('enquiries')
    when 'quotations'        then public.has_module_access('quotations')
    when 'invoices'          then public.has_module_access('invoices')
    when 'payments'          then public.has_module_access('payments')
    when 'social'            then public.has_module_access('social')
    when 'telecaller_jobs'   then public.has_module_access('telecaller')
    else false  -- automation_rules, message_templates and anything new: admins only
  end;
$$;
revoke all on function public.audit_can_read(text) from public, anon;
grant execute on function public.audit_can_read(text) to authenticated;

drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log
  for select to authenticated
  using (public.is_active_staff() and public.audit_can_read(table_name));

-- ---- 2. Profiles: only the Super Admin (or the service role) creates or deletes -----
-- 0002's FOR ALL policy let an Admin delete a colleague's profile and insert it
-- back with role 'admin', around "only the Super Admin grants admin". Accounts
-- are created and deleted by admin-create-user / admin-manage-user, which use
-- the service role and bypass RLS; admins still update (modules, active) as
-- before, under the 0032 trigger.
drop policy if exists profiles_admin_write on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists profiles_owner_insert on public.profiles;
create policy profiles_owner_insert on public.profiles
  for insert to authenticated
  with check (public.is_super_admin());
drop policy if exists profiles_owner_delete on public.profiles;
create policy profiles_owner_delete on public.profiles
  for delete to authenticated
  using (public.is_super_admin());

-- ---- 3. Push devices: update only your own row ---------------------------------------
-- `using (true)` let anyone re-point a colleague's device to themselves, so
-- that colleague's pushes stopped. register_push_device (0031) still claims a
-- token that changed hands.
drop policy if exists push_devices_own_update on public.push_devices;
create policy push_devices_own_update on public.push_devices
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- 4. Website analytics: admins read and manage, anon inserts small rows -------
-- The console shows Insights to admins only; the table let every staff role
-- read and delete it.
drop policy if exists staff_all_activities on public.user_activities;
create policy staff_all_activities on public.user_activities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists staff_all_event_logs on public.event_logs;
create policy staff_all_event_logs on public.event_logs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists anon_insert_activities on public.user_activities;
create policy anon_insert_activities on public.user_activities
  for insert to anon with check (pg_column_size(doc) < 8192);
drop policy if exists anon_insert_event_logs on public.event_logs;
create policy anon_insert_event_logs on public.event_logs
  for insert to anon with check (pg_column_size(doc) < 8192);

-- ---- 5. Company settings: admins read, only the Super Admin writes ---------------
-- The console's Settings page is Super Admin only; the table let any Admin
-- rewrite integration keys with a direct PATCH.
drop policy if exists admin_settings on public.settings;
drop policy if exists admin_settings_read on public.settings;
create policy admin_settings_read on public.settings
  for select to authenticated using (public.is_admin());
drop policy if exists owner_settings_write on public.settings;
create policy owner_settings_write on public.settings
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- ---- 6. Website enquiries: bounded, and they never overwrite a customer --------------
-- Anon inserts had no size limit. 32 KB fits the largest quote-calculator order
-- with room to spare.
drop policy if exists anon_insert_enquiries on public.enquiries;
create policy anon_insert_enquiries on public.enquiries
  for insert to anon
  with check (
    (doc->>'status' = 'new') and
    (doc->'starred' is null or doc->>'starred' = 'false') and
    (doc->>'owner' is null or doc->>'owner' = '') and
    (doc->>'quotationId' is null) and
    pg_column_size(doc) < 32768 and
    length(coalesce(doc->'customer'->>'name', '')) <= 200 and
    length(coalesce(doc->'customer'->>'email', '')) <= 254 and
    length(coalesce(doc->'customer'->>'phone', '')) <= 40 and
    length(coalesce(doc->>'message', '')) <= 8000
  );

-- 0029's upsert_customer_from filled a matched customer's blank GSTIN, state
-- code and address from ANY enquiry. From an anonymous website row that let
-- anyone who knows a customer's email plant a GSTIN or state code (IGST vs
-- CGST on the next invoice). An anonymous row still creates a NEW customer with
-- everything it gave; it only stops filling those three fields on an existing one.
create or replace function public.upsert_customer_from(c jsonb, origin text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name    text := trim(coalesce(c->>'name', ''));
  v_company text := trim(coalesce(c->>'company', ''));
  v_email   text := lower(trim(coalesce(c->>'email', '')));
  v_phone   text := public.national_digits(c->>'phone');
  v_address text := trim(coalesce(c->>'address', c->>'city', ''));
  v_gstin   text := upper(trim(coalesce(c->>'gstin', '')));
  v_state   text := trim(coalesce(c->>'stateCode', ''));
  v_trusted boolean := auth.uid() is not null or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  m_id  uuid;
  m_doc jsonb;
  patch jsonb := '{}'::jsonb;
begin
  if c is null or jsonb_typeof(c) <> 'object' then return null; end if;
  -- Filler Anu uses when a caller never gives a name. A copy of
  -- PLACEHOLDER_NAMES in Ortex.Mobile/src/domain/voice.ts: keep them in step.
  if lower(v_name) in ('customer','grahak','sir','madam','unknown','caller','test','testing',
                       'na','n/a','none','anonymous','user','client','aap','ji') then
    v_name := '';
  end if;
  -- A number shorter than a landline is a typo or a placeholder, not a key.
  if length(v_phone) < 8 then v_phone := ''; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := ''; end if;
  if v_name = '' and v_company = '' then return null; end if;
  if v_email = '' and v_phone = '' then return null; end if;

  perform pg_advisory_xact_lock(hashtext('ortex.upsert_customer_from'));

  if v_email <> '' then
    select id, doc into m_id, m_doc from public.customers
     where lower(trim(doc->>'email')) = v_email
     order by created_at limit 1;
  end if;
  if m_id is null and v_phone <> '' then
    select id, doc into m_id, m_doc from public.customers
     where public.national_digits(doc->>'phone') = v_phone
     order by created_at limit 1;
  end if;

  if m_id is not null then
    -- Fill blanks only. Tax and address details only from a signed-in source.
    if coalesce(trim(m_doc->>'name'), '')      = '' and v_name    <> '' then patch := patch || jsonb_build_object('name', v_name); end if;
    if coalesce(trim(m_doc->>'company'), '')   = '' and v_company <> '' then patch := patch || jsonb_build_object('company', v_company); end if;
    if coalesce(trim(m_doc->>'email'), '')     = '' and v_email   <> '' then patch := patch || jsonb_build_object('email', v_email); end if;
    if coalesce(trim(m_doc->>'phone'), '')     = '' and v_phone   <> '' then patch := patch || jsonb_build_object('phone', v_phone); end if;
    if v_trusted then
      if coalesce(trim(m_doc->>'address'), '')   = '' and v_address <> '' then patch := patch || jsonb_build_object('address', v_address); end if;
      if coalesce(trim(m_doc->>'gstin'), '')     = '' and v_gstin   <> '' then patch := patch || jsonb_build_object('gstin', v_gstin); end if;
      if coalesce(trim(m_doc->>'stateCode'), '') = '' and v_state   <> '' then patch := patch || jsonb_build_object('stateCode', v_state); end if;
    end if;
    if patch <> '{}'::jsonb then
      update public.customers set doc = doc || patch where id = m_id;
    end if;
    return m_id;
  end if;

  -- The shape newCustomer() gives both clients, plus where it came from.
  insert into public.customers (doc) values (jsonb_build_object(
    'name', v_name, 'company', v_company, 'email', v_email, 'phone', v_phone,
    'gstin', v_gstin, 'stateCode', v_state, 'address', v_address,
    'source', coalesce(nullif(trim(origin), ''), 'Lead')
  )) returning id into m_id;
  return m_id;
end $$;

-- ---- 7. Public photos: writing needs the module, listing needs a login -------------
-- Any active staff (even attendance-only) could overwrite or delete the product
-- photos the public website shows. Public buckets still serve every object by
-- URL without a select policy; the anon SELECT only let anyone LIST them
-- (every staff uid under avatars/, unapproved creatives under social-media/).
do $$
declare
  catalogue text := '(public.has_module_access(''products'') or public.has_module_access(''categories'') or public.has_module_access(''work''))';
begin
  execute 'drop policy if exists staff_upload_product_images on storage.objects';
  execute format('create policy staff_upload_product_images on storage.objects for insert to authenticated with check (bucket_id = %L and %s)', 'product-images', catalogue);
  execute 'drop policy if exists staff_update_product_images on storage.objects';
  execute format('create policy staff_update_product_images on storage.objects for update to authenticated using (bucket_id = %L and %s)', 'product-images', catalogue);
  execute 'drop policy if exists staff_delete_product_images on storage.objects';
  execute format('create policy staff_delete_product_images on storage.objects for delete to authenticated using (bucket_id = %L and %s)', 'product-images', catalogue);

  execute 'drop policy if exists staff_upload_social_media on storage.objects';
  execute 'create policy staff_upload_social_media on storage.objects for insert to authenticated with check (bucket_id = ''social-media'' and public.has_module_access(''social''))';
  execute 'drop policy if exists staff_update_social_media on storage.objects';
  execute 'create policy staff_update_social_media on storage.objects for update to authenticated using (bucket_id = ''social-media'' and public.has_module_access(''social''))';
  execute 'drop policy if exists staff_delete_social_media on storage.objects';
  execute 'create policy staff_delete_social_media on storage.objects for delete to authenticated using (bucket_id = ''social-media'' and public.has_module_access(''social''))';

  execute 'drop policy if exists public_read_product_images on storage.objects';
  execute 'create policy public_read_product_images on storage.objects for select to authenticated using (bucket_id = ''product-images'')';
  execute 'drop policy if exists public_read_social_media on storage.objects';
  execute 'create policy public_read_social_media on storage.objects for select to authenticated using (bucket_id = ''social-media'')';
  execute 'drop policy if exists public_read_avatars on storage.objects';
  execute 'create policy public_read_avatars on storage.objects for select to authenticated using (bucket_id = ''avatars'')';
end $$;

-- ---- 8. Definer helpers anon had no business calling ---------------------------------
revoke execute on function public.anu_team_of(uuid) from public, anon;
revoke execute on function public.anu_team_conversation(text) from public, anon;
revoke execute on function public.attendance_is_off_day(date) from public, anon;
revoke execute on function public.attendance_month_locked(date) from public, anon;
grant execute on function public.anu_team_of(uuid) to authenticated;
grant execute on function public.anu_team_conversation(text) to authenticated;
grant execute on function public.attendance_is_off_day(date) to authenticated;
grant execute on function public.attendance_month_locked(date) to authenticated;

-- ---- 9. A rate limiter for the public edge functions ---------------------------------
-- One counter per (key, window). Called only by edge functions with the service
-- role; no policy, so no client can read or reset it.
create table if not exists public.rate_limits (
  key text not null,
  bucket timestamptz not null,
  hits integer not null default 0,
  primary key (key, bucket)
);
alter table public.rate_limits enable row level security;

-- True while `p_key` is within `p_max` hits in the current `p_window_sec`
-- window; each call counts as one hit.
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_sec integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_bucket timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_sec) * p_window_sec);
  v_hits integer;
begin
  insert into public.rate_limits as r (key, bucket, hits) values (left(p_key, 200), v_bucket, 1)
  on conflict (key, bucket) do update set hits = r.hits + 1
  returning hits into v_hits;
  -- Housekeeping, now and then: yesterday's windows are no longer needed.
  if random() < 0.01 then
    delete from public.rate_limits where bucket < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end $$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
