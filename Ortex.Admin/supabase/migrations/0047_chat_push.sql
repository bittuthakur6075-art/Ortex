-- 0047_chat_push.sql
--
-- Team chat messages to phones that are CLOSED, through Firebase Cloud
-- Messaging: a new chat message (a person's, or Anu's team post) asks the
-- push-notify Edge Function to send it to every other member's registered
-- phones. The phone's own realtime notifier (Ortex.Mobile
-- features/chat/ChatNotifier.tsx) covers an app that is open or in the
-- background; this covers the rest, with the same `chat-<conversation>` tag so
-- the two copies replace each other.
--
-- Same wiring and the same Vault secrets as the lead push (0031): a no-op until
-- `push_notify_url` and `push_notify_secret` exist, and it never blocks a send.
-- Messages in a person's Anu thread are never pushed (nobody else is in it).

create or replace function public.chat_messages_push_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  if new.kind not in ('text', 'bot') then return new; end if;
  if exists (select 1 from public.chat_conversations c where c.id = new.conversation_id and c.kind = 'assistant') then
    return new;
  end if;
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_notify_url' limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_notify_secret' limit 1;
    if v_url is null or v_secret is null then
      return new;
    end if;
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('table', 'chat_messages', 'id', new.id)
    );
  exception when others then
    raise warning 'chat_messages_push_notify: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists chat_messages_push_notify on public.chat_messages;
create trigger chat_messages_push_notify
  after insert on public.chat_messages
  for each row execute function public.chat_messages_push_notify();
