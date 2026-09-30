-- 0054: the Staff role reads the catalogue but never changes it.
--
-- Until now the products grant was read AND write (0007's staff_products was
-- `for all`), and so was the catalogue's photo bucket (0050, section 7). Staff
-- were given `products` so the phone draws a second tab: 1.8.0's one-tab bar
-- crashed on launch for every login that reached only Home. They need to see
-- the catalogue, not edit it, so writes now also require a role other than
-- Staff. Every other role keeps exactly what it had.
--
-- Safe to run again: every object is dropped and recreated.

create or replace function public.is_staff_role()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'staff');
$$;
revoke all on function public.is_staff_role() from public, anon;
grant execute on function public.is_staff_role() to authenticated;

drop policy if exists staff_products on public.products;
drop policy if exists staff_products_read on public.products;
drop policy if exists staff_products_insert on public.products;
drop policy if exists staff_products_update on public.products;
drop policy if exists staff_products_delete on public.products;

create policy staff_products_read on public.products
  for select to authenticated using (public.has_module_access('products'));
create policy staff_products_insert on public.products
  for insert to authenticated
  with check (public.has_module_access('products') and not public.is_staff_role());
create policy staff_products_update on public.products
  for update to authenticated
  using (public.has_module_access('products') and not public.is_staff_role())
  with check (public.has_module_access('products') and not public.is_staff_role());
create policy staff_products_delete on public.products
  for delete to authenticated
  using (public.has_module_access('products') and not public.is_staff_role());

-- The catalogue's photos: 0050's rule, plus "not Staff".
do $$
declare
  catalogue text := '(public.has_module_access(''products'') or public.has_module_access(''categories'') or public.has_module_access(''work'')) and not public.is_staff_role()';
begin
  execute 'drop policy if exists staff_upload_product_images on storage.objects';
  execute format('create policy staff_upload_product_images on storage.objects for insert to authenticated with check (bucket_id = %L and %s)', 'product-images', catalogue);
  execute 'drop policy if exists staff_update_product_images on storage.objects';
  execute format('create policy staff_update_product_images on storage.objects for update to authenticated using (bucket_id = %L and %s)', 'product-images', catalogue);
  execute 'drop policy if exists staff_delete_product_images on storage.objects';
  execute format('create policy staff_delete_product_images on storage.objects for delete to authenticated using (bucket_id = %L and %s)', 'product-images', catalogue);
end $$;
