-- Nexora HQ: file attachments (phase 4)
-- Run AFTER nexora_support_finance.sql. Safe to re-run.
-- Files live in a PRIVATE Storage bucket and are only reachable through short-lived signed links.

-- ---------- Access rules in one place ----------
-- Read:  client/project/ticket files = any organisation member; invoice/expense files = finance roles only.
-- Write: follows the module (projects -> project managers, tickets -> support roles,
--        clients -> org admin / operations manager / technical admin, invoices & expenses -> finance roles).
create or replace function public.attachment_access(p_org text, p_type text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  org uuid;
begin
  if auth.uid() is null then return false; end if;
  if p_org is null or p_org !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  org := p_org::uuid;

  if p_type in ('invoice', 'expense') then
    return public.can_access_finance(org);
  elsif p_type = 'project' then
    return case when p_write then public.can_manage_projects(org) else public.is_org_member(org) end;
  elsif p_type = 'ticket' then
    return case when p_write then public.can_manage_support(org) else public.is_org_member(org) end;
  elsif p_type = 'client' then
    return case when p_write
      then public.has_org_role(org, array['organization_admin','operations_manager','technical_admin'])
      else public.is_org_member(org) end;
  end if;
  return false;
end;
$$;
revoke all on function public.attachment_access(text, text, boolean) from public, anon;
grant execute on function public.attachment_access(text, text, boolean) to authenticated;

-- ---------- Table ----------
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_type text not null check (entity_type in ('client','project','ticket','invoice','expense')),
  entity_id uuid not null,
  file_name text not null check (length(trim(file_name)) > 0),
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 10485760),
  uploaded_by uuid default auth.uid(),
  uploaded_by_email text,
  created_at timestamptz not null default now()
);
create index if not exists attachments_entity_idx on public.attachments (organization_id, entity_type, entity_id);

-- Stamp the uploader and make sure the file is attached to a real item of the same organisation.
create or replace function public.attachment_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ok boolean := false;
begin
  new.uploaded_by := auth.uid();
  new.uploaded_by_email := auth.jwt() ->> 'email';

  if new.entity_type = 'client' then
    select exists (select 1 from public.clients x where x.id = new.entity_id and x.organization_id = new.organization_id) into ok;
  elsif new.entity_type = 'project' then
    select exists (select 1 from public.projects x where x.id = new.entity_id and x.organization_id = new.organization_id) into ok;
  elsif new.entity_type = 'ticket' then
    select exists (select 1 from public.support_tickets x where x.id = new.entity_id and x.organization_id = new.organization_id) into ok;
  elsif new.entity_type = 'invoice' then
    select exists (select 1 from public.invoices x where x.id = new.entity_id and x.organization_id = new.organization_id) into ok;
  elsif new.entity_type = 'expense' then
    select exists (select 1 from public.expenses x where x.id = new.entity_id and x.organization_id = new.organization_id) into ok;
  end if;
  if not ok then
    raise exception 'The item you are attaching a file to was not found in this organisation.';
  end if;

  if new.storage_path not like (new.organization_id::text || '/' || new.entity_type || '/' || new.entity_id::text || '/%') then
    raise exception 'Invalid storage path for this attachment.';
  end if;
  return new;
end;
$$;
drop trigger if exists attachment_validate on public.attachments;
create trigger attachment_validate before insert on public.attachments
for each row execute function public.attachment_validate();

alter table public.attachments enable row level security;

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated
  using (public.attachment_access(organization_id::text, entity_type, false));
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (public.attachment_access(organization_id::text, entity_type, true));
drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete to authenticated
  using (public.attachment_access(organization_id::text, entity_type, true));

grant select, insert, delete on public.attachments to authenticated;

-- ---------- Private storage bucket (10 MB per file, common business file types) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hq-attachments', 'hq-attachments', false, 10485760,
  array[
    'application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv','application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- File paths look like  <organisation id>/<entity type>/<entity id>/<random>-<file name>
drop policy if exists "hq attachments read" on storage.objects;
create policy "hq attachments read" on storage.objects for select to authenticated
  using (bucket_id = 'hq-attachments'
         and public.attachment_access((storage.foldername(name))[1], (storage.foldername(name))[2], false));

drop policy if exists "hq attachments upload" on storage.objects;
create policy "hq attachments upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'hq-attachments'
         and public.attachment_access((storage.foldername(name))[1], (storage.foldername(name))[2], true));

drop policy if exists "hq attachments delete" on storage.objects;
create policy "hq attachments delete" on storage.objects for delete to authenticated
  using (bucket_id = 'hq-attachments'
         and public.attachment_access((storage.foldername(name))[1], (storage.foldername(name))[2], true));
