-- Enquiries imported from a spreadsheet (Enquiries -> Import on either client,
-- lib/enquiryImport.js) carry doc.imported. They are old calls being filed, not
-- new ones arriving, so they must not send one "New enquiry" push per row.
-- Same function as 0031 with that one early return.

create or replace function public.enquiries_push_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  if new.doc ? 'imported' then
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
      body := jsonb_build_object('table', 'enquiries', 'id', new.id)
    );
  exception when others then
    -- Never block the insert. The phone's own realtime alert still covers a
    -- rep whose app is open.
    raise warning 'enquiries_push_notify: %', sqlerrm;
  end;
  return new;
end;
$$;
