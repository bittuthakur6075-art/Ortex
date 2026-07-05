-- Allow anonymous users to view active products and categories.
drop policy if exists anon_select_products on public.products;
create policy anon_select_products on public.products
  for select to anon using (doc->>'status' = 'active');

drop policy if exists anon_select_categories on public.categories;
create policy anon_select_categories on public.categories
  for select to anon using (true);
