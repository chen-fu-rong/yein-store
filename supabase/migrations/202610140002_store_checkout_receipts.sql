alter table public.orders
  alter column user_id drop not null,
  add column if not exists discount_amount numeric not null default 0,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_address text;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;

alter table public.profiles
  add column if not exists phone text,
  add column if not exists address text;

create or replace function public.save_customer_contact_info(
  p_full_name text,
  p_phone text,
  p_address text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to sync customer details across devices.';
  end if;
  if nullif(trim(p_full_name), '') is null
    or nullif(trim(p_phone), '') is null
    or nullif(trim(p_address), '') is null then
    raise exception 'Name, phone, and delivery address are required.';
  end if;

  insert into public.profiles (id, full_name, phone, address)
  values ((select auth.uid()), trim(p_full_name), trim(p_phone), trim(p_address))
  on conflict (id) do update
  set full_name = excluded.full_name,
      phone = excluded.phone,
      address = excluded.address;
end;
$$;

revoke all on function public.save_customer_contact_info(text, text, text) from public, anon;
grant execute on function public.save_customer_contact_info(text, text, text) to authenticated;

update public.orders
set status = 'packed'
where status = 'printing'
  and payment_method = 'bank_transfer'
  and exists (
    select 1
    from public.order_items
    where order_items.order_id = orders.id
      and order_items.product_id is not null
  )
  and not exists (
    select 1
    from public.order_items
    where order_items.order_id = orders.id
      and order_items.product_id is null
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-assets',
  'public-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists public_assets_payment_slip_upload on storage.objects;
create policy public_assets_payment_slip_upload
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'public-assets'
    and name ~* '^payment-slips/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$'
  );

drop policy if exists public_assets_payment_slip_upload_restriction on storage.objects;
create policy public_assets_payment_slip_upload_restriction
  on storage.objects
  as restrictive
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'public-assets'
    and name ~* '^payment-slips/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$'
  );

create or replace function public.create_pos_order(
  p_customer_name text,
  p_customer_phone text,
  p_subtotal numeric,
  p_discount numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  product_name text;
  product_price numeric;
  product_stock integer;
  calculated_subtotal numeric := 0;
  new_order_id uuid;
  new_order_number text;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  ) then
    raise exception 'Administrator access is required.';
  end if;

  if nullif(trim(p_customer_name), '') is null
    or p_subtotal is null
    or p_subtotal < 0
    or p_discount is null
    or p_discount < 0 then
    raise exception 'Provide a customer name and valid subtotal and discount.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Order items must be an array.';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Provide between 1 and 100 order items.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as requested(value)
    where jsonb_typeof(value->'name') is distinct from 'string'
      or nullif(trim(value->>'name'), '') is null
      or jsonb_typeof(value->'quantity') is distinct from 'number'
      or (value->>'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(value->'unit_price') is distinct from 'number'
      or (value->>'unit_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
      or (
        value->'product_id' is distinct from 'null'::jsonb
        and (
          jsonb_typeof(value->'product_id') is distinct from 'string'
          or (value->>'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      )
  ) then
    raise exception 'Each order line requires a name, positive quantity, valid price, and optional valid product ID.';
  end if;

  for item in
    select (value->>'product_id')::uuid as product_id,
      sum((value->>'quantity')::bigint) as quantity
    from jsonb_array_elements(p_items) as requested(value)
    where jsonb_typeof(value->'product_id') = 'string'
    group by (value->>'product_id')::uuid
    order by (value->>'product_id')::uuid
  loop
    select products.name, products.price, products.stock
    into product_name, product_price, product_stock
    from public.products
    where products.id = item.product_id
    for update;

    if not found then
      raise exception 'One or more products are no longer available.';
    end if;
    if product_stock < item.quantity then
      raise exception 'INSUFFICIENT_STOCK: product % has insufficient stock.', item.product_id;
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_items) as requested(value)
      where (value->>'product_id')::uuid = item.product_id
        and (value->>'unit_price')::numeric <> product_price
    ) then
      raise exception 'The price for product % has changed. Refresh inventory and retry.', item.product_id;
    end if;
    calculated_subtotal := calculated_subtotal + product_price * item.quantity;
  end loop;

  select calculated_subtotal + coalesce(sum(
    (value->>'unit_price')::numeric * (value->>'quantity')::bigint
  ), 0)
  into calculated_subtotal
  from jsonb_array_elements(p_items) as requested(value)
  where jsonb_typeof(value->'product_id') = 'null';

  if p_subtotal <> calculated_subtotal then
    raise exception 'Order subtotal does not match its item prices.';
  end if;
  if p_discount > calculated_subtotal then
    raise exception 'Discount cannot exceed the order subtotal.';
  end if;

  new_order_id := gen_random_uuid();
  new_order_number := 'YEIN-POS-' ||
    to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDD-HH24MISS-MS') ||
    '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.orders (
    id,
    user_id,
    order_number,
    status,
    payment_method,
    payment_status,
    subtotal,
    discount_amount,
    shipping_fee,
    total,
    payment_slip_url,
    customer_name,
    customer_phone,
    customer_address
  ) values (
    new_order_id,
    auth.uid(),
    new_order_number,
    'pending',
    'pos',
    'verified',
    calculated_subtotal,
    p_discount,
    0,
    calculated_subtotal - p_discount,
    null,
    trim(p_customer_name),
    nullif(trim(p_customer_phone), ''),
    null
  );

  for item in
    select value
    from jsonb_array_elements(p_items) as requested(value)
  loop
    if jsonb_typeof(item.value->'product_id') = 'string' then
      select products.name, products.price
      into product_name, product_price
      from public.products
      where products.id = (item.value->>'product_id')::uuid;

      update public.products
      set stock = stock - (item.value->>'quantity')::integer
      where id = (item.value->>'product_id')::uuid;
    else
      product_name := trim(item.value->>'name');
      product_price := (item.value->>'unit_price')::numeric;
    end if;

    insert into public.order_items (order_id, product_id, name, quantity, unit_price)
    values (
      new_order_id,
      case when jsonb_typeof(item.value->'product_id') = 'string'
        then (item.value->>'product_id')::uuid
        else null
      end,
      product_name,
      (item.value->>'quantity')::integer,
      product_price
    );
  end loop;

  return jsonb_build_object(
    'id', new_order_id,
    'order_number', new_order_number
  );
end;
$$;

revoke all on function public.create_pos_order(text, text, numeric, numeric, jsonb) from public, anon;
grant execute on function public.create_pos_order(text, text, numeric, numeric, jsonb) to authenticated;

create or replace function public.get_pos_order_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  board jsonb;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  ) then
    raise exception 'Administrator access is required.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', orders.id,
      'order_number', orders.order_number,
      'customer_name', orders.customer_name,
      'total', orders.total,
      'status', orders.status,
      'payment_status', orders.payment_status,
      'order_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', order_items.name,
          'quantity', order_items.quantity,
          'product_id', order_items.product_id
        ) order by order_items.id)
        from public.order_items
        where order_items.order_id = orders.id
      ), '[]'::jsonb)
    ) order by orders.created_at desc
  ), '[]'::jsonb)
  into board
  from public.orders
  where orders.payment_status in ('pending', 'verified', 'rejected')
    and orders.status in ('pending', 'printing', 'completed', 'shipped')
    and exists (
      select 1
      from public.order_items
      where order_items.order_id = orders.id
        and order_items.product_id is null
    );

  return board;
end;
$$;

revoke all on function public.get_pos_order_board() from public, anon;
grant execute on function public.get_pos_order_board() to authenticated;

create or replace function public.advance_pos_order_status(
  p_order_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  ) then
    raise exception 'Administrator access is required.';
  end if;

  select orders.status
  into current_status
  from public.orders
  where orders.id = p_order_id
    and orders.payment_status = 'verified'
  for update;

  if not found then
    raise exception 'Verified order not found.';
  end if;

  if not exists (
    select 1
    from public.order_items
    where order_items.order_id = p_order_id
      and order_items.product_id is null
  ) then
    raise exception 'Only custom print orders can enter the production workflow.';
  end if;

  if not (
    (current_status = 'pending' and p_status = 'printing')
    or (current_status = 'printing' and p_status = 'completed')
  ) then
    raise exception 'Invalid order status transition.';
  end if;

  update public.orders
  set status = p_status
  where id = p_order_id;
end;
$$;

revoke all on function public.advance_pos_order_status(uuid, text) from public, anon;
grant execute on function public.advance_pos_order_status(uuid, text) to authenticated;

create or replace function public.set_admin_order_status(
  p_order_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_order_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  ) then
    raise exception 'Administrator access is required.';
  end if;

  if p_status not in ('pending', 'packed', 'shipped', 'cancelled', 'completed') then
    raise exception 'Invalid order status.';
  end if;

  if not exists (
    select 1
    from public.orders
    where orders.id = p_order_id
      and orders.payment_method = 'bank_transfer'
  ) then
    raise exception 'Store order not found.';
  end if;

  if not exists (
    select 1
    from public.order_items
    where order_items.order_id = p_order_id
      and order_items.product_id is not null
  ) or exists (
    select 1
    from public.order_items
    where order_items.order_id = p_order_id
      and order_items.product_id is null
  ) then
    raise exception 'Only ready-made product orders can use retail fulfillment statuses.';
  end if;

  update public.orders
  set status = p_status
  where id = p_order_id
    and payment_method = 'bank_transfer'
  returning id into updated_order_id;

  if updated_order_id is null then
    raise exception 'Store order not found.';
  end if;
end;
$$;

revoke all on function public.set_admin_order_status(uuid, text) from public, anon;
grant execute on function public.set_admin_order_status(uuid, text) to authenticated;

create or replace function public.create_store_order(
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_payment_slip_url text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  product_name text;
  product_price numeric;
  product_stock integer;
  new_order_id uuid;
  new_order_number text;
  calculated_subtotal numeric := 0;
begin
  if nullif(trim(p_customer_name), '') is null
    or nullif(trim(p_customer_phone), '') is null
    or nullif(trim(p_customer_address), '') is null
    or nullif(trim(p_payment_slip_url), '') is null then
    raise exception 'Customer details and payment slip are required.';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Order items must be an array.';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Provide between 1 and 100 order items.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as requested(value)
    where jsonb_typeof(value->'id') is distinct from 'string'
      or (value->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(value->'quantity') is distinct from 'number'
      or (value->>'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(value->'unit_price') is distinct from 'number'
      or (value->>'unit_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
  ) then
    raise exception 'Each item requires a valid product ID and positive whole-number quantity.';
  end if;

  for item in
    select (value->>'id')::uuid as product_id,
      sum((value->>'quantity')::bigint) as quantity
    from jsonb_array_elements(p_items) as requested(value)
    group by (value->>'id')::uuid
    order by (value->>'id')::uuid
  loop
    select p.name, p.price, p.stock
    into product_name, product_price, product_stock
    from public.products as p
    where p.id = item.product_id
    for update;

    if not found then
      raise exception 'One or more products are no longer available.';
    end if;
    if product_stock < item.quantity then
      raise exception 'INSUFFICIENT_STOCK: product % has insufficient stock.', item.product_id;
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_items) as requested(value)
      where (value->>'id')::uuid = item.product_id
        and (value->>'unit_price')::numeric <> product_price
    ) then
      raise exception 'The price for product % has changed. Refresh the store and review your cart.', item.product_id;
    end if;

    calculated_subtotal := calculated_subtotal + product_price * item.quantity;
  end loop;

  new_order_id := gen_random_uuid();
  new_order_number := 'YEIN-' ||
    to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDD-HH24MISS-MS') ||
    '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.orders (
    id,
    user_id,
    order_number,
    status,
    payment_method,
    payment_status,
    subtotal,
    shipping_fee,
    total,
    payment_slip_url,
    customer_name,
    customer_phone,
    customer_address
  ) values (
    new_order_id,
    auth.uid(),
    new_order_number,
    'pending',
    'bank_transfer',
    'pending',
    calculated_subtotal,
    0,
    calculated_subtotal,
    p_payment_slip_url,
    trim(p_customer_name),
    trim(p_customer_phone),
    trim(p_customer_address)
  );

  for item in
    select (value->>'id')::uuid as product_id,
      sum((value->>'quantity')::bigint) as quantity
    from jsonb_array_elements(p_items) as requested(value)
    group by (value->>'id')::uuid
    order by (value->>'id')::uuid
  loop
    select p.name, p.price
    into product_name, product_price
    from public.products as p
    where p.id = item.product_id;

    insert into public.order_items (order_id, product_id, name, quantity, unit_price)
    values (new_order_id, item.product_id, product_name, item.quantity, product_price);
  end loop;

  return jsonb_build_object(
    'id', new_order_id,
    'order_number', new_order_number,
    'subtotal', calculated_subtotal,
    'total', calculated_subtotal
  );
end;
$$;

revoke all on function public.create_store_order(text, text, text, text, jsonb) from public;
grant execute on function public.create_store_order(text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.get_store_receipt(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', orders.id,
    'order_number', orders.order_number,
    'created_at', orders.created_at,
    'customer_name', coalesce(orders.customer_name, ''),
    'customer_phone', coalesce(orders.customer_phone, ''),
    'customer_address', coalesce(orders.customer_address, ''),
    'payment_status', orders.payment_status,
    'status', orders.status,
    'payment_method', orders.payment_method,
    'payment_slip_url', coalesce(orders.payment_slip_url, ''),
    'total', orders.total,
    'order_items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', order_items.name,
          'quantity', order_items.quantity,
          'unit_price', order_items.unit_price
        ) order by order_items.id
      )
      from public.order_items
      where order_items.order_id = orders.id
    ), '[]'::jsonb)
  )
  from public.orders
  where orders.id = p_order_id;
$$;

revoke all on function public.get_store_receipt(uuid) from public;
grant execute on function public.get_store_receipt(uuid) to anon, authenticated;

create or replace function public.verify_store_order_payment(
  p_order_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_status text;
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

  select orders.payment_status
  into order_status
  from public.orders
  where orders.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;
  if order_status = 'verified' then
    return;
  end if;
  if order_status <> 'pending' then
    raise exception 'Only pending payments can be verified.';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Product quantities must be an array.';
  end if;
  if jsonb_array_length(p_items) > 100 or exists (
      select 1
      from jsonb_array_elements(p_items) as requested(value)
      where jsonb_typeof(value->'id') is distinct from 'string'
        or (value->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or jsonb_typeof(value->'quantity') is distinct from 'number'
        or (value->>'quantity') !~ '^[1-9][0-9]*$'
    ) then
    raise exception 'Invalid product quantities.';
  end if;

  if exists (
    select order_items.product_id, sum(order_items.quantity)::bigint as quantity
    from public.order_items
    where order_items.order_id = p_order_id and order_items.product_id is not null
    group by order_items.product_id
    except
    select (value->>'id')::uuid, sum((value->>'quantity')::bigint)
    from jsonb_array_elements(p_items) as requested(value)
    group by (value->>'id')::uuid
  ) or exists (
    select (value->>'id')::uuid, sum((value->>'quantity')::bigint)
    from jsonb_array_elements(p_items) as requested(value)
    group by (value->>'id')::uuid
    except
    select order_items.product_id, sum(order_items.quantity)::bigint
    from public.order_items
    where order_items.order_id = p_order_id and order_items.product_id is not null
    group by order_items.product_id
  ) then
    raise exception 'Submitted stock quantities do not match this order.';
  end if;

  for item in
    select order_items.product_id, sum(order_items.quantity)::bigint as quantity
    from public.order_items
    where order_items.order_id = p_order_id and order_items.product_id is not null
    group by order_items.product_id
    order by order_items.product_id
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

  update public.orders
  set payment_status = 'verified'
  where id = p_order_id;
end;
$$;

revoke all on function public.verify_store_order_payment(uuid, jsonb) from public, anon;
grant execute on function public.verify_store_order_payment(uuid, jsonb) to authenticated;
