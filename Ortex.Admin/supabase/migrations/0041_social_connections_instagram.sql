-- 0041_social_connections_instagram.sql
--
-- Instagram can now be connected on its own, without a Facebook Page, through
-- Meta's "Instagram API with Instagram Login" (graph.instagram.com). Its token
-- is a long-lived Instagram user token: it lasts 60 days and is renewed by the
-- publish sweep, so it lives in `social_connections` beside LinkedIn's (0037),
-- readable only with the service role.

alter table public.social_connections drop constraint if exists social_connections_platform_check;
alter table public.social_connections
  add constraint social_connections_platform_check check (platform in ('linkedin', 'instagram'));
