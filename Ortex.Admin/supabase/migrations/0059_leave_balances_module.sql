-- 0059: adjusting leave balances becomes a module, `leave-balances`.
--
-- Until now only the Super Admin could adjust a balance (leave_adjust, 0036).
-- Owner's decision 2026-09-30: the Super Admin chooses WHICH Admins may manage
-- leave balances too. So the module starts with the Admin role switched OFF
-- (module_controls.admin_access = false): nobody but the Super Admin has it
-- until the Super Admin ticks a person on Modules -> People (or the Admin
-- column on Modules -> Roles). has_module_access() is true for the Super Admin.
--
-- A balance is still the sum of its ledger, never a stored number, so every
-- change stays a ledger row with the person who made it and why:
--   add / remove / set      leave_adjust (set is a computed adjust)
--   undo an adjustment      leave_undo_adjust, a reversal row pointing at it
-- Nobody but the Super Admin changes their OWN balance.

insert into public.module_controls (key, enabled, admin_access)
values ('leave-balances', true, false)
on conflict (key) do nothing;

-- Whoever manages balances needs to read everyone's ledger.
drop policy if exists leave_ledger_read on public.leave_ledger;
create policy leave_ledger_read on public.leave_ledger for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_module_access('attendance-team')
    or public.has_module_access('leave-balances')
  );

create or replace function public.leave_adjust(p_user uuid, p_type text, p_delta numeric, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_module_access('leave-balances') then
    raise exception 'You do not have access to manage leave balances. The Super Admin can give it on the Modules page.';
  end if;
  if p_user = auth.uid() and not public.is_super_admin() then
    raise exception 'Ask the Super Admin to change your own leave balance.';
  end if;
  if p_delta = 0 or abs(p_delta) > 60 then
    raise exception 'Adjust by between 0.5 and 60 days.';
  end if;
  if length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Say why (for example: opening balance, comp-off for 2 Oct).';
  end if;
  if not exists (select 1 from public.leave_types where code = p_type and accrual <> 'none') then
    raise exception 'That leave type has no balance.';
  end if;
  insert into public.leave_ledger (user_id, type_code, delta, reason, note, by_user)
  values (p_user, p_type, round(p_delta * 2) / 2, case when p_delta > 0 and p_type = 'CO' then 'grant' else 'adjust' end,
          trim(p_note), auth.uid());
end $$;

/** Undo one manual adjustment or grant: a reversal row that points at it. */
create or replace function public.leave_undo_adjust(p_entry uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  e record;
begin
  if not public.has_module_access('leave-balances') then
    raise exception 'You do not have access to manage leave balances. The Super Admin can give it on the Modules page.';
  end if;
  select * into e from public.leave_ledger where id = p_entry;
  if not found then
    raise exception 'That ledger entry no longer exists.';
  end if;
  if e.reason not in ('adjust', 'grant') then
    raise exception 'Only a manual adjustment can be undone. Accruals and leave taken follow their own rules.';
  end if;
  if e.user_id = auth.uid() and not public.is_super_admin() then
    raise exception 'Ask the Super Admin to change your own leave balance.';
  end if;
  if exists (select 1 from public.leave_ledger where ref_id = p_entry and reason = 'reversal') then
    raise exception 'That adjustment has already been undone.';
  end if;
  insert into public.leave_ledger (user_id, type_code, delta, reason, ref_id, note, by_user)
  values (e.user_id, e.type_code, -e.delta, 'reversal', e.id,
          'Undone: ' || coalesce(nullif(trim(coalesce(p_note, '')), ''), coalesce(e.note, 'adjustment')), auth.uid());
end $$;

revoke all on function public.leave_undo_adjust(uuid, text) from public, anon;
grant execute on function public.leave_undo_adjust(uuid, text) to authenticated;
