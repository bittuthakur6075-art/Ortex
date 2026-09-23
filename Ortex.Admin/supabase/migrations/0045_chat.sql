-- 0045_chat.sql
--
-- TEAM CHAT: WhatsApp-style direct and group conversations between staff, plus
-- one private thread per person with Anu, the AI assistant.
--
--   chat_conversations  kind 'direct' (two people, one row per pair through
--                       direct_key), 'group' (a title and an owner) or
--                       'assistant' (one per person, the Anu thread).
--   chat_members        who is in a conversation, their last_read_at (read
--                       ticks and unread counts) and muted.
--   chat_messages       text, an optional attachment in the private
--                       `chat-files` bucket, an optional reply, and `meta`
--                       (the record cards Anu's answers carry).
--
-- Relational rather than the { id, doc } shape of the business collections:
-- a chat is read by conversation and time, and unread counts are a join.
--
-- ONE DOOR FOR WRITES. The tables have SELECT policies only; every write goes
-- through the security-definer functions below, which check membership, kind
-- and length. That is also what keeps a conversation PRIVATE: an admin is not
-- a member of other people's chats and cannot read them.
--
-- Anu's replies are written by the person's own browser (kind 'assistant'),
-- and only into their own assistant thread, which nobody else can read. A
-- person could forge a reply there, but only to themselves.

-- ---- tables ------------------------------------------------------------------

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group', 'assistant')),
  title text,
  direct_key text unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  muted boolean not null default false,
  primary key (conversation_id, user_id)
);

create index if not exists chat_members_user_idx on public.chat_members (user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'system', 'assistant')),
  body text,
  attachment jsonb,
  reply_to uuid references public.chat_messages (id) on delete set null,
  meta jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index if not exists chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at desc);

-- ---- membership helper (security definer, so policies do not recurse) ---------

create or replace function public.chat_is_member(p_conversation uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.chat_members
    where conversation_id = p_conversation and user_id = auth.uid()
  ) and public.is_active_staff();
$$;

-- ---- RLS: read-only for members ------------------------------------------------

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists chat_conversations_read on public.chat_conversations;
create policy chat_conversations_read on public.chat_conversations
  for select to authenticated using (public.chat_is_member(id));

drop policy if exists chat_members_read on public.chat_members;
create policy chat_members_read on public.chat_members
  for select to authenticated using (public.chat_is_member(conversation_id));

drop policy if exists chat_messages_read on public.chat_messages;
create policy chat_messages_read on public.chat_messages
  for select to authenticated using (public.chat_is_member(conversation_id));

revoke insert, update, delete on public.chat_conversations, public.chat_members, public.chat_messages from anon, authenticated;
grant select on public.chat_conversations, public.chat_members, public.chat_messages to authenticated;

-- ---- internal: a system line ("Priya added Rahul") -----------------------------

create or replace function public.chat_system(p_conversation uuid, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.chat_messages (conversation_id, sender_id, kind, body)
  values (p_conversation, auth.uid(), 'system', p_body);
  update public.chat_conversations set updated_at = now() where id = p_conversation;
$$;

revoke execute on function public.chat_system(uuid, text) from public, anon, authenticated;

create or replace function public.chat_name(p_user uuid)
returns text language sql security definer stable set search_path = public as $$
  select coalesce(nullif(trim(split_part(name, ' ', 1)), ''), 'Someone') from public.profiles where id = p_user;
$$;

-- ---- opening conversations ------------------------------------------------------

-- The one conversation between the caller and p_user, created on first use.
create or replace function public.chat_open_direct(p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_id uuid;
begin
  if v_me is null or not public.is_active_staff() then raise exception 'not_staff'; end if;
  if p_user is null or p_user = v_me then raise exception 'bad_user'; end if;
  if not exists (select 1 from public.profiles where id = p_user and active = true) then
    raise exception 'user_inactive';
  end if;

  v_key := 'direct:' || least(v_me::text, p_user::text) || ':' || greatest(v_me::text, p_user::text);
  select id into v_id from public.chat_conversations where direct_key = v_key;
  if v_id is null then
    insert into public.chat_conversations (kind, direct_key, created_by)
    values ('direct', v_key, v_me)
    on conflict (direct_key) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.chat_conversations where direct_key = v_key;
    end if;
    insert into public.chat_members (conversation_id, user_id, role)
    values (v_id, v_me, 'member'), (v_id, p_user, 'member')
    on conflict do nothing;
  end if;
  return v_id;
end;
$$;

-- The caller's private thread with Anu, created on first use.
create or replace function public.chat_open_assistant()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_id uuid;
begin
  if v_me is null or not public.is_active_staff() then raise exception 'not_staff'; end if;
  v_key := 'assistant:' || v_me::text;
  select id into v_id from public.chat_conversations where direct_key = v_key;
  if v_id is null then
    insert into public.chat_conversations (kind, title, direct_key, created_by)
    values ('assistant', 'Anu', v_key, v_me)
    on conflict (direct_key) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.chat_conversations where direct_key = v_key;
    end if;
    insert into public.chat_members (conversation_id, user_id, role)
    values (v_id, v_me, 'owner') on conflict do nothing;
  end if;
  return v_id;
end;
$$;

create or replace function public.chat_create_group(p_title text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_title text := left(trim(coalesce(p_title, '')), 80);
  v_id uuid;
begin
  if v_me is null or not public.is_active_staff() then raise exception 'not_staff'; end if;
  if v_title = '' then raise exception 'title_required'; end if;

  insert into public.chat_conversations (kind, title, created_by)
  values ('group', v_title, v_me) returning id into v_id;

  insert into public.chat_members (conversation_id, user_id, role) values (v_id, v_me, 'owner');
  insert into public.chat_members (conversation_id, user_id, role)
  select v_id, p.id, 'member' from public.profiles p
  where p.id = any (coalesce(p_members, '{}')) and p.id <> v_me and p.active = true
  on conflict do nothing;

  perform public.chat_system(v_id, public.chat_name(v_me) || ' created the group "' || v_title || '"');
  return v_id;
end;
$$;

-- ---- group management (owner only, except leaving) ------------------------------

create or replace function public.chat_is_owner(p_conversation uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.chat_members m join public.chat_conversations c on c.id = m.conversation_id
    where m.conversation_id = p_conversation and m.user_id = auth.uid() and m.role = 'owner' and c.kind = 'group'
  ) and public.is_active_staff();
$$;

create or replace function public.chat_add_members(p_conversation uuid, p_members uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_added text;
begin
  if not public.chat_is_owner(p_conversation) then raise exception 'not_owner'; end if;
  with added as (
    insert into public.chat_members (conversation_id, user_id, role)
    select p_conversation, p.id, 'member' from public.profiles p
    where p.id = any (coalesce(p_members, '{}')) and p.active = true
    on conflict do nothing
    returning user_id
  )
  select string_agg(public.chat_name(user_id), ', ') into v_added from added;
  if v_added is not null then
    perform public.chat_system(p_conversation, public.chat_name(auth.uid()) || ' added ' || v_added);
  end if;
end;
$$;

create or replace function public.chat_remove_member(p_conversation uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.chat_is_owner(p_conversation) then raise exception 'not_owner'; end if;
  if p_user = auth.uid() then raise exception 'use_leave'; end if;
  delete from public.chat_members where conversation_id = p_conversation and user_id = p_user;
  if found then
    perform public.chat_system(p_conversation, public.chat_name(auth.uid()) || ' removed ' || public.chat_name(p_user));
  end if;
end;
$$;

create or replace function public.chat_rename(p_conversation uuid, p_title text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_title text := left(trim(coalesce(p_title, '')), 80);
begin
  if not public.chat_is_owner(p_conversation) then raise exception 'not_owner'; end if;
  if v_title = '' then raise exception 'title_required'; end if;
  update public.chat_conversations set title = v_title, updated_at = now() where id = p_conversation;
  perform public.chat_system(p_conversation, public.chat_name(auth.uid()) || ' renamed the group to "' || v_title || '"');
end;
$$;

-- Leaving a group. The last owner to leave hands ownership to the longest-standing member.
create or replace function public.chat_leave(p_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if not exists (
    select 1 from public.chat_conversations c join public.chat_members m on m.conversation_id = c.id
    where c.id = p_conversation and c.kind = 'group' and m.user_id = v_me
  ) then raise exception 'not_member'; end if;

  delete from public.chat_members where conversation_id = p_conversation and user_id = v_me;
  perform public.chat_system(p_conversation, public.chat_name(v_me) || ' left');

  if not exists (select 1 from public.chat_members where conversation_id = p_conversation and role = 'owner') then
    update public.chat_members set role = 'owner'
    where (conversation_id, user_id) = (
      select conversation_id, user_id from public.chat_members
      where conversation_id = p_conversation order by joined_at limit 1
    );
  end if;
end;
$$;

-- ---- messages ---------------------------------------------------------------------

-- The only way a message is written. p_id is generated by the client, so a
-- retried send is idempotent and the optimistic bubble keeps its identity.
create or replace function public.chat_send(
  p_id uuid,
  p_conversation uuid,
  p_body text,
  p_attachment jsonb default null,
  p_reply_to uuid default null,
  p_kind text default 'text',
  p_meta jsonb default null
)
returns public.chat_messages language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_kind text := coalesce(p_kind, 'text');
  v_conv_kind text;
  v_body text := left(coalesce(p_body, ''), 8000);
  v_row public.chat_messages;
begin
  if not public.chat_is_member(p_conversation) then raise exception 'not_member'; end if;
  select kind into v_conv_kind from public.chat_conversations where id = p_conversation;

  if v_kind not in ('text', 'assistant') then raise exception 'bad_kind'; end if;
  if v_kind = 'assistant' and v_conv_kind <> 'assistant' then raise exception 'bad_kind'; end if;
  if trim(v_body) = '' and p_attachment is null then raise exception 'empty'; end if;
  if p_meta is not null and length(p_meta::text) > 20000 then raise exception 'meta_too_large'; end if;

  -- An attachment must live in THIS conversation's folder of the chat bucket.
  if p_attachment is not null then
    if coalesce(p_attachment ->> 'path', '') not like p_conversation::text || '/%' then
      raise exception 'bad_attachment';
    end if;
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.chat_messages where id = p_reply_to and conversation_id = p_conversation
  ) then
    p_reply_to := null;
  end if;

  insert into public.chat_messages (id, conversation_id, sender_id, kind, body, attachment, reply_to, meta)
  values (coalesce(p_id, gen_random_uuid()), p_conversation, v_me, v_kind, nullif(v_body, ''), p_attachment, p_reply_to, p_meta)
  on conflict (id) do nothing
  returning * into v_row;

  -- A retried send: hand back the row it already wrote (never one from another conversation).
  if v_row.id is null then
    select * into v_row from public.chat_messages where id = p_id and conversation_id = p_conversation;
    if v_row.id is null then raise exception 'bad_id'; end if;
  end if;

  update public.chat_conversations set updated_at = now() where id = p_conversation;
  update public.chat_members set last_read_at = now()
  where conversation_id = p_conversation and user_id = v_me;
  return v_row;
end;
$$;

-- Edit your own text within 15 minutes.
create or replace function public.chat_edit(p_message uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_body text := left(trim(coalesce(p_body, '')), 8000);
begin
  if v_body = '' then raise exception 'empty'; end if;
  update public.chat_messages set body = v_body, edited_at = now()
  where id = p_message and sender_id = auth.uid() and kind = 'text' and deleted_at is null
    and created_at > now() - interval '15 minutes' and public.chat_is_member(conversation_id);
  if not found then raise exception 'cannot_edit'; end if;
end;
$$;

-- "Delete for everyone": your own message, any time. The row stays so the
-- thread keeps its shape ("This message was deleted"); the content goes.
-- Returns the attachment path so the client can remove the file.
create or replace function public.chat_delete(p_message uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_path text;
begin
  update public.chat_messages m set body = null, meta = null, deleted_at = now(),
    attachment = null
  from (select attachment ->> 'path' as path from public.chat_messages where id = p_message) old
  where m.id = p_message and m.sender_id = auth.uid() and m.kind in ('text', 'assistant') and m.deleted_at is null
    and public.chat_is_member(m.conversation_id)
  returning old.path into v_path;
  if not found then raise exception 'cannot_delete'; end if;
  return v_path;
end;
$$;

create or replace function public.chat_mark_read(p_conversation uuid)
returns void language sql security definer set search_path = public as $$
  update public.chat_members set last_read_at = now()
  where conversation_id = p_conversation and user_id = auth.uid();
$$;

create or replace function public.chat_set_muted(p_conversation uuid, p_muted boolean)
returns void language sql security definer set search_path = public as $$
  update public.chat_members set muted = coalesce(p_muted, false)
  where conversation_id = p_conversation and user_id = auth.uid();
$$;

-- Clear the Anu thread (the only thread a person may empty on their own).
create or replace function public.chat_clear_assistant()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.chat_messages m using public.chat_conversations c
  where m.conversation_id = c.id and c.direct_key = 'assistant:' || auth.uid()::text;
end;
$$;

-- ---- the inbox --------------------------------------------------------------------

-- Every conversation the caller is in, newest activity first, with the last
-- message, the unread count and each member's read position (for the ticks).
create or replace function public.chat_inbox()
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.activity_at desc), '[]'::jsonb)
  from (
    select
      c.id,
      c.kind,
      c.title,
      c.created_at,
      me.muted,
      me.role as my_role,
      me.last_read_at,
      coalesce(last.created_at, c.updated_at) as activity_at,
      case when last.id is null then null else jsonb_build_object(
        'id', last.id,
        'sender_id', last.sender_id,
        'kind', last.kind,
        'body', left(last.body, 200),
        'attachment', last.attachment,
        'deleted', last.deleted_at is not null,
        'created_at', last.created_at
      ) end as last_message,
      (
        select count(*) from public.chat_messages u
        where u.conversation_id = c.id
          and u.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)
          and u.sender_id is distinct from auth.uid()
          and u.kind <> 'system'
      ) as unread,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'avatar_url', p.avatar_url, 'role', p.role,
          'active', p.active, 'member_role', m.role, 'last_read_at', m.last_read_at
        ) order by p.name), '[]'::jsonb)
        from public.chat_members m join public.profiles p on p.id = m.user_id
        where m.conversation_id = c.id
      ) as members
    from public.chat_conversations c
    join public.chat_members me on me.conversation_id = c.id and me.user_id = auth.uid()
    left join lateral (
      select * from public.chat_messages l
      where l.conversation_id = c.id order by l.created_at desc limit 1
    ) last on true
    where public.is_active_staff()
  ) x;
$$;

-- Everyone the caller can start a chat with: active staff, never email or modules.
create or replace function public.chat_people()
returns table (id uuid, name text, avatar_url text, role text)
language sql security definer stable set search_path = public as $$
  select p.id, p.name, p.avatar_url, p.role from public.profiles p
  where p.active = true and p.id <> auth.uid() and public.is_active_staff()
  order by p.name;
$$;

-- ---- grants -----------------------------------------------------------------------

revoke execute on function public.chat_open_direct(uuid), public.chat_open_assistant(),
  public.chat_create_group(text, uuid[]), public.chat_add_members(uuid, uuid[]),
  public.chat_remove_member(uuid, uuid), public.chat_rename(uuid, text), public.chat_leave(uuid),
  public.chat_send(uuid, uuid, text, jsonb, uuid, text, jsonb), public.chat_edit(uuid, text),
  public.chat_delete(uuid), public.chat_mark_read(uuid), public.chat_set_muted(uuid, boolean),
  public.chat_clear_assistant(), public.chat_inbox(), public.chat_people(),
  public.chat_is_member(uuid), public.chat_is_owner(uuid), public.chat_name(uuid)
  from public, anon;

grant execute on function public.chat_open_direct(uuid), public.chat_open_assistant(),
  public.chat_create_group(text, uuid[]), public.chat_add_members(uuid, uuid[]),
  public.chat_remove_member(uuid, uuid), public.chat_rename(uuid, text), public.chat_leave(uuid),
  public.chat_send(uuid, uuid, text, jsonb, uuid, text, jsonb), public.chat_edit(uuid, text),
  public.chat_delete(uuid), public.chat_mark_read(uuid), public.chat_set_muted(uuid, boolean),
  public.chat_clear_assistant(), public.chat_inbox(), public.chat_people(),
  public.chat_is_member(uuid), public.chat_is_owner(uuid), public.chat_name(uuid)
  to authenticated;

-- ---- files: the private `chat-files` bucket, one folder per conversation -----------

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 26214400) -- 25 MB
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- `<conversation id>/<uuid>-<file name>`: members upload and read, nobody updates.
drop policy if exists chat_files_insert on storage.objects;
create policy chat_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-files'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.chat_is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists chat_files_read on storage.objects;
create policy chat_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-files'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.chat_is_member(((storage.foldername(name))[1])::uuid)
  );

-- The uploader may remove their own file (after "delete for everyone").
drop policy if exists chat_files_delete on storage.objects;
create policy chat_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-files' and owner = auth.uid());

-- ---- realtime ------------------------------------------------------------------------
-- Realtime applies the SELECT policies above, so an event reaches members only.

do $$
declare
  t text;
begin
  foreach t in array array['chat_messages', 'chat_members', 'chat_conversations'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
