
-- Restrict application management to the central Nexora Super Admin
-- and organisation administrators.
-- This migration changes Applications permissions only.

begin;

-- Applications-specific administrator check.
create or replace function public.can_manage_applications(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_nexora_super_admin()
    or exists (
      select 1
      from public.organization_members m
      where m.organization_id = org_id
        and m.user_id = auth.uid()
        and m.role = 'organization_admin'
    );
$$;

-- Remove previous broad Applications management policies.
drop policy if exists "admins manage applications"
on public.applications;

drop policy if exists "managers manage applications"
on public.applications;

drop policy if exists "administrators insert applications"
on public.applications;

drop policy if exists "administrators update applications"
on public.applications;

-- Only authorised administrators can register applications.
create policy "administrators insert applications"
on public.applications
for insert
to authenticated
with check (
  public.can_manage_applications(organization_id)
);

-- Only authorised administrators can edit applications.
create policy "administrators update applications"
on public.applications
for update
to authenticated
using (
  public.can_manage_applications(organization_id)
)
with check (
  public.can_manage_applications(organization_id)
);

commit;
