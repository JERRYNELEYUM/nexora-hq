-- NEXORA HQ — initial secure schema
-- Run in Supabase SQL Editor on a NEW project after reviewing this file.
-- This creates the first HQ data model. It does not import existing client data.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  country text not null default 'Cameroon',
  headquarters text,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin','operations_manager','technical_admin','finance_officer','support_officer','staff')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_name text not null,
  business_type text,
  location text,
  contact_person text,
  phone text,
  email text,
  status text not null default 'prospect' check (status in ('prospect','onboarding','active','inactive','suspended')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  app_name text not null,
  app_code text not null,
  repository_url text,
  production_url text,
  hosting_provider text,
  current_version text,
  status text not null default 'development' check (status in ('development','staging','production','maintenance','archived')),
  created_at timestamptz not null default now(),
  unique (organization_id, app_code)
);

create table if not exists public.client_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete restrict,
  status text not null default 'planned' check (status in ('planned','configuring','active','paused','ended')),
  start_date date,
  created_at timestamptz not null default now(),
  unique (client_id, application_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  project_name text not null,
  description text,
  status text not null default 'planned' check (status in ('planned','in_progress','blocked','completed','cancelled')),
  start_date date,
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','waiting_client','resolved','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  invoice_number text not null,
  currency text not null default 'XAF',
  amount numeric(14,2) not null check (amount >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  due_date date,
  status text not null default 'draft' check (status in ('draft','issued','part_paid','paid','overdue','void')),
  created_at timestamptz not null default now(),
  unique (organization_id, invoice_number),
  check (amount_paid <= amount)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists clients_org_created_idx on public.clients(organization_id, created_at desc);
create index if not exists applications_org_idx on public.applications(organization_id);
create index if not exists projects_org_status_idx on public.projects(organization_id, status);
create index if not exists tickets_org_status_idx on public.support_tickets(organization_id, status);
create index if not exists invoices_org_due_idx on public.invoices(organization_id, due_date);

create or replace function public.is_hq_member(org_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_hq_admin(org_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org_id and m.user_id = auth.uid()
      and m.role in ('super_admin','operations_manager')
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.clients enable row level security;
alter table public.applications enable row level security;
alter table public.client_applications enable row level security;
alter table public.projects enable row level security;
alter table public.support_tickets enable row level security;
alter table public.invoices enable row level security;
alter table public.audit_logs enable row level security;

-- Organization members can see their own organization. Only admins can update membership.
create policy "members can view organization" on public.organizations
for select using (public.is_hq_member(id));

create policy "members can view team" on public.organization_members
for select using (public.is_hq_member(organization_id));

create policy "admins manage team" on public.organization_members
for all using (public.is_hq_admin(organization_id))
with check (public.is_hq_admin(organization_id));

create policy "members view clients" on public.clients
for select using (public.is_hq_member(organization_id));
create policy "admins manage clients" on public.clients
for all using (public.is_hq_admin(organization_id))
with check (public.is_hq_admin(organization_id));

create policy "members view applications" on public.applications
for select using (public.is_hq_member(organization_id));
create policy "admins manage applications" on public.applications
for all using (public.is_hq_admin(organization_id))
with check (public.is_hq_admin(organization_id));

create policy "members view client apps" on public.client_applications
for select using (public.is_hq_member(organization_id));
create policy "admins manage client apps" on public.client_applications
for all using (public.is_hq_admin(organization_id))
with check (public.is_hq_admin(organization_id));

create policy "members view projects" on public.projects
for select using (public.is_hq_member(organization_id));
create policy "admins manage projects" on public.projects
for all using (public.is_hq_admin(organization_id))
with check (public.is_hq_admin(organization_id));

create policy "members view tickets" on public.support_tickets
for select using (public.is_hq_member(organization_id));
create policy "admins manage tickets" on public.support_tickets
for all using (public.is_hq_admin(organization_id))
with check (public.is_hq_admin(organization_id));

create policy "finance admins view invoices" on public.invoices
for select using (
  exists (select 1 from public.organization_members m
          where m.organization_id = invoices.organization_id
          and m.user_id = auth.uid()
          and m.role in ('super_admin','operations_manager','finance_officer'))
);
create policy "admins manage invoices" on public.invoices
for all using (public.is_hq_admin(organization_id))
with check (public.is_hq_admin(organization_id));

create policy "admins view audit logs" on public.audit_logs
for select using (public.is_hq_admin(organization_id));
create policy "members insert audit logs" on public.audit_logs
for insert with check (public.is_hq_member(organization_id) and actor_user_id = auth.uid());

-- IMPORTANT FIRST-ADMIN BOOTSTRAP:
-- 1. Create your own user in Supabase Authentication > Users (invite/create).
-- 2. Run the SQL below after replacing the email and slug.
-- 3. Keep the organization UUID returned by the query.
-- Never expose the service_role key in the browser.
--
-- insert into public.organizations (name, slug, headquarters)
-- values ('Nexora Smart Services Ltd', 'nexora', 'Buea, Cameroon')
-- returning id;
--
-- insert into public.organization_members (organization_id, user_id, role)
-- select 'PASTE_ORGANIZATION_UUID'::uuid, id, 'super_admin'
-- from auth.users where email = 'YOUR_ADMIN_EMAIL';
--
-- Add the application seed records after creating the organization:
-- insert into public.applications
-- (organization_id, app_name, app_code, repository_url, status)
-- values
-- ('PASTE_ORGANIZATION_UUID', 'Nexora Stay', 'NEX-STAY', 'https://github.com/JERRYNELEYUM/Nexora-Stay', 'development'),
-- ('PASTE_ORGANIZATION_UUID', 'Nexora POS', 'NEX-POS', 'https://github.com/JERRYNELEYUM/Nexora-POS', 'development'),
-- ('PASTE_ORGANIZATION_UUID', 'Nexora Inventory', 'NEX-INV', null, 'development'),
-- ('PASTE_ORGANIZATION_UUID', 'School Accounting & POS', 'NEX-SCHOOL', null, 'development'),
-- ('PASTE_ORGANIZATION_UUID', 'Hotel Booking App', 'NEX-BOOK', null, 'development');
