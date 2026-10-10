-- M3: kas masuk/keluar saat shift (buka kasir sampai tutup kasir).
--
-- Cara memasang di Supabase: buka SQL Editor, tempel seluruh isi file ini, lalu Run.
-- Pasang sesudah file M5 (20261009120000_m5_akun_sinkron.sql). Boleh dijalankan
-- lebih dari sekali, dan aman dipasang sebelum aplikasi versi M3 dipakai.
-- Panduan: docs/supabase.md, bagian "Memperbarui database".
--
-- Shifts already sync since M5 (table public.shifts). This adds cash put into
-- or taken out of the drawer during a shift (not sales), e.g. buying ice.
-- Like sale items, these rows are append-only: written once by the device,
-- never changed or deleted.

create table if not exists public.cash_movements (
  id uuid primary key,
  store_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  shift_id uuid not null,
  device_id uuid not null,
  type text not null check (type in ('in', 'out')),
  amount bigint not null check (amount > 0),
  reason text not null,
  user_id uuid not null
);

create index if not exists cash_movements_sync_idx
  on public.cash_movements (store_id, synced_at, id);

drop trigger if exists guard on public.cash_movements;
create trigger guard before insert or update on public.cash_movements
  for each row execute function private.guard_append_only();

alter table public.cash_movements enable row level security;
revoke all on table public.cash_movements from anon, authenticated;
grant select, insert on public.cash_movements to authenticated;

drop policy if exists "Store members read" on public.cash_movements;
create policy "Store members read" on public.cash_movements
  for select to authenticated using (private.is_member(store_id));
drop policy if exists "Store members append" on public.cash_movements;
create policy "Store members append" on public.cash_movements
  for insert to authenticated with check (private.is_member(store_id));

-- Sync the new table too (last, after the rows it refers to).
create or replace function private.synced_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'stores', 'users', 'devices', 'categories', 'products', 'variant_groups',
    'product_variants', 'customers', 'shifts', 'images', 'transactions',
    'transaction_items', 'stock_movements', 'audit_log', 'cash_movements'
  ];
$$;

-- Same as in M5, with cash_movements added to the append-only tables.
-- (create or replace keeps the existing execute grants.)
create or replace function public.push_changes(p_store_id uuid, p_changes jsonb)
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

    if v_table in ('transaction_items', 'stock_movements', 'audit_log', 'cash_movements') then
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
