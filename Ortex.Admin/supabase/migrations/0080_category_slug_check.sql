-- A category's slug becomes a URL and is written into the website's prerendered
-- HTML and its build output paths. It used to be free text (the console only
-- slugified a blank field), so a quote, slash or regex character could break
-- the site build or reach the page markup. Only lower-case words joined by
-- single hyphens are accepted from now on; blank still means "derive it from
-- the name".
--
-- NOT VALID: existing rows are not checked, so the push cannot fail on an old
-- slug. The website slugifies every slug it reads anyway (lib/catalogCore.js).

alter table public.categories drop constraint if exists categories_slug_format;
alter table public.categories
  add constraint categories_slug_format
  check (coalesce(doc->>'slug', '') = '' or (doc->>'slug') ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  not valid;
