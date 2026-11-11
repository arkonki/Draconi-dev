-- Create random_tables for customizable roll tables (encounters, loot, etc.)
create table if not exists public.random_tables (
  id uuid default gen_random_uuid() primary key,
  party_id uuid references public.parties(id) on delete cascade not null,
  name text not null,
  description text,
  category text default 'General', -- e.g., 'Forest', 'Mountain', 'Loot'
  die_type text not null check (die_type in ('d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd66', 'd100')),
  rows jsonb not null default '[]'::jsonb, -- Array of { min: number, max: number, result: string }
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.random_tables enable row level security;

-- Drop existing policies to ensure clean slate
drop policy if exists "Party members and Admins can view random tables" on public.random_tables;
drop policy if exists "Admins and Party DMs can insert random tables" on public.random_tables;
drop policy if exists "Admins and Party DMs can update random tables" on public.random_tables;
drop policy if exists "Admins and Party DMs can delete random tables" on public.random_tables;
drop policy if exists "Admins and Party DMs can manage random tables" on public.random_tables; -- Cleanup potential artifact

-- SELECT: Allow Party Members OR Admins OR Party Creators to view
create policy "Party members and Admins can view random tables"
  on public.random_tables for select
  using (
    -- 1. Admin
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
    OR
    -- 2. Party Creator
    exists (select 1 from public.parties where id = random_tables.party_id and created_by = auth.uid())
    OR
    -- 3. Party Member
    exists (select 1 from public.party_members where party_id = random_tables.party_id and user_id = auth.uid())
  );

-- INSERT: Allow Admins OR Party Creators OR Global DMs in the party
create policy "Admins and Party DMs can insert random tables"
  on public.random_tables for insert
  with check (
    -- 1. Admin
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
    OR
    -- 2. Party Creator
    exists (select 1 from public.parties where id = random_tables.party_id and created_by = auth.uid())
    OR
    -- 3. Global DM who is a member
    (
      exists (select 1 from public.users where id = auth.uid() and role in ('dm', 'gm'))
      AND
      exists (select 1 from public.party_members where party_id = random_tables.party_id and user_id = auth.uid())
    )
  );

-- UPDATE: Allow Admins OR Party Creators OR Global DMs in the party
create policy "Admins and Party DMs can update random tables"
  on public.random_tables for update
  using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
    OR
    exists (select 1 from public.parties where id = random_tables.party_id and created_by = auth.uid())
    OR
    (
      exists (select 1 from public.users where id = auth.uid() and role in ('dm', 'gm'))
      AND
      exists (select 1 from public.party_members where party_id = random_tables.party_id and user_id = auth.uid())
    )
  );

-- DELETE: Allow Admins OR Party Creators OR Global DMs in the party
create policy "Admins and Party DMs can delete random tables"
  on public.random_tables for delete
  using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
    OR
    exists (select 1 from public.parties where id = random_tables.party_id and created_by = auth.uid())
    OR
    (
      exists (select 1 from public.users where id = auth.uid() and role in ('dm', 'gm'))
      AND
      exists (select 1 from public.party_members where party_id = random_tables.party_id and user_id = auth.uid())
    )
  );
