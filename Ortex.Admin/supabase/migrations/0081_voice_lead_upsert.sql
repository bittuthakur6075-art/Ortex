-- 0081_voice_lead_upsert.sql
--
-- One voice call, one enquiry row. The website's voice assistant saves on every
-- capture_lead: a partial save once the name and number hold up, a complete one,
-- then a confirmed one after the read-back. Each was a new INSERT with a fresh
-- reference, so one call left three or four rows in the enquiries list, each
-- counted as a lead and matched to the customer again (0031's push fires on
-- insert only, so every row also rang the phones).
--
-- save_voice_lead(doc) inserts the call's first save and UPDATES that same row
-- on every later one. The site mints the reference once per conversation and
-- sends it with each save. Anyone may know a reference (it is read out to the
-- customer), so an update must also carry the row's `call.id`, a random UUID
-- only the caller's own browser holds, and is accepted only while the row is a
-- voice lead, still 'new' (staff have not picked it up) and under two hours old.
-- Anything else is refused with P0409 and the site starts a fresh row.
--
-- Only the fields a visitor supplies are replaced: customer, items,
-- productInterest, message, notes and call. Status, owner, star and every other
-- staff field stay as staff left them. A resumed call (same tab, within two
-- hours) keeps its row and records under its own recording path; the earlier
-- paths are kept in `call.recordings`.
--
-- The function is SECURITY DEFINER (anon cannot read or update enquiries), so it
-- repeats the bounds of the anonymous insert policy (0050, 0076) itself. The
-- insert still passes 0079's rate-limit trigger; updates have their own limit
-- per row. Old site builds that insert directly keep working through 0076's
-- policy.

create or replace function public.save_voice_lead(p_doc jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ref     text := p_doc->>'reference';
  v_call    text := p_doc #>> '{call,id}';
  v_row     public.enquiries%rowtype;
  v_old_rec text;
  v_new_rec text;
  v_recs    jsonb;
  v_doc     jsonb;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    raise exception 'A voice lead must be an object' using errcode = '22023';
  end if;
  if v_ref is null or v_ref !~ '^ORT-[0-9A-Z]{11}$' then
    raise exception 'A voice lead needs a valid reference' using errcode = '22023';
  end if;
  if v_call is null or v_call !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'A voice lead needs its call id' using errcode = '22023';
  end if;
  if p_doc->>'source' is distinct from 'Voice assistant (Anu)' then
    raise exception 'Only voice leads are saved here' using errcode = '42501';
  end if;

  -- Two saves of the same call arriving together must not both insert.
  perform pg_advisory_xact_lock(hashtext('save_voice_lead:' || v_ref));

  select * into v_row from public.enquiries
   where doc->>'reference' = v_ref
   order by created_at
   limit 1
   for update;

  if not found then
    v_doc := p_doc;
    if (v_doc->>'status') is distinct from 'new'
       or not (v_doc->'starred' is null or v_doc->>'starred' = 'false')
       or not (v_doc->>'owner' is null or v_doc->>'owner' = '')
       or v_doc->>'quotationId' is not null then
      raise exception 'A new voice lead must arrive unassigned' using errcode = '42501';
    end if;
  else
    if v_row.doc->>'source' is distinct from 'Voice assistant (Anu)'
       or v_row.doc #>> '{call,id}' is distinct from v_call
       or v_row.doc->>'status' is distinct from 'new'
       or v_row.created_at < now() - interval '2 hours' then
      raise exception 'This voice lead can no longer be updated' using errcode = 'P0409';
    end if;
    if not public.rate_limit_hit('voice-lead:' || v_ref, 60, 600) then
      raise exception 'Too many updates to this call. Please try again in a few minutes.' using errcode = 'P0429';
    end if;

    -- Keep every recording the conversation made: a resumed call records under
    -- its own path, and the row points at the newest.
    v_old_rec := v_row.doc #>> '{call,recording}';
    v_new_rec := p_doc #>> '{call,recording}';
    v_recs := coalesce(v_row.doc #> '{call,recordings}', '[]'::jsonb);
    if jsonb_typeof(v_recs) <> 'array' then v_recs := '[]'::jsonb; end if;
    if v_old_rec is not null and v_old_rec is distinct from v_new_rec and not v_recs ? v_old_rec then
      v_recs := v_recs || to_jsonb(v_old_rec);
    end if;

    v_doc := v_row.doc
      || jsonb_strip_nulls(jsonb_build_object(
           'customer', p_doc->'customer',
           'items', p_doc->'items',
           'productInterest', p_doc->'productInterest',
           'message', p_doc->'message',
           'notes', p_doc->'notes'
         ))
      || jsonb_build_object('call',
           coalesce(v_row.doc->'call', '{}'::jsonb)
           || coalesce(p_doc->'call', '{}'::jsonb)
           || case when v_new_rec is null and v_old_rec is not null
                   then jsonb_build_object('recording', v_old_rec) else '{}'::jsonb end
           || case when jsonb_array_length(v_recs) > 0
                   then jsonb_build_object('recordings', v_recs) else '{}'::jsonb end);
  end if;

  if pg_column_size(v_doc) >= 32768
     or length(coalesce(v_doc->'customer'->>'name', '')) > 200
     or length(coalesce(v_doc->'customer'->>'email', '')) > 254
     or length(coalesce(v_doc->'customer'->>'phone', '')) > 40
     or length(coalesce(v_doc->>'message', '')) > 8000 then
    raise exception 'The voice lead is too large' using errcode = '23514';
  end if;

  if v_row.id is null then
    insert into public.enquiries (company_id, doc) values ('ortex', v_doc);
  else
    update public.enquiries set doc = v_doc where id = v_row.id;
  end if;
  return v_ref;
end $$;

revoke all on function public.save_voice_lead(jsonb) from public;
grant execute on function public.save_voice_lead(jsonb) to anon, authenticated;
