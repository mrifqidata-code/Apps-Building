-- M5: akun pemilik, perangkat terdaftar, dan sinkron data toko.
--
-- Cara memasang di Supabase: buka SQL Editor, tempel seluruh isi file ini, lalu Run.
-- Panduan lengkap: docs/supabase.md. Aturan sinkron: docs/sinkron.md.
--
-- Every synced table mirrors a Dexie table on the device (camelCase -> snake_case).
-- Devices create the ids (UUIDv7), so an upsert by id never duplicates a row.
-- The server is the meeting point between devices, and it enforces:
--   * Row Level Security: a signed-in user only sees and writes stores they belong to.
--   * Conflict rules in triggers, whichever way a row arrives:
--       - master data: last write wins by updated_at (newer replaces older),
--       - transactions: only status may move forward (paid -> void/refunded),
--       - items, stock movements, audit log: append-only, never changed or deleted.
--   * Nothing can be deleted through the API; deletes are soft (deleted_at).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

---------------------------------------------------------------------------
-- Membership: who may sync which store
---------------------------------------------------------------------------

-- role 'owner': the store owner's email account (any number of phones).
-- role 'device': one paired cashier phone (anonymous account), tied to one device row.
create table public.store_members (
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null,
  role text not null check (role in ('owner', 'device')),
  device_id uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, store_id),
  check ((role = 'device') = (device_id is not null))
);
create index store_members_store_idx on public.store_members (store_id);

create function private.is_member(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and m.revoked_at is null
  );
$$;

create function private.is_owner(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
      and m.revoked_at is null
  );
$$;

-- The device row a paired cashier phone is allowed to update (null for owners).
create function private.my_device_id(p_store_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.device_id from public.store_members m
  where m.store_id = p_store_id
    and m.user_id = (select auth.uid())
    and m.revoked_at is null;
$$;

create function private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

---------------------------------------------------------------------------
-- Synced tables
---------------------------------------------------------------------------

create table public.stores (
  id uuid primary key,
  store_id uuid not null check (store_id = id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  address text not null default '',
  phone text not null default '',
  logo_image_id uuid,
  receipt_footer text not null default '',
  prices_include_tax boolean not null default false,
  pb1_bps integer not null default 0 check (pb1_bps between 0 and 10000),
  service_bps integer not null default 0 check (service_bps between 0 and 10000),
  qris_image_id uuid,
  cashier_max_discount_bps integer not null default 0
    check (cashier_max_discount_bps between 0 and 10000)
);

create table public.users (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  role text not null check (role in ('owner', 'cashier')),
  email text,
  auth_user_id uuid,
  pin_hash text,
  pin_salt text,
  active boolean not null
);

create table public.devices (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  code text not null check (code ~ '^[A-Z][A-Z0-9]{0,3}$'),
  active boolean not null,
  last_seen_at timestamptz,
  unique (store_id, code)
);

create table public.categories (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  sort_order integer not null,
  active boolean not null
);

create table public.products (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  category_id uuid,
  name text not null,
  price bigint not null,
  cost bigint not null,
  image_id uuid,
  active boolean not null,
  track_stock boolean not null,
  low_stock_threshold integer,
  sort_order integer not null
);

create table public.variant_groups (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  product_id uuid not null,
  name text not null,
  mode text not null check (mode in ('single', 'multi')),
  required boolean not null,
  sort_order integer not null
);

create table public.product_variants (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  product_id uuid not null,
  group_id uuid not null,
  name text not null,
  price_delta bigint not null,
  cost_delta bigint not null,
  sort_order integer not null,
  active boolean not null
);

create table public.customers (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  whatsapp text
);

create table public.shifts (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id uuid not null,
  opened_by uuid not null,
  opened_at timestamptz not null,
  opening_cash bigint not null,
  closed_by uuid,
  closed_at timestamptz,
  expected_cash bigint,
  counted_cash bigint,
  cash_difference bigint,
  note text
);

-- Image files live in Storage (bucket store-images, path <store_id>/<id>); this row is the metadata.
create table public.images (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  mime_type text not null
);

create table public.transactions (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  receipt_no text not null,
  device_id uuid not null,
  shift_id uuid,
  cashier_id uuid not null,
  customer_id uuid,
  subtotal bigint not null,
  discount_type text check (discount_type in ('amount', 'percent')),
  discount_value bigint not null,
  discount_amount bigint not null,
  prices_include_tax boolean not null,
  service_bps integer not null,
  service_amount bigint not null,
  tax_bps integer not null,
  tax_amount bigint not null,
  total bigint not null,
  payment_method text not null check (payment_method in ('cash', 'qris', 'transfer')),
  amount_paid bigint not null,
  change_amount bigint not null,
  status text not null check (status in ('paid', 'void', 'refunded')),
  void_reason text,
  voided_by uuid,
  voided_at timestamptz,
  unique (store_id, receipt_no)
);

create table public.transaction_items (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  transaction_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  variants jsonb not null default '[]',
  qty integer not null,
  unit_price bigint not null,
  unit_cost bigint not null,
  discount_type text check (discount_type in ('amount', 'percent')),
  discount_value bigint not null,
  discount_amount bigint not null,
  line_total bigint not null,
  note text
);

create table public.stock_movements (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  product_id uuid not null,
  type text not null check (type in ('in', 'sale', 'opname', 'void_return')),
  qty_delta integer not null,
  counted_qty integer,
  transaction_id uuid,
  note text,
  user_id uuid
);

create table public.audit_log (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  actor_id uuid,
  device_id uuid,
  action text not null,
  entity text not null,
  entity_id text not null,
  before jsonb,
  after jsonb,
  reason text
);

-- Pull reads each table in (synced_at, id) order per store.
create index stores_sync_idx on public.stores (store_id, synced_at, id);
create index users_sync_idx on public.users (store_id, synced_at, id);
create index devices_sync_idx on public.devices (store_id, synced_at, id);
create index categories_sync_idx on public.categories (store_id, synced_at, id);
create index products_sync_idx on public.products (store_id, synced_at, id);
create index variant_groups_sync_idx on public.variant_groups (store_id, synced_at, id);
create index product_variants_sync_idx on public.product_variants (store_id, synced_at, id);
create index customers_sync_idx on public.customers (store_id, synced_at, id);
create index shifts_sync_idx on public.shifts (store_id, synced_at, id);
create index images_sync_idx on public.images (store_id, synced_at, id);
create index transactions_sync_idx on public.transactions (store_id, synced_at, id);
create index transaction_items_sync_idx on public.transaction_items (store_id, synced_at, id);
create index stock_movements_sync_idx on public.stock_movements (store_id, synced_at, id);
create index audit_log_sync_idx on public.audit_log (store_id, synced_at, id);

-- Tables in the order rows are pushed and pulled (parents before children).
create function private.synced_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'stores', 'users', 'devices', 'categories', 'products', 'variant_groups',
    'product_variants', 'customers', 'shifts', 'images', 'transactions',
    'transaction_items', 'stock_movements', 'audit_log'
  ];
$$;

---------------------------------------------------------------------------
-- Conflict rules (triggers)
---------------------------------------------------------------------------

-- Devices keep millisecond timestamps; server-made ones match so comparisons stay fair.
create function private.now_ms()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('milliseconds', now());
$$;

-- A device with a wrong clock must not make its rows win forever.
create function private.clamp_to_now(p_at timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when p_at > now() + interval '5 minutes' then private.now_ms() else p_at end;
$$;

-- Master data: last write wins by updated_at. An older or equal version is ignored.
create function private.guard_last_write_wins()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := private.clamp_to_now(new.updated_at);
  if tg_op = 'UPDATE' then
    if new.updated_at <= old.updated_at then
      return null;
    end if;
    new.id := old.id;
    new.store_id := old.store_id;
    new.created_at := old.created_at;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

-- Transactions are never edited. Only the status may move forward once,
-- from paid to void or refunded, together with who, when and why.
create function private.guard_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := private.clamp_to_now(new.updated_at);
    new.synced_at := clock_timestamp();
    return new;
  end if;
  if old.status <> 'paid' or new.status not in ('void', 'refunded') then
    return null;
  end if;
  old.status := new.status;
  old.void_reason := new.void_reason;
  old.voided_by := new.voided_by;
  old.voided_at := new.voided_at;
  old.updated_at := greatest(old.updated_at, private.clamp_to_now(new.updated_at));
  old.synced_at := clock_timestamp();
  return old;
end;
$$;

-- Items, stock movements and the audit log are append-only.
create function private.guard_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'append_only' using errcode = '42501';
  end if;
  new.updated_at := private.clamp_to_now(new.updated_at);
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

-- The device code is part of every receipt number, so it never changes.
create function private.guard_device_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.code := old.code;
  return new;
end;
$$;

create trigger guard before insert or update on public.stores
  for each row execute function private.guard_last_write_wins();
create trigger guard before insert or update on public.users
  for each row execute function private.guard_last_write_wins();
create trigger guard before insert or update on public.devices
  for each row execute function private.guard_last_write_wins();
create trigger guard_code before update on public.devices
  for each row execute function private.guard_device_code();
create trigger guard before insert or update on public.categories
  for each row execute function private.guard_last_write_wins();
create trigger guard before insert or update on public.products
  for each row execute function private.guard_last_write_wins();
create trigger guard before insert or update on public.variant_groups
  for each row execute function private.guard_last_write_wins();
create trigger guard before insert or update on public.product_variants
  for each row execute function private.guard_last_write_wins();
create trigger guard before insert or update on public.customers
  for each row execute function private.guard_last_write_wins();
create trigger guard before insert or update on public.shifts
  for each row execute function private.guard_last_write_wins();
create trigger guard before insert or update on public.images
  for each row execute function private.guard_last_write_wins();
create trigger guard before insert or update on public.transactions
  for each row execute function private.guard_transaction();
create trigger guard before insert or update on public.transaction_items
  for each row execute function private.guard_append_only();
create trigger guard before insert or update on public.stock_movements
  for each row execute function private.guard_append_only();
create trigger guard before insert or update on public.audit_log
  for each row execute function private.guard_append_only();

---------------------------------------------------------------------------
-- Row Level Security
---------------------------------------------------------------------------

alter table public.store_members enable row level security;
alter table public.stores enable row level security;
alter table public.users enable row level security;
alter table public.devices enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.variant_groups enable row level security;
alter table public.product_variants enable row level security;
alter table public.customers enable row level security;
alter table public.shifts enable row level security;
alter table public.images enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_log enable row level security;

-- Start from nothing, then grant only what the app needs. Nobody may delete.
revoke all on table
  public.store_members, public.stores, public.users, public.devices, public.categories,
  public.products, public.variant_groups, public.product_variants, public.customers,
  public.shifts, public.images, public.transactions, public.transaction_items,
  public.stock_movements, public.audit_log
from anon, authenticated;

grant select on public.store_members to authenticated;
grant select, insert, update on
  public.stores, public.users, public.devices, public.categories, public.products,
  public.variant_groups, public.product_variants, public.customers, public.shifts,
  public.images, public.transactions
to authenticated;
grant select, insert on public.transaction_items, public.stock_movements, public.audit_log
to authenticated;

create policy "Own memberships" on public.store_members
  for select to authenticated using (user_id = (select auth.uid()));

-- Tables any member of the store may read and write.
do $$
declare
  t text;
begin
  foreach t in array array[
    'stores', 'categories', 'products', 'variant_groups', 'product_variants',
    'customers', 'shifts', 'images', 'transactions'
  ] loop
    execute format(
      'create policy "Store members read" on public.%I for select to authenticated
         using (private.is_member(store_id))', t);
    execute format(
      'create policy "Store members insert" on public.%I for insert to authenticated
         with check (private.is_member(store_id))', t);
    execute format(
      'create policy "Store members update" on public.%I for update to authenticated
         using (private.is_member(store_id)) with check (private.is_member(store_id))', t);
  end loop;

  foreach t in array array['transaction_items', 'stock_movements', 'audit_log'] loop
    execute format(
      'create policy "Store members read" on public.%I for select to authenticated
         using (private.is_member(store_id))', t);
    execute format(
      'create policy "Store members append" on public.%I for insert to authenticated
         with check (private.is_member(store_id))', t);
  end loop;
end;
$$;

-- Users: a paired cashier phone may add and edit cashiers, but never an owner
-- (so it cannot change the owner's PIN or promote anyone to owner).
create policy "Store members read" on public.users
  for select to authenticated using (private.is_member(store_id));
create policy "Members add users" on public.users
  for insert to authenticated
  with check (private.is_owner(store_id) or (private.is_member(store_id) and role = 'cashier'));
create policy "Members edit users" on public.users
  for update to authenticated
  using (private.is_owner(store_id) or (private.is_member(store_id) and role = 'cashier'))
  with check (private.is_owner(store_id) or (private.is_member(store_id) and role = 'cashier'));

-- Devices: only the owner registers or edits devices; a paired phone may update its own row.
-- (An upsert is checked against the insert policy too, hence the own-row case there.
-- New phones are registered by claim_pairing_code, never by a phone itself.)
create policy "Store members read" on public.devices
  for select to authenticated using (private.is_member(store_id));
create policy "Owner adds devices" on public.devices
  for insert to authenticated
  with check (private.is_owner(store_id) or id = private.my_device_id(store_id));
create policy "Owner or the device itself edits" on public.devices
  for update to authenticated
  using (private.is_owner(store_id) or id = private.my_device_id(store_id))
  with check (private.is_owner(store_id) or id = private.my_device_id(store_id));

---------------------------------------------------------------------------
-- Sync API (runs as the caller, so RLS and the triggers above apply)
---------------------------------------------------------------------------

-- Upserts rows by id. Each row succeeds or fails on its own. The result lists
-- the rows the server rejected (failed, with the reason) and, for rows the
-- conflict rules ignored, the version the server kept (current).
create function public.push_changes(p_store_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_table text;
  v_row jsonb;
  v_columns text;
  v_on_conflict text;
  v_count integer;
  v_kept jsonb;
  v_failed jsonb := '[]'::jsonb;
  v_current jsonb := '[]'::jsonb;
begin
  if not private.is_member(p_store_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  foreach v_table in array private.synced_tables() loop
    continue when not (p_changes ? v_table);

    select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
      into v_columns
      from pg_catalog.pg_attribute a
     where a.attrelid = format('public.%I', v_table)::regclass
       and a.attnum > 0 and not a.attisdropped;

    if v_table in ('transaction_items', 'stock_movements', 'audit_log') then
      v_on_conflict := 'do nothing';
    else
      select 'do update set ' || string_agg(format('%1$I = excluded.%1$I', a.attname), ', ')
        into v_on_conflict
        from pg_catalog.pg_attribute a
       where a.attrelid = format('public.%I', v_table)::regclass
         and a.attnum > 0 and not a.attisdropped and a.attname <> 'id';
    end if;

    for v_row in select value from jsonb_array_elements(p_changes -> v_table) loop
      begin
        if private.try_uuid(v_row ->> 'store_id') is distinct from p_store_id then
          raise exception 'wrong_store';
        end if;
        execute format(
          'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) on conflict (id) %3$s',
          v_table, v_columns, v_on_conflict
        ) using v_row;
        get diagnostics v_count = row_count;
        -- Nothing written: the server already has a newer or final version. Send it back.
        if v_count = 0 and v_on_conflict <> 'do nothing' then
          execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
            into v_kept using private.try_uuid(v_row ->> 'id');
          if v_kept is not null then
            v_current := v_current || jsonb_build_array(jsonb_build_object('table', v_table, 'row', v_kept));
          end if;
        end if;
      exception when others then
        v_failed := v_failed || jsonb_build_array(jsonb_build_object(
          'table', v_table, 'id', v_row ->> 'id', 'code', sqlstate, 'message', sqlerrm
        ));
      end;
    end loop;
  end loop;

  return jsonb_build_object('failed', v_failed, 'current', v_current);
end;
$$;

-- Returns up to p_limit rows per table changed after each table's cursor
-- {"ts": synced_at, "id": id}, in (synced_at, id) order.
create function public.pull_changes(p_store_id uuid, p_cursors jsonb, p_limit integer default 500)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_table text;
  v_cursor jsonb;
  v_rows jsonb;
  v_result jsonb := '{}'::jsonb;
begin
  if not private.is_member(p_store_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  foreach v_table in array private.synced_tables() loop
    v_cursor := coalesce(p_cursors -> v_table, '{}'::jsonb);
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t) order by t.synced_at, t.id), ''[]''::jsonb)
         from (
           select * from public.%I
            where store_id = $1 and (synced_at, id) > ($2, $3)
            order by synced_at, id
            limit $4
         ) t',
      v_table
    )
    into v_rows
    using p_store_id,
          coalesce((v_cursor ->> 'ts')::timestamptz, '-infinity'::timestamptz),
          coalesce(private.try_uuid(v_cursor ->> 'id'), '00000000-0000-0000-0000-000000000000'::uuid),
          least(greatest(coalesce(p_limit, 500), 1), 1000);
    v_result := v_result || jsonb_build_object(v_table, v_rows);
  end loop;

  return v_result;
end;
$$;

---------------------------------------------------------------------------
-- Accounts and devices (run as the database owner, with their own checks)
---------------------------------------------------------------------------

create function private.require_owner_account()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'owner_account_required' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_user and u.email_confirmed_at is not null) then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

-- Next free device code in a store: K1, K2, ...
create function private.next_device_code(p_store_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'K' || (coalesce(max(substring(d.code from '^K([0-9]+)$')::integer), 0) + 1)
  from public.devices d
  where d.store_id = p_store_id;
$$;

-- Makes the signed-in owner the owner of a store created on their device.
-- The store's rows (including its first device) are uploaded right after with push_changes.
create function public.create_store(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_owner_account();
begin
  if exists (select 1 from public.store_members m where m.store_id = p_store_id) then
    raise exception 'store_exists' using errcode = '23505';
  end if;
  -- MVP: one store per owner account.
  if exists (
    select 1 from public.store_members m
    where m.user_id = v_user and m.role = 'owner' and m.revoked_at is null
  ) then
    raise exception 'already_owner' using errcode = '23505';
  end if;
  insert into public.store_members (user_id, store_id, role) values (v_user, p_store_id, 'owner');
end;
$$;

-- Stores the signed-in user belongs to, with the store name once it has been uploaded.
create function public.my_stores()
returns table (store_id uuid, role text, device_id uuid, store_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.store_id, m.role, m.device_id, s.name
  from public.store_members m
  left join public.stores s on s.id = m.store_id
  where m.user_id = (select auth.uid()) and m.revoked_at is null
  order by m.created_at;
$$;

-- Registers another phone or laptop of the owner (e.g. a new phone) as a device of the store.
create function public.register_device(p_store_id uuid, p_device_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  perform private.require_owner_account();
  if not private.is_owner(p_store_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text, 0));
  v_code := private.next_device_code(p_store_id);
  insert into public.devices (id, store_id, created_at, updated_at, name, code, active)
  values (
    p_device_id, p_store_id, private.now_ms(), private.now_ms(),
    left(coalesce(nullif(trim(p_name), ''), v_code), 40), v_code, true
  );
  return jsonb_build_object('store_id', p_store_id, 'device_id', p_device_id, 'device_code', v_code);
end;
$$;

-- Pairing codes: 8 characters, valid 10 minutes, usable once. Only a hash is stored.
create table private.pairing_codes (
  code_hash text primary key,
  store_id uuid not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid
);

create table private.pairing_failures (
  user_id uuid not null,
  failed_at timestamptz not null default now()
);
create index pairing_failures_user_idx on private.pairing_failures (user_id, failed_at);

create function private.hash_pairing_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex');
$$;

create function public.create_pairing_code(p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- No 0/O or 1/I, so the code is easy to read out loud and type.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_code text := '';
  v_expires timestamptz := now() + interval '10 minutes';
  v_user uuid := private.require_owner_account();
begin
  if not private.is_owner(p_store_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id) then
    raise exception 'store_not_synced' using errcode = 'P0001';
  end if;
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  delete from private.pairing_codes where expires_at < now() - interval '1 day';
  insert into private.pairing_codes (code_hash, store_id, created_by, expires_at)
  values (private.hash_pairing_code(v_code), p_store_id, v_user, v_expires);
  return jsonb_build_object(
    'code', substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4),
    'expires_at', v_expires
  );
end;
$$;

-- A new cashier phone (signed in anonymously) joins a store with a pairing code.
-- Returns {"ok": true, store_id, device_id, device_code} or {"ok": false, "error": ...}.
-- Errors are returned, not raised, so failed attempts are remembered for rate limiting.
create function public.claim_pairing_code(p_code text, p_device_id uuid, p_device_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_pairing private.pairing_codes;
  v_code text;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if (
    select count(*) from private.pairing_failures f
    where f.user_id = v_user and f.failed_at > now() - interval '1 hour'
  ) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;
  if exists (select 1 from public.store_members m where m.user_id = v_user and m.revoked_at is null) then
    return jsonb_build_object('ok', false, 'error', 'already_paired');
  end if;

  select * into v_pairing from private.pairing_codes c
  where c.code_hash = private.hash_pairing_code(p_code)
    and c.used_at is null
    and c.expires_at > now()
  for update;
  if not found then
    insert into private.pairing_failures (user_id) values (v_user);
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_pairing.store_id::text, 0));
  v_code := private.next_device_code(v_pairing.store_id);
  insert into public.devices (id, store_id, created_at, updated_at, name, code, active)
  values (
    p_device_id, v_pairing.store_id, private.now_ms(), private.now_ms(),
    left(coalesce(nullif(trim(p_device_name), ''), 'Kasir ' || v_code), 40), v_code, true
  );
  insert into public.store_members (user_id, store_id, role, device_id)
  values (v_user, v_pairing.store_id, 'device', p_device_id);
  update private.pairing_codes set used_at = now(), used_by = v_user
  where code_hash = v_pairing.code_hash;

  return jsonb_build_object(
    'ok', true, 'store_id', v_pairing.store_id, 'device_id', p_device_id, 'device_code', v_code
  );
end;
$$;

-- The owner disconnects a paired phone: it can no longer read or send anything.
-- Its data already on the server stays.
create function public.revoke_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store uuid;
begin
  perform private.require_owner_account();
  select d.store_id into v_store from public.devices d where d.id = p_device_id;
  if v_store is null or not private.is_owner(v_store) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  update public.store_members set revoked_at = now()
  where device_id = p_device_id and revoked_at is null;
  update public.devices
     set active = false,
         updated_at = greatest(private.now_ms(), updated_at + interval '1 millisecond')
   where id = p_device_id;
end;
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.is_owner(uuid) to authenticated;
grant execute on function private.my_device_id(uuid) to authenticated;
grant execute on function private.try_uuid(text) to authenticated;
grant execute on function private.synced_tables() to authenticated;
grant execute on function private.clamp_to_now(timestamptz) to authenticated;
grant execute on function private.now_ms() to authenticated;

revoke execute on function
  public.push_changes(uuid, jsonb),
  public.pull_changes(uuid, jsonb, integer),
  public.create_store(uuid),
  public.my_stores(),
  public.register_device(uuid, uuid, text),
  public.create_pairing_code(uuid),
  public.claim_pairing_code(text, uuid, text),
  public.revoke_device(uuid)
from public, anon;
grant execute on function
  public.push_changes(uuid, jsonb),
  public.pull_changes(uuid, jsonb, integer),
  public.create_store(uuid),
  public.my_stores(),
  public.register_device(uuid, uuid, text),
  public.create_pairing_code(uuid),
  public.claim_pairing_code(text, uuid, text),
  public.revoke_device(uuid)
to authenticated;

---------------------------------------------------------------------------
-- Storage: product photos, store logo, QRIS image
---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-images', 'store-images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Path: <store_id>/<image_id>. Images never change once uploaded, so there is no update or delete.
create policy "Store members read images" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'store-images'
    and private.is_member(private.try_uuid((storage.foldername(name))[1]))
  );
create policy "Store members upload images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'store-images'
    and private.is_member(private.try_uuid((storage.foldername(name))[1]))
  );
