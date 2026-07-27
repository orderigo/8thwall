-- Supabase schema for the PortalOS prototype.
-- Run this in Supabase Dashboard > SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'viewer' check (role in ('viewer', 'editor', 'admin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_worlds (
  id text primary key,
  config jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.portal_worlds enable row level security;

-- A logged-in user can read their own profile.
create policy "Users can read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Admin profiles can read all profiles for the admin panel.
create policy "Admins can read all profiles"
  on public.profiles
  for select
  using (
    exists (
      select 1 from public.profiles admin_profile
      where admin_profile.id = auth.uid()
        and admin_profile.role = 'admin'
        and admin_profile.status = 'active'
    )
  );

-- Logged-in users can read portal world config.
create policy "Authenticated users can read portal worlds"
  on public.portal_worlds
  for select
  to authenticated
  using (true);

-- Editors and admins can create/update portal world config from the frontend editor.
create policy "Editors can upsert portal worlds"
  on public.portal_worlds
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles editor_profile
      where editor_profile.id = auth.uid()
        and editor_profile.role in ('editor', 'admin')
        and editor_profile.status = 'active'
    )
  );

create policy "Editors can update portal worlds"
  on public.portal_worlds
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles editor_profile
      where editor_profile.id = auth.uid()
        and editor_profile.role in ('editor', 'admin')
        and editor_profile.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.profiles editor_profile
      where editor_profile.id = auth.uid()
        and editor_profile.role in ('editor', 'admin')
        and editor_profile.status = 'active'
    )
  );

-- Automatically create a profile after email/password signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, status)
  values (new.id, new.email, 'viewer', 'active')
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- After your first signup, promote yourself by replacing the email below.
-- update public.profiles set role = 'admin' where email = 'you@example.com';
