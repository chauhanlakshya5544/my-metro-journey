-- My Metro Journey: Live location setup
-- Run this in Supabase SQL Editor.
-- IMPORTANT: after both accounts exist, add the owner/parent link with the INSERT shown at the bottom.

create table if not exists public.live_locations (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  sharing_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint live_locations_coordinates_check check (
    (latitude is null and longitude is null) or
    (latitude between -90 and 90 and longitude between -180 and 180)
  )
);

create table if not exists public.family_location_access (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid not null references public.profiles(id) on delete cascade,
  primary key (owner_id, parent_id),
  constraint different_family_users check (owner_id <> parent_id)
);

-- The Data API requires table privileges in addition to RLS policies.
grant select, insert, update, delete on table public.live_locations to authenticated;
grant select, insert on table public.family_location_access to authenticated;

alter table public.live_locations enable row level security;
alter table public.family_location_access enable row level security;

-- Owner can create/update/read their own location.
drop policy if exists "owner manages own live location" on public.live_locations;
create policy "owner manages own live location"
on public.live_locations for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

-- A linked parent can read the owner's live location only.
drop policy if exists "linked parent reads live location" on public.live_locations;
create policy "linked parent reads live location"
on public.live_locations for select
to authenticated
using (
  exists (
    select 1 from public.family_location_access f
    where f.owner_id = live_locations.owner_id
      and f.parent_id = (select auth.uid())
  )
);

-- Users can see only their own family-link rows.
drop policy if exists "users read their family links" on public.family_location_access;
create policy "users read their family links"
on public.family_location_access for select
to authenticated
using ((select auth.uid()) = owner_id or (select auth.uid()) = parent_id);

-- Only an owner can create a link involving themselves.
drop policy if exists "owner creates family link" on public.family_location_access;
create policy "owner creates family link"
on public.family_location_access for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create index if not exists family_location_access_parent_idx
  on public.family_location_access(parent_id);

create index if not exists live_locations_updated_idx
  on public.live_locations(updated_at desc);

-- After both accounts exist, run ONE statement like this with their real UUIDs:
-- insert into public.family_location_access (owner_id, parent_id)
-- values ('OWNER-UUID-HERE', 'PARENT-UUID-HERE')
-- on conflict do nothing;
