alter table public.products
  add column if not exists stock integer not null default 0;

alter table public.products enable row level security;

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

drop policy if exists products_public_read on public.products;
drop policy if exists "Allow public read access" on public.products;
create policy products_public_read
  on public.products
  for select
  to anon, authenticated
  using (true);

drop policy if exists products_admin_manage on public.products;
drop policy if exists "Allow all operations for authenticated/admin" on public.products;
create policy products_admin_manage
  on public.products
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );

create or replace function public.deduct_product_stock(p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item record;
  updated_count integer;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  ) then
    raise exception 'Administrator access is required.';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'At least one product quantity is required.';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'At least one product quantity is required.';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'At most 100 product lines may be completed at once.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as requested(value)
    where jsonb_typeof(value->'id') is distinct from 'string'
      or (value->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(value->'quantity') is distinct from 'number'
      or (value->>'quantity') !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'Each product requires a valid ID and positive whole-number quantity.';
  end if;

  for item in
    select (value->>'id')::uuid as product_id,
      sum((value->>'quantity')::bigint) as quantity
    from jsonb_array_elements(p_items) as requested(value)
    group by (value->>'id')::uuid
  loop
    update public.products
    set stock = stock - item.quantity
    where id = item.product_id
      and stock >= item.quantity;

    get diagnostics updated_count = row_count;
    if updated_count = 0 then
      raise exception 'INSUFFICIENT_STOCK: product % is unavailable or has insufficient stock.',
        item.product_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.deduct_product_stock(jsonb) from public, anon;
grant execute on function public.deduct_product_stock(jsonb) to authenticated;
