
-- Secure Client management permissions.
-- Central Nexora Super Admin and authorised organisation roles
-- can add and edit clients within their permitted organisations.

begin;

-- Dedicated permission check for Client management.
create or replace function public.can_manage_clients(org_id uuid)
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
        and m.role in (
          'organization_admin',
          'operations_manager',
          'technical_admin'
        )
    );
$$;

-- Remove older broad Client management policies.
drop policy if exists "managers manage clients"
on public.clients;

drop policy if exists "admins manage clients"
on public.clients;

-- Recreate organisation-member read access.
drop policy if exists "members view clients"
on public.clients;

create policy "members view clients"
on public.clients
for select
to authenticated
using (
  public.is_hq_member(organization_id)
);

-- Only authorised roles can register clients.
create policy "authorised users insert clients"
on public.clients
for insert
to authenticated
with check (
  public.can_manage_clients(organization_id)
);

-- Only authorised roles can edit clients.
create policy "authorised users update clients"
on public.clients
for update
to authenticated
using (
  public.can_manage_clients(organization_id)
)
with check (
  public.can_manage_clients(organization_id)
);

commit;
