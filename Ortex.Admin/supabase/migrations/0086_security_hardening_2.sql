-- 0086: security hardening, round two (audit of 2026-10-24).
--
--   1. Staff loses the `payroll` grant. With it, every Staff login (the gate
--      kiosk included) passed is_payroll(): full PAN and bank numbers, every
--      payslip, salary revisions. `attendance-team` and `products` stay
--      (owner's decisions; `products` is read-only for Staff since 0054).
--   2. The 0005-era policies are gone. Production still had them (0008's
--      replacements were missing there), so any signed-in user could read and
--      delete website analytics, read and rewrite automation rules, templates
--      and generated messages, and anyone could insert unbounded rows into
--      whatsapp_logs / ai_messages. Analytics stay admin-only (0050) with the
--      anonymous 8 KB insert; the four automation tables are recreated on the
--      `insights` module (0061 retired `automation`, so the 0008 policies
--      named a key nobody can hold). automation-engine writes with the service
--      role and is unaffected. Nothing anonymous reads rules or templates.
--   3. `leads` was scoped to a `leads` module that does not exist, so only
--      admins ever saw it. It follows `enquiries` now, still per company.
--   4. An Admin no longer reaches payroll (or another company, or someone's
--      chats) through an account they control:
--        * only the Super Admin grants payroll, leave-balances or a module
--          whose switch keeps it from Admins, by modules or by role;
--        * an Admin cannot deactivate, reset or delete someone holding one of
--          those, or someone who works in none of the Admin's companies.
--      The profile trigger enforces it for direct writes; the two user
--      functions ask admin_manage_refusal() / admin_grant_refusal(), because a
--      password reset or ban is not a profiles write.
--   5. chat_send is throttled: 30 messages a minute per person.
--   6. staff_directory answers active staff only (0026 meant it; the view
--      never checked). Every row stays, so a leaver's edits still show a name.
--   7. settings_staff carries `notifications` (no secrets in it), so staff
--      honour "email off" instead of the defaults.
--   8. settings_mirror_ortex is dropped (0075 phase 2). The console writes
--      companies.doc itself and the phone never writes settings; the mirror
--      only let an unrelated settings save overwrite Ortex's company block
--      (logo and addresses) with a stale copy.
--   9. Quotations and invoices get money rules in the database: every line's
--      quantity above 0, rate not negative, discount 0-100, the grand total
--      finite and below 1e10, the doc under 512 KB. Checked only when the
--      lines, totals or extra discount change, so old rows are never
--      re-judged by an unrelated update.
--
-- Idempotent; nothing here can fail on existing data.

-- ---- 1. Staff loses payroll ------------------------------------------------------------

update public.role_permissions
   set modules = coalesce((select jsonb_agg(m) from jsonb_array_elements(modules) m where m <> '"payroll"'::jsonb), '[]'::jsonb),
       updated_at = now()
 where role = 'staff' and modules @> '["payroll"]'::jsonb;

-- ---- 2. leftover permissive policies ---------------------------------------------------

drop policy if exists authenticated_all_activities  on public.user_activities;
drop policy if exists authenticated_all_event_logs  on public.event_logs;
drop policy if exists authenticated_all_whatsapp    on public.whatsapp_logs;
drop policy if exists anon_insert_whatsapp          on public.whatsapp_logs;
drop policy if exists authenticated_all_ai_messages on public.ai_messages;
drop policy if exists anon_insert_ai_messages       on public.ai_messages;
drop policy if exists admin_all_rules               on public.automation_rules;
drop policy if exists anon_select_rules             on public.automation_rules;
drop policy if exists admin_all_templates           on public.message_templates;
drop policy if exists anon_select_templates         on public.message_templates;

-- Analytics: admins read and manage, anon inserts small rows (0050). Recreated
-- in case 0050's pair is missing too.
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

-- ---- 3. policies on retired or missing module keys -------------------------------------

drop policy if exists staff_automation_rules on public.automation_rules;
create policy staff_automation_rules on public.automation_rules
  for all to authenticated
  using (public.has_module_access('insights')) with check (public.has_module_access('insights'));
drop policy if exists staff_message_templates on public.message_templates;
create policy staff_message_templates on public.message_templates
  for all to authenticated
  using (public.has_module_access('insights')) with check (public.has_module_access('insights'));
drop policy if exists staff_whatsapp_logs on public.whatsapp_logs;
create policy staff_whatsapp_logs on public.whatsapp_logs
  for all to authenticated
  using (public.has_module_access('insights')) with check (public.has_module_access('insights'));
drop policy if exists staff_ai_messages on public.ai_messages;
create policy staff_ai_messages on public.ai_messages
  for all to authenticated
  using (public.has_module_access('insights')) with check (public.has_module_access('insights'));

drop policy if exists staff_leads on public.leads;
create policy staff_leads on public.leads
  for all to authenticated
  using (public.has_module_access('enquiries') and public.has_company_access(company_id))
  with check (public.has_module_access('enquiries') and public.has_company_access(company_id));

-- ---- 4. what only the Super Admin may grant --------------------------------------------

-- Modules an Admin may neither grant nor touch the holder of: payroll,
-- leave balances, and every module whose switch keeps it from Admins (0053).
create or replace function public.super_admin_only_modules()
returns text[] language sql stable security definer set search_path = public as $$
  select array['payroll', 'leave-balances']
         || coalesce(array(select key from public.module_controls where admin_access = false), '{}');
$$;
revoke all on function public.super_admin_only_modules() from public, anon;
grant execute on function public.super_admin_only_modules() to authenticated, service_role;

-- Which of those a role plus a personal list carries (hidden ones excluded).
create or replace function public.held_super_admin_modules(p_role text, p_modules jsonb, p_hidden jsonb default '[]'::jsonb)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array(
    select k from unnest(public.super_admin_only_modules()) k
     where (coalesce(p_modules, '[]'::jsonb) ? k
            or coalesce((select r.modules from public.role_permissions r where r.role = p_role), '[]'::jsonb) ? k)
       and not coalesce(p_hidden, '[]'::jsonb) ? k
  ), '{}');
$$;
revoke all on function public.held_super_admin_modules(text, jsonb, jsonb) from public, anon;
grant execute on function public.held_super_admin_modules(text, jsonb, jsonb) to authenticated, service_role;

-- NULL when p_actor may deactivate, reset or delete p_target; else the reason.
-- The Owner and Super Admin rules stay in the functions and the trigger.
create or replace function public.admin_manage_refusal(p_actor uuid, p_target uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  a public.profiles;
  t public.profiles;
begin
  select * into a from public.profiles where id = p_actor;
  select * into t from public.profiles where id = p_target;
  if a.id is null or t.id is null then return null; end if;
  if a.role = 'super_admin' or p_actor = p_target then return null; end if;
  if cardinality(public.held_super_admin_modules(t.role, t.modules, t.modules_hidden)) > 0 then
    return 'Only the Super Admin can change the account of someone with payroll or other Super Admin-only access.';
  end if;
  if not (coalesce(a.companies, '[]'::jsonb) ?| array(select jsonb_array_elements_text(coalesce(t.companies, '[]'::jsonb)))) then
    return 'You can only manage people who work in one of your companies.';
  end if;
  return null;
end $$;
revoke all on function public.admin_manage_refusal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_manage_refusal(uuid, uuid) to service_role;

-- NULL when p_actor may create someone with this role and these modules.
create or replace function public.admin_grant_refusal(p_actor uuid, p_role text, p_modules jsonb)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  a public.profiles;
  held text[];
begin
  select * into a from public.profiles where id = p_actor;
  if a.id is null or a.role = 'super_admin' then return null; end if;
  held := public.held_super_admin_modules(p_role, p_modules);
  if cardinality(held) > 0 then
    return format('Only the Super Admin can give someone %s.', array_to_string(held, ', '));
  end if;
  return null;
end $$;
revoke all on function public.admin_grant_refusal(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_grant_refusal(uuid, text, jsonb) to service_role;

-- The profile trigger (latest 0075), with the Admin branch tightened.
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  role_change boolean := coalesce(current_setting('ortex.role_change', true), '') = 'on';
  service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  me uuid := auth.uid();
  owner_call boolean := public.is_owner();
  privileged text[] := array['admin', 'super_admin'];
  gained text[];
  refusal text;
begin
  -- (a) The Owner, for EVERY caller, the service role and the Owner included.
  if not role_change then
    if tg_op = 'DELETE' then
      if old.is_owner then
        raise exception 'The Owner''s account cannot be deleted.';
      end if;
    elsif tg_op = 'INSERT' then
      if new.is_owner then
        raise exception 'The Owner cannot be changed.';
      end if;
    else
      if new.is_owner is distinct from old.is_owner then
        raise exception 'The Owner cannot be changed.';
      end if;
      if old.is_owner and (new.role is distinct from 'super_admin' or new.active is not true) then
        raise exception 'The Owner cannot be demoted or deactivated.';
      end if;
    end if;
  end if;

  if role_change then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- (c) Nobody signed in but the Owner changes the Owner's row.
  if me is not null and tg_op = 'UPDATE' and old.is_owner and not owner_call
     and new is distinct from old then
    raise exception 'Only the Owner can change the Owner''s account.';
  end if;

  -- (b) Only the Owner makes, removes, deactivates or deletes a Super Admin.
  -- The service role passes: its edge functions check the caller is the Owner.
  if not (service or owner_call) then
    if (tg_op = 'DELETE' and old.role = 'super_admin')
       or (tg_op = 'INSERT' and new.role = 'super_admin')
       or (tg_op = 'UPDATE' and (old.role = 'super_admin') is distinct from (new.role = 'super_admin'))
       or (tg_op = 'UPDATE' and old.role = 'super_admin' and new.active is distinct from old.active) then
      raise exception '%', public.owner_only_message();
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Trusted from here: the service role (its functions check the caller).
  if service or tg_op = 'INSERT' then
    return new;
  end if;

  if public.is_super_admin() then
    return new;
  end if;

  -- 0075: the companies someone works in are the Super Admin's to set.
  if new.companies is distinct from old.companies then
    raise exception 'Only the Super Admin can change which companies someone works in.';
  end if;

  if public.is_admin() then
    -- An Admin manages Accounts, Sales and Staff, not other admins.
    if new.role = any (privileged) and new.role is distinct from old.role then
      raise exception 'Only the Super Admin can give someone the % role.', new.role;
    end if;
    if old.role = any (privileged) then
      new.role    := old.role;
      new.modules := old.modules;
      new.active  := old.active;
      new.email   := old.email;
      return new;
    end if;
    -- 0086: someone else's role, modules or login.
    if old.id is distinct from me
       and (new.role is distinct from old.role or new.modules is distinct from old.modules
            or new.active is distinct from old.active) then
      refusal := public.admin_manage_refusal(me, old.id);
      if refusal is not null then
        raise exception '%', refusal;
      end if;
      gained := array(
        select k from unnest(public.held_super_admin_modules(new.role, new.modules)) k
         where not k = any (public.held_super_admin_modules(old.role, old.modules))
      );
      if cardinality(gained) > 0 then
        raise exception 'Only the Super Admin can give someone %.', array_to_string(gained, ', ');
      end if;
    end if;
    return new;
  end if;

  -- Everyone else edits only their own harmless columns (0003).
  new.role    := old.role;
  new.modules := old.modules;
  new.active  := old.active;
  new.email   := old.email;
  return new;
end $$;

-- ---- 5. chat_send throttle -------------------------------------------------------------

-- On the row, so every path that posts as a person counts (chat_send,
-- chat_post_to_team). Bot posts (no sender) and the service role pass.
create or replace function public.chat_messages_throttle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sender_id is not null and new.sender_id = auth.uid()
     and not public.rate_limit_hit('chat:user:' || new.sender_id::text, 30, 60) then
    raise exception 'You are sending messages too fast. Wait a minute and try again.';
  end if;
  return new;
end $$;
revoke all on function public.chat_messages_throttle() from public, anon, authenticated;

drop trigger if exists chat_messages_throttle on public.chat_messages;
create trigger chat_messages_throttle before insert on public.chat_messages
  for each row execute function public.chat_messages_throttle();

-- ---- 6. staff_directory answers active staff only --------------------------------------

create or replace view public.staff_directory as
  select
    p.id,
    p.name,
    p.avatar_url,
    p.role,
    p.is_owner
  from public.profiles p
  where public.is_active_staff();
revoke all on public.staff_directory from anon;
grant select on public.staff_directory to authenticated;
comment on view public.staff_directory is
  'id -> name/avatar/role/is_owner for attribution and the Owner label, every person (leavers too) but only for an active staff caller (0086). Allow-list: never email, modules or active.';

-- ---- 7. settings_staff carries notifications -------------------------------------------

create or replace view public.settings_staff as
  select
    s.id,
    jsonb_build_object(
      -- No fallback to the global block: another company must never print Ortex's GSTIN.
      'company',   coalesce(case when c.id is null then s.doc -> 'company' else c.doc -> 'company' end, '{}'::jsonb),
      'tax',       coalesce(c.doc -> 'tax',       s.doc -> 'tax',       '{}'::jsonb),
      'numbering', coalesce(c.doc -> 'numbering', s.doc -> 'numbering', '{}'::jsonb),
      'quotation', coalesce(c.doc -> 'quotation', s.doc -> 'quotation', '{}'::jsonb),
      'documents', coalesce(c.doc -> 'documents', s.doc -> 'documents', '{}'::jsonb),
      -- 0086: who to email and whether to. Any key that looks like a credential is dropped.
      'notifications', coalesce((
        select jsonb_object_agg(e.key, e.value)
          from jsonb_each(case when jsonb_typeof(s.doc -> 'notifications') = 'object' then s.doc -> 'notifications' else '{}'::jsonb end) e
         where e.key !~* '(key|secret|token|password|pass)'
      ), '{}'::jsonb)
    ) as doc,
    greatest(s.updated_at, c.updated_at) as updated_at
  from public.settings s
  left join public.companies c on c.id = public.default_company_id()
  where public.is_active_staff();

revoke all on public.settings_staff from anon;
grant select on public.settings_staff to authenticated;

comment on view public.settings_staff is
  'The document blocks (company, tax, numbering, quotation, documents) of the caller''s default company, global settings where the company has none (never another company''s details), and notifications without credential-like keys (0086). Never integrations or telecaller.';

-- ---- 8. settings_mirror_ortex is retired -----------------------------------------------

drop trigger if exists settings_mirror_ortex on public.settings;
drop function if exists public.settings_mirror_ortex();

-- ---- 9. money rules on quotations and invoices -----------------------------------------

-- A JSON number, or a string holding one; NULL for anything else (blank, text, objects).
create or replace function public.json_num(v jsonb)
returns numeric language plpgsql immutable set search_path = public as $$
declare t text;
begin
  if v is null or jsonb_typeof(v) = 'null' then return null; end if;
  t := btrim(v #>> '{}');
  if jsonb_typeof(v) in ('number', 'string') and t ~ '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$' then
    return t::numeric;
  end if;
  return null;
end $$;

create or replace function public.document_money_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  l jsonb;
  i int := 0;
  q numeric;
  r numeric;
  d numeric;
  g numeric;
  what text := case tg_table_name when 'invoices' then 'invoice' else 'quotation' end;
begin
  if pg_column_size(new.doc) >= 524288 then
    raise exception 'This % is too large to save (over 512 KB).', what;
  end if;
  if tg_op = 'UPDATE'
     and (new.doc -> 'lines') is not distinct from (old.doc -> 'lines')
     and (new.doc -> 'totals') is not distinct from (old.doc -> 'totals')
     and (new.doc -> 'extraDiscountPercent') is not distinct from (old.doc -> 'extraDiscountPercent') then
    return new;
  end if;

  if new.doc ? 'lines' and jsonb_typeof(new.doc -> 'lines') not in ('array', 'null') then
    raise exception 'The % lines are not a list.', what;
  end if;
  if jsonb_typeof(new.doc -> 'lines') = 'array' then
    for l in select value from jsonb_array_elements(new.doc -> 'lines') loop
      i := i + 1;
      q := public.json_num(l -> 'quantity');
      if q is null or q <= 0 or q >= 1e9 then
        raise exception 'Line %: the quantity must be more than 0.', i;
      end if;
      if nullif(btrim(coalesce(l ->> 'rate', '')), '') is not null then
        r := public.json_num(l -> 'rate');
        if r is null or r < 0 or r >= 1e10 then
          raise exception 'Line %: the rate cannot be negative.', i;
        end if;
      end if;
      if nullif(btrim(coalesce(l ->> 'discountPercent', '')), '') is not null then
        d := public.json_num(l -> 'discountPercent');
        if d is null or d < 0 or d > 100 then
          raise exception 'Line %: the discount must be between 0 and 100%%.', i;
        end if;
      end if;
    end loop;
  end if;

  if nullif(btrim(coalesce(new.doc ->> 'extraDiscountPercent', '')), '') is not null then
    d := public.json_num(new.doc -> 'extraDiscountPercent');
    if d is null or d < 0 or d > 100 then
      raise exception 'The extra discount must be between 0 and 100%%.';
    end if;
  end if;

  if nullif(btrim(coalesce(new.doc #>> '{totals,grandTotal}', '')), '') is not null then
    g := public.json_num(new.doc #> '{totals,grandTotal}');
    if g is null or g < 0 or g >= 1e10 then
      raise exception 'The % total is not a valid amount.', what;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.document_money_guard() from public, anon, authenticated;

drop trigger if exists quotations_money_guard on public.quotations;
create trigger quotations_money_guard before insert or update of doc on public.quotations
  for each row execute function public.document_money_guard();
drop trigger if exists invoices_money_guard on public.invoices;
create trigger invoices_money_guard before insert or update of doc on public.invoices
  for each row execute function public.document_money_guard();
