-- Greeting Cards Platform - initial schema
-- Run this file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin', 'admin', 'viewer');
create type public.occasion_status as enum ('draft', 'active', 'ended', 'disabled');
create type public.template_shape as enum ('square', 'rectangle');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.occasions (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null,
  title_en text not null,
  slug text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.occasion_status not null default 'draft',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint occasion_dates_valid check (ends_at > starts_at)
);

create table public.fonts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  family_name text not null,
  language text not null check (language in ('ar', 'en', 'both')),
  weight integer not null default 400,
  style text not null default 'normal' check (style in ('normal', 'italic')),
  storage_path text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references public.occasions(id) on delete cascade,
  name text not null,
  shape public.template_shape not null,
  image_path text not null,
  image_width integer not null,
  image_height integer not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (occasion_id, shape, name)
);

create table public.template_settings (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null unique references public.templates(id) on delete cascade,
  arabic_settings jsonb not null default '{}'::jsonb,
  english_settings jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table public.generation_logs (
  id bigint generated always as identity primary key,
  occasion_id uuid not null references public.occasions(id) on delete cascade,
  template_id uuid references public.templates(id) on delete set null,
  arabic_name text not null,
  english_name text not null,
  shape public.template_shape not null,
  generated_at timestamptz not null default now()
);

create table public.statistics_totals (
  occasion_id uuid primary key references public.occasions(id) on delete cascade,
  total_generated bigint not null default 0,
  square_generated bigint not null default 0,
  rectangle_generated bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  id boolean primary key default true check (id),
  platform_name_ar text not null default 'بطاقات تهنئة',
  platform_name_en text not null default 'Greeting Cards',
  empty_message_ar text not null default 'لا توجد مناسبة متاحة حاليًا',
  empty_message_en text not null default 'No occasion is currently available.',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true) on conflict do nothing;

-- Seed built-in fonts. Files are shipped with the frontend in v1.
insert into public.fonts (display_name, family_name, language, weight, style, is_system)
values
  ('GE Thameen Light', 'GE Thameen', 'ar', 300, 'normal', true),
  ('GE Thameen Book', 'GE Thameen', 'ar', 400, 'normal', true),
  ('GE Thameen DemiBold', 'GE Thameen', 'ar', 600, 'normal', true),
  ('Aller Light', 'Aller', 'en', 300, 'normal', true),
  ('Aller Regular', 'Aller', 'en', 400, 'normal', true),
  ('Aller Bold', 'Aller', 'en', 700, 'normal', true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in ('super_admin', 'admin'), false);
$$;

create or replace function public.increment_generation_total()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.statistics_totals (
    occasion_id,
    total_generated,
    square_generated,
    rectangle_generated
  ) values (
    new.occasion_id,
    1,
    case when new.shape = 'square' then 1 else 0 end,
    case when new.shape = 'rectangle' then 1 else 0 end
  )
  on conflict (occasion_id) do update set
    total_generated = public.statistics_totals.total_generated + 1,
    square_generated = public.statistics_totals.square_generated + case when new.shape = 'square' then 1 else 0 end,
    rectangle_generated = public.statistics_totals.rectangle_generated + case when new.shape = 'rectangle' then 1 else 0 end,
    updated_at = now();
  return new;
end;
$$;

create trigger generation_log_total_trigger
after insert on public.generation_logs
for each row execute procedure public.increment_generation_total();

alter table public.profiles enable row level security;
alter table public.occasions enable row level security;
alter table public.fonts enable row level security;
alter table public.templates enable row level security;
alter table public.template_settings enable row level security;
alter table public.generation_logs enable row level security;
alter table public.statistics_totals enable row level security;
alter table public.app_settings enable row level security;

create policy "profile self read" on public.profiles
for select to authenticated using (id = auth.uid() or public.current_role() = 'super_admin');

create policy "super admin manages profiles" on public.profiles
for all to authenticated using (public.current_role() = 'super_admin') with check (public.current_role() = 'super_admin');

create policy "public reads active occasions" on public.occasions
for select to anon, authenticated
using (status = 'active' and starts_at <= now() and ends_at >= now() or public.is_admin() or public.current_role() = 'viewer');

create policy "admins manage occasions" on public.occasions
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public reads active system fonts" on public.fonts
for select to anon, authenticated using (is_active = true or public.is_admin());

create policy "admins manage fonts" on public.fonts
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public reads active templates" on public.templates
for select to anon, authenticated using (
  is_active = true and exists (
    select 1 from public.occasions o
    where o.id = occasion_id and o.status = 'active' and o.starts_at <= now() and o.ends_at >= now()
  ) or public.is_admin() or public.current_role() = 'viewer'
);

create policy "admins manage templates" on public.templates
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public reads settings for active templates" on public.template_settings
for select to anon, authenticated using (
  exists (
    select 1 from public.templates t
    join public.occasions o on o.id = t.occasion_id
    where t.id = template_id and t.is_active = true and o.status = 'active' and o.starts_at <= now() and o.ends_at >= now()
  ) or public.is_admin() or public.current_role() = 'viewer'
);

create policy "admins manage template settings" on public.template_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public creates generation logs" on public.generation_logs
for insert to anon, authenticated with check (
  char_length(trim(arabic_name)) between 1 and 100
  and char_length(trim(english_name)) between 1 and 100
  and exists (
    select 1 from public.occasions o
    where o.id = occasion_id and o.status = 'active' and o.starts_at <= now() and o.ends_at >= now()
  )
);

create policy "staff reads generation logs" on public.generation_logs
for select to authenticated using (public.current_role() in ('super_admin', 'admin', 'viewer'));

create policy "admins delete generation logs" on public.generation_logs
for delete to authenticated using (public.is_admin());

create policy "staff reads statistics" on public.statistics_totals
for select to authenticated using (public.current_role() in ('super_admin', 'admin', 'viewer'));

create policy "admins manage statistics" on public.statistics_totals
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public reads app settings" on public.app_settings
for select to anon, authenticated using (true);

create policy "admins manage app settings" on public.app_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Storage buckets (template images and uploaded fonts).
insert into storage.buckets (id, name, public)
values ('card-templates', 'card-templates', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('card-fonts', 'card-fonts', true)
on conflict (id) do nothing;

create policy "public reads card templates" on storage.objects
for select to public using (bucket_id = 'card-templates');

create policy "admins manage card templates" on storage.objects
for all to authenticated using (bucket_id = 'card-templates' and public.is_admin())
with check (bucket_id = 'card-templates' and public.is_admin());

create policy "public reads card fonts" on storage.objects
for select to public using (bucket_id = 'card-fonts');

create policy "admins manage card fonts" on storage.objects
for all to authenticated using (bucket_id = 'card-fonts' and public.is_admin())
with check (bucket_id = 'card-fonts' and public.is_admin());
