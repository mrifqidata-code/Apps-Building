-- M7: paket toko dan masa aktif (uji coba 30 hari, lalu diperpanjang manual).
--
-- Cara memasang di Supabase: buka SQL Editor, tempel seluruh isi file ini, lalu Run.
-- Pasang sesudah file M5 dan M3. Boleh dijalankan lebih dari sekali.
-- Panduan: docs/paket.md (cara melihat toko dan memperpanjang paket).
--
-- Using Reqap on one phone without an account is free and never touches the
-- server. The cloud (sync, backup, more phones) needs an active plan:
-- - A new cloud store starts a 30-day trial when its owner creates it.
-- - The operator extends it by hand after a bank transfer (admin_* functions
--   below, from the SQL Editor). There is no payment gateway.
-- - When the plan has run out, every read and write of the store's data is
--   refused with 'plan_inactive'. The phones keep working offline and send
--   their changes once the plan is extended.

create table if not exists public.store_plans (
  store_id uuid primary key,
  plan text not null check (plan in ('trial', 'toko')),
  -- Null: no end date (e.g. the operator's own store).
  active_until timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_plans enable row level security;
revoke all on table public.store_plans from anon, authenticated;
grant select on public.store_plans to authenticated;

---------------------------------------------------------------------------
-- The gate: membership checks now also require an active plan
---------------------------------------------------------------------------

create or replace function private.plan_active(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.store_plans p
    where p.store_id = p_store_id
      and (p.active_until is null or p.active_until > now())
  );
$$;

create or replace function private.require_active_plan(p_store_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.plan_active(p_store_id) then
    raise exception 'plan_inactive' using errcode = 'P0001',
      hint = 'Masa aktif paket toko sudah habis.';
  end if;
end;
$$;

-- Membership without the plan check, for reading the plan itself.
create or replace function private.is_listed_member(p_store_id uuid)
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

-- Same as in M5, but a member of a store whose plan has run out gets the error
-- 'plan_inactive' instead of access. Every policy and the sync API use these
-- three functions, so this one change closes tables, sync and image storage.
-- Non-members still just get false (and 'not_member' from the sync API).
-- (create or replace keeps the existing execute grants.)
create or replace function private.is_member(p_store_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_listed_member(p_store_id) then
    return false;
  end if;
  perform private.require_active_plan(p_store_id);
  return true;
end;
$$;

create or replace function private.is_owner(p_store_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.store_members m
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
      and m.revoked_at is null
  ) then
    return false;
  end if;
  perform private.require_active_plan(p_store_id);
  return true;
end;
$$;

create or replace function private.my_device_id(p_store_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_device uuid;
begin
  select m.device_id into v_device from public.store_members m
  where m.store_id = p_store_id
    and m.user_id = (select auth.uid())
    and m.revoked_at is null;
  if v_device is not null then
    perform private.require_active_plan(p_store_id);
  end if;
  return v_device;
end;
$$;

-- New functions are executable by everyone unless revoked (as M5 did for its own).
revoke execute on function
  private.is_listed_member(uuid),
  private.plan_active(uuid),
  private.require_active_plan(uuid)
from public, anon;
grant execute on function
  private.is_listed_member(uuid),
  private.plan_active(uuid),
  private.require_active_plan(uuid)
to authenticated;

-- Members (owner and cashier phones) can see their store's plan, even after it ran out.
drop policy if exists "Members read their plan" on public.store_plans;
create policy "Members read their plan" on public.store_plans
  for select to authenticated using (private.is_listed_member(store_id));

---------------------------------------------------------------------------
-- Trial: a store created in the cloud gets 30 days
---------------------------------------------------------------------------

create or replace function private.start_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'owner' then
    insert into public.store_plans (store_id, plan, active_until)
    values (new.store_id, 'trial', now() + interval '30 days')
    on conflict (store_id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function private.start_trial() from public, anon, authenticated;

drop trigger if exists start_trial on public.store_members;
create trigger start_trial after insert on public.store_members
  for each row execute function private.start_trial();

-- Stores already in the cloud when this file is installed also get 30 days from now.
insert into public.store_plans (store_id, plan, active_until)
select distinct m.store_id, 'trial', now() + interval '30 days'
from public.store_members m
on conflict (store_id) do nothing;

---------------------------------------------------------------------------
-- For the operator: run these in the SQL Editor (see docs/paket.md).
-- Not callable from the app: only the database owner and the secret key.
---------------------------------------------------------------------------

-- Every store with its owner's email, plan and recent activity.
create or replace function public.admin_stores()
returns table (
  store_id uuid,
  store_name text,
  owner_email text,
  plan text,
  active_until timestamptz,
  active_devices bigint,
  last_sale_at timestamptz,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.store_id,
    s.name,
    (select string_agg(u.email, ', ' order by u.email)
       from public.store_members o join auth.users u on u.id = o.user_id
      where o.store_id = m.store_id and o.role = 'owner' and o.revoked_at is null),
    p.plan,
    p.active_until,
    (select count(*) from public.devices d where d.store_id = m.store_id and d.active),
    (select max(t.created_at) from public.transactions t where t.store_id = m.store_id),
    min(m.created_at)
  from public.store_members m
  left join public.stores s on s.id = m.store_id
  left join public.store_plans p on p.store_id = m.store_id
  group by m.store_id, s.name, p.plan, p.active_until
  order by min(m.created_at);
$$;

-- After a transfer: paket Toko for p_months more months, counted from the end of
-- the current period (or from now if it already ran out). No end date stays no end date.
create or replace function public.admin_extend_plan(
  p_store_id uuid,
  p_months integer,
  p_note text default null
)
returns public.store_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.store_plans;
begin
  if p_months is null or p_months < 1 or p_months > 36 then
    raise exception 'Jumlah bulan harus 1 sampai 36';
  end if;
  if not exists (select 1 from public.store_members m where m.store_id = p_store_id) then
    raise exception 'Toko % tidak ada', p_store_id;
  end if;
  insert into public.store_plans as p (store_id, plan, active_until, note)
  values (p_store_id, 'toko', now() + make_interval(months => p_months), p_note)
  on conflict (store_id) do update set
    plan = 'toko',
    active_until = case
      when p.active_until is null then null
      else greatest(p.active_until, now()) + make_interval(months => p_months)
    end,
    note = coalesce(p_note, p.note),
    updated_at = now()
  returning * into v_plan;
  return v_plan;
end;
$$;

-- No end date, e.g. for the operator's own store.
create or replace function public.admin_set_plan_unlimited(p_store_id uuid, p_note text default null)
returns public.store_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.store_plans;
begin
  if not exists (select 1 from public.store_members m where m.store_id = p_store_id) then
    raise exception 'Toko % tidak ada', p_store_id;
  end if;
  insert into public.store_plans as p (store_id, plan, active_until, note)
  values (p_store_id, 'toko', null, p_note)
  on conflict (store_id) do update set
    plan = 'toko', active_until = null, note = coalesce(p_note, p.note), updated_at = now()
  returning * into v_plan;
  return v_plan;
end;
$$;

revoke execute on function
  public.admin_stores(),
  public.admin_extend_plan(uuid, integer, text),
  public.admin_set_plan_unlimited(uuid, text)
from public, anon, authenticated;
grant execute on function
  public.admin_stores(),
  public.admin_extend_plan(uuid, integer, text),
  public.admin_set_plan_unlimited(uuid, text)
to service_role;
